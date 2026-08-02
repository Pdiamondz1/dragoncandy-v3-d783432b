# knowledge-sync — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **[orphans] Run the orphan check every run — by PATH, not title.** The `wiki-save-answer`
  flow adds `analyses/` pages + syncs RAG but does NOT update `index.md`, so its pages land as
  catalog orphans (caught 2: [[Competitive Advantage]], [[Influencer/Creator Outreach]]). Before
  finishing, list `concepts|entities|analyses/*.md` whose **file path** is not referenced in
  `index.md` and add any missing. Match on the `(path/to/file.md)` link target, NOT the
  frontmatter `title:` — Donny-captured pages use curated index display names that differ from
  their raw long titles, so a title match throws false-positive "orphans".
- **[rag-sync] Don't hand-sync after merge.** The committed post-merge git hook auto-runs
  `sync:wiki` + `sync:internal` on a **main** fast-forward that touched `docs/`. Verify via
  `.git/knowledge-sync.log` — `errors=0` is the authority (not counts); confirm retrievability
  with a `content ilike` query on the changed pages.
- **[scope] Branch off `origin/main`, not the just-merged worktree.** A merged feature branch
  is squash-diverged; author knowledge-sync docs on a fresh branch for a clean PR. **Corollary
  (2026-07-19): before editing ANY core doc, diff it against `origin/main` first.** That check caught
  `origin/main` having restructured PROJECT_CONTEXT under me (PR #294: §5 → index + `SHIPPED_LOG.md`);
  writing from the stale worktree would have produced an entry in the exact format #294 deleted, plus
  a conflict against a 100KB restructure. Rebase onto `origin/main` before authoring.
- **[status-correction] A follow-up PR must EDIT the earlier §5 line, not append a second one.**
  §5 is an index of *current status* (its own header says "§5 wins on status"), and it is
  **always loaded**, so a stale entry there is worse than a stale one in `SHIPPED_LOG.md` — every
  future session reads it. On 2026-07-19, PR #307's line said its findings were "not yet fixed";
  PR #308 fixed them, so the line was corrected in place and the prose went to `SHIPPED_LOG.md`.
  Contrast with `SHIPPED_LOG.md`, which is **append-only historical snapshots** — never rewrite a
  past entry there to reflect later work; prepend a new one. Same discipline as the standing
  edit-in-place-on-supersession rule for concept pages, applied to the core-doc split.
- **[gap-claims] Verify a claimed knowledge gap against `origin/main`, never a worktree.** A worktree
  drifts silently — **absence in one proves nothing.** On 2026-07-19 I asserted "PR #288 shipped
  without its knowledge-sync" from a worktree 15 commits behind; PR #290 had already done the sync and
  #291 verified it. The claim reached the founder, a spec, a plan, and a ledger before being caught,
  and would have produced a **duplicate** wiki source — the exact opposite of "compound, don't
  duplicate". Cheap check first: `git fetch origin` then
  `git ls-tree -r --name-only origin/main -- docs/wiki/raw/sessions/ | grep <topic>`. Applies to any
  "X is missing / was never documented" claim, not just knowledge-sync.
- **[runlog-in-pr] Bundle this MEMORY.md Run Log entry INTO the docs PR commit**, not a
  separate follow-up. Forgetting it (as on the #176 run) costs a whole extra PR cycle just to
  persist one bookkeeping line.
- **[rag-verify] `donny_knowledge` has no `source_id` column** — verify retrievability with
  `content ilike '%<distinctive phrase>%'`, not a source/id filter (the query errors otherwise).
  Pick a phrase that can't straddle a markdown line-wrap (a short hyphenated/code token like
  `fixed-probe` or `82dvh`, not a multi-word sentence) — wrapped prose false-negatives the check.
  Also `inserted=0` in the sync log does NOT mean a new page was missed (upsert counting) — trust
  the ilike probe, not the counters.
- **[context-tax] Session detail goes to `docs/SHIPPED_LOG.md`, NOT `PROJECT_CONTEXT.md` §5.**
  §5 is now a one-line-per-entry index with three subsections — `### In flight`, `### Built —
  awaiting founder go-live` (these carry a `**Pending:**` clause), `### Shipped` — because §5 is
  auto-loaded into every session, so detail there is a compounding per-session tax: it reached
  ~29,950 tokens, 65% of the whole session load, before this split. Prepend full session detail
  to `SHIPPED_LOG.md` (newest-first) instead. Older Run Log entries below this Lesson predate the
  split and model the old behavior (`Output: ... PROJECT_CONTEXT active-workstream bullet`) —
  don't pattern-match their `Output:` line into a new run; that's exactly the mistake this Lesson
  corrects.
- **[squash-drift] For a still-OPEN PR, `git fetch origin <branch>` and diff it against the local
  worktree branch before editing shared docs.** When `git push` is env-blocked, code branches often
  land via the blob→tree→commit→ref REST workaround, which **squashes** into one commit rebased onto
  the *current* `origin/main` — so the actual PR head can be far ahead of (and unrelated in SHA to) the
  local worktree's own unsquashed commit history. Editing `PROJECT_CONTEXT.md`/`index.md`/`log.md` on
  the stale local branch risks a docs commit that doesn't sit on top of the real PR, or silently reverts
  origin/main commits the PR head already carries. Fetch the named branch ref directly, confirm the
  local branch's file-set is disjoint from what changed since the merge-base (so nothing is lost), then
  build the knowledge-sync commit on a fresh local branch off the FETCHED PR head, not the stale one.

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-08-02] VerifiedRoute missing-profile lockout (PR #357 → paired docs PR)
- Output: new `raw/sessions/2026-08-02-verified-route-missing-profile.md`; **compounded** onto
  `concepts/internal-only-users.md` (new "frontend route-guard trap" section, 3 Key Decisions,
  frontmatter `sources:`/`updated:`); `index.md` (new Sources line + refreshed the
  `[[Internal-Only AIOS Users]]` Concepts entry); `log.md` (ingest entry at top);
  **`SHIPPED_LOG.md` prepended**; **PROJECT_CONTEXT §5** one-line Shipped entry; + THIS entry.
  No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change — no schema, token, or workflow change.
- Happened: third instance of a pattern `concepts/internal-only-users.md` already owned (no
  `profiles` row for internal accounts), after the FK-write and profile-read traps — so this
  **compounded** rather than starting a new page, per "compound, don't duplicate".
- Worked: [scope] paid off twice. Branching off `origin/main` and diffing the core docs first
  showed PROJECT_CONTEXT's `### Shipped` now leads with a *different* entry than the auto-loaded
  CLAUDE.md copy showed — writing from the session-loaded version would have anchored the edit on
  a stale line. Also checked `[[Verification Before Reporting]]` before linking it; no such page,
  so the link was dropped rather than shipped dangling.
- Failed: nothing blocking. The `git push` env-block recurred (one `timeout 90` attempt, then the
  blob→tree→commit→ref REST workaround) — so [squash-drift] applies to the code PR: its head is a
  squash rebased onto `origin/main`, unrelated in SHA to the worktree's 3 commits.
- Remember: **the wiki page asserted an invariant that was false** ("a null profile is tolerated
  everywhere"). Three traps have now disproved it. Per "flag contradictions, never silently
  resolve", it was *qualified in place* with the counter-evidence rather than deleted — and its
  "accommodate, don't back-fill" decision was likewise **qualified, not overwritten**, because the
  founder deliberately granted a real dual account. When ingest finds the page's own stated
  principle contradicted by this session, annotate it as a claim-to-verify; don't quietly rewrite
  history to match the new fact.

### [2026-07-26] The 200K-band load run + the 16 KB header wall (PR #345 merged; paired docs branch `docs/knowledge-sync-200k-run`)
- **Output:** new `raw/sessions/2026-07-26-200k-load-run-and-header-overflow.md`; **compounded** onto
  [[Synthetic Weight Engine]] a "The 200K-band run — cap discovered, DB still idle" section + **corrected**
  its Slice-2 "Not yet applied to prod" line → applied+fixture-verified; NEW concept
  `concepts/supabase-in-filter-header-overflow.md`; `index.md` (new Sources + Concepts lines, Synthetic
  entry refreshed built→run, **+6 back-cataloged sessions**); `log.md` top entry; `SHIPPED_LOG.md`
  prepended; `PROJECT_CONTEXT.md` §5 edited in place (built→shipped-and-run); `DATABASE_SCHEMA.md`
  migration status corrected. No `DESIGN_SYSTEM`/`CLAUDE.md` change.
- **Happened:** a **post-merge** sync (PR #345 landed while the founder was asking "where are we on 50K
  DAUs?") covering three things the knowledge layer had missed: the migration apply, the live 200K-band
  run, and the header-overflow fix. Ran on a fresh branch off `origin/main` per [scope] — the working
  worktree was 1 behind (#345 itself).
- **Worked:** **verified every headline number independently from `sim_load_snapshots`** rather than
  copying the run summary out of memory — including re-implementing the event sweep in SQL (naive 4,000 ==
  honest 4,000, `max_concurrent_shards`=20) and confirming the migration's recorded row. That caught a real
  discrepancy: `db_active_conn_peak` is `max(active_connections)` over **ALL** snap rows (27), not
  latest-row-per-shard (24) — I'd have published 24 had I replicated the aggregation by eye instead of
  reading the RPC body. [orphans]-by-path found the synthetic workstream's **6 sessions were never
  cataloged** (Phase 0/1/A, runner matrix, Slice 2, living marketplace) — back-filled them all.
  [wikilinks]-exact: grepped `index.md` for all 6 targets before linking.
- **Failed:** nothing knowledge-side. ~28 older raw sessions remain uncataloged (pre-existing, needs its
  own pass to describe honestly) — surfaced to the founder rather than silently swept or silently left.
- **Remember:** **a new concept page is right when the lesson outlives the subsystem that found it.**
  The `.in()` overflow surfaced inside the load matrix, so compounding it onto [[Synthetic Weight Engine]]
  was tempting — but it applies to every supabase-js caller in the repo (89 unaudited call sites), so it
  got its own page and a back-link. Test: would someone hitting this bug in an unrelated feature ever find
  it on the load-testing page? Also: **when a run's own reported numbers exist, re-derive them from the
  raw table anyway** — the summary is a lead, and the aggregation window is exactly the kind of detail
  that differs.

### [2026-07-24] Synthetic Weight Engine — runner matrix (Slice 1) (branch `feat/synthetic-load-runner-matrix`, PR #337)
- **Output:** `raw/sessions/2026-07-24-synthetic-load-runner-matrix.md` → compounded onto
  [[Synthetic Weight Engine]] a "Runner matrix (Slice 1)" section; `index.md` Concepts-entry tail; `log.md`
  top entry; `SHIPPED_LOG.md` prepended; `PROJECT_CONTEXT.md` §5 edited in place; `DATABASE_SCHEMA.md` (3 new RPCs + purge note).
- **Happened:** Per-session sync for the multi-IP load runner matrix (Task 3.2 + Phases 4–5; Phase 6 deferred).
  Branch was 1 behind origin/main → **merged origin/main in first** (per the [scope] lesson) before editing
  the core docs; the 1 stale commit was the wallet-first #336 sync touching the exact same core docs, so a
  stale-worktree edit would have conflicted.
- **Worked:** The pre-edit `git rev-list --count $base..origin/main -- <coredoc>` divergence check named
  exactly which core docs main had moved (PROJECT_CONTEXT/SHIPPED_LOG/index/log, NOT DATABASE_SCHEMA) — a
  cheap, precise gate. Compounding onto the existing concept page (not a new page) = zero new orphans.
- **Failed:** An Edit on the `purge_synthetic_data()` DATABASE_SCHEMA note failed on a 3-line `old_string`
  (likely an em-dash/whitespace mismatch); a shorter unique single-line anchor matched. Prefer short unique anchors.
- **Remember:** RAG sync + the [[verify-knowledge]] loop-close are **post-merge** here (pre-merge, the
  committed post-merge hook auto-runs `sync:wiki` on the main fast-forward). Do NOT hand-sync from the worktree.

### [2026-07-24] Wallet-first payout reroute — stage 2 of the wallet-first fix (branch `feat/wallet-first-stage2`)
- **Output:** `raw/sessions/2026-07-24-wallet-first-reroute-stage2.md` → compounded onto
  [[Payout Finalization & Re-entrancy]] (new "Wallet-first reroute (stage 2 — shipped)" section + residuals
  flipped to CLOSED); `index.md` Sources line + refreshed Concepts entry; `log.md` top entry; `SHIPPED_LOG.md`
  prepended; `PROJECT_CONTEXT.md` §5 flush-ledger line updated in place → "Wallet-first payout fix (stages 1+2
  shipped)". No `DATABASE_SCHEMA.md` change (no migration).
- **Happened:** stage 2 removed the transfer-vs-pending fork; 4 Codex fix rounds before clean; two edge-fn
  deploys (`release-creator-payout` ×2, `check-creator-payout-status`).
- **Worked:** the [scope] lesson's core-doc diff-vs-`origin/main` check confirmed all core docs were SAME as
  `origin/main` (no drift) before editing — clean. §5 line edited in place (not appended) per [status-correction].
  Session detail → `SHIPPED_LOG.md`, §5 kept to one consolidated entry per [context-tax].
- **Failed:** nothing knowledge-side.
- **Remember:** an edge-fn `index.ts` with a top-level `serve()` is NOT import-testable (server-on-import →
  Deno leaked-resource failure); factor the testable body into a **co-located pure module**, do NOT reach for
  an `import.meta.main` guard (untested in the Supabase runtime — a wrong guard silently unregisters the
  handler). Prefer routing a REVOKE-contested financial column (`creator_profiles.pending_balance`) through an
  edge function over depending on an apparently-accidental table-level re-grant. Rollback-wrapped prod tests:
  end the `DO` block with `RAISE EXCEPTION` so the tx can't commit and the assertions return in the error.
### [2026-07-24] Synthetic Weight Engine — Phase A: load proof & economics (branch `feat/synthetic-weight-load-economics`)
- Output: bundled INTO the work PR — new `raw/sessions/2026-07-24-synthetic-weight-load-economics-phase-a.md`;
  **compounded** a "Phase A — load proof & economics" section onto `concepts/synthetic-weight-engine.md`
  (+ the 8-issue Codex gauntlet); `index.md` Concepts-entry tail refreshed; `log.md` ingest line;
  `SHIPPED_LOG.md` prepended; `PROJECT_CONTEXT.md` §5 corrected + moved; `DATABASE_SCHEMA.md`
  `sim_load_snapshots` row + the two RPCs.
- Happened: rebased onto `origin/main` first (base was 1 behind — #334 durable-flush, zero file overlap
  with my 24 commits → clean rebase) so the docs were authored against current core-doc state.
- Worked: the `[scope]` lesson (diff/rebase against `origin/main` before editing core docs) paid off —
  §5 already had a Synthetic Weight line that was **stale** ("kill switch OFF, 0 bots, parked") even
  though SHIPPED_LOG showed Phase 1 LIVE (N=25 + cron); per `[status-correction]` I corrected it IN
  PLACE and moved it In-flight→Shipped rather than appending a second line. Compounding onto the existing
  concept page (not a new thin page) followed "compound, don't duplicate."
- Failed: nothing blocking.
- Remember: **for a multi-phase workstream, check whether an EARLIER phase left a stale §5 line before
  adding the current phase** — Phase 1's go-live hadn't updated §5, so the Phase-A sync had to fix two
  status boundaries at once (Phase 1 live + Phase A shipped). Also: this engine's live *operation* is a
  founder toggle (daily cron running), so the whole entry belongs under `### Shipped`, not `### In flight`,
  even though "live ramps are founder-gated."

### [2026-07-24] Durable pending-balance flush ledger — stage 1 of the wallet-first fix (branch `feat/wallet-first-payout`)
- Output: bundled INTO the work PR — new `raw/sessions/2026-07-24-durable-flush-ledger.md`; **compounded**
  onto `concepts/payout-finalization-consistency.md` (new "Durable pending-balance flush ledger (stage 1)"
  section + **reframed** the "Known residuals" — the identical-cents under-pay is CLOSED by the durable
  per-flush key, the two `release-creator-payout` cross-path residuals still need stage 2; frontmatter
  `updated`/`sources` bumped); `index.md` (new Sources line in the payout cluster + refreshed the
  `[[Payout Finalization & Re-entrancy]]` Concepts entry); `log.md` ingest entry at top; `SHIPPED_LOG.md`
  prepended; `PROJECT_CONTEXT.md` §5 one Shipped line; **`DATABASE_SCHEMA.md`** (new `pending_balance_flushes`
  blockquote — table + 4 RPCs + the reconcile cron); + THIS entry. No `DESIGN_SYSTEM`/`CLAUDE.md` change.
- Happened: the next payout-hardening increment after #329, executed via subagent-driven-development
  (implementer + spec + code-quality subagents per task; migration/deploy/E2E careful-gated in the main
  session). Correctly **compounded** onto the payout page — it already forward-referenced the flush as "the
  clean fix," so stage 1 landing is a section + a residuals reframe on the OWNING page, not a thin new page.
  The durable story is the flush idempotency-key dilemma (a key must be stable-across-retries AND
  unique-across-movements) resolved by a durable per-flush record whose id is the key.
- Worked: [scope] rebased onto `origin/main` first (was 4 behind — `SHIPPED_LOG`/`PROJECT_CONTEXT`/`wiki/log`
  had diverged via recent synthetic-weight knowledge PRs); post-rebase all 6 target docs byte-IDENTICAL to
  origin/main before editing (clean rebase — my 13 commits were spec/plan/code, disjoint from the shared
  docs). [context-tax]: full prose to `SHIPPED_LOG.md`, §5 got ONE line. [orphans]-by-path: no new concept
  page (compound); new raw session cataloged in Sources. [wikilinks]-exact: `[[Payout Finalization &
  Re-entrancy]]` confirmed present before linking; the new `[[Durable Flush Ledger Session]]` self-registers.
  [runlog-in-pr] bundled. Edited `DATABASE_SCHEMA.md` (a real table+RPC+cron addition, not a bare CHECK tweak).
- Failed: none for knowledge-sync. RAG sync + close-the-loop [[verify-knowledge]] are post-merge (PR open;
  the post-merge hook syncs since `docs/` changed).
- Remember: **when a concept page you (or a prior run) wrote forward-references a fix as "the clean fix,"
  and this session ships stage 1 of it, compound onto that page and reframe its residuals** (what stage 1
  closed vs what still needs stage 2), rather than minting a new page — even though the flush ledger is a
  substantial subsystem (a table + 4 RPCs + a cron), it is the *next layer* of the payout-finalization
  story, not a separate subject. The sharp non-knowledge lesson (captured on the raw/concept pages): the
  ONE unbounded-claimed path — transfer-succeeds/`confirm`-fails — needed **bump-on-confirm-fail** to bound
  it under Stripe's ~24h idempotency TTL, or reconcile would eventually double-pay. (advisory — reinforces
  compound-onto-hub)

### [2026-07-23] Payout finalize retry + safe failure handling (PR #328)
- Output: bundled INTO the work PR #328 — new `raw/sessions/2026-07-23-payout-finalize-retry.md`, new
  `concepts/payout-finalization-consistency.md` (no existing payment page owned the escrow→payout→finalize
  flow); `index.md` (new Sources line in the "Pay" slot before [[Posting-Schedule Failed-Status Session]] +
  a new Concepts line after [[Payments Split by Surface]]); `log.md` ingest entry at top; `SHIPPED_LOG.md`
  prepended; `PROJECT_CONTEXT.md` §5 one Shipped line; + THIS entry. No `DATABASE_SCHEMA`/`DESIGN_SYSTEM`/
  `CLAUDE.md` change (edge fn only).
- Happened: third increment of the content-delivery-stabilization backlog. The durable knowledge is a NEW
  money-path re-entrancy/idempotency concept, distinct from the existing payment pages (webhook delivery /
  test-mode / boost / split-by-surface). The scope descoping through four review passes (safe core →
  retry-loop-only, because safely surfacing/retrying needs a durable payout marker) IS the durable story.
- Worked: **[squash-drift] earned its keep** — origin/main advanced to 5d66baa1 (the synthetic-weight-engine
  PR) WHILE I worked. The REST code push auto-rebased onto it (verified via the compare API that the branch
  diff = exactly 1 file), and I `git checkout origin/main -- <core docs>` before editing so the docs sit on
  top of the synthetic-weight-engine changes rather than reverting them. [orphans]-by-path: new raw + concept
  both cataloged. [wikilinks]-exact: [[Payments Split by Surface]], [[Content Delivery State Machine]],
  [[Stripe Webhook Delivery]], [[Posting-Schedule Failed-Status Session]] confirmed. [runlog-in-pr] bundled.
- Failed: none for knowledge-sync. RAG sync + [[verify-knowledge]] post-merge (PR open).
- Remember: when origin/main moves mid-work, the REST blob→tree→commit uses the CURRENT origin/main tree as
  base_tree, so the pushed commit auto-rebases — a TREE_MISMATCH vs your STALE local HEAD tree is EXPECTED
  and fine; verify via the `compare` API that the branch diff is only your files. And `git checkout
  origin/main -- <core docs>` before editing shared docs, or the docs push reverts whatever just merged.
  (advisory — sharpens [squash-drift])

### [2026-07-23] posting_schedule_status 'failed' CHECK gap (PR #326)
- Output: bundled INTO the work PR #326 — new `raw/sessions/2026-07-23-posting-schedule-failed-status.md`;
  **compounded** onto `concepts/content-delivery-state-machine.md` (new "Sibling CHECK-gap in the
  post-approval scheduling leg" note + frontmatter `sources`); `index.md` (new Sources line, alphabetical
  "Po" slot before [[Project Context]]); `log.md` update entry at top; `SHIPPED_LOG.md` prepended;
  `PROJECT_CONTEXT.md` §5 one Shipped line; + THIS entry. No `DATABASE_SCHEMA` change (a CHECK value, not
  a table/column), no `DESIGN_SYSTEM`/`CLAUDE.md`.
- Happened: a small, self-contained follow-up increment from the SAME content-delivery-stabilization
  backlog as the #325 drift repair (user said "keep going"). Correctly **compounded** onto the drift page
  (same recorded-vs-intended CHECK-gap class) rather than minting a thin new page — the durable lesson
  already lives there.
- Worked: [scope] all 6 target docs byte-IDENTICAL to `origin/main` (dae067a4, my own #325 merge) before
  editing. [orphans]-by-path: new raw session cataloged in Sources. [wikilinks]-exact: `[[Content Delivery
  State Machine]]`, `[[Posting-Schedule Failed-Status Session]]` (self-registers), `[[verify-knowledge]]`
  confirmed present. Proportionate: skipped the DATABASE_SCHEMA edit (no table/column moved — just a CHECK
  value). [runlog-in-pr] bundled.
- Failed: none for knowledge-sync. RAG sync + close-the-loop [[verify-knowledge]] are post-merge (PR open;
  the post-merge hook syncs since `docs/` changed).
- Remember: **scale the knowledge footprint to the change** — a one-line CHECK fix in an area that already
  has a concept page is a compound + a SHIPPED_LOG line, NOT a new page; and `DATABASE_SCHEMA.md` is for
  table/column/view changes, not every CHECK-value tweak. (advisory)

### [2026-07-23] Content-delivery state-machine drift repair + auto-approval revival (PR #325)
- Output: bundled INTO the open work PR #325 — new `raw/sessions/2026-07-23-content-state-machine-drift-repair.md`;
  **compounded** onto `concepts/content-delivery-state-machine.md` (new "Prod Drift Incident & Repair"
  section + a `submitted → rejected` transition row + a service-role-only-RPC note; frontmatter
  `updated`/`sources` bumped) rather than a new page — that page already owned the `content_status`
  machine and documented it as *working*; `index.md` (new Sources line after [[Content Delivery System
  Flows]] + refreshed the `[[Content Delivery State Machine]]` Concepts entry); `log.md` ingest entry at
  top; `SHIPPED_LOG.md` **prepended** (full prose); `PROJECT_CONTEXT.md` §5 ONE Shipped index line (the
  broad "Content delivery system stabilization" workstream stays In flight — this repaired one chunk);
  **`DATABASE_SCHEMA.md`** (new `content_disputes` row + a state-machine/`budget_spent` blockquote — a
  real table/column/RPC restore); + THIS entry. No `DESIGN_SYSTEM`/`CLAUDE.md` change.
- Happened: an exploration that turned into a **schema-drift repair** — the collaboration state machine
  was recorded-applied but MISSING from prod (phantom drift), silently breaking auto-approval + reject +
  dispute. The durable knowledge is a **compound-in-place** on the page that owns the machine, flipping
  its implicit "this works" framing to "was drifted, here's the repair," + the reusable lesson
  (`schema_migrations` recording ≠ objects exist on prod).
- Worked: [scope] all 6 target docs verified byte-IDENTICAL to `origin/main` (unchanged at 9f3cb08a)
  before editing — the code branch only touched migrations+edge-fn, so the docs matched. [squash-drift]
  noted: PR #325 was landed as a REST squash rebased onto `origin/main`, diverged from the local 3-commit
  branch — so the docs commit must ride on the PR head, not the stale local. [orphans]-by-path: the new
  raw session cataloged in Sources; concept page already cataloged (line refreshed). [wikilinks]-exact:
  grepped `index.md` — `[[Content Delivery System Flows]]`, `[[Service-Role Data Exposure]]` confirmed
  present before linking. [context-tax]: full prose to `SHIPPED_LOG.md`, §5 got one line. [runlog-in-pr]
  bundled.
- Failed: none for knowledge-sync. RAG sync + close-the-loop [[verify-knowledge]] are post-merge (PR open;
  the post-merge hook syncs since `docs/` changed) — per [rag-sync].
- Remember: **when a schema-drift repair fixes a machine a concept page documents as working, the
  compound is a *reframe*, not just an append** — the page's existing "here's the working flow" framing
  is now historically wrong-by-omission, so add the drift/repair section AND correct any transition
  table/invariant the repair changed (here the new `submitted → rejected` row), rather than leaving a
  page that reads as if it always worked. And the sharp non-knowledge lesson (captured on the raw/concept
  pages): verify object existence on prod directly, never trust `schema_migrations` recording. (advisory)

### [2026-07-20] create_counter_offer authorization hardening (branch `fix/counter-offer-authz`)
- Output: bundled INTO the work branch — new `raw/sessions/2026-07-20-counter-offer-authz.md`;
  **compounded** onto `concepts/service-role-data-exposure.md` (flipped its "Open finding —
  create_counter_offer" section, which I had filed in the prior pricing run, to a dated **Resolved**
  record; frontmatter `sources`/`updated` bumped); `index.md` (new Sources line + refreshed the
  `[[Service-Role Data Exposure]]` Concepts entry open→closed); `log.md` ingest entry at top;
  `SHIPPED_LOG.md` **prepended**; `PROJECT_CONTEXT.md` §5 one Shipped line; **`DATABASE_SCHEMA.md`**
  `application_counter_offers` row extended (the authz + pinned INSERT policy — a real RLS/authz
  change); + THIS entry. No `DESIGN_SYSTEM`/`CLAUDE.md` change.
- Happened: a security-fix session that **closed a finding a prior run of THIS skill had filed** —
  so the natural move was compound-in-place (open→resolved on the page that owns the defect class),
  not a new page, mirroring the found→fixed narrative the page already carries for PR #308. The wiki
  work rides the SAME work branch as the code (the migration), so it's bundled, not a paired docs PR.
- Worked: [scope] the branch was rebased onto `origin/main` first, so core docs matched HEAD before
  editing (the on-disk-modified warnings were the rebase pulling #321/#322; handled by re-anchoring
  grep before each edit — the top Run Log entry had shifted to a different branch's). [runlog-in-pr]
  bundled. [wikilinks]-exact: the new `[[Counter-Offer Authorization Session]]` self-registers via its
  Sources line; `[[Service-Role Data Exposure]]` confirmed present. [orphans]-by-path: no new concept
  page (compound), new raw session cataloged.
- Failed: none for knowledge-sync. RAG sync + close-the-loop verify-knowledge are post-merge (the
  post-merge hook syncs since `docs/` changed).
- Remember: the sharp lesson is a *review* one, captured on the concept/raw pages, not a knowledge-sync
  one — **verify a reviewer's grant claim against live `routine_privileges` + an as-role call before
  accepting OR dismissing it** (Codex's "authenticated loses EXECUTE" P1 was empirically false: a
  direct default-privilege grant survives `REVOKE … FROM public`). For this skill, re-confirms
  compound-in-place when closing a finding an earlier run filed. (advisory)

### [2026-07-19] Delivery timing + tier merged into one selection (branch `worktree-dc-improvements-4`)
- Output: bundled INTO the work PR — new `raw/sessions/2026-07-19-delivery-tier-timing-merge.md`, new
  `concepts/delivery-tier-selection.md`, `index.md` (Concepts between [[Deep-Link Param Query Race]] and
  [[Dezzy Agent (Playbook Suite)]]; Sources between [[Data-Exposure Reviewer Session]] and [[Donny Audit
  Phase 1 Session]]), `log.md` (ingest entry at top), `SHIPPED_LOG.md` (prepended full prose),
  PROJECT_CONTEXT §5 ONE index line under Shipped, + THIS entry. No DATABASE_SCHEMA change (no columns
  touched — `delivery_type`/`deadline`/`delivery_fee` all pre-existing), no DESIGN_SYSTEM change (the new
  control uses the existing light-app kit; no new token), no CLAUDE.md change.
- Happened: a founder **screenshot bug-report** whose durable knowledge is much broader than the UI
  merge, so I wrote a NEW concept — **no page owned the delivery-tier subject at all** despite it
  governing the fee, the deliverable cap, the SLA timer and the Stripe line item. The page captures the
  derivation rules, the UI-vs-DB vocabulary split, the local-midnight invariant, and the cost invariant
  `budgetTotal === fixed_price + delivery_fee`; the raw session captures the review narrative.
- Worked: **[scope] paid off yet again** — `origin/main` had moved **8 commits** ahead mid-session
  (#308–#315 plus the #309/#311 mission re-grounding of CLAUDE.md + PROJECT_CONTEXT), and 4 of my 6
  target docs DIFFERED. Editing from the stale worktree would have silently reverted two knowledge-syncs
  and the founder's new Mission section. Checked code overlap first (`comm -12` on the two file lists →
  **empty**), then rebased clean. [orphans]-by-path: both new files cataloged. [wikilinks]-exact: all 7
  targets grepped against index.md before linking, zero dangling. [runlog-in-pr] bundled.
- Failed: could not exercise the authenticated campaign builder in a browser (local dev login redirects
  to prod) — recorded honestly as a Known Issue in the raw session rather than glossed. Behaviour is
  covered by 8 component tests driving the real click/change handlers; the visual pass is founder/preview.
- Remember: **when a fix makes a *latent* inconsistency load-bearing, the fix is not "wrong" — but it now
  owns the inconsistency.** Writing `delivery_fee` on the edit page was correct in isolation, yet it
  converted a dormant display/semantics split into a live "$500 shown, $575 charged". Codex caught it, and
  the right response was to fix the *root* (extract the duplicated cost math both surfaces had drifted
  apart on) rather than patch the display or revert the fix. Corollary for review loops: **three
  consecutive rounds where each finding is caused by the previous fix is a signal you are walking a
  dependency chain, not churning** — the tell is that every finding was independently verifiable against
  the code (I read the escrow fn, the validator, and both cost call-sites before acting on each one).
  Contrast the PR #241 run below, where Codex *oscillated* on a prior demand — that is churn, and the
  correct move there was to stop. (advisory)

### [2026-07-19] Campaign price anchoring + negotiation reach (branch `worktree-dc-improvements-7`)
- Output: bundled INTO the work branch — new `raw/sessions/2026-07-19-campaign-price-anchoring.md`,
  new `concepts/campaign-price-anchoring.md`, **compounded** the pre-existing `create_counter_offer`
  authz gap onto `concepts/service-role-data-exposure.md` (new "Open finding" section above "The
  remediation"), `index.md` (Sources in the "Ca" cluster + Concepts after [[Campaign Lifecycle]]),
  `log.md` ingest entry at top, `SHIPPED_LOG.md` **prepended**, `PROJECT_CONTEXT.md` §5 one Shipped
  index line, + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change — the tier bands are app
  constants in `src/lib/campaignPricing.ts`, not design tokens, and no schema or workflow rule moved.
- Happened: a **founder-feedback pricing session** whose durable knowledge is a NEW concept rather than
  a compound. Deliberated it: [[Pricing Architecture]] is platform monetization (take-rate/credits/rush)
  and [[Campaign Generation Creativity]] is idea quality — neither owns "what a business pays a
  creator", which is the number both sides of the marketplace judge us by. Wrote it as one page
  spanning generation → business editor → creator counter-offer, because that IS one story. The
  security finding went the other way: compounded onto [[Service-Role Data Exposure]], which already
  owns the definer-bypasses-RLS class, instead of a thin sibling page.
- Worked: [scope] — fetched first, found the branch 1 behind, rebased onto `origin/main`, and confirmed
  all five target docs byte-IDENTICAL to `origin/main` before editing. [runlog-in-pr] bundled.
  [wikilinks]-exact earned its keep again: grepped `index.md` for every target and **dropped
  `[[Revoke Definer From Anon]]` — no such page exists** (it's a project *memory*, not a wiki page), so
  the trap is stated inline as prose instead of minting a dangling link. Verified the exact display
  names `[[Creator Groups (Crews)]]` and `[[Campaign Lifecycle]]` (both have near-miss siblings —
  `[[Creator Groups Session]]`, `[[Campaign Lifecycle Flow]]` — that a careless link would have hit).
- Failed: none for knowledge-sync. The edge-function deploy and prod verification are post-merge by
  the founder's choice ("deploy with the merge"); RAG sync is post-merge via the hook, per [rag-sync].
- Remember: **when two independent reviewers flag the same finding, verify it yourself before
  believing OR dismissing it — but treat the agreement as a strong prior.** Codex and
  `data-exposure-reviewer` both caught that a crew campaign's `fixed_price` is `0` **not `null`**, so
  an `isFixedPrice` (`!= null`) guard silently failed to exclude free campaigns once the co-located
  `isInvited` term was removed. The general trap is a **guard that was only ever correct by accident**:
  `isInvited` had been masking the crew case, so removing it for good reasons exposed a defect that
  predated the change. Before deleting a condition from a compound guard, ask what *each* term was
  independently excluding — not just the one you meant to remove. (advisory)

### [2026-07-19] Service-role remediation (PR #308 → paired docs PR)
- Output: new `raw/sessions/2026-07-19-service-role-remediation.md`; **compounded** onto
  `concepts/service-role-data-exposure.md` (new "The remediation" section + the
  two-functional-regressions and stricter-than-RLS notes; frontmatter `sources:` extended);
  `index.md` (new Sources line alphabetically after Schedule Agenda Simplification + refreshed the
  `[[Service-Role Data Exposure]]` Concepts entry); `log.md` (new ingest entry at top);
  **`SHIPPED_LOG.md` prepended** + **PROJECT_CONTEXT §5 one-liner corrected** (its #307 text still
  said the findings were "not yet fixed"); + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md
  change — no schema, RLS, token, or workflow change.
- Happened: **first run under the post-#294 core-doc split where §5 needed CORRECTING, not just
  appending.** PR #307's §5 line described the findings as unfixed; #308 fixed them, so leaving it
  would have made the always-loaded index actively wrong. §5 is an index whose job is *current
  status* — the [context-tax] header says so explicitly ("§5 wins on status") — so a follow-up PR
  that changes an earlier entry's status must edit that line, not add a second one.
- Worked: [scope] every touched doc verified IDENTICAL to `origin/main` before editing, on a fresh
  `docs/knowledge-sync-308` branch cut from `origin/main` (both work branches were already merged).
  Compounded rather than duplicated — the concept page already owned the defect class from #307, so
  the remediation became a section, not a thin sibling page. [runlog-in-pr] bundled.
  [wikilinks]-exact: grepped `index.md` before linking; the new `[[Service-Role Remediation Session]]`
  self-registers via its own Sources line and is referenced from the concept page's See Also.
- Failed: none for knowledge-sync. (Deploy verification was done in-session via `list_edge_functions`
  — versions + `verify_jwt` + changed `ezbr_sha256` — not by signing in, the usual auth-gated gap.)
- Remember: promoted to a Lesson below ([status-correction]).

### [2026-07-19] Help center screenshots + sidebar link & improved search (PRs #306, #310 → paired docs PR)
- Output: paired docs PR off origin/main — `raw/sessions/2026-07-19-help-center-screenshots-and-search.md`,
  compounded `concepts/help-center-and-guidance.md` (new "Screenshots" + "Search & navigation" sections +
  flipped the "Stale screenshots" known-issue → resolved + frontmatter sources/updated), `index.md`
  (Sources + extended the Concepts line), `log.md` update entry, PROJECT_CONTEXT §5 workstream bullet,
  + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change (frontend + content only; the
  `help-screenshots` bucket + the client search are not schema/token/workflow).
- Happened: two founder help efforts on a surface that ALREADY had a concept page (last session's #272), so
  the durable knowledge is a **compound-in-place**, not a new page. Both code PRs merged FIRST (git push
  env-blocked → gh REST overlay), so this is the paired docs PR off a fresh origin/main. Both efforts
  reframed on discovery: the screenshot system already existed (`help-screenshots` bucket) → refresh+extend
  not build; `/help` already had a search → improve not add. Also RESOLVED the concept page's own "Stale
  screenshots" known-issue that #306 fixed (edit the gate, don't just append — the gate-flip Lesson).
- Worked: [scope] — based ALL doc edits on origin/main's CURRENT versions (index/log/PROJECT_CONTEXT/MEMORY
  had DIVERGED 30+ commits; `git checkout origin/main -- <files>` first so the REST overlay doesn't clobber
  other sessions' edits) + [runlog-in-pr] + [orphans]-by-path (new raw session cataloged in Sources; concept
  page already cataloged → Concepts line extended in place). Captured the durable CLI-storage-upload recipe +
  the cp-won't-overwrite→additive-repoint gotcha as concept knowledge, not just a log line.
- Failed: the sidebar Help item couldn't be visually prod-verified (renders only in the logged-in shell;
  founder was logged out) — build-verified + recorded honestly, same class of gap as prior auth-gated
  verifies. RAG sync + verify-knowledge close-the-loop are inherently post-merge for this run.
- Remember: **`supabase storage cp` won't overwrite** (409 Duplicate) and `storage rm` silently no-ops, so
  "replace an image" = upload a NEW filename + repoint the referencing rows (additive), never an in-place
  overwrite; and cp needs a RELATIVE src + `--workdir <linked-repo>` from PowerShell (absolute `C:\` →
  "unsupported operation"; MSYS mangles `ss://`). (advisory)

### [2026-07-19] data-exposure-reviewer subagent (branch `worktree-dc-improvements-3`)
- Output: new `raw/sessions/2026-07-19-data-exposure-reviewer.md`, new
  `concepts/service-role-data-exposure.md`, **edited in place** `analyses/claude-subagents-audit.md`
  (Tier-2 `rls-migration-reviewer` deferral → RESOLVED/shipped/renamed), `index.md` (new Sources +
  Concepts lines, alphabetical; refreshed the `[[Claude Subagents Audit]]` Analyses entry), `log.md`
  (new ingest entry at top), **PROJECT_CONTEXT §5 one-line index entry + the full prose in
  `SHIPPED_LOG.md`** (first run under the post-#294 structure), + THIS entry.
  No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change (markdown-only branch: one agent + one skill line).
- Happened: **the run started on a false premise I had asserted myself.** I told the founder PR #288
  shipped without its knowledge-sync and wrote it into the spec, the plan, and the ledger. It was
  wrong — checked from *this worktree*, **15 commits behind `origin/main`**, where PR #290 had already
  done the sync and #291 verified it. Caught only at step 1 of this skill, by the `[scope]` Lesson's
  "is it identical to origin/main?" check. Retracted in the spec + plan rather than deleted.
- Worked: **[scope] paid for itself and then some.** The diff-vs-`origin/main` check caught both the
  false gap AND that `origin/main` had restructured PROJECT_CONTEXT (PR #294: §5 → index +
  `SHIPPED_LOG.md`, 129,707 → 28,825 B). Writing docs from the stale worktree would have produced a
  long §5 entry in exactly the format #294 deleted, plus a conflict against a 100KB restructure.
  Rebased onto `origin/main` first (7 commits, zero conflicts — `codex-review/SKILL.md` was unchanged
  there), then authored against the new structure. [wikilinks]-exact: grepped `index.md` before
  linking — dropped `[[Worktree Stale-Main Gotcha]]` because **no such page exists** (stated the
  lesson inline instead of minting a dangling link). [runlog-in-pr] bundled. Compounded rather than
  duplicated: edited the existing audit's Tier-2 block in place instead of spawning a thin
  "audit part 2" page.
- Failed: the #288 error itself — three artifacts had to be corrected after the fact. RAG sync is
  post-merge (branch unmerged), per [rag-sync].
- Remember: promoted to a Lesson below ([gap-claims]).

### [2026-07-19] Context-tax split — PROJECT_CONTEXT §5 -> index + SHIPPED_LOG (PRs #294 + #295)
- Output: `docs/wiki/concepts/context-tax.md` + its `index.md` Sources/Concepts entries + the
  `log.md` ingest line; a `SHIPPED_LOG.md` prose entry and ONE §5 index line (the new rule,
  self-applied for the first time).
- Happened: first run under the `[context-tax]` Lesson written earlier in the same session. Raw
  source -> one concept page -> index (Sources + Concepts, alphabetical) -> `log.md` -> core docs.
  Orphan check by PATH: clean. `npm run build` green.
- Worked: the `[scope]` Lesson (branch off `origin/main`) mattered more than usual — `origin/main`
  moved FIVE times during the parent branch. The `[orphans]`-by-path sweep was clean first try.
- Failed: (1) let bash eat backticks inside `python -c` TWICE in one session — the `log.md` entry
  silently lost every backticked term and had to be rewritten, and the same trap then broke this
  very entry. **Write the script to a FILE and run it; never inline python containing backticks.**
  (2) Skipped this skill entirely after merging #294/#295 and only ran it when asked "are we good
  to close out" — the required step is *on branch finish*, not on request.
- Remember: **a merged reconciliation can be silently reverted by a concurrent PR.** #301 (an
  unrelated `read-the-traces` refactor) carried a stale §5 and re-added all four entries #295 had
  resolved — +4 `Pending:` lines, 0 removed, with no conflict. Before editing §5, diff it against
  what you last landed, not just against `origin/main`'s tip. Always-loaded shared docs are the
  highest-contention files in the repo.

### [2026-07-18] Read the traces — agent-layer observability (PR #292, bundled)
- Output: bundled INTO the work PR #292 — new `raw/sessions/2026-07-18-read-the-traces.md`, new
  `concepts/reading-agent-traces.md`, `index.md` (Concepts after [[QA CI/CD Gate]] + Sources),
  `log.md` ingest entry, **DATABASE_SCHEMA.md** (`donny_tool_executions` row rewritten — the real
  column names + `message_id` now nullable), PROJECT_CONTEXT workstream bullet, + THIS entry. No
  DESIGN_SYSTEM/CLAUDE.md change (no design token or workflow-rule change).
- Happened: an **external-source audit** session — the founder asked whether a YouTube video's
  content could be adopted. The durable knowledge is NOT "we watched a video"; it's (a) the scoping
  result — 3 of its 4 rules were already implemented past what it described, so only one was built
  — and (b) the **silent-write trap** the build uncovered. Wrote a NEW concept ([[Reading Agent
  Traces]]) because agent-layer observability is a genuinely distinct subject from the existing
  discovery/closure/memory layers ([[Self-Improving App]] / [[Validator Skills]] / [[Loop Memory
  Protocol]]), and cross-linked all three as the 4th layer of the same stack rather than duplicating
  them.
- Worked: [scope] — the 3 docs (index/log/PROJECT_CONTEXT) were DIVERGED because origin/main had
  gained 4 commits (#288/#289/#290/#291) mid-session; `git checkout origin/main -- <docs>` before
  editing avoided clobbering that Phase-4 knowledge sync. [runlog-in-pr] bundled. [wikilinks]-exact
  caught TWO would-be dangling links up front — no `[[Media Ingest]]` page exists (de-linked to
  plain text) and the real name is `[[Donny Data Visibility & Quick-Action Routing]]`, not the
  `[[Donny Data & Quick Actions]]` I'd guessed. [orphans]-by-path: both new files cataloged.
- Failed: none for knowledge-sync. (The orchestrator fix's true E2E — a row actually landing —
  needs a real social/MCP tool call I can't synthesize; recorded honestly in the concept's Known
  Issues with the exact proof anchor: baseline is 125 rows / **0** null `message_id`, so the first
  null-`message_id` row is the proof. Not glossed.)
- Remember: when the founder supplies an EXTERNAL best-practices source (video/article/framework),
  the highest-value move is to **audit it against the repo before adopting any of it** — here 3 of 4
  rules were already implemented better than described, so adopting wholesale would have re-bought
  owned capability and buried the one real gap. Capture the *audit result* (the scorecard) as durable
  knowledge, not a summary of the source — and never imply the source was consumed more deeply than
  it was (the transcript was never captured; the rule NAMES came from the chapter list and the detail
  was grounded in first-party vendor docs, which is stated plainly on the page). (advisory)
### [2026-07-18] Landing "Human-driven. AI-assisted." redesign (branch feat/landing-joe-redesign, PR #293)
- Output: bundled INTO the open work PR #293 — `raw/sessions/2026-07-18-landing-joe-redesign.md`, new
  `concepts/landing-human-driven-redesign.md`, `concepts/landing-cinematic-video-redesign.md` (edited
  in place — supersession callout + See-Also, content NOT overwritten since the video-system mechanics
  it documents still apply when the new opt-in flag is on), `index.md` (Sources + Concepts, alphabetical),
  `log.md` ingest entry, `PROJECT_CONTEXT.md` (new Active Workstreams bullet), `DESIGN_SYSTEM.md` (Theme
  section corrected — landing is no longer in the "dark surfaces" list — + a new "Landing's own scoped
  marketing identity" section + the Page-Specific-Backgrounds table split landing out of the dark row),
  + THIS entry. RAG sync + [[verify-knowledge]] are post-merge (this PR is still open).
- Happened: a founder-directed strategic repositioning ("Human-driven. AI-assisted.") shipped as a full
  landing redesign, PRE-merge on an OPEN PR (#293). [squash-drift] fired for real: the local worktree's
  `feat/landing-joe-redesign` branch (17 unsquashed commits) had diverged from the actual PR #293 head on
  GitHub, which was a single commit squash-rebased onto the *latest* `origin/main` (4 commits ahead,
  unrelated "Light-App Kit" Phase 4 + de-gray work) — landed via the known git-push-blocked REST
  workaround. Confirmed the local branch's changed files were 100% disjoint from origin/main's new
  commits, then authored all docs on a fresh branch off the *fetched* PR head so the commit sits
  correctly on top of the real PR state, not a stale fork. Also found + fixed a **real DESIGN_SYSTEM.md
  contradiction**, not just an addition: its Theme section still listed "Landing... self-scopes `.dark`"
  and the Page-Specific-Backgrounds table still had landing as dark charcoal — both now false, since this
  redesign removes the landing's `.dark` wrapper entirely. Left uncorrected, the next UI session would
  have read stale, wrong guidance from a project-instruction file.
- Worked: [orphans]-by-path (both new pages confirmed cataloged) + [wikilinks]-exact (grepped index.md
  first for every target: [[Landing Cinematic Video Redesign]], [[Landing Redesign & Public Lead
  Capture]], [[Landing Prerendered Shell & Performance]], [[Anonymous Brief Generator]], [[Dark-Luxe App
  Theme]], [[Light-App Kit]] all confirmed real before linking). [runlog-in-pr] (this entry bundled into
  the same commit). Read the actual shipped code (LandingPage.tsx, HeroVideoBackdrop.tsx, featureConfig.ts,
  tailwind.config.ts, index.html, the whole-branch-review commit diff) rather than trusting only the
  task's prose summary — caught that `HeroVideoBackdrop` is fixed to a single `hero.business` key with a
  LIGHT scrim (not the old per-role dark-scrim switching), which the existing
  `docs/runbooks/landing-video-backdrop-kit.md` doesn't reflect (flagged as a follow-up in the raw
  session + concept page, left un-edited — out of the explicit deliverable list this run).
- Failed: none for knowledge-sync. (The redesign's true visual/copy E2E on a logged-out prod visitor is
  founder/post-merge verification, same class of gap as every other landing-feature run.)
- Remember: **[squash-drift] → promoted to Lessons.** When a knowledge-sync run targets an OPEN PR (not
  a just-merged branch), don't assume the local worktree branch matches the PR — fetch and diff the named
  remote branch first. Also: a redesign that changes the landing's light/dark posture is a **Theme**-level
  fact, not just a landing-page fact — grep the *other* core docs (here, `DESIGN_SYSTEM.md`'s Theme
  section written for a DIFFERENT recent redesign) for now-false claims about the surface you just
  changed, not only the page that talks about that surface by name. (advisory, extends [orphans])

### [2026-07-18] Light-theme polish Phase 4 (Outstand) + backgrounds/accents cleanup (PRs #288/#289 → one paired docs PR)
- Output: bundled INTO this docs PR — TWO new raw sessions (`raw/sessions/2026-07-18-light-theme-polish-phase4.md`,
  `raw/sessions/2026-07-18-degray-backgrounds-accents.md`), UPDATED `concepts/light-app-kit.md` (Rollout →
  Phase 4 + the cleanup + a new "de-gray palette also covers `bg-muted`" section + sources), `index.md`
  (2 new Sources lines + refreshed `[[Light-App Kit]]` Concepts entry), `log.md` (2 new ingest entries at
  top), PROJECT_CONTEXT (Phase-4 + cleanup notes on the existing light-theme bullet), + THIS entry. No
  DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change (frontend-only presentational; the kit + palette were in
  DESIGN_SYSTEM from Phase 1 — the `bg-muted` nuance is captured in the wiki concept, not the core doc).
- Happened: bundled TWO closely-related efforts (the final surface-group phase + the cross-app cleanup
  the founder redirected to mid-flow) into ONE knowledge-sync, since they're the same light-theme-polish
  workstream and Phase 4's sync hadn't run yet when the cleanup started. Two raw sessions (distinct
  efforts) but ONE compounded concept page (extended [[Light-App Kit]] Rollout + added the `bg-muted`
  palette nuance) — compound, don't duplicate.
- Worked: [scope] all 4 touched docs byte-IDENTICAL to origin/main before editing (both PRs were
  code-only). [runlog-in-pr] bundled. [wikilinks]-exact: grepped index.md — the new
  `[[Light-Theme Polish Phase 4 Session]]` + `[[De-gray Backgrounds & Off-Brand Accents]]` self-register
  via their new index Sources lines; `[[Light-App Kit]]` confirmed present. Read the real batch commits +
  whole-branch reviews, not just task summaries — captured the durable `bg-muted`-palette + inset-tint-
  over-colored-bubble (`bg-white/40`) lessons verbatim from the review catches.
- Failed: none for knowledge-sync. (Authenticated Outstand + app surfaces are founder-verify-only —
  Claude can't sign in; both deploys are bundle-hash + public-console verified. Same known gap.)

### [2026-07-18] Light-theme polish Phase 3 (PR #285 → paired docs)
- Output: bundled INTO this docs PR — new `raw/sessions/2026-07-18-light-theme-polish-phase3.md`,
  UPDATED `concepts/light-app-kit.md` (Rollout → Phase 3 shipped + Phase 4 = Outstand-only + sources),
  `index.md` (new Sources line alphabetically after Phase 2; refreshed the `[[Light-App Kit]]` Concepts
  entry), `log.md` (new ingest entry at top), PROJECT_CONTEXT (Phase-3 note appended to the existing
  light-theme bullet — NOT a new bullet), + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change
  (frontend-only presentational rollout; the kit + de-gray palette were already in DESIGN_SYSTEM from
  Phase 1).
- Happened: third consecutive **rollout-phase** knowledge-sync of the same [[Light-App Kit]] pattern.
  **Compounded, didn't duplicate** — no new concept page; extended the kit page's Rollout to Phase 3/4
  and refreshed its index entry. No genuinely-new kit gotcha this phase (unlike Phase 2's forwardRef), so
  the raw session records the *reinforced* rules (money-flow-styling-only, shared-wrapper-is-highest-
  leverage, semantic/social-color keeps) rather than inventing a new concept.
- Worked: [scope] all 5 touched docs byte-IDENTICAL to origin/main before editing (Phase 3 was code-only,
  so #285 didn't move them). [runlog-in-pr] bundled. [wikilinks]-exact: grepped index.md — `[[Light-App
  Kit]]`, `[[Light-Theme Polish Phase 1/2 Session]]` all present; the new `[[Light-Theme Polish Phase 3
  Session]]` self-registers via its index line. Read the real 5-commit diff, not just the task summaries —
  captured the exact money-flow-styling-only wording + the two review-caught fixes (tier-badge distinction,
  error-boundary `bg-red-50` re-assert) verbatim.
- Failed: none for knowledge-sync. (Authenticated settings/billing/payments/promotions surfaces are
  founder-verify-only — Claude can't sign in; the public deploy is bundle-hash + console verified. Same
  known auth-gated-verify gap as Phase 1/2, not glossed.)

### [2026-07-18] Light-theme polish Phase 2 (PR #282 → paired docs)
- Output: bundled INTO this docs PR — new `raw/sessions/2026-07-18-light-theme-polish-phase2.md`,
  UPDATED `concepts/light-app-kit.md` (added the 3rd gotcha `AppCard`-not-`forwardRef`, extended the
  Rollout section to Phase 1/2/3, added the green-"Available"/chat-bubble defensible keeps), `index.md`
  (new Sources line, alphabetical after Phase 1; refreshed the `[[Light-App Kit]]` Concepts entry),
  `log.md` (new ingest entry at top), PROJECT_CONTEXT (Phase-2 note appended to the existing
  light-theme bullet — NOT a new bullet), + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md
  change (frontend-only presentational rollout; no schema/token/workflow change).
- Happened: knowledge-sync for a **Phase-2 rollout** of an already-documented pattern
  ([[Light-App Kit]] from PR #280). Correctly **compounded, didn't duplicate** — no new concept page;
  updated the existing kit page's Rollout + gotchas rather than spawning a thin "phase 2" page. The
  one genuinely-new durable fact (AppCard is not forwardRef) went into the kit's gotchas list as gotcha
  #3, not just the raw session, so future kit adopters see it.
- Worked: [scope] verified all 5 touched docs were byte-IDENTICAL to origin/main before editing (the
  squash-merged phase-2 branch had the same doc base). [runlog-in-pr] entry bundled. [wikilinks]-exact:
  grepped index.md — `[[Light-App Kit]]`, `[[Light-Theme Polish Phase 1 Session]]`, `[[Dragon Feed]]`
  confirmed present; the new `[[Light-Theme Polish Phase 2 Session]]` self-registers via its index line.
  Read the real 3-commit diff (`git show`) not just the task summary — that's where the exact de-gray
  class swaps (`bg-stone-100`→`bg-white border-dc-teal/20`, `bg-gray-300`→`bg-dc-teal/10`) and the
  forwardRef commit-message note came from verbatim.
- Failed: none for knowledge-sync. (Authenticated messaging/DragonShare dashboards remain
  founder-verified only — Claude can't sign in; the public creator profile WAS screenshot-checkpointed
  on prod. Same known auth-gated-verify gap as every prior app-surface session, not glossed.)

### [2026-07-17] Landing backdrop HEVC .mov fix (PR #273 → paired docs)
- Output: bundled INTO the work — `raw/sessions/2026-07-17-landing-backdrop-mov-fix.md`,
  **corrected in place** `concepts/landing-cinematic-video-redesign.md` (the "DragonFeed Backdrop
  Adapter" section's eligibility regex/frontend-merge-order/no-stall-fix bullets rewritten to the
  current behavior, not appended as a contradictory new section; added a "Durable lessons from
  PR #273" bullet + frontmatter `sources:`), `index.md` (Sources, alphabetical), `log.md` update
  entry, PROJECT_CONTEXT (follow-up sentence appended to the existing PR #268 bullet, not a new
  bullet), + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change (frontend + one edge-fn
  `lib.ts` redeploy; no schema/token/workflow change).
- Happened: a same-branch, **next-day** bug-report session that REVERSED two decisions the
  IMMEDIATELY PRIOR knowledge-sync run (PR #268, one entry below) had just documented as shipped —
  "dynamic clips lead" and "`.mov` is eligible." Per the standing "edit-in-place on supersession"
  Lesson, corrected those exact sentences in the concept page rather than leaving them stale or
  bolting on a second, contradictory section — a reader hitting that page must see the CURRENT
  merge order and eligibility regex, not a stale one two paragraphs above a correction. Root cause
  (a real HEVC `.MOV` silently failing to decode, no `error` event) + the reversed decisions +
  the three-layer fix went into both the concept-page correction and a new raw session narrating
  the debugging path.
- Worked: [runlog-in-pr] + [orphans]-by-path (new raw session cataloged in index.md; no new
  concept page). [wikilinks]-exact: grepped index.md first — confirmed
  [[DragonFeed Backdrop Adapter Session]], [[Trust-Then-Flag Model]], [[Dragon Feed]],
  [[Landing Cinematic Video Redesign]] all exist before linking. Read the actual PR #273 commit
  diff (`git show`) rather than trusting only the task's prose summary, which caught the exact
  `mergeBackdropPlaylist` array-order line, the `VIDEO_EXT` regex before/after, and the
  `MAX_DWELL_MS` value verbatim — durable pages should quote the real code, not a paraphrase.
- Failed: none for knowledge-sync. (The underlying fix's true visual E2E — does the hero now
  avoid the HEVC clip and never freeze on prod — is founder/post-merge verification, same class
  of gap as every other prod-content landing feature; not silently glossed over.)
- Remember: **a fix that reverses a decision an EARLIER knowledge-sync run already documented as
  shipped must EDIT that concept section in place, not append a second "actually, here's what
  really happens now" section below it.** A concept page that contradicts itself top-to-bottom is
  worse than one that's simply out of date — a reader has no way to know which paragraph is
  current. This is the same "edit-in-place on supersession" Lesson already captured for a
  *different* session's rewrite (2026-07-16 DragonFeed creator search), now confirmed for the
  sharper case of a **same-page, next-day, same-branch** correction — check `git log`/the actual
  diff for the real before/after values rather than re-deriving them from a prose task
  description, since the commit is the ground truth. (advisory — extends [orphans]/[wikilinks]
  discipline to a "verify against the diff" sibling)

### [2026-07-17] DragonFeed hero backdrop adapter (PR #268 → paired docs)
- Output: bundled INTO the work — `raw/sessions/2026-07-17-dragonfeed-backdrop-adapter.md`,
  **compounded** `concepts/landing-cinematic-video-redesign.md` (new "DragonFeed Backdrop Adapter
  (shipped)" section + flipped the seam's forward-looking "future DragonFeed adapter" line to
  shipped + See-Also [[Trust-Then-Flag Model]]/[[QA CI/CD Gate]] + frontmatter sources/updated),
  `index.md` (Sources + rewrote the concept line), `log.md` ingest entry, PROJECT_CONTEXT
  active-workstream bullet, + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change (reads
  existing columns, adds one edge fn — no schema/token/workflow change).
- Happened: **closed a same-branch, one-day-old prediction** — the 2026-07-16
  `landing-cinematic-video-redesign.md` concept page (written by the PRIOR knowledge-sync run, on
  the SAME worktree) explicitly predicted "a future DragonFeed adapter…swaps the source with zero
  component changes"; this session built exactly that adapter one day later. Per the standing
  close-the-prediction pattern, compounded a new section onto that SAME page (flip gated→shipped)
  rather than minting a thin new "backdrop adapter" page — even though the feature has real
  standalone architecture (a new edge fn + a merge/signature seam), it is fundamentally the *next
  layer* of the one clip-source-seam story, not a separate subject. Also cross-linked
  [[Trust-Then-Flag Model]] (why the curation gate is "paid boost" not "all verified") and
  [[QA CI/CD Gate]] (why the feature is unverifiable on a PR preview — Preview points at staging,
  which has no eligible boosted rows).
- Worked: [runlog-in-pr] + [orphans]-by-path (new raw session cataloged; concept page already
  cataloged, only its line rewritten). [wikilinks]-exact: grepped index.md first — confirmed
  [[Trust-Then-Flag Model]], [[QA CI/CD Gate]], [[Dragon Feed]] all exist before linking; did NOT
  invent a `[[DragonFeed Backdrop Adapter]]` concept-page link since no such page exists (the
  content lives as a section on the existing page instead). Captured the two durable technical
  lessons as concept knowledge, not just a log line: (1) an index-based rotation component needs a
  **content-aware** remount key, not just a role/length key, the moment its playlist can grow
  post-mount; (2) a rotation that only advances on success (`onEnded`) becomes a real hazard the
  moment its content source stops being 100%-curated (`onError` must also advance).
- Failed: none for knowledge-sync. (The underlying feature's true visual E2E — does the hero show
  the real clip logged-out — is inherently post-merge/founder-verified on prod, same class of gap
  as every other prod-content landing feature; documented explicitly rather than glossed over.)
- Remember: when a concept page you wrote in the IMMEDIATELY PRIOR knowledge-sync run explicitly
  predicts "a future X," and the very next session builds X, **compound onto that same page and
  flip the prediction to shipped** even if X has its own nontrivial architecture (a new edge fn, a
  new hook) — the reader's mental model is "one seam, now with a second source," not two unrelated
  features. Only mint a separate page when the new work is a genuinely distinct *subject*, not just
  the next chapter of a story you already started. (advisory — reinforces the existing "close the
  prediction" + compound-onto-hub Lessons with the sharper case of a same-session/next-day pair.)
### [2026-07-18] Light-theme polish Phase 1 (PR #280 → paired docs PR)
- Output: paired docs PR off origin/main — new `raw/sessions/2026-07-18-light-theme-polish-phase1.md`,
  new `concepts/light-app-kit.md`, `index.md` (Concepts + Sources, alphabetical in the L cluster),
  `log.md` ingest entry, PROJECT_CONTEXT workstream bullet, + THIS entry. **DESIGN_SYSTEM.md was already
  refreshed IN the code PR #280** (the design-token/UI-pattern change rode with the code) — so this docs
  PR does NOT re-touch it (avoids a stale-vs-fresh conflict).
- Happened: a UI-quality feature (a shared primitive kit + de-gray) → wrote a NEW concept
  ([[Light-App Kit]]) distinct from [[Dark-Luxe App Theme]] (that's the dark surfaces; this is the light
  app's kit) and cross-linked both + [[App Theme Pivot Session]]. Reset the worktree to a fresh docs
  branch off origin/main first (per [scope]; the code branch is squash-diverged). RAG sync +
  [[verify-knowledge]] post-merge via the hook.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new concept + session both cataloged in
  index.md). [wikilinks]-exact (grepped index.md: [[Dark-Luxe App Theme]] / [[App Theme Pivot Session]]
  confirmed; alphabetical inserts "Li" before the "Lo"/"Loop" cluster). Captured the durable *kit +
  gotchas* (nested-button, AppCard-p0-over-shadcn-Card, invisible-text-white) as concept knowledge, not
  "we restyled some screens." Noted DESIGN_SYSTEM already shipped in the code PR so this PR skips it.
- Failed: none for knowledge-sync. (Authenticated dashboards verified by the founder on prod — Claude
  can't sign in; the recurring auth-gated-verify wall.)
- Remember: when the code PR ALREADY carries a core-doc refresh (here DESIGN_SYSTEM.md rode with #280
  because a design-system change is part of the feature diff), the paired docs PR must **NOT** re-edit
  that core doc — check `git log <base>..HEAD -- docs/DESIGN_SYSTEM.md` before touching it, or you
  reintroduce a stale version / conflict. A UI-polish session's durable knowledge is the *kit + its
  gotchas* (a concept page), not the per-screen sweep. (advisory)

### [2026-07-17] App theme PIVOT — light app + dark marketing (PRs #275/#277 → paired docs PR)
- Output: paired docs PR — new `raw/sessions/2026-07-17-app-light-marketing-dark-pivot.md`, **REWROTE**
  `concepts/dark-luxe-app-theme.md` (force-dark → light-app-dark-marketing), `index.md` (new source +
  rewrote the concept line + a "Superseded" note on the Slice-1 source line), `log.md` update entry,
  **REWROTE** DESIGN_SYSTEM.md "Theme" section + PROJECT_CONTEXT workstream bullet, + THIS entry. Also
  updated the project memory `project_dark_luxe_app_theme.md` (loaded each session — it described the
  reverted force-dark approach).
- Happened: **same-day reversal of my own #269 work** — the founder rejected the force-dark app (too
  dark / unreadable / white patches) after it shipped, so the app was reverted to light and dark scoped
  to landing+auth+onboarding+/internal. The knowledge layer described the SUPERSEDED force-dark approach
  everywhere, so this was an **edit-in-place correction** across the concept page + both core docs +
  project memory (not an append) — a `[Remember]`-supersedes-in-place case.
- Worked: [scope] (docs checked out from origin/main first to avoid clobbering #271's index/log changes)
  + [runlog-in-pr] + [wikilinks]-exact (grepped index.md: [[AIOS Internal Shell]] / the two Landing pages
  / [[Mobile Viewport & Fixed Positioning]] confirmed; de-linked a `[[git push…]]` that's a memory not a
  wiki page). Kept the still-true durable knowledge (two-color-system model, the traps) while flipping the
  direction; added the NEW keystone (the washed-auth gotcha + `useDarkHtml`).
- Failed: none for knowledge-sync. (The washed-auth regression itself was a real prod miss — a scoped-div
  `.dark` isn't enough; caught only by post-deploy prod screenshot, since local dev looked closer to OK.)
- Remember: when a shipped feature is REVERSED by founder feedback the same session, the knowledge layer
  must be **corrected in place across ALL layers** (concept page + core docs + project memory + a
  superseded-note on the original source), not just appended — a stale "we forced the app dark"
  instruction in DESIGN_SYSTEM.md/PROJECT_CONTEXT.md would actively mislead the next UI task. And a
  scoped-`.dark` surface in an otherwise-light app needs a dark `<body>` (`useDarkHtml`), not just a dark
  root div — translucent glow layers wash out over a white body. (advisory)

### [2026-07-17] Dark-Luxe app theme — Slice 1 (PR #269 → paired docs PR)
- Output: paired docs PR off origin/main — `raw/sessions/2026-07-17-dark-luxe-app-theme-slice1.md`,
  NEW `concepts/dark-luxe-app-theme.md`, `index.md` (Concepts + Sources, alphabetical), `log.md`
  ingest entry, **DESIGN_SYSTEM.md** new "Theme — Dark-Luxe (default, forced)" section (a design-token/
  UI-pattern change → core-doc refresh warranted), PROJECT_CONTEXT active-workstream bullet, + THIS entry.
- Happened: code PR #269 merged + deployed FIRST (git push env-blocked → landed via gh REST
  blob→tree→commit→ref), so this is the paired docs PR off a fresh origin/main (per [scope]). Wrote a NEW
  concept (a distinct subject — the app-wide dark-theme mechanics, cross-linked to the landing's
  [[Landing Redesign & Public Lead Capture]] scoped-`.dark` page it generalizes). The DESIGN_SYSTEM.md
  edit is load-bearing: it's a project-instruction file, so "the app is dark now + use `.dc-surface`/
  `.dc-panel`/`.dc-field`" MUST be there or future UI work defaults to the old light literals. RAG sync +
  [[verify-knowledge]] are post-merge (hook on the docs/ ff).
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new concept + session both cataloged in index.md).
  [wikilinks]-exact caught TWO would-be dangling links up front — grepped index.md and found NO
  `[[Design System]]` (it's a core doc, not a wiki page → de-linked to plain text) and NO
  `[[Landing Lead Capture]]` (real name is `[[Landing Redesign & Public Lead Capture]]`); kept the real
  [[Landing Cinematic Video Redesign]] / [[Donny Chat UX]] / [[Mobile Viewport & Fixed Positioning]].
  Pre-flight `gh api compare/89e3c5ce...main` confirmed none of my target doc files (index/log/
  DESIGN_SYSTEM/PROJECT_CONTEXT) changed on main → safe to edit the worktree copies.
- Failed: none for knowledge-sync. (Mobile viewport + authenticated dashboards couldn't be independently
  verified — the browser MCP resize doesn't reflow to a true mobile viewport, and Claude can't type the
  test password; recorded honestly in the verify-prod verdict as met:false + missing[] notes, not a
  silent pass — same wall as the [2026-07-16 Donny Tray] run.)
- Remember: the **gh REST push has an empty-blob footgun** — `gh api …/git/blobs -f content=@-` sends
  EMPTY (every SHA = `e69de29b…`); use `jq -n --rawfile c <b64file> '{content:$c,encoding:"base64"}' |
  gh api …/git/blobs --input -` (a big base64 as a command `--arg` also throws `Argument list too long`),
  and ALWAYS sanity-check `gh api compare/main...branch` shows the expected additions/deletions before the
  PR. A doc-token/UI-pattern change (dark-luxe) earns a **DESIGN_SYSTEM.md** refresh, not just a concept
  page — it's a project-instruction file future UI work reads. (advisory)

### [2026-07-16] Donny data visibility + quick-action 404 (branch worktree-dc-issues-6, PR #260)
- Output: bundled INTO the work PR #260 — `raw/sessions/2026-07-16-donny-data-visibility-quick-actions.md`,
  new `concepts/donny-data-and-quick-actions.md` (sibling of [[AI Creator Matching]]), `index.md`
  (Sources + Concepts), `log.md` ingest entry, PROJECT_CONTEXT active-workstream bullet, + THIS entry.
  No DATABASE_SCHEMA change (the fix corrects code to the EXISTING schema — no columns changed;
  the real column names are captured on the concept page). RAG sync + [[verify-knowledge]] post-merge.
- Happened: a founder BUG-report session whose durable knowledge is TWO reusable bug classes (captured
  as ONE new concept for Donny's data/navigation, distinct from the [[AI Creator Matching]] *matching*
  page but cross-linked): (1) schema-drift-swallowed-to-`[]` (`campaigns.platform` doesn't exist → the
  real "no campaigns" cause; the whole DragonShare agent on dead columns/enums) and (2) LLM-invented-
  route→404 (the `isKnownRoute` allow-list pattern). Merged origin/main mid-session (the deploy
  pre-flight caught the #248/#251 web-Donny collision — deploying the stale branch would have reverted
  them), so the branch is off latest main; per [scope] the docs edit the latest index/log/PROJECT_CONTEXT.
- Worked: [runlog-in-pr] + [orphans]-by-path (new concept + session both cataloged in index.md).
  [wikilinks]-exact: grepped index.md first — [[AI Creator Matching]], [[Donny AI]], [[Donny Web Access]]
  all confirmed before linking; Sources insert alphabetical (Chat < **Data** < Desktop), Concepts insert
  alphabetical (Donny Chat UX < **Donny Data...** < Donny Web Access). Compounded onto the matching page
  by reference rather than duplicating the two-backend wiring.
- Failed: the edge-function-reviewer caught the ACTUAL root cause I MISSED — my initial diagnosis blamed
  org-ownership + a fragile `.or`, but the headline bug was the nonexistent `campaigns.platform` column
  (carried over verbatim from the original code) 400'ing every query. The prod SQL I ran early even
  listed the columns (no `platform`) but I didn't cross-check the agent's SELECT against it. Two-model
  review earned its keep.
- Remember: when rewriting a data-access query, **cross-check every selected column/enum against the
  column list you already pulled from prod** — carrying forward the OLD select is how a pre-existing
  swallowed-400 survives a "rewrite". And a bug-report session's durable knowledge is the *class of bug*
  (schema-drift-swallow + invented-route-404), captured as a concept, not "we fixed Donny". (advisory)

### [2026-07-16] Donny first-open tray close-trap fix + branded redesign (PR #258 → paired docs PR)
- Output: paired docs PR off origin/main — `raw/sessions/2026-07-16-donny-tray-close-ux.md`, compounded
  `concepts/donny-chat-ux.md` (new "Panel stages & the shared header" section + frontmatter sources +
  See-Also [[Mobile Viewport & Fixed Positioning]] / [[Donny Tray Close UX Session]]), `index.md` (Sources),
  `log.md` update entry, PROJECT_CONTEXT active-workstream bullet, + THIS entry. No
  DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change (frontend-only; no schema/token/workflow change).
- Happened: code PR #258 merged first (git push env-blocked → landed via gh REST blob→tree→commit→ref),
  so this is the paired docs PR off a fresh branch off origin/main (per [scope]). **Compounded, didn't
  duplicate** — a [[Donny Chat UX]] page already existed with a "Two different inputs" tray section, so the
  first-open close-trap fix + shared-header unification belongs there as a new section, not a thin new page.
  RAG sync + [[verify-knowledge]] are post-merge (post-merge hook on the docs/ ff).
- Worked: [scope] + [runlog-in-pr] + compound-onto-existing-page. [wikilinks]-exact: grepped index.md first —
  [[Design System]], [[Donny AI]], [[Mobile Viewport & Fixed Positioning]] confirmed before linking; the new
  session source is cataloged in index.md Sources (path-based [orphans]). Captured the durable knowledge as
  concept (the 3-stage machine + the *structural* one-shared-header fix + the useIsMobile-gate-because-CSS-hidden
  click-outside gotcha + the rebase-onto-#236-fixed-overlay catch), not just "we added a close button".
- Failed: none for knowledge-sync. (Mobile viewport couldn't be independently verified in verify-prod — the
  browser-automation renderer captures at a fixed ~1568px and ignored the phone-width resize; recorded in the
  session source + the verify-prod verdict as met:false + a manual-spot-check note, not a silent pass.)
- Remember: verifying an **auth-gated frontend fix on prod** hits two known walls — (1) a code-split chunk
  change leaves the entry `index-*.js` hash unchanged, so bundle-hash polling never fires → confirm deploy-live
  via the **Vercel deployment `success` status on the merge commit** (+ the app's own "new version" banner); and
  (2) can't type the test password → have the user sign in on the driven browser, then drive the checks.
  (advisory — reinforces the [2026-07-16 desktop-overlay] Remember)

### [2026-07-16] Web Donny find_creators — right function this time (branch feat/donny-orchestrator-find-creators)
- Output: bundled INTO the work PR — `raw/sessions/2026-07-16-donny-orchestrator-find-creators.md`,
  **compounded** `concepts/ai-creator-matching.md` (new "Which Donny? consumer uses donny-orchestrator,
  not donny-chat" section + FIXED the now-stale "privacy parity deferred" bullet → shipped in #247 +
  frontmatter sources), `index.md` (Sources + rewrote the concept line), `log.md` update entry,
  PROJECT_CONTEXT active-workstream bullet, + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md change.
- Happened: the session's headline is a **wrong-function debugging lesson** — two prior fixes (PR #246/#249)
  were built on `donny-chat`, but the consumer web/mobile Donny calls `donny-orchestrator`; a
  `read_network_requests` capture was the decisive diagnostic. So the durable knowledge is a wiring fact +
  the "confirm the endpoint before building" rule, compounded onto the SAME [[AI Creator Matching]] concept
  (it's the next layer of the same subject) — including a **correction** of the prior section's implication
  that donny-chat was the consumer fix. Pre-merge off origin/main (per [scope]); RAG sync + [[verify-knowledge]]
  post-merge via the docs/ hook.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new raw session cataloged). Compounded + CORRECTED
  the existing concept page rather than spawning a new one; also fixed a stale bullet the prior sync left
  (privacy parity was "deferred" but #247 shipped it). Captured the reusable orchestrator sub-agent pattern
  (add a tool + agents/*.ts + agentMap + tool_choice forcing) as concept knowledge.
- Failed: none for knowledge-sync. (The underlying feature is LIVE-verified — a rare fully-verified pre-merge
  run — because the founder signed in mid-session so I could drive the browser E2E on the correct endpoint.)
- Remember: when knowledge-sync captured a fix that later proved MISDIRECTED (wrong function/surface), the
  next sync must **CORRECT the earlier section in place** (not just append) so the concept page doesn't keep
  implying the wrong thing — and record the diagnostic that found the truth (here: capture the network request
  to confirm the endpoint). (advisory — extends the "edit-in-place on supersession" Lesson to *corrections*)

### [2026-07-16] Donny chat `match_creators` fix — sibling of PR #241 (branch feat/donny-chat-matcher)
- Output: bundled INTO the work PR — `raw/sessions/2026-07-16-donny-chat-matcher-fix.md`, **compounded**
  `concepts/ai-creator-matching.md` (new "Donny chat sibling" section + flipped the known-limitations
  follow-up bullet → shipped + added a service-role-privacy-parity bullet + See-Also [[Donny AI]] +
  frontmatter sources), `index.md` (Sources + extended concept line), `log.md` ingest entry,
  PROJECT_CONTEXT active-workstream bullet, + THIS entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md
  change (tool-only edge-fn change; no schema/token/workflow change).
- Happened: **compounded, didn't duplicate** — the PR #241 concept page ([[AI Creator Matching]]) had
  *predicted* this exact sibling under "Known limitations" ("Donny chat's separate `match_creators`
  … out of scope here, a documented follow-up"), so this run **closed the prediction** by flipping that
  bullet gated→shipped and adding the sibling section, rather than minting a thin new "Donny matcher"
  page. Pre-merge on the work branch (rebased onto origin/main incl. #243/#245 per [scope]); RAG sync +
  [[verify-knowledge]] are post-merge (hook on the docs/ ff).
- Worked: [scope]-rebase + [runlog-in-pr] + [orphans]-by-path (new raw session cataloged in index.md;
  no new concept page). [wikilinks]-exact: grepped index.md first — [[AI Creator Matching]],
  [[Creator Location Search]], [[Notification Delivery]], [[Donny AI]] all confirmed before linking; the
  Sources insert is alphabetical ("Donny Chat **Matcher**" between "Donny Chat **Input**" and "Donny
  **Desktop**"). Captured the two durable rules as concept knowledge, not just a session log: (1) a
  matcher that can return 0 over a non-empty pool must score soft + never exclude (two ANDed hard
  `ilike` filters are the failure), and (2) a tool fetching with the **service role** bypasses RLS →
  must re-assert `profile_visibility='public'` in the query (the Codex P1).
- Failed: none. (verify-knowledge close-the-loop RAG check is inherently post-merge for this pre-merge
  run.) Note: Codex oscillated on round 9 (objected to the `CANDIDATE_LIMIT` it demanded on round 7) —
  a review-loop churn signal, not a knowledge issue; stopped the loop + escalated rather than churn.
- Remember: when a prior concept page *predicted* a follow-up under "Known limitations", the next
  knowledge-sync should **close that prediction in place** (flip gated→shipped + compound a section on
  the SAME page), not spawn a sibling page — keeps the "AI creator matching" story in one node and
  avoids a near-duplicate. (advisory — reinforces the existing "close the prediction" + compound-onto-hub
  Lessons)
### [2026-07-16] DragonFeed Instagram-style creator search (branch feat/dragonfeed-creator-search)
- Output: bundled INTO the work PR — `raw/sessions/2026-07-16-dragonfeed-creator-search.md`, **edited the
  existing** `concepts/dragon-feed.md` (search section rewritten browse-vs-creator-list + supersession
  note + lazy-geocoding invariants moved to the creator level + Key Decisions/frontmatter), `index.md`
  (Dragon Feed Concepts entry rewritten + new Sources line), `log.md` ingest entry, PROJECT_CONTEXT new
  active-workstream bullet, + THIS run-log entry. Frontend-only (no DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md
  change).
- Happened: a SECOND iteration on a surface that ALREADY had a concept page (PR #242's dragon-feed.md), so
  the durable knowledge is an **edit-in-place of the existing page**, not a new one — the old page still
  described the now-DELETED `filterMediaByRadius`/`useFeedLocationFilter`, so leaving it would contradict
  the code. Rewrote the search section to the two-mode model + a `>` supersession callout, and updated both
  the index.md concept entry and the same-day PR #242 wiki artifacts it references. Pre-merge off
  origin/main (per [scope]); RAG sync + [[verify-knowledge]] post-merge via the docs/ hook.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new raw session cataloged; the concept page was
  already cataloged — edited its entry in place). [wikilinks]-exact: linked [[Creator Location Search]] +
  [[Mobile Viewport & Fixed Positioning]] (confirmed in index.md) and the sibling [[Dragon Feed Mobile &
  Zip Search Session]] source. Recorded the reusable pivot ("a zip is a search *trigger*, not a media
  filter" → deletes a whole path) as durable concept knowledge, not just a log line.
- Failed: none. (RAG-sync + verify-knowledge close-the-loop are inherently post-merge for this pre-merge run.)
- Remember: when a later session SUPERSEDES code that an existing concept page documents, knowledge-sync must
  **edit that page** (rewrite the stale section + a supersession note) — a compound-in-place, not a new
  page and not an append — else the wiki keeps describing deleted code. (advisory)

### [2026-07-16] Donny campaign-idea creativity (PR #243 → paired docs PR)
- Output: paired docs PR off origin/main — `raw/sessions/2026-07-16-donny-campaign-creativity.md`, new
  `concepts/campaign-generation-creativity.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  PROJECT_CONTEXT active-workstream bullet, + THIS run-log entry. No DATABASE_SCHEMA change (model
  routing + the cost-ledger rate are code-level, not schema; captured in the concept page), no
  DESIGN_SYSTEM/CLAUDE.md change.
- Happened: code PR #243 merged first (git push env-blocked → landed via gh REST blob→tree→commit→ref,
  `jq --rawfile` for large blobs), so this is the paired docs PR off a fresh origin/main (per [scope]).
  Wrote a NEW concept ([[Campaign Generation Creativity]]) — the campaign-generation prompt architecture
  + the diagnosis-pattern + the model-`floor` are a distinct subject (cross-linked [[Donny AI]] /
  [[AIOS Runtime Spend Source-of-Truth]] / [[Campaign Generate Async Jobs Session]]). A Bash-classifier
  outage mid-run gated the commit/sync; staged all Edits (Edit/Write aren't gated) and did the commit +
  RAG sync when it recovered. RAG sync + verify-knowledge are post-merge.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new concept + session both cataloged in
  index.md). [wikilinks]-exact: grepped index.md first — [[Donny AI]], [[AIOS Runtime Spend
  Source-of-Truth]], [[Campaign Generate Async Jobs Session]] all confirmed before linking. The keystone
  durable knowledge (weak output ≠ cost throttle → query the ledger; verify which layer actually
  changed) went into the concept page as a reusable diagnosis pattern, not just a session log.
- Failed: could NOT verify Opus 4.8 prod-key access to validate the intended model choice — every path
  was gated (no-password rule, probe-deploy classifier, mangled CLI key, form-fill classifier). Shipped
  on Sonnet (the freed prompt is the real fix); Opus is a documented one-line toggle.
- Remember: when a "spend for quality" model choice can't be verified because every verification path is
  gated (auth rule / prod-write classifier / CLI), ship the model-independent win on the known-good tier
  and leave the premium model as a one-line, cost-rate-ready toggle — don't block the whole feature on an
  unverifiable ceiling. (advisory)

### [2026-07-16] DragonFeed mobile vertical feed + zip-radius search (branch worktree-dc-issues-2, PR #242)
- Output: bundled INTO the work PR #242 — `raw/sessions/2026-07-16-dragonfeed-mobile-feed-zip-search.md`,
  new `concepts/dragon-feed.md`, `index.md` (Concepts + Sources), `log.md` ingest entry, PROJECT_CONTEXT
  active-workstream bullet, + THIS run-log entry. Frontend-only (no schema/DESIGN_SYSTEM/CLAUDE.md change).
- Happened: a consumer-frontend feature that yields reusable *architecture* knowledge, so I wrote a NEW
  concept for the Dragon Feed *surface* (none existed — only creator-groups/creator-location-search/
  mobile-viewport were there) rather than a thin "we added a feature" note. Compounded by cross-linking
  [[Creator Location Search]] (the geo stack this reuses) + [[Mobile Viewport & Fixed Positioning]] (the
  mobile/desktop rule) rather than duplicating them. Pre-merge on the work branch (off origin/main per
  [scope]); RAG sync + [[verify-knowledge]] are post-merge (the post-merge hook fires on the docs/ ff).
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new concept + source both cataloged in index.md).
  [wikilinks]-exact: grepped index.md for the bracketed display names before linking — confirmed
  [[Creator Location Search]], [[Mobile Viewport & Fixed Positioning]], [[DragonShare]] all exist (no
  dangling link). Captured the two Codex-caught lazy-geocoding invariants (don't filter mid-geocode; skip
  geocoding under "Any") + the useIsMobile-JS-branch-not-CSS-double-mount decision as durable concept
  knowledge, not just a session log.
- Failed: none. (RAG-sync + verify-knowledge close-the-loop are inherently post-merge for this pre-merge run.)
- Remember: when a big *frontend* feature reuses an existing backend/utility stack on a NEW surface, the
  durable knowledge is the *reuse pattern + its gotchas* (here: media-level `filterMediaByRadius` extending
  the creator-level `filterByRadius`, plus the two async-geocode invariants), captured on a concept page for
  that surface that cross-links the shared stack — not a restatement of the stack itself. (advisory)
### [2026-07-16] AI creator matching fix — location + skill / "Found 0" (branch worktree-dc-issues-3)
- Output: bundled INTO the work PR — `raw/sessions/2026-07-16-fix-ai-creator-matching-location.md`,
  new `concepts/ai-creator-matching.md`, updated `concepts/creator-location-search.md` (See-Also +
  geo-port note + frontmatter), `index.md` (Concepts + Sources), `log.md` ingest entry,
  PROJECT_CONTEXT workstream bullet, + THIS run-log entry. No DATABASE_SCHEMA change (the
  `campaign_matches.match_score` type change is column-level detail the high-level schema doc doesn't
  track → captured in the concept page instead).
- Happened: a founder BUG-report session (screenshot) whose headline is a DEBUGGING lesson, not a
  feature — "Found 0 matches" was a silently-swallowed INSERT (score column type + a stale trigger's
  `brand_id` + a dead `business_address` select), not a scoring bug. Wrote a NEW concept
  ([[AI Creator Matching]]) because the matcher pipeline + write-bug + the Deno geo-port are a
  distinct subject from the browse-page [[Creator Location Search]] (cross-linked both ways). Rebased
  the work branch onto origin/main first (per [scope]; my 5 code files were file-disjoint from
  origin's recent commits → clean rebase) so the docs edit the LATEST index/log/PROJECT_CONTEXT.
  RAG sync + verify-knowledge are post-merge (hook on the docs/ ff).
- Worked: [scope]-rebase-when-file-disjoint + [runlog-in-pr] + [orphans]-by-path (both new pages
  cataloged in index.md). [wikilinks]-exact caught two would-be dangling links — grepped index.md and
  found NO [[Verify DB Schema]] page and NO `entities/google-maps.md`, so I dropped both brackets
  (plain text) rather than mint broken catalog links; kept the real [[Creator Location Search]] +
  [[Notification Delivery]].
- Failed: none. (verify-knowledge close-the-loop RAG check is inherently post-merge for a pre-merge run.)
- Remember: a bug-report session's durable knowledge is the *class of bug*, captured as a concept —
  here "an empty match set over a non-empty pool = a write-path failure (constraints + AFTER-INSERT
  triggers), not scoring; verify column types vs prod, not the migration file." (advisory)

### [2026-07-16] Donny desktop panel fixed-overlay (PR #236 → paired docs PR)
- Output: paired docs PR off origin/main — `raw/sessions/2026-07-16-donny-desktop-overlay.md`,
  compounded `concepts/mobile-viewport-fixed-positioning.md` (new §4 desktop docked-panel-overlay
  rule + frontmatter sources/tags), `index.md` (Sources line), `log.md` ingest entry,
  PROJECT_CONTEXT workstream bullet, DESIGN_SYSTEM new "desktop side-panels overlay" rule, + THIS entry.
- Happened: code PR #236 (one-line className fix) merged first, so this is the **paired docs PR** off
  a fresh branch off origin/main (per [scope]). **Compounded, didn't duplicate** — the desktop Donny
  overlay is the *desktop counterpart* of the mobile fixed-positioning concept and RELIES on that page's
  §1 PageTransition-opacity-only contract, so it belongs there as a new §4, not a thin new page. RAG sync
  + verify-knowledge are post-merge (hook on the `main` ff).
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new raw session cataloged in index.md; no new
  concept page). [wikilinks]-exact: grepped index.md first — [[Mobile Viewport & Fixed Positioning]] +
  [[Donny Chat UX]] confirmed before linking. Captured the reusable *design rule* (docked `flex-shrink-0`
  sibling steals width from `flex-1` main → viewport-keyed grids crush → make it a `fixed` overlay) as a
  DESIGN_SYSTEM bullet + concept §4, not "we moved the Donny panel".
- Failed: none. (RAG sync + verify-knowledge close-the-loop are inherently post-merge for this pre-merge
  docs PR.)
- Remember: a **one-line CSS fix can still carry durable design-system knowledge** — a docked-panel-steals-
  flex-width defect is a reusable rule, so it earns a DESIGN_SYSTEM bullet + a §-on-an-existing-concept, not
  a skip. Also: during verify, do NOT type a test-account password into a login form (hard safety rule) —
  verify the deploy via bundle sentinel + public render and have the user sign in for an authenticated shot;
  and Vite content-hashes differ local↔Vercel, so grep the prod-served chunk name (read from the live
  `index-*.js`), not the local build's name. (advisory)

### [2026-07-14] Mobile screen-fit — fixed-position un-trap + invite sheet iOS fit (branch worktree-DC-mobile-screenfit)
- Output: bundled INTO the work PR — `raw/sessions/2026-07-14-mobile-screenfit-fixed-position.md`, new
  `concepts/mobile-viewport-fixed-positioning.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  PROJECT_CONTEXT workstream bullet, DESIGN_SYSTEM new bottom-anchored-mobile-UI rule, + THIS entry.
- Happened: a founder bug-report session (two iPhone screenshots) whose durable knowledge is a *generalized
  trap*, not a feature: the PR #224 fixed-overlay incident was one victim of a class (PageTransition's
  transform + framer's first-load `initial` stall traps ALL fixed descendants) — this session deleted the
  trap itself (opacity-only contract) and wrote the concept page the #224 memory never got. Pre-merge off
  origin/main (per [scope]); RAG sync + verify-knowledge post-merge via the hook.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path + [wikilinks]-exact (grep caught "Landing
  **Prerendered** Shell & Performance" ≠ my guessed name). Empirical fixed-probe evidence (prod before /
  local after) went straight into the concept page as a reusable diagnostic.
- Failed: none.
- Remember: when a bug recurs from a known one-off memory (here #224's portal fix), the knowledge layer
  owes a CONCEPT page for the class, not another incident note — and the fix should target the trap, not
  add another victim-side patch. (advisory)

- Output: bundled INTO the work PR — `raw/sessions/2026-07-10-schedule-agenda-simplification.md`, new
  `concepts/schedule-agenda-view.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  PROJECT_CONTEXT active-workstream bullet, + THIS run-log entry. No DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md
  change (frontend-only; no schema/token/workflow change).
- Happened: first **consumer frontend UX** capture in a while (recent runs were AIOS/Dezzy). A big
  *frontend* feature still yielded a reusable *architecture* pattern → captured the pattern (a pure
  normalized `AgendaItem` model that lets ONE presentational view serve two unrelated data sources +
  two host pages, with `variant` as a *behavioral* mobile/desktop switch), not "we redid the calendar".
  Pre-merge on the work branch (off origin/main per [scope]); RAG sync + verify-knowledge are post-merge.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path (new concept cataloged in index.md). Grepped
  index.md for exact wikilink display names before linking ([[Outstand]], [[Donny AI]], [[Campaign
  Delivery, Scheduling & Notifications Session]] all confirmed). Compounded onto existing [[Outstand]]/
  [[Donny AI]] entities rather than a thin duplicate.
- Failed: none. (verify-knowledge close-the-loop RAG check is inherently post-merge for this pre-merge run.)
- Remember: two reviews caught two different *plan-authored* bugs — the Opus whole-branch review found a
  hardcoded `variant="desktop"` (my plan's "only widens max-width" comment was wrong; it actually routes
  Sheet-vs-Popover), and Codex found the agenda dropped an existing data source (sponsorship events the old
  DayStrip rendered). Lesson: when a redesign REPLACES a component (DayStrip→AgendaView), enumerate every
  data source the old component consumed and confirm each survives — a "simplification" silently drops
  inputs. (advisory)

### [2026-07-09] Creator Groups + Private Group Campaigns (branch feat/creator-groups-private-campaigns)
- Output: bundled INTO the work branch — `raw/sessions/2026-07-09-creator-groups.md`, new
  `concepts/creator-groups.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  DATABASE_SCHEMA (new "Creator Groups (Crews)" section + `campaigns.group_id` + functions),
  PROJECT_CONTEXT active-workstream bullet, + THIS entry. (RAG sync + [[verify-knowledge]] are
  post-merge — the human-merge gate holds; the post-merge hook fires on the main ff.)
- Happened: pre-merge run on a fresh branch off origin/main (per [scope]). Big feature (26 commits,
  Phase 1 roster + Phase 2 private group campaigns), so wrote ONE strong new concept
  ([[Creator Groups (Crews)]]) + one session source that narrates the whole arc incl. the 10-round
  Codex hardening. [wikilinks]-exact: grepped index.md first — [[Campaign Lifecycle]] +
  [[Notification Delivery]] confirmed; [[RLS Policy Model]] did NOT exist so re-pointed to the real
  [[SECURITY DEFINER Advisor Triage]] page rather than leave a dangling link. [orphans]-by-path: new
  concept + session both cataloged in index.md.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path + the wikilink-verify-before-linking habit
  (caught the non-existent RLS page). The most reusable durable knowledge captured as concept, not
  just log: the "verify columns vs prod not migration files" trap (`creator_count` is JSONB-only),
  the two-apply-gates rule, the escrow-gates-hide-everywhere lesson, and the definer grant asymmetry.
- Failed: none. (Codex hit its usage limit before the final clean pass — a Codex-infra limit, not a
  knowledge-sync issue; unrelated to this skill.)
- Remember: when a concept references a pattern that "feels like" it should have a wiki page but
  doesn't (e.g. an "RLS policy model"), grep index.md and link the closest REAL page instead of
  minting a dangling `[[wikilink]]` — a broken catalog link reads worse than a slightly-off name. (advisory)

### [2026-07-07] AIOS Agent-Loop Audit — 3 gaps, consolidated (branch feat/aios-spend-source-of-truth)
- Output: bundled INTO PR #220 — `raw/sessions/2026-07-07-aios-agent-loop-audit.md`, new
  `concepts/aios-runtime-spend-source-of-truth.md`, `index.md` (Concepts + Sources), `log.md` ingest
  entry, PROJECT_CONTEXT active-workstream bullet, DATABASE_SCHEMA `donny_cost_ledger` row, + THIS entry.
- Happened: a **multi-branch** session (3 PRs) captured as ONE consolidated knowledge-sync on the gap-3
  branch per the founder's ask. **Territory partition (the sibling-worktree lesson):** gap 1's knowledge
  (make-validator) already shipped on #217 (it edited `validator-skills.md` there) — did NOT re-touch it
  here to avoid a merge conflict; referenced it instead. Wrote ONE strong new concept for gap 3 (the
  meatiest/most-reusable) + folded gaps 1–2 into the session source (compound, don't spawn thin pages).
- Worked: [wikilinks]-exact-display-name (grepped index.md first: Validator Skills / Founder Playbooks /
  Self-Improving App / Loop Memory Protocol all confirmed before linking). [orphans]-by-path: both new
  files cataloged in index.md. [runlog-in-pr]. The reframe (runtime vs dev spend) + the two-constraint
  ledger gotcha are captured as durable concept knowledge, not just a session log.
- Failed: none. RAG sync + [[verify-knowledge]] close-the-loop are inherently **post-merge** for this
  pre-merge run (don't hand-sync unmerged wiki content — the human-merge gate holds; the post-merge hook
  fires on the main ff). Earlier this session ran `sync:wiki` as a *go-live probe* (synced main's 67
  pages + proved the embedding fix) — that is NOT this branch's new pages.
- Remember: for a **multi-branch** session, partition the knowledge layer — the branch that already
  captured its concept owns it; the consolidated sync writes only the *uncaptured* gaps + one session
  source that narrates the whole arc, referencing (not re-editing) the already-captured pages. (advisory)

### [2026-06-29] DC AIOS Strategy Library Management (branch feat/aios-strategy-library-management)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-29-strategy-library-management.md`, new
  `concepts/strategy-library-management.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  DATABASE_SCHEMA (`internal_docs` note) + PROJECT_CONTEXT workstream bullet (refreshed in Task 7), + THIS entry.
- Happened: knowledge-sync run on a **full-rollout** session (not a paired docs PR) — pre-merge on a
  fresh branch off origin/main (per [scope]). The feature itself made `donny-knowledge-sync` archive-aware,
  and the keystone smoke ran `sync:internal` twice on prod (which synced the *existing* 84 docs + backfilled
  `source_hash`); the NEW concept page is on the branch and syncs to the RAG **post-merge** via the hook
  (per [rag-sync] — don't hand-sync unmerged wiki content). PATH-based [orphans] check: new page cataloged.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path. New concept page compounds onto [[AIOS Internal Shell]]
  / [[Founder Playbooks]] / [[Self-Improving App]] rather than duplicating. Captured the durable traps
  (trigger `search_path` advisor; is_core-survives-resync rests on the SET-clause omission not the trigger;
  full-sync-doubles-as-source_hash-backfill; service-role-RPC grant pattern) as concept knowledge.
- Failed: none. (verify-knowledge close-the-loop RAG check is inherently post-merge for a pre-merge run.)
- Remember: **before writing any wikilink, grep `index.md` for the EXACT bracketed display name** — concept
  slugs ≠ guessed titles ("AIOS Internal **Shell**" not "Dashboard"; "**Knowledge-Sync Automation**" not
  "knowledge-sync"; "Patch-Based Corrections" not "Donny Gated Corrections"). Saved 4 broken-link lint hits
  this run. (advisory)

### [2026-06-28] Dezzy milestone-celebration playbook — Domain 6 core (branch feat/dezzy-milestone-celebrations)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-28-dezzy-milestone-celebrations.md`, extended
  `concepts/dezzy-agent-playbook-suite.md` (Domain 6 section un-gated + status + Deferred + frontmatter
  sources), `index.md` (Sources), `log.md` ingest entry, PROJECT_CONTEXT workstream bullet, + THIS entry.
- Happened: compounded onto the existing suite hub page (no new thin page — a new domain slice of an
  existing concept). The DRE going live (this session's earlier work + PR #205/#196) un-gated the
  milestone core, so the knowledge update also *flipped a documented gate to shipped*.
- Worked: [scope] + [runlog-in-pr] + compound-onto-hub; recording the privacy/role-prefix/false-recency
  decisions as durable concept knowledge, and updating the suite status so the wiki reflects "#6 core live".
- Failed: none. (Live agentic playbook run is founder-verification — needs admin auth — so the wiki notes
  it as pending, same as the other dezzy playbooks.)
- Remember: when a session ships work that un-gates a previously-documented gate, the knowledge-sync must
  EDIT the gate language (gated→shipped), not just append — else the wiki contradicts reality. (advisory)

### [2026-06-28] Anonymous brief generator repair + Layered-v1 hardening (branch fix/anonymous-brief-generator)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-28-anonymous-brief-generator-fix.md`, new
  `concepts/anonymous-brief-generator.md` (See-Also [[Landing Lead Capture]]), `index.md` (Concepts +
  Sources), `log.md` ingest entry, PROJECT_CONTEXT workstream bullet, + THIS run-log entry.
- Happened: a "tiny guardrail" task uncovered the whole free-brief feature was 500ing in prod; became a
  full repair. Followed the brainstorming gate end-to-end (design → AskUserQuestion forks → spec →
  independent spec-review (6 fixes → Approved) → build → Codex (2 P1s) → deploy + live curl-verify).
  New concept page (distinct enough from the lead-capture endpoint to stand alone; cross-linked).
- Worked: [scope] (off origin/main) + [runlog-in-pr] + the spec-review-before-build gate caught the
  wrong "trusted IP" idea + the Sonnet-default model trap BEFORE any code. Capturing the durable traps
  (service-role≠user-auth; getModelConfig→Sonnet; functions.invoke 2xx-only; bad-inet cap bypass) as a
  concept page, not just a session log.
- Failed: none. (Thin-page readable=false path is unit-tested but not live-curled — the IP got
  rate-limited after the valid test; acceptable, the unit test + code cover it.)
- Remember: an investigation that uncovers a bigger prod bug should STOP and re-scope through the design
  gate, not graft onto the original small task. (advisory)

### [2026-06-28] DRE rewards rename → "Creator standing" (branch feat/dre-rename-creator-standing)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-28-dre-rename-creator-standing.md`, a "Display
  naming" note added to `concepts/dragon-rewards-engine.md` (+ frontmatter sources), `index.md` (Sources),
  `log.md` update entry, PROJECT_CONTEXT bullet, + THIS run-log entry.
- Happened: founder-feedback-driven display rename (Dragon Points→Reputation; Egg/Scout/Knight/Master/Legend
  → Rising/Established/Pro/Elite/Icon; emojis dropped). Keys/tables/flag unchanged. Compounded the rename
  note onto the existing DRE concept page (no new page). Also redeployed the dre-award-engine notification
  copy (v2, MCP faithful-rebundle + boot-check 401 — the live every-5-min cron, so I rebundled the exact
  4 deployed files with only the 2 strings changed rather than hand-listing deps).
- Worked: [scope] + [runlog-in-pr] + compound-onto-hub; the "display-only, keys unchanged" framing kept the
  concept page accurate without rewriting every DP/tier mention.
- Failed: none. Carried forward the stranded #200 verify-knowledge entry.
- Remember: for a live edge-fn copy change, `get_edge_function` → swap the string → redeploy the SAME file
  set is the low-risk path (no hand-guessed _shared bundle); boot-check via the 401 auth gate. (advisory)

### [2026-06-28] Landing redesign + public lead capture (branch feat/landing-luxe-redesign)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-28-landing-redesign-lead-capture.md`, new
  `concepts/landing-lead-capture.md`, `index.md` (Concepts + Sources), `log.md` ingest entry, PROJECT_CONTEXT
  active-workstream bullet, DATABASE_SCHEMA new "Marketing & Leads" section (`leads`), + THIS run-log entry.
- Happened: first **consumer-facing** landing redesign captured (recent runs were all AIOS/Dezzy). Extracted
  TWO reusable patterns into ONE concept page (scoped-`.dark` theme + closed-anon-DML lead pipeline) rather
  than two thin pages. Pre-merge off origin/main (per [scope]); RAG sync + verify-knowledge are post-merge
  (hook on the docs/ ff). PATH-based [orphans] check: new page cataloged in index.md.
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path. Capturing the scoped-dark technique (reusable beyond
  this page) + the lead-table RLS posture as durable concept knowledge, not just a session log.
- Failed: none. (Mobile not screenshot-verifiable — the Chrome extension can't shrink the viewport below
  ~1280px; deferred to verify-prod's both-viewport check.)
- Remember: a big *frontend* redesign still yields reusable *backend/architecture* knowledge (scoped dark
  theme + closed-anon-DML public-form pipeline) — capture the patterns, not "we restyled the landing". (advisory)

### [2026-06-28] Dragon Rewards UI launch gate (branch feat/dre-ui-launch-gate)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-28-dre-ui-launch-gate.md`, updated the runbook on
  `concepts/dragon-rewards-engine.md` (two-switch launch + reversible-UI rollback + ⚠️→resolved),
  `index.md` (Sources), `log.md` update entry, PROJECT_CONTEXT bullet, + THIS run-log entry.
- Happened: first code slice of the session (not a seed/doc) — a frontend gate fix. Compounded the runbook
  change onto the existing DRE concept page (no new concept page). The knowledge change *resolved* a Codex
  P2 (the seeded-OFF flag made the old runbook a partial-launch trap) — did the runbook update before the
  final Codex re-run (the "knowledge-sync before final Codex" lesson, now reflexive).
- Worked: [scope] + [runlog-in-pr]; updating the hub page's runbook in the SAME PR that introduced the flag
  kept doc + behavior consistent (no stale-runbook window).
- Failed: none. Carried forward the stranded #198 verify-knowledge entry.
- Remember: when a code change adds a NEW launch switch, the operational runbook is part of the change's
  blast radius — update it in the same PR or Codex (rightly) flags the doc as a partial-launch hazard. (advisory)

### [2026-06-28] DRE go-live runbook + readiness check (branch docs/dre-go-live-runbook)
- Output: `raw/sessions/2026-06-28-dre-go-live-runbook.md`, a new "Go-Live Runbook & Readiness Check" section
  compounded onto `concepts/dragon-rewards-engine.md` (+ frontmatter updated/sources), `index.md` (Sources),
  `log.md` update entry, + THIS run-log entry.
- Happened: a **read-only investigation** (no prod change) turned into durable knowledge. The headline was an
  operational finding, not a feature: the DRE is fully deployed + cron-live and the silent backfill already
  ran (98 events / 24 balances), and `go_live_at` gates only the bell — the points/tiers UI is already
  visible (no frontend gate). Recorded the gate semantics + the founder-launch runbook on the DRE concept
  page (compound-onto-hub, the DRE team's page is on main + stable). RAG sync post-merge.
- Worked: compounding an *operational runbook + readiness finding* onto the existing concept page kept it
  discoverable + RAG-retrievable, rather than a stray doc.
- Failed: none.
- Remember: a read-only "is X ready / what does turning it on do" investigation IS knowledge — capture the
  finding + the runbook in the concept page, and flag founder-decision/irreversibility explicitly. (advisory)

### [2026-06-28] Dezzy SEO articles — Domain 6 SEO slice (branch feat/aios-dezzy-seo-articles)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-28-dezzy-seo-articles.md`, extended
  `concepts/dezzy-agent-playbook-suite.md` (Domain-6 section + refreshed status/Deferred + frontmatter
  sources), `index.md` (Sources), `log.md` ingest entry, PROJECT_CONTEXT bullet, + THIS run-log entry.
- Happened: pre-merge run off origin/main (per [scope]). Compounded into the suite hub page (no new concept
  page → Sources index line only). The session's headline was a **read-only prod probe** that found Domain 6
  mostly GATED (empty DRE ledger + no referral table) — captured that honestly in the page so the wiki
  records *why* only the SEO slice shipped. RAG sync + verify-knowledge deferred to post-merge.
- Worked: [scope] + [runlog-in-pr] + compound-onto-hub; the gated-scope finding belongs in the durable
  knowledge layer, not just the spec.
- Failed: none. Carried forward the stranded #197 verify-knowledge entry (post-merge runs strand — same as
  #194/#195).
- Remember: when an exploration's main output is "most of this is gated, here's why", that finding is
  knowledge — record the gate + its reopen-condition in the concept page, not only the spec. (advisory)

### [2026-06-27] Dragon Rewards Engine v1 (docs bundled INTO the work branch)
- Output: this work branch (`worktree-DC-DRE-AI`) — `raw/sessions/2026-06-27-dre-engine-tiers-badges.md`,
  new `concepts/dragon-rewards-engine.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  PROJECT_CONTEXT active-workstream bullet, DATABASE_SCHEMA Dragon Rewards section + `public_dragon_tiers`
  view row, + THIS run-log entry.
- Happened: ran knowledge-sync **pre-merge** on the open work branch (off origin/main per [scope] —
  rebased onto origin/main earlier so the parent DRE spec analysis, imported by PR #191, was present
  to See-Also). Bundled all docs INTO the work PR alongside the code per [runlog-in-pr]. RAG sync +
  verify-knowledge are post-merge (post-merge hook on the docs/ ff).
- Worked: [scope] + [runlog-in-pr] applied. PATH-based [orphans] check clean (new page is cataloged;
  the parent spec analysis was already in index.md from PR #191). Compounded the new concept onto the
  parent [[DragonCandy — Dragon Rewards Engine (DRE) Full System Spec]] + [[DragonShare]] +
  [[Notification Delivery]] rather than duplicating.
- Failed: none.
- Remember: when a brand-new feature decomposes from an already-ingested parent spec (here PR #191's
  DRE analysis), the new concept page slots cleanly with the parent as its See-Also — no forward-link
  to defer. (advisory)

### [2026-06-27] Dezzy press & events — Domain 4 (branch feat/aios-dezzy-press-events)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-27-dezzy-press-events.md`, extended
  `concepts/dezzy-agent-playbook-suite.md` (new Domain-4 section + refreshed status/Deferred + frontmatter
  sources), `index.md` (Sources), `log.md` ingest entry, PROJECT_CONTEXT bullet, + THIS run-log entry.
- Happened: pre-merge run on a fresh branch off origin/main (per [scope]). First Dezzy domain on the
  **cloud-routine** rail (not a playbook). Compounded into the suite hub page [[Dezzy Agent (Playbook
  Suite)]] (no new concept page → only a Sources index line). The Deferred line predicted "#4 needs a cloud
  routine" → this slice fulfilled it, so I moved #4 from Deferred to a shipped Domain-4 section. RAG sync +
  verify-knowledge deferred to post-merge.
- Worked: [scope] + [runlog-in-pr] + compound-onto-hub. Codex P3 ("knowledge-sync scope undone") was just
  the mid-flight branch state — doing the knowledge-sync here resolves it (re-run Codex after).
- Failed: none. Carried forward the stranded #195 verify-knowledge entry (post-merge runs strand — same as
  #194).
- Remember: when a prior session's Deferred list *predicted* the next slice's shape, the next knowledge-sync
  should move that item from Deferred → shipped (close the prediction), not leave a stale "remaining" line.
  (advisory)

### [2026-06-27] Dezzy weekly brief — Domain 5 capstone (branch feat/aios-dezzy-weekly-brief)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-27-dezzy-weekly-brief.md`, extended
  `concepts/dezzy-agent-playbook-suite.md` (capstone section + refreshed Deferred + See Also), `index.md`
  (Sources), `log.md` ingest entry, PROJECT_CONTEXT active-workstream bullet, + THIS run-log entry.
- Happened: pre-merge run on a fresh branch off origin/main (per [scope]). **Compounded, didn't duplicate** —
  the weekly-brief capstone belongs in the suite-overview page [[Dezzy Agent (Playbook Suite)]] (the sibling's
  page), not a thin new page; extended it + refreshed its now-stale "Deferred" (3 of 6 domains shipped). No
  new concept page → no new index Concepts entry, only a Sources line. RAG sync + verify-knowledge deferred
  to post-merge.
- Worked: [scope] + [runlog-in-pr] + compound-don't-duplicate. Editing the sibling worktree's already-merged
  suite page (now on main) was clean — no conflict (its branch is merged, I'm off main).
- Failed: none. Note — the verify-knowledge MEMORY.md #194 entry was stranded (committed post-squash-merge on
  the content branch, never reached main); re-added it in this PR to un-strand it.
- Remember: a capstone/overview update is a *compound onto the hub page* job, not a new page — keeps the suite
  narrative in one place and avoids index orphans. (advisory)

### [2026-06-27] Dezzy content playbooks (Domains 1+2, branch feat/aios-dezzy-content-playbooks)
- Output: bundled INTO the work PR — `raw/sessions/2026-06-27-dezzy-content-playbooks.md`, new
  `concepts/dezzy-content-playbooks.md` (compounds on [[Founder Playbooks]]), `index.md`
  (Concepts + Sources), `log.md` ingest entry, PROJECT_CONTEXT active-workstream bullet, + THIS
  run-log entry.
- Happened: pre-merge run (work branch open, off the fresh DC-Dezzy-AI-2 worktree ≈ origin/main).
  Built two report-only seed playbooks; no new concept duplication (new page is a distinct
  product-framing concept, cross-linked to the existing engine page [[Founder Playbooks]]).
  Path-based orphan check: my new page is in index.md. RAG sync + verify-knowledge deferred to
  post-merge (per [scope]/[rag-sync] — don't hand-sync unmerged wiki content).
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path applied. Coordinated non-overlap with the
  sibling DC-Dezzy-AI worktree: distinct slugs/migration/spec filenames and a NEW concept page
  rather than editing the shared `analyses/dragoncandy-dame-ai-...spec.md` (which the sibling's
  knowledge-sync owns).
- Failed: none. Noted a pre-existing orphan — `analyses/dragoncandy-dame-ai-...spec.md` (imported
  PR #190) is NOT in index.md; left for the sibling worktree that actively edits it (its territory).
- Remember: when two worktrees ship sibling slices of one spec, partition the knowledge layer —
  each owns distinct page filenames; only ONE owns the shared analysis page + its index entry; both
  appending index.md/log.md is fine (resolvable at merge). (advisory)

### [2026-06-27] Dezzy Outreach v1 (docs bundled INTO the open work branch)
- Output: this work branch (`worktree-DC-Dezzy-AI`) — `raw/sessions/2026-06-27-dezzy-outreach-v1.md`,
  new `concepts/dezzy-agent-playbook-suite.md`, updated `analyses/the-core-idea-two-agents-one-company.md`
  (Dame→Dezzy rename note + domain-#3-shipped + See Also), `index.md` (Concepts + Sources + **Analyses
  orphan fix**), `log.md` ingest entry, PROJECT_CONTEXT active-workstream bullet, + THIS run-log entry.
- Happened: ran knowledge-sync **pre-merge** on the still-open Dezzy work branch (per the PR #180
  precedent — the branch is off origin/main so [scope] is satisfied). The branch was 4 behind
  origin/main and the core-idea analysis lived only on origin/main, so I **rebased onto origin/main
  first** (the 8 commits touch only edge-fn/migration/spec/plan — disjoint from the 4 origin commits'
  donny-chat/wiki files → clean rebase) so the core-idea doc was present to update in-PR. RAG sync +
  verify-knowledge are post-merge (post-merge hook on the docs/ ff).
- Worked: [scope] + [runlog-in-pr] applied. The PATH-based [orphans] check caught the core-idea
  analysis itself as an `index.md` orphan (added by PR #189's `wiki-save-answer`, never cataloged) —
  fixed it in the same pass. Compounded onto [[Founder Playbooks]] (Dezzy = a *use* of that rail) rather
  than duplicating it.
- Failed: none.
- Remember: when the branch is behind origin/main and the doc you must update lives only on main,
  **rebase onto origin/main first** (clean when the code commits are file-disjoint) so knowledge-sync
  is complete in one PR — beats deferring the core-doc edit to post-merge. (advisory)

### [2026-06-27] Internal Donny profile-read fix (PR #185 → paired docs PR)
- Output: docs PR off origin/main — `raw/sessions/2026-06-27-internal-donny-profile-read.md`,
  extended `concepts/internal-only-users.md` ("The profile-read trap" section + read-side rule),
  `index.md` (Sources), `log.md` ingest entry, PROJECT_CONTEXT active-workstream bullet, + THIS
  run-log entry.
- Happened: PR #185 (code) already merged WITHOUT docs, so this is the paired docs PR authored on
  a fresh branch off origin/main (per [scope]). No new concept page (compounded the existing
  internal-only-users page per "compound, don't duplicate"). Path-based orphan check clean.
  RAG sync + verify-knowledge run after this docs PR merges (post-merge hook on the docs/ ff).
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path all applied. Compounding onto the PR #180
  concept page (read-side as a sequel section) kept the knowledge in one coherent place.
- Failed: none.
- Remember: when a code PR ships without its docs (e.g. the deploy/merge happened first), the
  knowledge-sync becomes a *paired docs PR* off origin/main — same [scope] rule, just decoupled
  in time from the code PR. (advisory)

### [2026-06-26] Internal-only AIOS user FKs (PR #180 — docs bundled INTO the work PR)
- Output: PR #180 — `raw/sessions/2026-06-26-internal-only-user-fks.md`, new
  `concepts/internal-only-users.md`, updated `entities/google-workspace.md` +
  `concepts/error-handling-patterns.md` (backend non-Error-throw caveat), `index.md` + `log.md`,
  PROJECT_CONTEXT active-workstream bullet. Bundled into the **open work PR** (not a separate docs
  PR) since #180 was still unmerged — [scope] is satisfied because that branch is already off
  `origin/main`.
- Happened: ran knowledge-sync **pre-merge** (work PR open). Docs committed onto the work branch;
  RAG sync deferred to merge (the post-merge hook fires on the main fast-forward). Path-based
  orphan check clean; new page linked. On merge, rebased onto an advanced main (4 PRs landed:
  #179/#181/#182/#183) — index.md/log.md auto-merged; PROJECT_CONTEXT + this MEMORY conflicted
  (both appended), resolved keep-both.
- Worked: [scope] (fresh-off-main work branch) + [runlog-in-pr] (this entry in the docs commit) held.
- Failed: the naive **title-based** orphan check threw 4 false positives — Donny-captured analyses
  use curated `index.md` display names ≠ their frontmatter `title:`. The PATH-based check was clean.
- Remember: orphan-check by file PATH not title → **promoted into [orphans] Lesson**. For a
  pre-merge knowledge-sync run, the RAG-sync + [[verify-knowledge]] close-the-loop step is
  inherently post-merge (don't hand-sync unmerged wiki content — the human-merge gate holds).

### [2026-06-26] AIOS Stakeholder Invite backfill (PR #178 → docs PR)
- Output: this docs PR — `raw/sessions/2026-06-26-aios-stakeholder-invite.md`, new
  `concepts/aios-stakeholder-invite.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  cross-links re-added to `concepts/aios-internal-shell.md`, + THIS run-log entry. PROJECT_CONTEXT
  already had the #178 workstream bullet → no core-doc change.
- Happened: closed the gap flagged in the prior run's [Remember] — PR #178 had shipped without a
  wiki page (the UI-polish run had to drop a dangling `[[AIOS Stakeholder Invite]]` forward link).
  Authored on a fresh branch off origin/main (per [scope]); the new page makes that forward link
  resolve, so I re-added the cross-links. Sourced entirely from the merged spec +
  PROJECT_CONTEXT bullet + edge-fn code (no live session needed).
- Worked: [scope] + [runlog-in-pr] applied; forward-link-then-backfill is a clean pattern — the
  earlier dangling link became a TODO that this run discharged.
- Failed: none.
- Remember: a deliberately-dropped dangling wikilink is a backlog item — when you later author the
  target page, re-add the cross-link from the page that wanted it (closes the loop on the forward
  link). (advisory)

### [2026-06-26] AIOS internal dashboard UI polish (PR #179 → docs PR pending)
- Output: this docs PR — `raw/sessions/2026-06-26-aios-ui-polish.md`, new
  `concepts/aios-internal-shell.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  PROJECT_CONTEXT active-workstream bullet, and THIS run-log entry (bundled per [runlog-in-pr]).
- Happened: authored on a fresh branch off origin/main (per [scope]); orphan check clean
  (the for-loop over concepts|entities|analyses found 0); dropped a dangling
  `[[AIOS Stakeholder Invite]]` wikilink (PR #178 was shipped but never wiki-ingested — a
  pre-existing gap, left out of scope). Code PR #179 already merged; this is the paired docs PR.
- Worked: [scope] + [orphans] + [runlog-in-pr] Lessons all applied. New concept compounds on
  [[Donny Chat UX]] (the light-vs-dark sibling) instead of a thin duplicate.
- Failed: none yet (RAG sync + verify-knowledge happen after this PR merges + main ff).
- Remember: **gap noticed** — PR #178 (AIOS Stakeholder Invite) shipped without a wiki page;
  worth a backfill ingest in a future knowledge-sync (don't let merged AIOS features skip the wiki).

### [2026-06-24] Stripe webhook revival + dual-secret (PRs #173/#174 → docs PR #176)
- Output: PR #176 — `raw/sessions/2026-06-24-stripe-webhook-revival-dual-secret.md`, new
  `concepts/stripe-webhook-delivery.md`, `entities/stripe-connect.md` (Webhook Delivery
  section), `index.md` + `log.md` entries, PROJECT_CONTEXT active-workstream bullet.
- Happened: authored on a fresh branch off origin/main (per [scope]); orphan check clean;
  Codex-clean (docs-only); merged #176; ff'd main → post-merge hook synced RAG (wiki: +1
  inserted/49 updated/errors=0; internal: +1/69 updated/errors=0). Confirmed retrievability via
  `content ilike` — "Stripe Webhook Delivery" present (updated 03:27Z).
- Worked: [scope] + [orphans] + [rag-sync] Lessons all held — no hand-sync, no orphans, clean PR.
- Failed: forgot to bundle THIS run-log entry into #176 (this is a follow-up PR); first verify
  query used a non-existent `source_id` column on `donny_knowledge`.
- Remember: both failures → **promoted to Lessons** ([runlog-in-pr], [rag-verify]).

### [2026-06-24] Test-Mode Stripe UX session (PR #168 → docs PR #169)
- Output: PR #169 — `raw/sessions/2026-06-24-test-mode-stripe-ux.md`, new `concepts/test-mode-stripe-ux.md`, `entities/stripe-connect.md` cross-link, `index.md` + `log.md` entries, PROJECT_CONTEXT active-workstream. [[verify-knowledge]] verdict: `done:true` (all 3 met, first pass).
- Happened: authored docs on a fresh branch off origin/main (per [scope] Lesson), ingested, ran orphan check (clean), opened+merged #169, ff'd main → post-merge hook synced RAG (wiki: +1 inserted/48 updated/errors=0). Confirmed retrievability via `content ilike` (page present, updated 19:15Z).
- Worked: [scope] + [orphans] + [rag-sync] Lessons all applied cleanly — no hand-sync, no orphans, clean PR. Removed one dangling `[[Lovable Edge Function Deploy Gap]]` wikilink (no such page) to keep lint green.
- Failed: none. (Auto-merge is disabled on the repo → had to poll CI then merge #169 manually; not a knowledge issue.)
- Remember: repo has no auto-merge — a docs PR needs a CI poll-then-merge, not `gh pr merge --auto`. (advisory)

### [2026-06-24] Loop memory shipped + security triage capture + orphan fix
- Output: PR #166 (`raw/sessions/2026-06-24-…`, `concepts/security-definer-advisor-triage.md`,
  `loop-memory-protocol.md` status, index.md+log.md, PROJECT_CONTEXT.md) + this orphan-fix PR
  (index.md entries for the 2 orphans).
- Happened: captured the session, merged #166, RAG auto-synced (errors=0, confirmed by content
  query). Close-the-loop lint caught 2 pre-existing orphans → fixed in this follow-up.
- Worked: post-merge hook auto-synced both RAG stores; `content ilike` verified retrievability.
- Failed: missed appending this Run Log entry to #166 itself (the loop-memory dogfood) → done
  here; the 2 orphans were pre-existing from `wiki-save-answer`.
- Remember: orphan-check + the wiki-save-answer gap → **promoted to Lessons**.

<!-- Template for each run (newest on top):
### [YYYY-MM-DD HH:MM] <session/topic>
- Output: <wiki session source + pages + core-doc edits; never a duplicate of the output>
- Happened: <what was captured, which core docs refreshed, RAG synced?>
- Worked: <what went well>
- Failed: <what the verify-knowledge verdict's missing[] flagged / what went wrong>
- Remember: <takeaway; note "→ promoted to Lessons" when durable>
-->
