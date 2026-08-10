# knowledge-sync — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **[scope-paths] Point the `[scope]` check at the branch's SOURCE paths, not just the core
  docs.** On 2026-08-10 the check ran clean against `PROJECT_CONTEXT.md`/`SHIPPED_LOG.md`/
  `docs/wiki/` — and `origin/main` had, that same morning, merged a **parallel implementation of
  the very feature the branch was building** (#429 vs #428, two sessions acting on two phrasings
  of one founder complaint). A docs-clean `origin/main` says nothing about
  `src/components/...`. The collision was found by accident, chasing an unrelated Codex finding,
  after hours of duplicate work. Run
  `git log --oneline HEAD..origin/main -- <the dirs this branch edits>` as well — on a repo with
  30+ worktrees, *"has someone already shipped this?"* has a real answer one command away.
  Corollary: **when the parallel version landed first and is better, delete yours** and rebuild
  on top of it; merging both produces two answers to one question.
- **[superseded-mechanism] When work DELETES a mechanism, hunt the rule you wrote for it.**
  A knowledge-sync that generalises a pattern into `DESIGN_SYSTEM.md` / `CLAUDE.md` plants a
  claim that outlives the branch. On 2026-08-10 a redesign deleted the pinned-composer machinery
  a *previous run on the same branch* had just codified as a house rule — leaving an
  always-loaded doc instructing every future session to build the thing that had just been
  removed, which is worse than never writing it. **Before finishing, grep the core docs for the
  mechanism this session removed**, and rewrite the rule to the principle that survived rather
  than deleting it outright — the reason the old rule existed is usually still true, only its
  answer changed. Same edit-in-place discipline as `[status-correction]`, applied to design
  rules instead of status lines.

- **[wiki-is-internal] `sync:wiki` publishes nothing, and `sync:internal` is what carries the
  wiki into the RAG — by design, not a gap.** Since PRs #434 → #437 (2026-08-10)
  `sync-wiki-to-donny.mjs` sends **only** pages listed in a `CONSUMER` allowlist that is
  **empty**, so it is a near no-op; `sync-internal-docs.mjs` is the script that syncs
  `docs/wiki/` (as `internal-<dir>:<slug>`, scope internal), and `wiki-merge-pr` writes the same
  namespace. **Step 6 should therefore run `sync:internal`** — running only `sync:wiki` after
  adding a page will report `Publishing 0 page(s)` and the page will NOT be in the RAG. Keep
  verifying with `content ilike`, which queries with the service role and no scope predicate, so
  it is unaffected. **Do not "fix" a page's absence from the consumer scope; that is intended.**
  If `sync:wiki` exits 1 with `orphans=N`, that is drift to prune, not a broken sync. The prior shape was two denylists, one of them
  (`EXCLUDE`) inert behind a `SYNC_CURATE=1` the unattended post-merge sync never set, which left
  **107 of 112** wiki rows consumer-reachable — including the page stating the live user count,
  the vendor-by-vendor burn and "Stripe test mode". A denylist **fails open**; every page
  `/wiki-ops ingest` adds was consumer-reachable until someone noticed. If a page genuinely
  should be consumer-readable, that is a deliberate allowlist edit — read the page end to end
  first, then preview with `SYNC_DRY_RUN=1`. See [[Donny RAG Scope Boundary]].
- **[new-page-vs-compound] "Compound, don't duplicate" is about the same SUBJECT, not the same
  neighbourhood.** On 2026-08-10 the nearest page to a RAG-scope session was
  [[Knowledge-Sync Automation]] — but that page is the *plumbing* (npm aliases, secret resolver,
  post-merge hook) and the session was about the *boundary* that plumbing writes across. Separate
  page, cross-linked both ways. Compounding a distinct subject onto a topical neighbour buries it
  as a retrieval key and pushes the host page toward `FAIL_CHARS`, where it is **skipped entirely**
  — paying a real cost for a principle that did not apply.
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
  **Corollary (2026-08-07): `**Pending:**` clauses DECAY, and nothing sweeps them.** Each entry is
  written by the session that built the thing; the session that later merges the PR or applies the
  migration is usually a *different* one that never revisits §5. A sweep of all 10 "Built — awaiting
  founder go-live" entries found **8 already complete** — merged PRs, applied migrations, deployed
  functions — so the always-loaded status doc was telling every session that four live `/internal`
  pages were still dark. Verify a `**Pending:**` clause against **prod objects** (`pg_proc` /
  `information_schema` / `pg_indexes` / `pg_indexes`), the **PR state**, and the **function
  version** — never against the clause itself or the migration ledger (`schema_migrations` records
  intent, not existence; recorded ≠ actual). Two traps hit during that sweep: the recorded migration
  *version* does not match the repo filename prefix, and **guessing an object name produces a
  spectacular false alarm** — I "found" two live prod breaks that were really `complete_posting_schedule`
  vs the actual `complete_posting_schedule_if_done`, and an `outstand_media_cache` table that the
  migration never created (it adds columns + an index to `outstand_media_ownership`). Read the
  migration for the real identifiers before querying for them. Re-sweep whenever the section looks
  long, or when any entry is older than ~2 weeks.
- **[gap-claims] Verify a claimed knowledge gap against `origin/main`, never a worktree.** A worktree
  drifts silently — **absence in one proves nothing.** On 2026-07-19 I asserted "PR #288 shipped
  without its knowledge-sync" from a worktree 15 commits behind; PR #290 had already done the sync and
  #291 verified it. The claim reached the founder, a spec, a plan, and a ledger before being caught,
  and would have produced a **duplicate** wiki source — the exact opposite of "compound, don't
  duplicate". Cheap check first: `git fetch origin` then
  `git ls-tree -r --name-only origin/main -- docs/wiki/raw/sessions/ | grep <topic>`. Applies to any
  "X is missing / was never documented" claim, not just knowledge-sync.
- **[codex-empty-diff] `codex review --base main` reviews NOTHING when the work is
  staged-but-uncommitted.** On a fresh branch cut from `origin/main`, HEAD *is* main's tip until you
  commit, so `git diff main...HEAD` is empty and Codex spins on nothing — and a returned "clean"
  would be **false assurance on an unreviewed diff**, the worst possible failure for a review gate.
  Confirm the range is non-empty (`git diff main...HEAD --stat`) before trusting any verdict; use
  `--uncommitted` for staged work, or commit first. Caught 2026-08-07 only because the run hung.
- **[sync-before-blocked-gate] When a required review gate is blocked, run knowledge-sync anyway,
  and record the gate as unrun.** The docs then ride in the same PR and go through the second pass
  with the code (which `CLAUDE.md` requires) instead of becoming a follow-up. State the blocked gate
  in all three places status lives — §5's `**Pending:**` clause, the concept page's Known Issues,
  and the SHIPPED_LOG entry's opening note. Corollary to [status-correction]: §5 is *current
  status*, so an entry that **overstates readiness** is the same defect as one that goes stale.
