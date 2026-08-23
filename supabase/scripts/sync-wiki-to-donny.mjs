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

// ── This script publishes to the CONSUMER scope, and does nothing else ────────────────────
//
// It syncs exactly the pages listed in CONSUMER below — currently **none** — at consumer scope
// (`scope` omitted ⇒ null). Every other wiki page is deliberately not sent, because
// `sync-internal-docs.mjs` ALREADY syncs the whole `docs/wiki/` tree as `internal-<dir>:<slug>`
// at scope "internal", and `wiki-merge-pr` writes that same namespace via
// `_shared/wiki-sync-payload.ts`. So the internal copy has two writers and this has one, and the
// `wiki:<dir>/<slug>` namespace exists for one purpose: the consumer scope.
//
// WHY IT SENDS NOTHING TODAY. The wiki is an engineering and founder notebook, written for an
// internal reader — schema, RLS holes, deploy runbooks, vendor spend, margin strategy ("all four
// streams stack on one customer"), product-decision framing ("MVPs over-gate"). Consumer product
// knowledge lives in `help_articles` and the /help center, which is what users actually read.
// An empty set is a valid, and currently the correct, state.
//
// HOW THIS GOT HERE, because the shape matters more than the list:
//
//   1. Two denylists, one of them dead. `EXCLUDE` (19 pages) gated on SYNC_CURATE=1, which the
//      unattended `npm run sync:wiki` from the post-merge hook never sets, so its pages reached
//      the CONSUMER RAG at scope null on every merge. Prod 2026-08-10: 107 of 112 rows
//      consumer-reachable. The worst page was on NEITHER list — `entities/dragoncandy-platform`
//      states the live user count, the vendor-by-vendor burn and "Stripe test mode" — because a
//      denylist FAILS OPEN, holding only what someone thought to enumerate.
//   2. PR #434 inverted it to this allowlist and marked every non-listed page "internal", which
//      closed the leak (verified: consumer-reachable 0 of 247).
//   3. PR #436 (this) stops sending them at all. Marking 100+ pages internal duplicated rows that
//      `sync-internal-docs.mjs` already writes — measured on prod, **113 pages embedded twice,
//      109 of them byte-identical** — so internal Donny could spend two of its five RAG slots on
//      one page, and every sync paid double the embedding cost. It also subjected the duplicate
//      to this script's hard `FAIL_CHARS` skip. (That clause used to add "while the internal copy
//      handles the same page gracefully — truncate-embed with the full markdown preserved in
//      internal_docs". That was wrong: `internal_docs` is not what Donny retrieves from, so the
//      truncated half was the only half he could see. Both paths now chunk instead.)
//
// TO PUBLISH A PAGE TO CONSUMERS: read it end to end first and edit out anything an end user must
// not read — then add its exact "<dir>/<filename>" here. Preview with
// `SYNC_DRY_RUN=1 node supabase/scripts/sync-wiki-to-donny.mjs`, which prints the list and POSTs
// nothing. TO UNPUBLISH ONE: remove it here AND prune its row — see the orphan check below, which
// exists precisely because removing it here is not self-healing.
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
    // Allowlist ONLY — see CONSUMER above. A page that is not listed is not this script's
    // business: `sync-internal-docs.mjs` already syncs it at internal scope.
    if (!CONSUMER.has(`${dir}/${name}`)) continue;
    consumerSeen.add(`${dir}/${name}`);
    const slug = name.replace(/\.md$/, "");
    const raw = readFileSync(join(WIKI_ROOT, dir, name), "utf8");
    const { fm, body } = parseFrontmatter(raw);
    const title = fm.title ?? slug;
    // No `scope` key ⇒ donny-knowledge-sync stores scope null ⇒ consumer-reachable. That is the
    // entire point of this script, so it is stated rather than left as an absence.
    pages.push({
      source_id: `wiki:${dir}/${slug}`,
      content: `${title}\n\n${body}`,
      metadata: { title, type: fm.type ?? dir, path: `${WIKI_ROOT}/${dir}/${name}`, tags: fm.tags ?? "" },
    });
  }
}

