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
// SYNC_DRY_RUN=1 scans and prints the consumer/internal split, then exits without POSTing —
// so an edit to CONSUMER below can be checked before it reaches prod. Needs no URL or key.
const DRY_RUN = process.env.SYNC_DRY_RUN === "1";

// ── Scope: the wiki is INTERNAL BY DEFAULT ────────────────────────────────────────────────
//
// Every page this script sends is marked scope:"internal" unless its exact "<dir>/<filename>"
// is listed in CONSUMER below. `donny-knowledge-sync` recomputes `scope` from this payload on
// EVERY sync, insert or update — it does not preserve what is already in the DB — so this
// script is the sole source of truth and a one-off DB fix does not hold.
//
// WHY DEFAULT-INTERNAL, AND WHY THE PREVIOUS SHAPE FAILED. This used to be two denylists:
// `EXCLUDE` (19 pages, gated behind SYNC_CURATE=1) and `FORCE_INTERNAL` (5 pages,
// unconditional). The unattended sync — `npm run sync:wiki`, fired by the post-merge hook —
// never set SYNC_CURATE, so all 19 `EXCLUDE` pages synced to the CONSUMER RAG at scope null on
// every merge. Verified on prod 2026-08-10: 107 of 112 wiki rows were consumer-reachable.
//
// But the deeper defect was the denylist SHAPE, not the dead gate. A denylist fails OPEN: it
// only holds pages someone thought to enumerate, so every page `/wiki-ops ingest` adds is
// consumer-reachable until noticed. The pages that leaked worst were on NEITHER list —
// `entities/dragoncandy-platform` states the live user count, the monthly burn broken down by
// vendor, and that Stripe is in test mode, and `donny-orchestrator` hands consumer RAG chunks
// straight to the `general` catch-all agent, so "what is DragonCandy?" could retrieve it.
//
// An allowlist fails CLOSED, which is the correct direction here because the wiki is not
// consumer material in the first place: it is an engineering and founder notebook, written for
// an internal reader. Its pages carry schema, RLS holes, deploy runbooks, vendor spend, margin
// strategy ("all four streams stack on one customer") and product-decision framing ("MVPs
// over-gate"). Consumer product knowledge lives in `help_articles` and the /help center, which
// is what users actually read.
//
// NOTHING IS LOST INTERNALLY. `sync-internal-docs.mjs` already writes an
// `internal-<dir>:<slug>` copy of every wiki page at scope "internal" — verified 1:1 on prod
// (112 wiki pages, 112 internal copies). Internal Donny reads those; these `wiki:` rows exist
// only to populate the consumer scope.
//
// KNOWN SIDE EFFECT OF THE FLIP, checked rather than assumed: in donny-knowledge-sync, a page
// sent with scope "internal" and no `full_content` also does a `select archived_at from
// internal_docs where path = metadata.path`, and an archived doc gets its donny_knowledge row
// DELETED instead of upserted. That branch used to see 5 pages and now sees all of them. On
// prod 2026-08-10 `internal_docs` holds 114 `docs/wiki/%` paths with **0** archived, so this is
// a no-op today; going forward it is the behaviour you want — archiving a wiki doc through
// `internal_doc_archive()` now also prunes its consumer-facing row instead of leaving it live.
//
// TO PUBLISH A PAGE TO CONSUMERS: read it end to end first and edit out anything an end user
// must not read, then add its exact "<dir>/<filename>" here. An empty set is a valid, and
// currently the correct, state. Run with SYNC_DRY_RUN=1 to see the split before it reaches prod.
const CONSUMER = new Set([]);

if (!DRY_RUN && (!URL || !KEY)) {
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
/** Which CONSUMER entries the scan actually matched — drives the guard below. */
const consumerSeen = new Set();
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
    const raw = readFileSync(join(WIKI_ROOT, dir, name), "utf8");
    const { fm, body } = parseFrontmatter(raw);
    const title = fm.title ?? slug;
    const page = {
      source_id: `wiki:${dir}/${slug}`,
      content: `${title}\n\n${body}`,
      metadata: { title, type: fm.type ?? dir, path: `${WIKI_ROOT}/${dir}/${name}`, tags: fm.tags ?? "" },
    };
    // Internal by default — see CONSUMER above. donny-knowledge-sync reads page.scope.
    if (CONSUMER.has(`${dir}/${name}`)) {
      consumerSeen.add(`${dir}/${name}`);
    } else {
      page.scope = "internal";
    }
    pages.push(page);
  }
}

// Staleness guard on CONSUMER: it is keyed on exact "<dir>/<filename>" strings, so a rename,
// move or split silently stops the match firing. The page then stays internal under its new
// name and quietly disappears from consumer Donny with no signal — the same silent rot that
// let `EXCLUDE` sit dead for months.
//
// THIS IS DELIBERATELY NOT A HARD ABORT, and the reason is the inverted default. The version
// of this guard that threw was protecting a DENYLIST, where a stale entry meant a page was
// about to reach the consumer RAG at scope null — refusing to sync was the safe failure.
// Under an allowlist the failure direction flips: a stale entry means a page is MORE
// protected than intended, never less. Aborting every page over an over-protection bug
// would stop internal knowledge updating to guard against nothing, and would reproduce the
// very defect the oversized-page check below already refuses to reproduce. So: name the
// entries, sync everything, exit non-zero.
//
// It names the missing entries. An earlier version reported only a count ("expected 2, found
// 1"), which said a path was wrong but not WHICH — and since the sync runs unattended from
// the post-merge hook, the failure surfaced as a silently stale RAG.
const missingConsumer = [...CONSUMER].filter((k) => !consumerSeen.has(k));
if (missingConsumer.length > 0) {
  console.error(
    `CONSUMER guard failed — these entries matched no file on disk:\n` +
    missingConsumer.map((k) => `  - ${WIKI_ROOT}/${k}`).join("\n") +
    `\nA wiki file on the consumer allowlist was renamed, moved or split, so it is syncing as ` +
    `internal and consumer Donny can no longer retrieve it. Fix the CONSUMER set in ` +
    `supabase/scripts/sync-wiki-to-donny.mjs to match the paths that exist on disk (check with ` +
    `ls, not with a donny_knowledge query — a stale row outlives its file), then re-run.`
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

// Always report the scope split. This is the number to compare against the DB after a sync:
//   select coalesce(scope,'NULL'), count(*) from donny_knowledge
//   where metadata->>'source_id' like 'wiki:%' group by 1;
const consumerPages = pages.filter((p) => p.scope !== "internal");
console.log(
  `Scope: ${consumerPages.length} consumer, ${pages.length - consumerPages.length} internal ` +
  `(wiki is internal by default — see CONSUMER in this file).`
);
for (const p of consumerPages) console.log(`  consumer: ${p.source_id}`);

if (DRY_RUN) {
  console.log(`\nDry run — nothing sent. ${pages.length} pages scanned, ${oversized.length} oversized.`);
  process.exit(missingConsumer.length > 0 ? 1 : 0);
}

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
if (errors > 0 || oversized.length > 0 || missingConsumer.length > 0) process.exit(1);