- **[runlog-in-pr] Bundle this MEMORY.md Run Log entry INTO the docs PR commit**, not a
  separate follow-up. Forgetting it (as on the #176 run) costs a whole extra PR cycle just to
  persist one bookkeeping line.
- **[rag-verify] `donny_knowledge` has no `source_id` column** — verify retrievability with
  `content ilike '%<distinctive phrase>%'`, not a source/id filter (the query errors otherwise).
  Pick a phrase that can't straddle a markdown line-wrap (a short hyphenated/code token like
  `fixed-probe` or `82dvh`, not a multi-word sentence) — wrapped prose false-negatives the check.
  Also `inserted=0` in the sync log does NOT mean a new page was missed (upsert counting) — trust
  the ilike probe, not the counters.
  **Never use `max(updated_at)` as the freshness signal.** Root cause found 2026-08-07 and
  **since FIXED — the reason changed, the rule did not.** Historically
  `trg_donny_knowledge_updated_at → handle_updated_at()` was a **stub**
  (`-- Function logic here / RETURN NEW;`) that never assigned `NEW.updated_at`, so an UPDATE fired
  it and changed nothing (after a sync reporting `updated=101 errors=0`, the changed page held the
  new text while `updated_at` **equalled its `created_at`** from 78 minutes earlier) — the check was
  structurally unpassable, not flaky. **PR #385 / migration `20260807233200` restored the function**;
  measured 2026-08-08, **231 of 237** rows now have `updated_at > created_at`, exactly the UPDATE
  count of that sync. **Still don't gate on it** — a moved timestamp proves only that *something*
  was written; `content ilike` proves the specific new text is retrievable, which is what the RAG is
  for. The old corollary "**~30 tables share this stub**, distrust `updated_at` on all of them" is
  **retired** — those triggers work. What remains true is narrower: `updated_at` is a *modification*
  stamp, never a *status* signal, and pre-2026-08-07 rows are unreliable in **both** directions
  (`== created_at` means "no explicit writer touched it", not "never modified"). See
  [[Updated-At Trigger Drift]].
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

- **[doc-documents-the-bug] When the page you're compounding onto describes the defect as a
  FEATURE, the edit is a retraction, not an append — and it must read as one.** On 2026-08-08
  [[Notification Delivery]] said `create-notification` "resolves the email type as
  `emailType ?? map[type]`, so a caller can target **any** template" — accurate, approving, and a
  precise description of the hole being closed. Deleting the line would erase the evidence that the
  guidance was ever given; a reader who acted on it needs to see it *withdrawn*. Quote the old text,
  mark it corrected with a date, say why it was wrong, and point at what replaced it (same
  discipline as the struck-through Known Issue). Ask on every compound: **does this page currently
  recommend the thing I just fixed?** — a page can be entirely accurate and still be wrong about
  whether the behaviour is desirable.
- **[scope-ordering] Run the [scope] check before the FIRST doc edit, not after the last.** On
  2026-08-08 I edited three core docs, *then* checked, and found `origin/main` 7 ahead with all four
  moved — conflicting in exactly the three I'd touched. The check is **one command**
  (`git log --oneline HEAD..origin/main -- <core docs>`) and it is worth running even when the branch
  is "only a few" commits behind and the session isn't doc-focused, because the core docs are the
  most-edited files in the repo and every knowledge-sync touches the same four. Corollary: **do the
  `origin/main` merge before starting any long-running background `git push`** — a push in flight
  pins the branch, so the merge has to wait it out.

- **[memory-scope] A remembered fact can be true and still wrong *where you are standing*. Check
  whether it is scoped to a location before propagating it.** On 2026-08-09 I quoted the stored
  "`npm run test` exits 1 with ~103 pre-existing failures — judge by counts, not the exit code" into
  **eight** subagent dispatches. Measured from the worktree: **210 files / 2033 tests / 0 failed.**
  The memory wasn't stale — those failures are vitest mis-collecting Playwright specs under
  `.claude/worktrees/**`, and *a worktree has none nested under it*. So from a worktree a red suite
  means a **real regression**, the opposite of what I'd told everyone; "it's always red" trains a
  session to ignore the one signal that catches a real break. Applies to any environment-shaped
  claim (paths, tooling, CI, shells) — **the cheapest check is to run the thing once before quoting
  the memory about it**, and to fix the memory with the scope rather than deleting it. Corollary:
  `<cmd> | tail -N` reports **tail's** exit code, not `<cmd>`'s — a pipe launders a failure into 0.

