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
const MAX_EMBED_CHARS = 24_000; // embed input is truncated; full_content is not

const WIKI_DIRS = ["concepts", "entities", "analyses"].map((d) => `docs/wiki/${d}`);

if (!URL || !KEY) {
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
    pages.push({
      source_id: `${sourcePrefix}:${slug}`,
      content: `${title}\n\n${body}`.slice(0, MAX_EMBED_CHARS),
      metadata: { title, type: fm.type ?? "internal_doc", path: filePath.replace(/\\/g, "/"), tags: fm.tags ?? "" },
      scope: "internal",
      full_content: raw,
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

console.log(`Found ${pages.length} internal pages. Syncing to ${URL} ...`);

let inserted = 0, updated = 0, errors = 0;
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
  console.log(`Batch ${i / BATCH + 1}: +${json.inserted} inserted, ~${json.updated} updated, ${json.errors} errors`);
}

console.log(`\nDone. inserted=${inserted} updated=${updated} errors=${errors}`);

// `process.exitCode`, NOT `process.exit()` — same fix as sync-wiki-to-donny.mjs (#437). Calling
// process.exit() here tears the process down while undici still holds a pooled socket from the
// fetch loop above; on Windows that aborts with
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and REPLACES the exit code (an
// intended 1 was observed surfacing as 127). This path only runs when errors > 0 — i.e. exactly
// when the post-merge hook and CI need the code to be trustworthy.
if (errors > 0) process.exitCode = 1;
