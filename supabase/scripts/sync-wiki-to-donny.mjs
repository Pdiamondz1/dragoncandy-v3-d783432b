// sync-wiki-to-donny.mjs  (Node 18+, uses global fetch)
// Client side of the autoresearch `sync-donny` step: reads verified wiki pages and
// POSTs them to the donny-knowledge-sync edge function, which embeds + upserts them
// into donny_knowledge so Donny's RAG can retrieve them.
//
// Scope (per the autoresearch skill): concepts/, entities/, analyses/ only.
// Idempotent: the function keys on metadata.source_id ("wiki:<type>/<slug>").
//
// Auth: use the project's NEW Secret key (sb_secret_…) — the value injected into the
// edge function as SUPABASE_SERVICE_ROLE_KEY on new-API-key-system projects. The legacy
// service_role JWT (eyJ…) will NOT match and returns 401. Get it from the dashboard:
// Project Settings → API Keys → Secret keys.
//
// Usage (run from the repo/worktree root; never commit a key):
//   set DONNY_SYNC_URL=https://<ref>.supabase.co/functions/v1/donny-knowledge-sync
//   set SUPABASE_SECRET_KEY=sb_secret_xxx
//   node supabase/scripts/sync-wiki-to-donny.mjs
//
// Default target is staging — promote to prod only after verifying retrieval.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WIKI_ROOT = process.env.WIKI_ROOT ?? "docs/wiki";
const URL = process.env.DONNY_SYNC_URL;
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIRS = ["concepts", "entities", "analyses"];
const BATCH = 50;

// Curation: with SYNC_CURATE=1 (use for the user-facing prod assistant), skip internal
// engineering / infra / ops / internal-strategy pages so Donny only retrieves
// product/content-relevant knowledge in end-user chats. Edit as the wiki grows.
const CURATE = process.env.SYNC_CURATE === "1";
const EXCLUDE = new Set([
  "self-improving-app", "migration-replay-drift", "qa-cicd-gate", "typescript-patterns",
  "error-handling-patterns", "content-delivery-state-machine", "boost-payment-two-path",
  "payments-split-by-surface", "data-flywheel", "musks-algorithm", "north-star-kpi-scorecard",
  "supabase", "capacitor-native-shell", "file-management", "organizations", "stripe-connect",
  "content-engine-data-audit", "claude-skills-framework-audit", "claude-subagents-audit",
]);

// Forced-internal (unconditional — NOT gated behind SYNC_CURATE, unlike EXCLUDE above):
// these two pages are DRE ENGINEERING docs describing phases that were never built
// (referrals, streaks, "Hype Weeks", point redemption). If consumer Donny can retrieve
// them, he promises users rewards that don't exist. donny-knowledge-sync recomputes
// `scope` from this script's payload on EVERY sync, insert or update (it does not
// preserve whatever is already in the DB), so a one-off DB fix does not hold — this
// script must always send scope: "internal" for these paths, including on the
// unattended post-merge sync. Keyed on the exact "<dir>/<filename>" pair (not a slug
// substring) so an unrelated future page can never be swallowed by a loose match.
const FORCE_INTERNAL = new Set([
  "concepts/dragon-rewards-engine.md",
  "analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md",
]);

if (!URL || !KEY) {
  console.error("Set DONNY_SYNC_URL and SUPABASE_SECRET_KEY (the sb_secret_… key).");
  process.exit(1);
}

function parseFrontmatter(raw) {
  // Tolerate both LF and CRLF (Windows checkouts) line endings.
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: m[2].trim() };
}