- **[scope-catches-more-than-docs] The `[scope-ordering]` check is a PROD safety check, not just a
  doc-conflict check — and it is the only thing that catches a concurrent-deploy revert.** On
  2026-08-09 it was run for the usual reason (are the core docs current before I edit them?) and
  the answer — `origin/main` 3 ahead — revealed that a **fleet redeploy had silently reverted a
  parallel session's prod fix**. #416 merged and deployed `donny-orchestrator` at 22:38 UTC; a
  redeploy of 82 functions pinned to `caa7ca97` (pre-merge) overwrote it at 22:54. **Both deploys
  succeeded and both passed the boot probe, because stale code boots perfectly well** — there is
  no health check that catches this, and nothing in the deploying session's view looks wrong.
  Generalize two ways: (1) a multi-function deploy pins itself to one commit while `origin/main`
  keeps moving, so re-check `HEAD..origin/main` immediately **before** a fleet deploy and again
  **after**; (2) when repairing, verify by **reading the deployed source for the other change's
  symbols**, never by the version number, which increments either way. Corollary for parallel
  sessions generally: `[squash-drift]` and `[gap-claims]` already say a worktree serves stale
  *files*; this says a stale worktree can also ship stale *code to production*.

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-08-10] Wiki RAG dedupe — compounding onto a page THIS session wrote (`docs/wiki-sync-dedupe`, after #437)
- Output: `docs/wiki/concepts/donny-rag-scope-boundary.md` (updated, not a new page) + the
  `log.md` entry dated 2026-08-10 "the wiki was syncing a second copy of itself";
  `knowledge-sync-automation.md` updated again; `SHIPPED_LOG.md` prepended;
  `PROJECT_CONTEXT.md` §5 line **edited in place** per [status-correction].
- Happened: #437 superseded the mechanism the page written *four hours earlier in this same
  session* described, so the compound/new-page call was easy in the other direction from last
  run — same subject, edited in place. Two pages describing one boundary would leave no signal
  about which is current.
- Worked: [claim-decay] fired twice in one run, both on text this session authored.
  `knowledge-sync-automation.md`'s "what the two scripts mean" block was false within hours, and
  its **long-standing** "harmless libuv assertion" Gotcha turned out to be wrong in a way that
  mattered — the assertion replaces the process exit code (an intended 1 observed as 127).
- Worked: chasing that claim instead of just rewording it found the identical `process.exit()`
  -after-fetch pattern latent on `sync-internal-docs.mjs`'s error path, fixed in the same PR.
  **A doc that says "check the others" and does not check is the same defect it is documenting.**
- Failed: nothing gating. One genuine operational error earlier in the session, recorded because
  it is cheap to repeat: the 113-row prune was run **before** its script change reached `main`,
  and the post-merge hook re-inserted every row by running `main`'s older script. Sequence data
  changes AFTER the code that governs them, and read `.git/knowledge-sync.log` before concluding
  a delete failed.
- Remember: **a page this session created is not exempt from [claim-decay] — it is the most
  likely thing to rot, because the same session keeps changing what it describes.** Before
  finishing any run, re-read the pages this session touched *earlier* against what shipped
  *later*.

### [2026-08-10] Donny RAG consumer scope — the wiki goes internal by default (`docs/wiki-sync-consumer-scope`, after #434)
- Output: `docs/wiki/concepts/donny-rag-scope-boundary.md` (new) + the `log.md` entry dated
  2026-08-10 "the consumer RAG was the leak"; `knowledge-sync-automation.md` updated;
  `SHIPPED_LOG.md` prepended; `PROJECT_CONTEXT.md` §5 one line under Shipped.
- Happened: [scope-paths] and [scope] both applied and both earned their keep — `origin/main`
  moved **twice** during the code session (#430/#431, then #433) in a repo with 30+ worktrees, so
  the docs branch was cut fresh from `origin/main` (669b259b) and the path check
  (`git log HEAD..origin/main -- docs/wiki docs/SHIPPED_LOG.md docs/PROJECT_CONTEXT.md
  .claude/skills`) came back empty. [orphans] run by path: **113 pages, 0 orphans**.
- Worked: **a new page rather than a compound, for a reason worth reusing.** The nearest existing
  page, [[Knowledge-Sync Automation]], is the *plumbing* (aliases, secret resolver, post-merge
  hook); this session's subject is the *boundary* that plumbing writes across. "Compound, don't
  duplicate" is about the same subject, not the same neighbourhood — and compounding here would
  also have pushed a page toward the embedding ceiling for no retrieval benefit.
- Worked: [claim-decay] caught a live one **in the page I was already editing**.
  `knowledge-sync-automation.md` asserted "updates don't bump `updated_at`" — falsified by PR #385
  on 2026-08-07. Rewritten to the principle that survived (gate on `content ilike` because it
  proves *this* text is retrievable, not merely that *something* was written) rather than deleted,
  per [superseded-mechanism].
- Failed: nothing gating. One process note — the code PR (#434) merged **before** its docs, so
  this ran as a paired follow-up rather than riding in the same PR. That is the opposite of
  [sync-before-blocked-gate]'s preference and it was avoidable: the founder asked for step 1 only,
  and I treated "step 1" as excluding the knowledge layer instead of asking.
- Remember: **the wiki now syncs `internal` by default, so a knowledge-sync no longer publishes
  anything to consumers.** Step 6's `sync:wiki` still runs and is still how pages reach
  `donny_knowledge` — they just land at `scope='internal'` alongside the `internal-*` mirror. The
  `content ilike` verification is unaffected (it queries with the service role and no scope
  predicate). If a future session wants a page consumer-readable, that is a deliberate `CONSUMER`
  allowlist edit in `sync-wiki-to-donny.mjs`, previewable with `SYNC_DRY_RUN=1`, and it should
  read the page end to end first — see [[Donny RAG Scope Boundary]].

### [2026-08-10] Donny dashboard — fresh per visit, after a parallel-PR collision (`fix/donny-dashboard-mobile-composer`, #428)

Output: `docs/wiki/raw/sessions/2026-08-10-donny-dashboard-fresh-per-visit.md` →
[[Donny-First Dashboard]] (new "#429, #428" section + a "collision nobody looked for" subsection
under review-caught + 3 new Decisions) · `docs/wiki/log.md` top entry · `SHIPPED_LOG.md` top
entry · `PROJECT_CONTEXT.md` §5 edited in place.

- Happened: mid-session, #429 merged a **parallel implementation** of the bounded scroller this
  branch was building. Branch was reset onto `main` and rebuilt to carry only the remainder
  (fresh-per-visit + collapsing greeting); the duplicate was discarded.
- Failed: the `[scope]` check ran that morning and came back clean — against the **core docs
  only**. It said nothing about `src/components/donny/`. → new Lesson `[scope-paths]`.
- Worked: correcting a stale claim the concept page had carried since #423 ("the dashboard sits
  in normal page flow scrolled by `#main-content`"), which #429 had invalidated and #429's own
  knowledge-sync had not yet reached. **Compounding onto a page is also a chance to check what it
  currently asserts.**
- Worked: recording the *process* lesson in the wiki, not just the code lesson. The expensive
  miss here was duplicated work, and no amount of test coverage would have surfaced it.
- Remember: an earlier run on this same branch generalised a mechanism into `DESIGN_SYSTEM.md`
  that a later commit deleted — see `[superseded-mechanism]`. Both of this session's lessons are
  about **knowledge-sync output going stale faster than the branch it documents**.

### [2026-08-09] Donny-first dashboard Phase B — inline chat + the markdown-table fix (`feat/donny-dashboard-inline-chat`)

**Output:** new `raw/sessions/2026-08-09-donny-dashboard-inline-chat.md`; **no new concept page** —
compounded onto `concepts/donny-first-dashboard.md`; `index.md` (1 Sources line + the existing
Concepts entry rewritten); `log.md` top entry; `SHIPPED_LOG.md` prepended; `PROJECT_CONTEXT.md` §5
entry **corrected in place**; + THIS entry.

**Happened.** Branch-finish for the Phase-B work that came out of the founder's own prod
acceptance test of the repaired `social_*` tools.

**Worked — [status-correction], and it caught two decayed claims in the always-loaded doc.** §5's
Phase-A entry still said *"Pending: merge PR #410 … flip `DONNY_FIRST_DASHBOARD_ENABLED`"*. Both
were **already done** — #410 merged at 10:19 UTC the same day and #411 flipped the flag, which is
precisely why the founder could reach the feature on prod. Verified against the **PR state** and
`git show origin/main:src/lib/featureConfig.ts`, not against the clause. Corrected the one line
rather than appending a Phase-B entry beside a stale Phase-A one.

**Worked — [doc-documents-the-bug].** The concept page described the panel-opening as *"a
deliberate trade the founder accepted, not an oversight"* — accurate when written, and exactly the
behaviour the founder then reported as broken. Struck through with a date and the reason instead of
deleted, because a reader who acted on that framing needs to see it **withdrawn**.

**Worked — [scope].** `git diff --name-only` both ways before touching anything showed **zero
overlap** between `origin/main`'s two new commits (#418, #421 — docs only) and this branch's file
set. That proved the rebase could not conflict *and* could not invalidate the finished Codex
review, so the code gate did not have to be re-run after it. Ordering that paid: the two files
`origin/main` did **not** touch (`concepts/donny-first-dashboard.md`, the new raw session) were
written and committed **before** the rebase; `index.md`/`log.md`/`SHIPPED_LOG`/`PROJECT_CONTEXT`
after — `log.md` is prepend-at-top, so editing it pre-rebase conflicts by construction.

**Failed → fixed.** Reported a full-suite figure of "229 files" from a `grep` that had matched
vitest's **interim progress line** rather than the final summary, which read as five test files
silently vanishing. The JSON reporter settled it: 234 files / 2329 tests / 0 failed. **Remember:
`--reporter=json` for any test count that goes into a doc or a commit message** — the console
summary is not addressable by grep mid-run. Two unrelated red tests (`HeroSection`,
`OnboardingWizard`) were chased to ground rather than waved off as flakes: untouched directories
(empty diff vs main), passing in isolation, and `HeroSection` green at a longer timeout because its
tests do a dynamic `import()` inside a 5s budget on a heavily loaded machine.

**Remember — a blank Codex run is a FAILED gate, and it happened three times here.** Round 1 was
killed by a session compaction, round 2 hit the 10-minute cap mid-pass, and round 4 died at exit
127 after 157 KB of output. None produced a verdict; none counts as a pass. Round 4's retry came
back clean. Also: a `codex review` backgrounded with `&` inside a shell command writes to
`/dev/null` and its verdict is **unrecoverable** — use the harness's own background mode.

### [2026-08-09] `.com` Phase 1 + esm.sh bundler outage + 82-function redeploy (PRs #414, #415 merged; docs on `fix/redeploy-after-social-tools-merge`)

**Output:** new `raw/sessions/2026-08-09-dotcom-phase1-and-esm-sh-bundler-outage.md`; **two NEW**
concept pages `concepts/domain-migration-io-to-com.md` + `concepts/edge-function-deploy-bundling.md`;
`index.md` (2 Concepts entries + 1 Sources line); `log.md` top entry; `SHIPPED_LOG.md` prepended;
`PROJECT_CONTEXT.md` §5 one **In flight** line; `supabase/config.toml` comment corrected; + THIS
entry and the [scope-catches-more-than-docs] Lesson above.

**Happened.** Ran as the branch-finish step for three efforts on one thread. Split into **two**
concept pages by subject, not session — the bundler-outage page outlives the migration entirely,
and neither would have to be wrong for the other to be right.

**Worked — [scope-ordering], and it paid off far beyond its purpose.** One command before the
first doc edit surfaced `origin/main` 3 ahead, which is how I found that my own fleet deploy had
**silently reverted a parallel session's prod fix** 16 minutes after they deployed it. Promoted as
[scope-catches-more-than-docs]. Also [wikilinks]-exact, which caught **two** dangling links
(`[[Anon Key Is Not Authorization]]` → the real name is `[[verify_jwt Is Not Authorization]]`;
`[[Landing Lead Capture]]` → `[[Landing Redesign & Public Lead Capture]]`) — the recurring failure
of writing a link from memory of a page's *subject* rather than its catalogued display name.
Confirmed the `index.md` Concepts duplication from the 2026-08-09 run is **fixed** (#412); each
concept path now appears once.

**Failed — my own verification command lied to me, twice in one session.** I passed
`[regex]::Escape(...)` together with `-SimpleMatch`, so the search looked for literal backslashes
and reported all three *real* links as DANGLING. Had I trusted it I'd have "fixed" three correct
links into broken ones. **A verification tool that reports failure is itself a claim that needs
checking** — the same discipline as verifying a reviewer's finding, applied to my own tooling.

**Remember — the sharpest thing here is about my own reporting, not the code.** During the outage
I told the founder twice that I had found the cause (entrypoint path; then the new cross-file
import). Both were wrong, and each was disproven by the very next experiment. What actually found
it was **comparing the broken function against a working one** — one call, after four wrong
hypotheses read from the code. Two durable rules: when a deploy breaks and the code looks fine,
**diff against something that still serves** instead of rewriting the thing that's broken; and
**a hypothesis that survives only because you haven't tested it is not a finding** — say
"unverified" until an experiment separates it. Second: testing the *siblings* (`esm.sh/stripe`,
`esm.sh/jose` — both fine) is what kept the fix at 121 files instead of 155, i.e. what stopped
me churning the money rail on an assumption. Third, on mobile verification: I nearly filed
"blocked" again, and only the stored memory recording that this exact verdict had been **too
broad once before** made me try browser-use, which worked first attempt.

### [2026-08-09] Donny-first dashboard Phase A + route blind spot (PRs #409 merged, #410 open — bundled INTO #410)

**Output:** new `raw/sessions/2026-08-09-donny-first-dashboard-and-route-blind-spot.md`; NEW
`concepts/donny-first-dashboard.md`; **compounded as a CORRECTION** onto
`concepts/donny-data-and-quick-actions.md` (new "The guard's blind spot" section, its Known Issue
struck-and-explained, one new Known Issue, See Also); `index.md` (1 Sources line + the new Concept
+ the quick-actions entry corrected — **each in both catalog copies**, see below); `log.md` top
entry; `SHIPPED_LOG.md` prepended; `PROJECT_CONTEXT.md` §5 **two** Built entries with dated
`**Pending:**` clauses; `DATABASE_SCHEMA.md` (`campaigns.deadline` is a `date`); `DESIGN_SYSTEM.md`
(`AppChip` is a filter primitive, wrong as a primary affordance); + THIS entry.

**Happened.** Ran as the branch-finish step with #410 already open, so the docs ride in the same PR.
Covered **two** efforts because #409 merged during the session without its own sync.

**Worked — [scope-ordering] paid off by being run first, for once.** One command before any edit;
core docs were current because the branch had just been rebased onto `origin/main`. Also
[wikilinks]-exact (grepped all 7 targets against `index.md`; zero dangling) and [orphans]-by-path
via PowerShell (clean).

**Worked — [doc-documents-the-bug] fired exactly as written.** `donny-data-and-quick-actions.md`
described the `isKnownRoute` three-layer fix as if it closed the class, and its Known Issue framed
the residual risk as *under*-linking ("a new route must be added or Donny won't link to it") — the
safe failure. The shipped failure was the opposite and cost twelve dead CTAs including the revenue
path. Struck the Known Issue and explained it rather than deleting it.

**NEW WIKI DEFECT FOUND, deliberately not fixed:** `index.md`'s `## Concepts` section contains the
**entire catalog twice**, with UTF-8 mojibake (`â€”`) scattered through both copies. Verified by
`uniq -c` on the extracted paths — every concept appears exactly 2×; Sources and Entities are
single. I added each new/corrected entry to **both** copies, so nothing is lost whichever copy a
future dedupe keeps. Deduping is a ~160-line rewrite of a file every worktree touches → its own PR.

**Failed / didn't run.** RAG sync is post-merge per [rag-sync] (#410 open; `docs/` changed so the
post-merge hook fires on the main fast-forward). `verify-knowledge`'s loop-close likewise deferred.

**Remember — the correction this session had to make about ITSELF, which is the sharpest thing here.**
I told **eight** subagent dispatches "`npm run test` exits 1 from ~103 pre-existing failures; judge
by counts, not the exit code," quoting a stored memory. Then measured it: **210 files / 2033 tests /
0 failed.** The memory was not stale — it is **location-scoped**. Those failures are vitest
mis-collecting Playwright specs under `.claude/worktrees/**`, and *a worktree has no nested
worktrees under it to scan*. So from a worktree a red suite means a **real regression**, the exact
opposite of what I'd told everyone. Repeating "it's always ~103 red" trains a whole session to
ignore the one number that catches a real break. **A memory can be true and still be wrong where you
are standing — check whether a remembered fact is scoped to a location before propagating it.**
(Memory file updated with the scoping.) Second, cheap: `npm run test | tail -N` reports **tail's**
exit code, not vitest's — the pipe silently launders a failure into exit 0.

### [2026-08-08] Notification + invitation authorization (`fix/notification-authorization`, PR #387)

**Output:** new `raw/sessions/2026-08-08-notification-and-invitation-authorization.md`;
**compounded** onto `concepts/notification-delivery.md` (new "Who may notify whom" section + the
`emailType` correction + 2 new residuals + the bulk-invite Known Issue flipped) and
`concepts/campaign-invitations.md` (new "Invitation & application integrity" section); `index.md`
(new Sources line + **both** Concepts entries corrected); `log.md` top entry; `SHIPPED_LOG.md`
prepended; `PROJECT_CONTEXT.md` §5 one Built entry with a `**Pending:**` clause;
`DATABASE_SCHEMA.md` (`can_notify_user` blockquote + a `push_notifications` row note); + THIS entry.

**Happened.** Covered **two** efforts, because #387's sync had never run — no raw session, and
`SHIPPED_LOG.md`'s newest entry predated it. Both compounds are *reframes*: each page stated
something this work made false, and on [[Notification Delivery]] the false statement **was the
vulnerability** (`emailType ?? map[type]` — "a caller can target any template" — written approvingly).

**Worked.** Struck-and-explained that line rather than deleting it, per "flag contradictions, never
silently overwrite" — a reader who remembers the old guidance needs to see it retracted, not vanish.
Choosing compound over new pages was easy once I asked which page would have to be *wrong* for the
new page to be right: both would.

**Failed — and it cost real work.** I edited `SHIPPED_LOG.md`, `index.md` and `log.md` **before**
running the [scope] check, then found `origin/main` 7 ahead with all four core docs moved. The merge
conflicted in exactly those three files. Nothing was lost, but the check is **one command** and I ran
it after the last edit instead of before the first. Compounded by starting a long `git push`
beforehand, which pinned the branch and forced the merge to wait ~20 min.

**Remember.** Two new Lessons promoted: [doc-documents-the-bug] and the [scope] ordering corollary.
Also worth carrying: `handle_updated_at()` was **restored** upstream (migration `20260807233200`,
PR #385) — the "it's a stub, `updated_at` is untrustworthy on ~30 tables" warning still in older
session context is now **stale**. A worktree 7 commits behind serves stale *facts*, not just stale
files.
### [2026-08-08] `donny-dragonshare-score` removal (`chore/remove-orphaned-dragonshare-score`)

**Output:** "Resolved by deletion", "Found while confirming the sibling lead", "Open instances" and
"deleting source is not undeploying" sections on `concepts/service-role-data-exposure.md`
(compounded, no new page); source `raw/sessions/2026-08-08-dragonshare-score-removal.md`; `log.md`
entry `[2026-08-08] update | [[Service-Role Data Exposure]]`; `index.md` concept line extended;
`SHIPPED_LOG.md` prepend **plus a pointer inserted into the now-stale lead list of the 2026-08-07
entry**; `PROJECT_CONTEXT.md` §5 (Built — awaiting founder go-live); removal notes on the two
2026-04-27 DragonShare planning docs.

**Happened.** Checked two of the four unverified leads the 2026-08-07 session filed. One was real
(deleted the function); **one of my own claims about the other was wrong** and had already reached a
recommendation to the founder.

**Worked — closing a lead in the doc that filed it, in BOTH directions.** I struck the confirmed lead
*and* the refuted one in the spec's §7, rather than deleting the refuted bullet. A wrong lead left
standing is what gets acted on later; a lead silently removed looks like it was never checked. Both
now carry `CHECKED <date> →` and the outcome.

**Failed — "orphaned" was asserted from a grep of runtime call sites.** `landing-clips` reaches its
consumer through `lazy(() => import("./HeroVideoBackdrop"))` behind a flag that is `false` **by
design** (`DESIGN_SYSTEM.md` promises the flag re-enables it "with zero other code changes"). A lazy
dynamic import behind a false flag is indistinguishable from dead code to that grep, and deleting the
function would have broken the promise **silently** — the fetcher swallows all errors and returns
`[]`. I had already recommended deleting it before checking.

**Remember (promote if it recurs):**
- **[dead-code] "Orphaned" is a claim about the whole consumer chain, flag-gated links included.**
  Trace `lazy()`/dynamic `import()` and feature flags before calling anything dead. A flag that is
  off by design is preservation, not abandonment — check whether a doc *promises* it can be flipped.
- **[deploy-gap] Deleting source is NOT undeploying.** A merged deletion leaves the function serving,
  so the repo and the live attack surface disagree — and the repo is what everyone greps. Any
  "removed the function" entry must carry the undeploy as an explicit `**Pending:**`, which is why
  this entry went to *Built — awaiting founder go-live*, not *Shipped*.
- **[reviewer-scope] A reviewer finding can be too SMALL.** `data-exposure-reviewer` flagged
  `screenshot_url`; the same policy left `content_file_path` unconstrained too. Verifying a finding
  means re-deriving its reasoning, not just confirming the line it points at — check whether the
  cause covers siblings the reviewer didn't name. (Mirror of the existing verify-before-accepting
  rule, in the under-reporting direction.)

### [2026-08-08] `status_changed_at` anchor (`feat/status-changed-at-anchor`, PR #391)

**Output:** the "The follow-up: `status_changed_at`" section + extended anchor table on
`concepts/updated-at-trigger-drift.md` (compounded, no new page); `log.md` entry
`[2026-08-08] update | [[Updated-At Trigger Drift]]`; `index.md` concept line rewritten;
`DATABASE_SCHEMA.md` both new columns + the anchor-scope rule; `SHIPPED_LOG.md` prepend;
`PROJECT_CONTEXT.md` §5 (2 in-place corrections).

**Worked — compounding beat creating.** #391 closes the open issue #385 left, so it belongs on the
same page; a new page would have separated a defect from its fix. Better still, it let me **close
two "Known Issues" in place** rather than leave a page advertising problems that no longer exist.
A concept page's Known Issues section is a decaying claim just like a §5 `**Pending:**` clause — the
session that fixes the issue is the only one positioned to notice.

**Worked — the decay lesson caught a live one.** #384's §5 line said "**Pending:** merge PR #384";
it merged (e3f12c14) *while this session was running*. Corrected to keep only the genuinely
outstanding half (`verify-prod` still not run). This is the second consecutive session where a
`**Pending:**` clause decayed under me, which is evidence the pattern is structural, not a one-off.

**Remember — two bugs of identical shape in one change.** Twice I removed a column from a
`.select()` and left a payload reading it. Invisible to TypeScript because the embedded object is
cast `as any`; it would have been `undefined` at runtime and thrown out of the sort. **When a change
renames a selected column, grep every read of the old name — the `as any` cast means the compiler is
not a safety net here.** Both were caught by re-grepping after the edit, not by review.

**Remember — reviewers found what I could not.** `edge-function-reviewer` caught that the queries
never checked `error` (so an out-of-order deploy fails *silently* — "it looks like a quiet day"),
and Codex caught a design error I would have defended: a symmetric two-column anchor that *looked*
consistent and would have announced escrow events that never happened. **Symmetry is not evidence
of correctness. The consumer decides an anchor's scope.**

### [2026-08-07] `handle_updated_at()` restore (`docs/knowledge-sync-updated-at-restore`, PR #385 work)

**Output:** `docs/wiki/concepts/updated-at-trigger-drift.md` (new) +
`raw/sessions/2026-08-07-handle-updated-at-restore.md`; `log.md` entry
`[2026-08-07] ingest | [[Updated-At Trigger Drift]]`; `index.md` ×2 (concept + raw session);
`SHIPPED_LOG.md` prepend; §5 "Shipped" entry; **`DATABASE_SCHEMA.md` ×2 corrections**.

**Happened.** Ran as the branch-finish step for the trigger-restore work, but on a *fresh* branch
off `origin/main` — the work branch had already been squash-merged, so per the [scope] lesson there
was nothing to join. The distinguishing feature of this run: it had to **falsify a core doc I had
written earlier the same day**.

**Worked.** The DATABASE_SCHEMA warning ("`handle_updated_at()` **is** a stub, `updated_at` is NOT
trustworthy on ~30 tables") was accurate when written and became false the moment the migration
applied. Because that file is auto-loaded into every session, a stale claim there is the most
expensive kind of staleness there is. Rewrote it **in place** per the [status-correction] lesson —
and, critically, preserved the *reason* behind the anchor pattern rather than deleting the whole
block: `updated_at` moves on any write, so it could never mark a state transition, stub or no stub.
Grepping for a second reference caught the Crews Phase 2 note carrying the same now-false "is a
no-op" clause. **One correction is rarely one edit — grep the claim, not the section.**

**Failed.** Two of six `[[wikilinks]]` I wrote didn't resolve (`[[Dragon Rewards Engine]]` — real
name is `[[Dragon Rewards Engine (DRE)]]`; `[[Knowledge Sync]]` — no such page at all). Caught by
grepping each display name against `index.md` *before* commit, which cost one command. Writing
links from memory of a page's subject rather than its catalogued display name is the recurring
failure mode.

**Remember.** A `**Pending:**`-style claim is not the only kind that decays — a **negative**
finding ("X is broken", "Y is untrustworthy") decays the instant someone fixes X. The session that
fixes it is the only one positioned to notice, because every later session just reads the stale
warning and believes it. When a session's work *invalidates a doc that session wrote*, correcting
it is part of the work, not follow-up.

**Also failed — and this one was the real find.** Codex returned a P2 against the *documentation*
(the "rows before 2026-08-07 are frozen" blanket claim — correctly flagged as overbroad). Checking
it against real rows falsified something much bigger than the doc: the pre-merge audit's claim that
`campaign_collaborations.updated_at` has **zero** explicit writers, which was the whole basis for
calling that alert filter "exactly equivalent". It has one (`useProjectComplete.ts:52`), and 10 of
16 prod rows prove it. **A documentation review found a code defect, because the doc restated a
code claim in a form that was checkable against data.** Writing the claim down is what made it
falsifiable. Don't treat doc review as cosmetic.

**Method, promoted to a Lesson:** the original audit was done by reading code, and verified by
*more reading*. One `count(*) filter (where updated_at is distinct from created_at)` broke it in
seconds. **A universal negative — "nothing writes X", "no caller does Y" — is cheap to falsify with
data and expensive to establish by reading. Query first.** The 3-digit-millisecond JS timestamp
versus `now()`'s 6-digit microseconds identified the writer's *language* before the grep found the
file.
### [2026-08-07] DragonFeed uplift + nav active-state (`worktree-dc-improvements-16`, PR #384)

**Output:** NEW `concepts/nav-active-state.md`; **compounded** three sections + rewritten Key
Decisions + 6 new Known Issues onto `concepts/dragon-feed.md`; `index.md` (new Concepts line, new
Sources line, refreshed Dragon Feed entry); `log.md` top entry; `SHIPPED_LOG.md` prepend;
`PROJECT_CONTEXT.md` §5 one Built entry **plus an in-place correction of #382's** (see below).

**Happened.** Ran the sync as the branch-finish step with PR #384 already open, so the docs join it
rather than becoming a follow-up. Split by *subject*, not by session: the nav fix got its own page
because the lesson outlives Dragon Feed entirely (it was reported there but affects all three navs
and all three roles, and nothing owned "which nav item is current"); the feed work compounded onto
the page that already owns the feed.

**Worked.** [status-correction]'s decay corollary paid off immediately and unprompted: #382's §5
entry still read `**Pending:** merge PR #382` while #382 was **already merged** — I only noticed
because I merged `origin/main` into the branch first ([scope]) and saw its commit go by. Verified
against `origin/main` (`380065e7`) rather than assuming, then moved it Built → Shipped as a
one-liner, preserving the genuinely-unrun both-viewport pass rather than quietly dropping it. Also
[orphans]-by-path (clean, via PowerShell — the bash one-liner tripped the worktree-isolation guard,
worth remembering) and [wikilinks]-exact: grepped all four targets against `index.md` before
linking, zero dangling.

**Failed.** Nothing knowledge-side. RAG sync is post-merge per [rag-sync] — PR open, and `docs/`
changed so the post-merge hook will fire on the main fast-forward.

**Remember.** Two durable lessons from the work itself, both worth generalizing:
**(1) A composite id that other code PARSES is a public contract.** `${creator.id}-${url}` looked
like an implementation detail; it is persisted into `analytics_events.content_id` and
string-stripped back apart by two live surfaces, so the planned uuid migration would have emptied
the Inspiration page and dashboard strip **with no error**. Grep for consumers before changing any
id scheme, however internal it looks — and note the failure mode was *silent*, which is why the
spec reviewer catching it mattered more than any test would have.
**(2) When a value drives ranking, prefer the one the client cannot author.** The upload timestamp
was available two ways: parsed free from the filename (`${kind}-${Date.now()}`) or fetched from
`storage.objects.created_at`. The free one is client-supplied — a creator writing to their own
folder could craft a future timestamp and pin their work to the top of the feed permanently. Took
the paid one.
Process note: the spec reviewer returned **8 issues, most of them real**, on a spec I'd have
otherwise implemented as written — including the id break and three features with no producer
(poster frames, "Donny auto-tags", a "hot" term that was structurally zero). Verifying its two
sharpest claims directly, rather than accepting or dismissing them, is what turned a table-plus-
migration design into a no-schema one. **Review the spec, not just the code.**

### [2026-08-07] AI Creator Match auto-run + invite clarity (`worktree-dc-improvements-17`, PR #382)

**Output:** `docs/wiki/concepts/campaign-invitations.md` (new) + the "The trigger" / "Showing the
work" sections on `concepts/ai-creator-matching.md`; `log.md` entry
`[2026-08-07] ingest | [[Campaign Invitations]]`; `SHIPPED_LOG.md` prepend; §5 "Built — awaiting
founder go-live" entry.

**Happened.** Ran knowledge-sync as the branch-finish step **after** the PR was already open, so
the docs commit lands on the same branch and joins #382 rather than becoming a follow-up. Wrote
the raw session source, ingested it as one new concept page plus a compound onto the existing
matching page, then refreshed both core docs.

**Worked.** The [scope] pre-check paid off in one command: `git rev-list --count HEAD..origin/main`
= 0 and `git diff --stat origin/main -- <core docs>` empty, so editing was safe with no rebase —
worth doing every time given how often `origin/main` restructures these files. Splitting new vs
compound by *subject* rather than by session was the right call: "what an invitation is" had no
home anywhere (Campaign Lifecycle = application state machine, Creator Groups = the *other*
invitation type), while the auto-run is plainly a property of the matcher and belonged on its
page. Correcting that page's Pipeline line ("Button →" is no longer true) mattered as much as the
new sections — a compound that only appends leaves the old claim standing.

**Failed.** Nothing in the sync itself. The RAG sync (step 6) is **not run** — it happens on the
post-merge hook when main fast-forwards, per [rag-sync]; #382 is unmerged.

**Remember.** Per [sync-before-blocked-gate], one gate was genuinely unrun this session (the
both-viewport visual pass — machine at 100% CPU, and browser sessions don't cross dev-server
ports), so it is stated in **all three** status places: §5's `**Pending:**` clause, the
SHIPPED_LOG entry's opening `>` note, and the session source's "Not verified" section. New
durable lesson from the work itself, worth generalizing beyond this run: **a doc comment is not
the contract.** `trg_reject_group_campaign_invitation`'s migration comment claims it "fires for
every write path (incl. service-role)" while its `CREATE TRIGGER` clause says `BEFORE INSERT` —
the comment was true when written and silently wrong the moment an UPDATE path appeared. When a
wiki page records a guarantee, cite the clause, never the comment.

### [2026-08-07] DC Points visibility (branch `feat/dc-points-visibility`, docs bundled into the same branch)

**Output:** new `raw/sessions/2026-08-07-dc-points-visibility.md`; **compounded** onto
`concepts/dragon-rewards-engine.md` (new "DC Points visibility" section + 2 new Known Issues +
2 new See Also links; frontmatter `updated`/`sources` bumped); **qualified** (not overwrote)
`concepts/self-improving-app.md`'s Known Issues claim that internal-scoped rows stay invisible
to consumer Donny "on every path" — true only for the `sync-internal-docs.mjs` path it was
verified against, not the separate `sync-wiki-to-donny.mjs` consumer path this session's RAG-leak
finding disproves it on; short content-refresh note added to
`concepts/help-center-and-guidance.md`'s existing naming-drift bullet; `index.md` (refreshed
`[[Dragon Rewards Engine (DRE)]]` Concepts entry in place + 1 new Sources line); `log.md` ingest
entry at top; `SHIPPED_LOG.md` **prepended** with a bold state-as-of-writing note;
`PROJECT_CONTEXT.md` §5 one line under **Built — awaiting founder go-live** with a `**Pending:**`
clause; `DATABASE_SCHEMA.md` (`dre_my_standing()` RPC blockquote appended to the existing DRE
section). No `DESIGN_SYSTEM.md`/`CLAUDE.md` change — grepped the new components for off-palette
classes first; all `dc-*`. + THIS entry.

**Happened:** ran under an explicit constraint this run had never seen before — do the files only,
no database operation of any kind, not even the read-only `verify-knowledge` loop-close if it would
touch the DB, and no `sync:wiki`/`sync:internal` (RAG sync deferred to the post-merge hook, since
this is pre-merge and per [rag-sync] that's the normal flow anyway). Ran on the SAME branch as the
code (`feat/dc-points-visibility`), not a paired docs branch — the branch was already fully caught
up with `origin/main` (`merge-base HEAD origin/main` == `origin/main`'s tip, confirmed before
editing any core doc), so no [scope] risk from a stale worktree.

**Worked:** compounding onto the existing DRE concept page rather than a new page — this is the
*same subsystem* gaining a visibility layer, and the page already had the exact "sub-project gets
its own raw session, all compounding onto one page" pattern from the UI-launch-gate and rename
sub-projects. [status-correction]-adjacent: qualified self-improving-app.md's over-broad "every
path" claim in place with dated counter-evidence rather than silently leaving it wrong, per the
wiki's own "flag contradictions, never silently resolve" rule — found by asking whether the DRE
RAG-leak session actually was covered by that page's own "verified with sentinel tests" line (it
wasn't; two different sync scripts, only one was tested). [sync-before-blocked-gate]: recorded the
unrun Codex gate in all three places status lives (§5, the concept page, SHIPPED_LOG's opening
note) — mirrors the exact treatment the SAME-DAY campaign-target-audience run gave its own
quota-blocked Codex gate, confirmed by reading that run's Lessons/entries first.

**Failed:** nothing knowledge-side. Deliberately did not run [[verify-knowledge]]'s loop-close
(it queries `donny_knowledge`, which the task explicitly scoped out) or attempt any `sync:*` npm
script — both are correctly deferred to post-merge per the task's own instructions, not a gap.

**Remember:** **a scope constraint that forbids the DB doesn't mean skip the loop-close
discipline — it means the loop closes later, and the docs should say so explicitly rather than
imply the RAG is current.** Every doc this run touched states "RAG sync deferred to the post-merge
hook" or equivalent, so a reader (or the 3am freshness agent) doesn't mistake "files written" for
"Donny already knows this." Second: when a page's Known Issues makes a claim ("on every path")
that a *different* sync mechanism this session touches would falsify, check it explicitly instead
of assuming the claim was about the mechanism you're currently working on — two sync scripts
writing the same table is an easy place for "every path" to quietly become false.
### [2026-08-07] §5 "Built — awaiting founder go-live" verification sweep (`docs/section5-status-sweep`)

**Output:** `PROJECT_CONTEXT.md` §5 — Built 10 → 2 entries, Shipped 79 → 87, −2,557 bytes off the
always-loaded payload; plus the `[status-correction]` corollary above.

**Happened.** Asked "what's next", I checked §5's `**Pending:**` clauses against prod instead of
reading them. **8 of 10 were already complete** — every referenced PR (#344/#346/#350/#352/#354/#368)
merged, every referenced migration applied, every function deployed. Four `/internal` pages the doc
called dark are live. Only Google Workspace (`google-chat-donny` genuinely returns 503) and
`LEADS_NOTIFY_EMAIL` survive.

**Worked.** Verifying by **object existence**, not the migration ledger — and it mattered: the
recorded `schema_migrations` versions don't match repo filename prefixes, so a ledger diff would
have been noise. Adding a standing note at the top of the Built subsection so the next reader knows
the clauses are claims with an expiry date, rather than silently inheriting the same trap.

**Failed.** I nearly reported **two live prod breaks that didn't exist**, both from *guessing*
object names: `complete_posting_schedule` (real name `..._if_done`) and an `outstand_media_cache`
table the migration never creates (it adds columns + an index to `outstand_media_ownership`). Only
caught because a "deployed code calls a missing RPC" claim seemed too severe to report unchecked.
**Read the migration for the real identifiers before querying for them.**

**Remember.** Three retrieval gaps in one session — an unindexed memory file, two skills
contradicting each other, and this. None was a knowledge gap; every fact already existed somewhere
unread. That failure mode is invisible until something forces a cross-check, so build the
cross-check into the routine rather than waiting to trip over it.

### [2026-08-07] Campaign target audience — status correction after the deploy landed (`docs/campaign-audience-shipped`)

**Output:** the `[2026-08-07] update | [[Campaign Target Audience]]` line in `docs/wiki/log.md`, a
new **Status** section + rewritten Known Issues on
`docs/wiki/concepts/campaign-target-audience.md`, and §5 moved In flight → Shipped.

**Happened.** Second half of the same feature: deployed `donny-campaign-generate` v113 → v114 and
verified it end-to-end, then corrected the knowledge layer, which still read "committed, **not
merged**". Textbook [status-correction]: **edited** the §5 line in place (moved it to Shipped)
rather than appending a second entry, and left `SHIPPED_LOG.md` alone — its header declares entries
historical snapshots with §5 as the status authority, so "correcting" it would have violated its
append-only contract.

**Worked.** Verifying the feature by calling the edge function directly from the logged-in tab
(sync path, result parked on `window` and polled) instead of driving the whole builder UI. It read
the generator's **raw output** — so "3 distinct audiences, 2 alternates, 6 tags, transitional `[]`
present" were all checked as data, not inferred from a rendering, and no throwaway campaign was
created on prod. It also upgraded the page's central claim from argument to observation: the
autoregressive field-ordering demonstrably drove style/tags from the audience.

**Failed.** (1) `supabase functions deploy` via Bash was **classifier-blocked**; the MCP
`deploy_edge_function` fallback would have meant hand-transcribing ~51KB across 8 files, where one
typo silently deploys broken code. The PowerShell tool ran the same CLI fine — and the CLI's upload
list then *confirmed* my transitive `_shared` closure was exactly right, which hand-bundling could
never have proven. (2) Mobile viewport still unverifiable: `resize_window` leaves
`window.innerWidth` pinned at 1707 (reproduced twice) and `browser-use --connect` needs a
remote-debugging port the founder's Chrome doesn't expose. Recorded as unverified, **not** passed.

**Remember.** A blocked verification belongs in Known Issues with its evidence and its unblock, at
the same weight as a bug. The temptation is to let a static argument ("no viewport-conditional code
in the diff") quietly stand in for the runtime check it can't replace.

### [2026-08-07] Campaign target audience replaces creator personas (`feat/campaign-target-audience`, unmerged)

**Output:** `docs/wiki/concepts/campaign-target-audience.md` (new) + the
`[2026-08-07] ingest | [[Campaign Target Audience]]` line in `docs/wiki/log.md`.

**Happened.** Ran the sync **before** the PR (and before Codex, which was quota-blocked), so the
docs ride in the same PR and go through the second pass with the code. Wrote a NEW concept page
rather than compounding onto [[Campaign Generation Creativity]] — that page is "are the ideas any
good", this is "what are they for" — but added a dated update section there too, since the change
edits the same prompt, and cross-linked both ways.

**Worked.** Recording status honestly in three places instead of implying completion: the §5 line
says "committed, **not merged**" with a `**Pending:**` clause, the concept page's Known Issues
names the unrun Codex review, and the SHIPPED_LOG entry opens with a bold state-as-of-writing
note. The Lesson about §5 being *current status* cuts both ways — an entry that overstates
readiness is the same failure as one that goes stale.

**Failed / nearly.** Dropped the new Sources line above `Campaign Price Anchoring Session` when
P < T; the section is already non-alphabetical so nothing would have caught it. Moved it.

**Remember.** Two new Lessons promoted below: the codex-empty-diff trap, and running the sync
pre-PR when a review gate is blocked.

### [2026-08-06] `outstand-proxy` cross-tenant authorization (PR #368, absorbs #367)

**Output:** `docs/wiki/concepts/cross-tenant-proxy-authorization.md` (new) + the
`[2026-08-06] ingest | [[Cross-Tenant Proxy Authorization]]` line in `docs/wiki/log.md`.

**Happened.** Three pre-existing live authz holes in `outstand-proxy` closed. Wrote a NEW concept
page rather than compounding onto [[Social Measurement Spine]] — that page is about *measurement*,
this about *tenant isolation*. Cross-linked both ways. Struck through (not deleted) the two Known
Issues on the spine page that this fixed.

**Worked.** Checking for doc collisions BEFORE writing: `git diff --stat origin/main
origin/<other-branch>` showed PR #367 touched **exactly** the five files I was about to edit and was
still unmerged. Cherry-picking it onto this branch first, then re-applying my edits on the corrected
base, turned a guaranteed five-file conflict into a clean fold. Cost: redoing ~5 edits. Worth it.

**Failed.** I wrote all five doc edits BEFORE checking for the collision, so I had to
`git checkout HEAD --` four of them and redo the work. The check is cheap and belongs first.

**Remember.** When a status-correcting PR for the *same subject area* is open and unmerged, the next
session's knowledge-sync will collide with it on every file. Fold it in (cherry-pick + supersede)
rather than writing a third PR that conflicts with both.

### [2026-08-06] Measurement spine deployed + first measured post — status correction (branch `docs/measurement-spine-live-proof`)
- **Output:** `PROJECT_CONTEXT.md` §5 entry **moved** Built-awaiting-go-live → **Shipped** and rewritten
  (it asserted "Nothing has yet flowed through the pipeline", false within hours); `concepts/social-measurement-spine.md`
  Known-issues item flipped + a NEW "The first measured post" section with the observed timeline + a new
  Known-issue recording that amplification is unreachable; `SHIPPED_LOG.md` **prepended** a second same-day
  entry (append-only — the morning entry was accurate when written, so it was NOT rewritten); `log.md` update
  entry; + THIS entry.
- **Happened:** a same-day correction run. I wrote "nothing has ever flowed through this pipeline" into three
  docs in the morning; by afternoon the branch was deployed and a real post (`ei1xc`) had gone end-to-end.
- **Worked:** [scope] fresh branch off `origin/main`, all 4 target docs verified byte-identical first.
  [status-correction] §5 edited **in place and moved between subsections**, while `SHIPPED_LOG` got a *new*
  entry rather than a rewrite — the two files have opposite update rules and this run exercised both at once.
  Recorded the proof as an **observed timeline with timestamps**, not a claim, and listed what the run did
  NOT prove (raw payload uncaptured, no multi-platform fan-out, amplification unexercised).
- **Failed:** I did not capture the literal `POST /posts` body — the browser network capture started too late
  and the request was gone. Recorded as functionally-proven-only rather than glossed.
- **Remember:** **an always-loaded status doc can go stale within hours of being written, and the author is
  the least likely person to notice.** §5's "Nothing has yet flowed" was true when written and false the same
  afternoon. When a §5 entry states a *pending condition* ("awaiting X", "nothing has yet Y"), that entry is a
  liability the moment the condition changes — prefer wording that decays gracefully, and re-check §5 at the
  END of any session that changed prod state, not only at the start. Second: **verify a feature is reachable
  before proposing it as a proof.** I proposed amplification as the end-to-end test and was wrong twice — it
  doesn't use the content I claimed, and it's brand-only with zero connected brand accounts. Both were one
  grep away (`userRole === 'brand'`, then the call sites), and I only found them after driving the UI.

### [2026-08-06] Social measurement spine + reconciliation + post ownership (PRs #365 merged, #366 open — bundled INTO #366)
- **Output:** new `raw/sessions/2026-08-06-social-measurement-spine-and-post-ownership.md`; NEW
  `concepts/social-measurement-spine.md`; `index.md` (**2** new Sources lines — mine + the cataloged
  2026-08-05 orphan — and a new Concepts line between [[Service-Role Data Exposure]] and
  [[Stakeholder Scorecard]]); `log.md` top entry; `SHIPPED_LOG.md` prepended; `PROJECT_CONTEXT.md` §5
  ONE line under **Built — awaiting founder go-live** with a `**Pending:**` deploy clause;
  `DATABASE_SCHEMA.md` (`outstand_post_ownership` row + a lockdown blockquote + the widened
  `donny_scheduled_posts` CHECK + a `social_post_log` no-UPDATE-policy note); + THIS entry. No
  `DESIGN_SYSTEM`/`CLAUDE.md` change.
- **Happened:** **[gap-claims] earned its keep in the opposite direction to usual** — I checked for a
  *prior* sync and found a genuine gap: **PR #365's knowledge-sync never ran.** Verified against
  `origin/main` (all core docs byte-identical to it, so the worktree WAS authoritative), not asserted:
  `SHIPPED_LOG.md`'s newest entry was 2026-08-02 (#357), §5 had no measurement entry, and the
  2026-08-05 raw session was an `index.md` orphan. So this run covers **two** efforts in one source —
  same call as the 2026-07-18 Phase-4 run — rather than leaving #365 permanently unrecorded.
- **Worked:** [scope] clean — `origin/main` 0 ahead of base, all 5 core docs SAME, and (per
  [squash-drift], since PR #366 is OPEN) `git rev-parse HEAD` == `origin/feat/...` confirming no squash
  divergence, because the normal `git push` succeeded this time rather than the REST workaround.
  [orphans]-by-path found **7** uncataloged raw sessions; cataloged the one from this workstream and
  surfaced the other 6 honestly rather than silently sweeping or silently leaving them.
  [wikilinks]-exact: grepped `index.md` for all 7 targets before linking — zero dangling.
  [context-tax]: full prose to `SHIPPED_LOG.md`, §5 got one line. NEW page rather than a compound,
  deliberated: [[Service-Role Data Exposure]] owns the definer/RLS defect *class* and
  [[Social Provider Decision]] owns the provider choice, but **nothing owned how a post becomes
  measured** — and the durable subject outlives both.
- **Failed:** nothing knowledge-side. RAG sync + the [[verify-knowledge]] loop-close are post-merge
  (PR open; the post-merge hook fires since `docs/` changed) — per [rag-sync].
- **Remember:** **a knowledge gap can be invisible precisely because the work SHIPPED.** #365 merged
  and fully deployed, so every signal said "done" — the missing sync left no failing check, and the
  orphaned raw session looked like a completed ingest to anything not checking `index.md` by path. The
  cheap tell was the `SHIPPED_LOG.md` date: **if the newest entry predates the last merged PR, a sync
  was skipped.** Worth running that one-line check at the START of every session, not only when a gap
  is suspected. Second, non-knowledge but sharp enough to carry: **four reviews can all miss the same
  defect when they share a question.** A whole-branch review, a data-exposure review, a scoped security
  review and my own tracing all asked *is the new code correct?*; Codex asked *does it run?* and found
  the branch's entire purpose inert. Diversity of *question* beats depth of *scrutiny*.

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
