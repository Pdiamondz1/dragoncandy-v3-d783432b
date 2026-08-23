// sync-internal-docs.mjs  (Node 18+, uses global fetch)
// AIOS internal-knowledge sync: reads strategy/ops docs (docs/*.md) and the full
// wiki (concepts/, entities/, analyses/) and POSTs them to donny-knowledge-sync
// with scope='internal' + full markdown, populating:
//   - donny_knowledge (scope='internal')  → internal Donny RAG
//   - internal_docs                       → /internal/strategy viewer
//
// SAFETY GATE: run the consumer leak test BEFORE the first prod run — the scope
// migration (20260611210000) must already be applied or internal content would
// land in consumer Donny's retrieval set.
//
// Auth: the value injected into edge functions as SUPABASE_SERVICE_ROLE_KEY —
// per project key system: PROD (zocahiffooqdybdhguqv) is on LEGACY keys, so use
// the service_role JWT (eyJ…) from the "Legacy anon, service_role API keys"
// tab; STAGING uses the new system, so use its sb_secret_… key.
// Usage (from the repo/worktree root; never commit a key):
//   set DONNY_SYNC_URL=https://<ref>.supabase.co/functions/v1/donny-knowledge-sync
//   set SUPABASE_SECRET_KEY=sb_secret_xxx
//   node supabase/scripts/sync-internal-docs.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.DONNY_SYNC_URL;
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH = 20; // smaller than wiki sync: full_content payloads are heavier

const WIKI_DIRS = ["concepts", "entities", "analyses"].map((d) => `docs/wiki/${d}`);

// Documents stored for /internal/strategy but deliberately NOT embedded.
//
// SHIPPED_LOG.md is 505,021 chars — a quarter of the whole internal corpus — of raw,
// newest-first changelog. Chunked like everything else it would be 85 of ~276 rows, all of it
// history that the wiki concept pages already synthesise, competing for the 5 slots
// `retrieveContext` returns. The wiki is the layer built for retrieval; this is the layer built
// for reading. It stays fully readable in the strategy viewer.
//
// This is a deliberate exclusion, not the silent truncation it replaces: the run prints it, and
// the edge function deletes the row it used to keep (which held only the newest 5% anyway).
const RAG_EXCLUDED = new Set(["docs/SHIPPED_LOG.md"]);

// SYNC_DRY_RUN=1 prints the document/chunk breakdown and exits without POSTing — the offline
// way to see what a change to the chunker would send. Mirrors sync-wiki-to-donny.mjs, including
// needing no URL or key.
const DRY_RUN = process.env.SYNC_DRY_RUN === "1";

if (!DRY_RUN && (!URL || !KEY)) {
  console.error("Set DONNY_SYNC_URL and SUPABASE_SECRET_KEY (the sb_secret_… key).");
  process.exit(1);
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: m[2].trim() };
}

function collectDir(dir, sourcePrefix) {
  const pages = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return pages;
  }
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const filePath = join(dir, name);
    if (!statSync(filePath).isFile()) continue;
    const slug = name.replace(/\.md$/, "");
    const raw = readFileSync(filePath, "utf8");
    const { fm, body } = parseFrontmatter(raw);
    const title = fm.title ?? slug;
    const base = `${sourcePrefix}:${slug}`;
    const path = filePath.replace(/\\/g, "/");
    const metadata = { title, type: fm.type ?? "internal_doc", path, tags: fm.tags ?? "" };

    if (RAG_EXCLUDED.has(path)) {
      // internal_docs only. `content` is omitted rather than filled with a placeholder — the
      // edge function does not require it here, and a plausible-looking unused string is how a
      // field starts being trusted.
      pages.push({ source_id: base, metadata, scope: "internal", full_content: raw, index_in_rag: false });
      continue;
    }

    // One page per chunk. `full_content` rides on chunk 0 ONLY: it is the whole document, and
    // sending it on all six chunks would upsert the same internal_docs row six times per run.
    // The WHOLE document, untruncated. donny-knowledge-sync splits it into rows — see
    // _shared/chunk-doc.ts for why chunking lives there and not here.
    pages.push({ source_id: base, content: `${title}\n\n${body}`, metadata, scope: "internal", full_content: raw });
  }
  return pages;
}

const pages = [
  // Top-level strategy/ops docs (docs/*.md, non-recursive — wiki/superpowers handled separately)
  ...collectDir("docs", "internal-doc"),
  // Full wiki, including the engineering/strategy pages the consumer curation excludes
  ...WIKI_DIRS.flatMap((dir) => collectDir(dir, `internal-${dir.split("/").pop()}`)),
];

// Say what is actually happening. The truncation this replaced was invisible in every signal
// the run produced — `updated=142 errors=0` with a third of the corpus never embedded — so the
// counts below name each category rather than reporting one total that hides the others.
const unindexed = pages.filter((p) => p.index_in_rag === false);
const embedChars = pages.reduce((n, p) => n + (p.content?.length ?? 0), 0);
const sourceChars = pages.reduce((n, p) => n + p.full_content.length, 0);
console.log(
  `Found ${pages.length} internal documents — ${pages.length - unindexed.length} to embed, ` +
  `${unindexed.length} stored unindexed.`,
);
for (const p of unindexed) console.log(`  unindexed (internal_docs only): ${p.metadata.path}`);
console.log(
  `Sending ${embedChars} of ${sourceChars} source chars for embedding ` +
  `(${Math.round((embedChars / sourceChars) * 100)}%; the remainder is the unindexed document ` +
  `above plus stripped frontmatter). Chunking happens server-side — the response reports it.`,
);