const pages = [];
for (const dir of DIRS) {
  let entries;
  try {
    entries = readdirSync(join(WIKI_ROOT, dir));
  } catch {
    continue;
  }
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const slug = name.replace(/\.md$/, "");
    if (CURATE && EXCLUDE.has(slug)) continue;
    const raw = readFileSync(join(WIKI_ROOT, dir, name), "utf8");
    const { fm, body } = parseFrontmatter(raw);
    const title = fm.title ?? slug;
    const page = {
      source_id: `wiki:${dir}/${slug}`,
      content: `${title}\n\n${body}`,
      metadata: { title, type: fm.type ?? dir, path: `${WIKI_ROOT}/${dir}/${name}`, tags: fm.tags ?? "" },
    };
    // Unconditional — see FORCE_INTERNAL above. donny-knowledge-sync reads page.scope.
    if (FORCE_INTERNAL.has(`${dir}/${name}`)) page.scope = "internal";
    pages.push(page);
  }
}

// Guard on FORCE_INTERNAL itself: it is the sole durable protection on the honesty hole
// described above, keyed on exact "<dir>/<filename>" strings. If either backing wiki file
// is ever renamed or moved, the match silently stops firing, the next sync re-inserts that
// page at scope null, and the hole reopens with NO error signal. Fail loudly instead.
const forcedInternalCount = pages.filter((p) => p.scope === "internal").length;
if (forcedInternalCount !== FORCE_INTERNAL.size) {
  throw new Error(
    `FORCE_INTERNAL guard failed: expected ${FORCE_INTERNAL.size} pages forced to scope "internal", but found ${forcedInternalCount}. ` +
    `A wiki file backing FORCE_INTERNAL was probably renamed or moved — update the FORCE_INTERNAL set in supabase/scripts/sync-wiki-to-donny.mjs to match its new "<dir>/<filename>" path.`
  );
}

// One oversized page fails its WHOLE batch (the embedding call sends the batch as a single
// `input` array, so OpenAI's 8,192-token-per-input limit rejects all 50). On 2026-07-26 a
// 33 KB concepts page did exactly that: "Invalid 'input[8]': maximum input length is 8192
// tokens" → 41 unrelated pages never reached the RAG. Wiki pages cannot use the
// truncate-embed-but-store-full trick sync-internal-docs.mjs relies on (the edge function
// rejects `full_content` on non-internal scope), so the fix is to keep pages small — this
// check names the offender instead of leaving a 502 to decode.
// Calibrated empirically, NOT theoretically — the char:token ratio varies with how much code,
// table pipe and symbol a page carries, so these are the observed data points:
//   29,865 chars — synced fine (analyses/…dre-full-system-spec.md)
//   33,369 chars — REJECTED  (concepts/synthetic-weight-engine.md, before its split)
// The cliff is somewhere between. Re-calibrate here if a page under FAIL_CHARS still 502s.
const FAIL_CHARS = 31_000;
const WARN_CHARS = 24_000;

// An oversized page is SKIPPED, never fatal: the other pages still sync and the exit code
// carries the failure. Blocking the whole run would reproduce the very defect this guards.
const oversized = pages.filter((p) => p.content.length > FAIL_CHARS);
for (const p of pages.filter((p) => p.content.length > WARN_CHARS && p.content.length <= FAIL_CHARS)) {
  console.warn(`WARNING: ${p.source_id} is ${p.content.length} chars — approaching the embedding ceiling. Split it soon.`);
}
for (const p of oversized) {
  console.error(`SKIPPING ${p.source_id} — ${p.content.length} chars exceeds ~${FAIL_CHARS}; it would fail its entire batch. Split it into focused siblings (a page this size is usually covering two subjects) and re-run.`);
}
const syncable = pages.filter((p) => p.content.length <= FAIL_CHARS);

console.log(`Found ${pages.length} in-scope wiki pages${oversized.length ? ` (${oversized.length} skipped as oversized)` : ""}. Syncing to ${URL} ...`);

let inserted = 0, updated = 0, errors = 0;
for (let i = 0; i < syncable.length; i += BATCH) {
  const batch = syncable.slice(i, i + BATCH);
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

console.log(`\nDone. inserted=${inserted} updated=${updated} errors=${errors} skipped=${oversized.length}`);
if (errors > 0 || oversized.length > 0) process.exit(1);