// Staleness guard on CONSUMER: it is keyed on exact "<dir>/<filename>" strings, so a rename,
// move or split silently stops the match firing. The page then stops being published with no
// signal — the same silent rot that let `EXCLUDE` sit dead for months.
//
// NOT A HARD ABORT. The version of this guard that threw was protecting a DENYLIST, where a
// stale entry meant a page was about to be published at scope null — refusing to sync genuinely
// prevented that. Here a stale entry only means one page is not published, which is the safe
// direction, so it names the entries, syncs the rest, and exits 1.
//
// It names them. An earlier version reported only a count ("expected 2, found 1"), which said a
// path was wrong but not WHICH — and since the sync runs unattended from the post-merge hook,
// the failure surfaced as a silently stale RAG.
/** Set by the orphan check below; carried into the exit code so drift is never a silent pass. */
let orphanCount = 0;
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

// HISTORY, and why the hard size gate that used to live here is gone.
//
// One oversized page used to fail its WHOLE batch: the embedding call sends the batch as a
// single `input` array, so OpenAI's 8,192-token-per-input limit rejected all of them. On
// 2026-07-26 a 33 KB concepts page did exactly that — "Invalid 'input[8]': maximum input length
// is 8192 tokens" → 41 unrelated pages never reached the RAG. The empirical cliff sat between
// 29,865 chars (synced fine) and 33,369 (rejected), so this file skipped anything over 31,000.
//
// donny-knowledge-sync now chunks every page it receives (_shared/chunk-doc.ts), which removes
// the cliff rather than avoiding it: no single embedding input is anywhere near the limit, so
// there is nothing left for a size gate to protect and skipping a page would simply drop it.
//
// The sibling claim in this block is also dead: it said a consumer page could not use "the
// truncate-embed-but-store-full trick sync-internal-docs.mjs relies on". That trick was never a
// trick, it was a defect — the truncated half was the only half Donny could retrieve — and it
// no longer exists on either path.
const WARN_CHARS = 24_000;

// THE HARD SKIP IS GONE — donny-knowledge-sync now chunks (see _shared/chunk-doc.ts), so a long
// page becomes several rows instead of one oversize embedding input, and the cliff above is no
// longer reachable. Skipping it would now DROP a page for no reason, which is the same
// content-loss class this comment block was written to prevent.
//
// The warning stays, because size is still a signal about the PAGE even when it is no longer a
// risk to the sync: a wiki page over this length is usually covering two subjects and reads
// better split into focused siblings.
for (const p of pages.filter((p) => p.content.length > WARN_CHARS)) {
  console.warn(`WARNING: ${p.source_id} is ${p.content.length} chars — it will be chunked, but a page this size usually covers two subjects. Consider splitting it.`);
}
const syncable = pages;

// Always report what is being published. Compare against the DB after a sync:
//   select coalesce(scope,'NULL'), count(*) from donny_knowledge
//   where metadata->>'source_id' like 'wiki:%' group by 1;
// Expected: exactly these source_ids, all at NULL. Anything else is an orphan (see below).
console.log(
  `Publishing ${pages.length} page(s) to the CONSUMER scope` +
  `${pages.length === 0 ? " — the allowlist is empty, which is the expected state" : ""}.`
);
for (const p of pages) console.log(`  consumer: ${p.source_id}`);

if (DRY_RUN) {
  console.log(`\nDry run — nothing sent. ${pages.length} pages scanned.`);
  process.exit(missingConsumer.length > 0 ? 1 : 0);
}