if (DRY_RUN) {
  console.log("\nDry run — nothing sent.");
  process.exit(0);
}

console.log(`Syncing to ${URL} ...`);

let inserted = 0, updated = 0, errors = 0, unindexedCount = 0, chunkCount = 0;
const split = [];
for (let i = 0; i < pages.length; i += BATCH) {
  const batch = pages.slice(i, i + BATCH);
  const resp = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pages: batch }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`Batch ${i / BATCH + 1} failed (${resp.status}):`, JSON.stringify(json).slice(0, 400));
    errors += batch.length;
    continue;
  }
  inserted += json.inserted ?? 0;
  updated += json.updated ?? 0;
  errors += json.errors ?? 0;
  unindexedCount += json.unindexed ?? 0;
  chunkCount += json.chunks ?? 0;
  for (const s of json.split ?? []) split.push(s);
  console.log(`Batch ${i / BATCH + 1}: +${json.inserted} inserted, ~${json.updated} updated, ${json.errors} errors`);
}

// Print what the server did with each document. The truncation this replaced was invisible in
// every signal the run produced — `updated=142 errors=0` while a third of the corpus was never
// embedded — so a run now has to say how many rows each document became.
for (const s of split.sort((a, b) => b.chunks - a.chunks)) {
  console.log(`  chunked: ${s.source_id} -> ${s.chunks} rows`);
}
console.log(
  `\nDone. documents=${pages.length} rows=${chunkCount} inserted=${inserted} updated=${updated} ` +
  `unindexed=${unindexedCount} errors=${errors}`,
);

// ── Orphan check (READ-ONLY) ─────────────────────────────────────────────────────────────────
//
// Nothing in this pipeline deletes a row whose source_id simply stopped being produced, so a
// renamed or deleted document strands its row in the RAG forever. Chunking makes that sharper:
// one renamed document now strands every one of its chunks. The edge function removes siblings
// past `chunk_total` when a document shrinks, which is the case it can see; this catches the
// case it cannot — an id that is no longer produced at all.
//
// READ-ONLY on purpose, matching sync-wiki-to-donny.mjs: giving a sync script DELETE over
// donny_knowledge has a worse blast radius on a bad filter than the drift it would fix. It
// prints the SQL for a human. FAILS OPEN — this sync did not create the drift, so a REST blip
// must not fail an otherwise good run.
try {
  const restUrl = URL.replace(/\/functions\/v1\/.*$/, "/rest/v1/donny_knowledge");
  const resp = await fetch(
    `${restUrl}?select=metadata&scope=eq.internal`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  if (!resp.ok) {
    console.warn(`Orphan check skipped — donny_knowledge read returned ${resp.status}.`);
  } else {
    const rows = await resp.json();
    // Compare DOCUMENTS, not rows. A row is legitimate if the document it belongs to is still
    // produced, and `chunk_base` is how a continuation chunk names that document. Comparing raw
    // source_ids would flag every "<id>#N" as an orphan, since no producer emits those ids.
    // Rows written before chunking existed have no chunk_base and are their own base.
    const expected = new Set(pages.filter((p) => p.index_in_rag !== false).map((p) => p.source_id));
    const orphans = rows
      .map((r) => r.metadata?.chunk_base ?? r.metadata?.source_id)
      .filter((id) => typeof id === "string" && !expected.has(id));
    const orphanDocs = [...new Set(orphans)]; // several chunks can share one dead document
    if (orphanDocs.length > 0) {
      const list = orphanDocs.map((id) => `'${id}'`).join(", ");
      console.error(
        `\nORPHANED — ${orphanDocs.length} internal document(s) this run does not produce, ` +
        `across ${orphans.length} row(s). They are still retrievable by internal Donny and ` +
        `nothing updates them.\n` +
        orphanDocs.slice(0, 15).map((id) => `  - ${id}`).join("\n") +
        (orphanDocs.length > 15 ? `\n  … and ${orphanDocs.length - 15} more` : "") +
        `\nPrune with (matches chunks via chunk_base, and pre-chunking rows via source_id):\n` +
        `  delete from donny_knowledge where scope = 'internal'\n` +
        `    and coalesce(metadata->>'chunk_base', metadata->>'source_id') in (${list});`,
      );
    } else {
      console.log("Orphan check: no unproduced internal rows.");
    }
  }
} catch (e) {
  console.warn(`Orphan check skipped — ${e instanceof Error ? e.message : String(e)}`);
}

// `process.exitCode`, NOT `process.exit()` — same fix as sync-wiki-to-donny.mjs (#437). Calling
// process.exit() here tears the process down while undici still holds a pooled socket from the
// fetch loop above; on Windows that aborts with
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and REPLACES the exit code (an
// intended 1 was observed surfacing as 127). This path only runs when errors > 0 — i.e. exactly
// when the post-merge hook and CI need the code to be trustworthy.
if (errors > 0) process.exitCode = 1;
