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
import { chunkDocument, chunkSourceId, HARD_MAX_CHARS } from "./chunk-doc.mjs";

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
    const chunks = chunkDocument(title, body);
    chunks.forEach((content, i) => {
      pages.push({
        source_id: chunkSourceId(base, i),
        content,
        metadata: chunks.length > 1 ? { ...metadata, chunk: i, chunk_total: chunks.length } : metadata,
        scope: "internal",
        ...(i === 0 ? { full_content: raw, chunk_total: chunks.length } : {}),
      });
    });
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
const docCount = new Set(pages.map((p) => p.metadata.path)).size;
const unindexed = pages.filter((p) => p.index_in_rag === false);
const multi = pages.filter((p) => p.chunk_total > 1);
console.log(
  `Found ${docCount} internal documents -> ${pages.length - unindexed.length} embedded chunk(s)` +
  `, ${unindexed.length} stored unindexed.`,
);
for (const p of multi) console.log(`  chunked: ${p.metadata.path} -> ${p.chunk_total} chunks`);
for (const p of unindexed) console.log(`  unindexed (internal_docs only): ${p.metadata.path}`);

// Nothing may go out oversize. A chunk past the embedding cliff 502s its ENTIRE batch, so one
// bad document would take 19 good ones down with it — fail here, where the message names the
// file, rather than in an OpenAI error that names nothing.
const oversize = pages.filter((p) => p.content && p.content.length > HARD_MAX_CHARS);
if (oversize.length > 0) {
  for (const p of oversize) console.error(`OVERSIZE ${p.source_id}: ${p.content.length} > ${HARD_MAX_CHARS}`);
  console.error("chunkDocument must not emit a chunk this large — fix the chunker, do not raise the cap.");
  process.exit(1);
}

if (DRY_RUN) {
  const embedChars = pages.reduce((n, p) => n + (p.content?.length ?? 0), 0);
  const sourceChars = [...new Set(pages.map((p) => p.metadata.path))]
    .reduce((n, path) => n + readFileSync(path, "utf8").length, 0);
  console.log(
    `\nDry run — nothing sent. ${embedChars} of ${sourceChars} source chars embedded ` +
    `(${Math.round((embedChars / sourceChars) * 100)}%; the rest is the unindexed document above).`,
  );
  process.exit(0);
}

console.log(`Syncing to ${URL} ...`);

let inserted = 0, updated = 0, errors = 0, unindexedCount = 0;
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
  console.log(`Batch ${i / BATCH + 1}: +${json.inserted} inserted, ~${json.updated} updated, ${json.errors} errors`);
}

console.log(`\nDone. inserted=${inserted} updated=${updated} unindexed=${unindexedCount} errors=${errors}`);

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
    `${restUrl}?select=metadata->>source_id&scope=eq.internal`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  if (!resp.ok) {
    console.warn(`Orphan check skipped — donny_knowledge read returned ${resp.status}.`);
  } else {
    const rows = await resp.json();
    const expected = new Set(pages.filter((p) => p.index_in_rag !== false).map((p) => p.source_id));
    const orphans = rows
      .map((r) => r["source_id"] ?? r["?column?"])
      .filter((id) => typeof id === "string" && !expected.has(id));
    if (orphans.length > 0) {
      console.error(
        `\nORPHANED rows — ${orphans.length} internal row(s) this run does not produce. They are ` +
        `still retrievable by internal Donny and nothing updates them.\n` +
        orphans.slice(0, 15).map((id) => `  - ${id}`).join("\n") +
        (orphans.length > 15 ? `\n  … and ${orphans.length - 15} more` : "") +
        `\nPrune with:\n  delete from donny_knowledge where scope = 'internal' ` +
        `and metadata->>'source_id' in (${orphans.slice(0, 15).map((id) => `'${id}'`).join(", ")}` +
        `${orphans.length > 15 ? ", …" : ""});`,
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