// ── Orphan check (READ-ONLY) ──────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS. Before PR #436 this script sent EVERY page, marking unlisted ones "internal",
// which made it self-healing: dropping a page from the allowlist overwrote its row back to
// internal on the next run. Sending only allowlisted pages is what removes the duplicate rows,
// but it costs exactly that property — a page removed from CONSUMER is simply no longer sent,
// so its row sits at scope null, consumer-retrievable, forever. That is the same silent rot
// `EXCLUDE` had, and the lesson from that one is that a rule living only in a comment does not
// hold. So the rule gets a check.
//
// It only READS. Pruning would mean giving a sync script DELETE on donny_knowledge, and the
// blast radius of a bad filter there is worse than the drift it fixes; the fix is a one-line
// SQL a human runs, which this prints. It also catches the pre-existing orphan class this file
// already documented — renaming ANY wiki page strands its old row, because nothing deletes.
//
// FAILS OPEN on a transport/permission error, deliberately: the sync itself did not create the
// drift, so a REST blip must not fail an otherwise good run. Skipped entirely under DRY_RUN
// (which is offline by contract — it needs no URL or key).
try {
  const restUrl = URL.replace(/\/functions\/v1\/.*$/, "/rest/v1/donny_knowledge");
  const resp = await fetch(
    `${restUrl}?select=scope,metadata&metadata->>source_id=like.wiki:*`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  if (!resp.ok) {
    console.warn(`Orphan check skipped — donny_knowledge read returned ${resp.status}.`);
  } else {
    const rows = await resp.json();
    // Compare DOCUMENTS, not rows. donny-knowledge-sync chunks a long page into
    // `wiki:<dir>/<slug>` plus `wiki:<dir>/<slug>#1…#N`, and no producer ever emits those
    // suffixed ids — so an exact source_id comparison would report every continuation chunk of
    // a legitimately published page as an orphan, exit the unattended sync non-zero, and print
    // DELETE SQL for live consumer content. `chunk_base` names the document a chunk belongs to;
    // rows written before chunking existed have none and are their own base.
    const expected = new Set(pages.map((p) => p.source_id));
    const orphans = rows
      .map((r) => ({ id: r.metadata?.chunk_base ?? r.metadata?.source_id, scope: r.scope }))
      .filter((r) => typeof r.id === "string" && !expected.has(r.id));
    if (orphans.length > 0) {
      // Report the scope per row rather than asserting one. These rows are unmaintained either
      // way, but only the scope-null ones are a live exposure — and claiming more than that is
      // the same defect this file's history is full of.
      const reachable = orphans.filter((r) => r.scope === null || r.scope !== "internal");
      console.error(
        `\nORPHANED rows — ${orphans.length} row(s) under the "wiki:" namespace that this ` +
        `allowlist does not publish. Nothing updates or deletes them; they duplicate the ` +
        `internal-<dir>:<slug> rows sync-internal-docs.mjs maintains.\n` +
        orphans.slice(0, 10).map((r) => `  - ${r.id} (scope ${r.scope ?? "NULL"})`).join("\n") +
        (orphans.length > 10 ? `\n  … and ${orphans.length - 10} more` : "") +
        `\n${reachable.length} of them are CONSUMER-RETRIEVABLE (scope null).` +
        `${reachable.length === 0 ? " None are a live exposure — this is cleanup, not a leak." : " That IS a live exposure."}` +
        `\nPrune with (chunk_base catches a chunked page's continuation rows; source_id ` +
        `catches rows written before chunking existed):\n` +
        `  delete from donny_knowledge where metadata->>'source_id' like 'wiki:%';\n` +
        `(if the allowlist is non-empty, add "and coalesce(metadata->>'chunk_base', ` +
        `metadata->>'source_id') not in (…)" — never filter on source_id alone, which would ` +
        `spare a published page's chunk 0 and delete all of its continuation chunks).`
      );
      orphanCount = orphans.length;
    }
  }
} catch (e) {
  console.warn(`Orphan check skipped — ${(e instanceof Error ? e.message : String(e))}`);
}

console.log(`Found ${pages.length} in-scope wiki pages. Syncing to ${URL} ...`);

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

console.log(`\nDone. inserted=${inserted} updated=${updated} errors=${errors} orphans=${orphanCount}`);

// `process.exitCode`, NOT `process.exit()`. Since the orphan check added a second fetch host,
// calling process.exit() here tore the process down while undici still held a pooled socket,
// which on Windows aborts with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and a
// 127 — masking the 1 this line means to return. Setting exitCode lets the loop drain and exit
// with the intended status.
if (errors > 0 || missingConsumer.length > 0 || orphanCount > 0) {
  process.exitCode = 1;
}
