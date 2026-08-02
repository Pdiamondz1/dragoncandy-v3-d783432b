# verify-knowledge — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`
>
> **Validator caveat:** Lessons here are **advisory** — they may sharpen your prose and your
> `missing[]` remediation hints, or remind you what to watch for. They MUST NOT change the
> deterministic `met` checks (those stay reproducible: same state in, same verdict out).

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **[freshness-proxy] When (b)'s raw `max(updated_at)` reads >24h stale but the sync just ran
  clean AND `content ilike` finds this session's new text in `donny_knowledge`, (b) is met.**
  `donny_knowledge.updated_at` is NOT reliably bumped on UPDATE (and a content-only re-embed of
  an existing page won't move `max(updated_at)`), so a knowledge-sync that only *changed* pages
  (no net-new page) can leave `RAG_LAST` pinned to an older insert date even though the RAG is
  current. The rule's authority is the **sync exit code** + **direct content presence**, not the
  timestamp — verify with `content ilike '%<distinctive new phrase>%'` and trust that. (Advisory:
  this clarifies how to *read* check (b)'s signal; it doesn't loosen the >24h rule for a genuinely
  un-synced RAG, which content-ilike would also reveal as absent.)

- **[unmerged-branch] Validating a PRE-merge branch is legitimate — and (b) must stay anchored to
  `origin/main`.** `LAST_WIKI_SYNC` is defined on `origin/main`, so a branch's un-merged pages are
  correctly out of (b)'s scope: a `content ilike` probe returning `[]` for this session's pages is the
  **expected** result, not a fail. Do not "fix" it by running the sync — the RAG tracks `origin/main`,
  and the post-merge hook propagates merged content. Only (c) covers the branch's own pages
  (are they in `index.md` + `log.md`). (Advisory: clarifies scope; does not loosen the >24h rule.)
- **[dated-analysis] A dated analysis page is not a contradiction just because reality moved on.**
  `claude-subagents-audit.md` still reads "zero custom `.claude/agents/`" and lists
  `rls-migration-reviewer` as deferred — both correct **as of its cycle**, and its own text says
  "none, **until this cycle**". With a dated Resolution block added, it is a historical record (the
  same rule SHIPPED_LOG states explicitly). Judge (a)'s contradiction half on whether pages assert
  conflicting **current** state, not on keyword staleness — a naive grep false-flags these critical.

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-08-02] Post-merge verify for PRs #357 + #358 (VerifiedRoute missing-profile fix)
- Output: verdict `done:true` — all three criteria met, `missing:[]`.
- Happened: (b) tried to fail exactly as **[freshness-proxy]** predicts. Raw `max(updated_at)` was
  `2026-07-27`, ~6 days behind `LAST_WIKI_SYNC` (`2026-08-02T09:45:34-04:00`) — a >24h gap that reads
  as a hard fail. The lesson's two authorities both held: the post-merge hook's sync exited clean
  (`wiki updated=96 errors=0`, `internal updated=118 errors=0`) and a `content ilike '%route-guard
  trap%'` probe returned the 2 `internal-only-users.md` rows (internal + consumer scope, 10,950 chars,
  phrase at offset 5234) carrying this session's new section. ⇒ (b) met.
- Worked: probing on a **short hyphenated token unique to this session's prose** (`route-guard trap`)
  rather than a generic identifier. My first probe used `createProfileFromMetadata` — 3 hits, all dated
  `2026-07-19`, i.e. pre-existing rows that would have "confirmed" freshness while proving nothing.
  A probe phrase must be new *in this session*, not merely present.
- Failed: nothing gating. One advisory surfaced and was correctly kept OUT of `missing[]` (that array
  is strictly the fix input for failed checks): `PROJECT_CONTEXT.md` §5 claimed Living Synthetic
  Marketplace was "LIVE on prod at 2,000 profiles" when prod had 0 — a core-doc staleness, which this
  contract makes advisory, not gating. It was corrected in a follow-up PR.
- Remember: **the validator is structurally blind to prod-state drift that produced no commit.** Check
  (b) compares the wiki to `git`; the synthetic purge happened by RPC on 2026-07-30 with no commit, so
  git had nothing to compare and all three checks would pass while a core doc was flatly wrong. When
  a run touches a claim about what is *live*, spot-check the DB (a `feature_flags` row, a row count)
  — a green verdict means "the knowledge layer matches git", never "the docs match reality".

### [2026-07-26] 200K-band load run + header-overflow knowledge-sync validation (PRs #345/#347/#348, POST-merge)
- **Output:** emitted `done:true` (all 3 met), closing the knowledge-sync loop for the 200K-band run
  + the `.in()` header-overflow fix.
- **Happened:** validated after BOTH merges — #347 (the sync itself) and #348 (the page split + a new
  sync-script size guard that #347's own growth made necessary). (a) index-incompleteness sweep over
  `concepts|entities|analyses` = 0; (b) `RAG_LAST` 17:59:26Z is *newer* than `LAST_WIKI_SYNC` 17:58:29Z,
  with `Synthetic Load Proof` (4) + `UND_ERR_HEADERS_OVERFLOW` (3) present by `content ilike`; (c) all
  three session pages in `index.md` + named in `log.md`.
- **Worked:** the [dated-analysis] lesson applied almost verbatim to a **new** shape — a `content ilike
  '%kill switch is OFF%'` probe returned 2 hits on `synthetic-weight-engine.md`, which naively reads as
  the exact contradiction this session corrected. Both were the **quoted old text inside the correction
  itself** ("This paragraph read '…' until 2026-07-26"), one row per scope (internal + wiki). Reading the
  surrounding context, not the keyword, is what kept (a) from a false critical.
- **Failed:** nothing at validation time. Worth recording that the *previous* run of the loop's generate
  half reported success while the RAG sync had half-failed (`errors=41`) — the validator would have
  caught it at (b)+(c), but only because someone read the sync log first.
- **Remember:** **a correction that quotes the text it corrects will match any keyword probe for the old
  claim.** Generalises [dated-analysis]: a page can contain a false statement *as a quotation of its own
  history* and still be entirely current. For (a)'s contradiction half, always read ±100 chars of context
  around a probe hit before calling it critical — the quotation marks and a "read … until <date>" clause
  are the tell. (Advisory: sharpens how to read (a); does not loosen it.)

### [2026-07-20] create_counter_offer authorization hardening knowledge-sync validation (PR #323, POST-merge)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the create_counter_offer
  authorization hardening.
- Happened: (a) orphan-by-path sweep on origin/main = 0; **no contradiction** — the compounded page
  now reads the create_counter_offer finding as **Resolved** and the index Concepts entry says
  "closed", consistent (no page still calls it open). (b) `LAST_WIKI_SYNC` 2026-07-20T18:36:55Z vs
  `RAG_LAST` 2026-07-20T00:37:07Z ≈ **18h** (inside the 24h window → met on the raw rule alone), AND
  the post-merge hook synced wiki `errors=0` UPDATE-only (`inserted=0 updated=87` — the finding was
  compounded onto an existing page, so `max(updated_at)` did NOT move, the classic [freshness-proxy]
  case); content probe `20260720000000` (the migration name, brand-new to the synced wiki text) = **3
  rows** confirms the resolved-section text is retrievable. (c) service-role page in index + a new
  `[2026-07-20] ingest` log entry naming it; new raw session cataloged in Sources.
- Worked: [freshness-proxy] again — a compound-onto-existing-page sync leaves `RAG_LAST` pinned to an
  older insert (00:37Z, same value as the #319 verify), so the migration-name content probe, not the
  timestamp, is the decisive (b) signal. It also happened to be <24h so it passed the raw rule too.
  Validated the "flip an open finding to Resolved" contradiction case carefully: a page narrating
  found→resolved for ITS OWN prior finding is a chronological record, not a self-contradiction
  ([dated-analysis] class).
- Failed: none as a validator. Post-merge run → this entry strands on the merged branch; carry it
  forward in a `chore/verify-knowledge-runlog-323` PR (or the next docs PR), same as #319→#320.
- Remember: nothing new — re-confirms [freshness-proxy] (compound sync, timestamp pinned, probe on a
  token unique to the NEW text) and [dated-analysis] (found→resolved on one page is not a contradiction).

### [2026-07-19] Campaign price anchoring + negotiation reach knowledge-sync validation (PR #319, POST-merge)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the campaign
  price-anchoring + negotiation-reach session.
- Happened: post-merge run (my #319 confirmed an ancestor of origin/main; #316 merged on top
  afterward — concurrent, harmless). (a) orphan-by-path sweep on origin/main = 0 across
  concepts+entities+analyses; **no contradiction** — the new `campaign-price-anchoring.md` is a
  distinct subject cross-linked to (not conflicting with) [[Pricing Architecture]], and the
  compounded `create_counter_offer` block on [[Service-Role Data Exposure]] narrates
  found→filed, a [dated-analysis]-class chronological record, not two pages disagreeing. (b)
  `LAST_WIKI_SYNC` 2026-07-20T00:35:59Z vs `RAG_LAST` 2026-07-20T00:37:07Z — RAG **ahead** by
  ~1 min (a net-new-page sync moved `max(updated_at)` this time, unlike the usual UPDATE-only
  case), well inside 24h; content probes `getSuggestedRange`=2 (both scopes) + `create_counter_offer`=5
  confirm retrievability. (c) new concept in index.md + a `[2026-07-19] ingest` log.md entry;
  raw session cataloged in Sources; compounded service-role page already in index and covered by
  the same log entry.
- Worked: this run is the clean-signal counterpart to [freshness-proxy] — a net-new page (not a
  compound-only sync) legitimately moved `RAG_LAST` past `LAST_WIKI_SYNC`, so (b) was unambiguous
  on the timestamp alone; the content probes were confirmation, not the sole evidence. Single-token
  probes (`getSuggestedRange`) held — a code symbol unique to the new page within the synced dirs.
- Failed: none as a validator.
- Remember: nothing new — re-confirms the post-merge direction of [unmerged-branch] and that a
  net-new-page sync gives a clean `RAG_LAST ≥ LAST_WIKI_SYNC` (the case [freshness-proxy] is the
  exception to, not the rule). This entry is post-merge so it strands on the worktree → carry it
  forward in the next docs PR or a `chore/verify-knowledge-runlog-319` PR. (advisory)

### [2026-07-19] Service-role remediation knowledge-sync validation (PR #308 code + PR #314 docs)
- Output: emitted `done:true` (all 3 met), closing the knowledge-sync loop for the service-role
  authorization remediation.
- Happened: (a) index-incompleteness 0 by path; **no contradiction** despite the concept page now
  carrying both "What it found on its first runs" (findings filed, unfixed) and "The remediation
  (shipped + deployed)" — that is a chronological narrative *within one page*, not two pages
  disagreeing, and the stale claim that DID exist (PROJECT_CONTEXT §5's "not yet fixed" from #307)
  was corrected in the same PR rather than left to rot. (b) `LAST_WIKI_SYNC` 09:44:05Z vs `RAG_LAST`
  08:35:05Z ≈ 69 min — inside the 24h window, and an **UPDATE-only** sync (`inserted=0 updated=107/85
  errors=0`) so the stale timestamp is expected per [freshness-proxy]; content probes confirm
  retrievability (`campaign-access.ts`=3, `handleRegenerate`=2, `isCollaborator`=2). (c) concept in
  index + named twice in log; new raw session cataloged.
- Worked: [freshness-proxy] again on an UPDATE-only sync — `handleRegenerate` and `isCollaborator` are
  single tokens unique to the new remediation prose and can't straddle a line-wrap, so they are
  unambiguous RAG proof despite `max(updated_at)` not moving. Validated **post-merge this time**
  (unlike the #307 run, which was pre-merge and correctly saw its own pages absent from the RAG) — so
  both scope directions of [unmerged-branch] are now confirmed in practice.
- Failed: none as a validator.
- Remember: nothing new — this run re-confirms [freshness-proxy], [unmerged-branch] (post-merge
  direction), and [dated-analysis] (a page narrating found→fixed in sequence is not self-contradictory).


### [2026-07-19] Help center screenshots + sidebar/search knowledge-sync validation (docs PR #312, POST-merge)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the help-center
  screenshots (#306) + sidebar/search (#310) efforts.
- Happened: (a) wiki lint — path-based orphan/index-completeness check clean (0 orphans across
  concepts+entities+analyses), no contradictions (compounded onto the existing
  [[Help Center & Donny Guidance]] page + a raw session, no net-new concept page → no new orphan risk);
  (b) `LAST_WIKI_SYNC` 2026-07-19T05:36:54-04:00 (=09:36 UTC), `RAG_LAST` 08:35 UTC — the classic
  UPDATE-only `max(updated_at)`-not-bumped case (compound-onto-existing-page), BUT the post-merge hook
  synced wiki errors=0/updated=85 and `content ilike` = `rankHelpArticles` 2 + `help-screenshots` 5 +
  `help-landing-page-2026-07` 2 confirm the new text is in `donny_knowledge` → [freshness-proxy], (b) met
  (also within 24h regardless); (c) the updated concept page is in index.md + the `[2026-07-19] update`
  log.md entry.
- Worked: [freshness-proxy] resolved (b) — `rankHelpArticles` / `help-landing-page-2026-07` are unique to
  the new help text within the synced wiki dirs, so the content-ilike hits are unambiguous proof despite
  the UPDATE-only timestamp.
- Failed: none (validator). Post-merge run → this run-log entry rides a dedicated
  `chore/verify-knowledge-runlog-312` PR (no work branch left to bundle into), matching the pattern.
- Remember: re-confirms [freshness-proxy] for a compound-onto-existing-page sync — the content-ilike probe
  on a token unique to the NEW text is the decisive (b) signal, not `max(updated_at)`. (advisory)

### [2026-07-19] data-exposure-reviewer knowledge-sync validation (branch `worktree-dc-improvements-3`, PRE-merge)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the
  `data-exposure-reviewer` subagent branch.
- Happened: **first run against an UNMERGED branch** — every prior entry validated post-merge. That
  changes how (b) reads, and the skill's own wording already handles it: `LAST_WIKI_SYNC` is defined
  on **`origin/main`**, so the branch's not-yet-merged pages are correctly out of scope.
  `LAST_WIKI_SYNC` 2026-07-19T07:29:06Z vs `RAG_LAST` 07:02:02Z → **27 minutes**, far inside the 24h
  window → (b) met. A `content ilike '*data-exposure-reviewer*'` probe returned `[]`, which is the
  **expected and correct** result pre-merge, NOT a fail — the RAG tracks `origin/main`, and this
  branch's pages reach it via the post-merge hook ([rag-sync] in knowledge-sync's memory).
  (a) index-incompleteness 0 by path; (c) both session pages in index + log.
- Worked: judging (a)'s contradiction half required real care rather than a grep verdict — the audit
  page still says "zero custom `.claude/agents/`" and names `rls-migration-reviewer` as deferred.
  Neither is a contradiction: it is a **dated analysis** whose own text qualifies it ("none, **until
  this cycle**") and which now carries a dated 2026-07-19 Resolution block. Same class as
  SHIPPED_LOG's "entries are historical snapshots" rule. A naive keyword check would have
  false-flagged it critical.
- Failed: none as a validator. Caught one **advisory** defect the gated checks do not cover — the
  edited analysis page kept `updated: 2026-07-07`. Correctly left out of `missing[]` (that array is
  strictly the fix input for `met:false`) and reported in prose; the caller fixed it in a follow-up
  commit.
- Remember: promoted to a Lesson below ([unmerged-branch]). Also worth noting the frontmatter miss —
  editing a page in place without bumping `updated:` is invisible to all three gated checks.

### [2026-07-18] Light-theme Phase 4 + backgrounds/accents cleanup knowledge-sync validation (PRs #288/#289 code + PR #290 docs)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the FINAL light-theme-polish
  work — Phase 4 (Outstand) + the cross-app backgrounds/off-brand-accents cleanup, bundled into one sync.
- Happened: (a) wiki lint — path-based orphan/index-completeness check clean (0 on origin/main), no
  contradictions (compounded onto [[Light-App Kit]] — extended Rollout + added the `bg-muted` palette
  section; no new concept page); (b) `LAST_WIKI_SYNC` 2026-07-18T23:55:51Z, raw `RAG_LAST` ≈16:47Z
  (UPDATE-only sync, `updated_at` not bumped) ~7h behind, well <24h, AND the post-merge hook synced
  errors=0 with `content ilike '%bg-white/40%'` = 2 + `%de-gray palette also covers%bg-muted%` = 2 +
  `%all four surface groups%on the kit%` = 2 confirming both the Phase-4 + cleanup Rollout text and the
  new `bg-muted` section are in `donny_knowledge` → [freshness-proxy], (b) met; (c) `concepts/light-app-kit.md`
  in index.md + BOTH new log ingest entries name it, and the 2 new raw sessions are catalogued in index
  Sources.
- Worked: [freshness-proxy] on an UPDATE-only sync again — `bg-white/40` is a single distinctive token
  unique to the new `bg-muted` section (no line-wrap), unambiguous RAG proof despite the stale timestamp.
  Bundling two efforts' docs into ONE sync (compound concept page, two raw sessions) kept it to a single
  docs PR. Docs-only PR #290 skipped Codex per convention.
- Failed: none (validator). This closes the ENTIRE light-theme polish (Phases 1–4 + the cleanup) —
  the whole light app is on the kit. The run is post-merge (PR #290 already merged) → this entry strands
  on the worktree → persisted via a dedicated `chore/verify-knowledge-runlog-290` PR.
- Remember: re-confirms [freshness-proxy] + single-token-probe + post-merge-strand → chore-PR pattern.
  Bundling a deferred phase's sync with the next effort's sync (when the phase's own sync hadn't run yet)
  is fine — two raw sessions, one compounded concept page, one docs PR. (advisory)

### [2026-07-18] Light-theme polish Phase 3 knowledge-sync validation (PR #285 code + PR #286 docs)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the light-theme
  polish Phase 3 session (settings + promotions + org/billing/payments; Outstand deferred to Phase 4).
- Happened: (a) wiki lint — path-based orphan/index-completeness check clean (0 across
  concepts+entities+analyses on origin/main), no contradictions (compounded onto [[Light-App Kit]] —
  extended its Rollout to Phase 3/4; no new page); (b) `LAST_WIKI_SYNC` 2026-07-18T20:07:19Z,
  raw `RAG_LAST` ≈16:47Z (UPDATE-only sync — `updated_at` not bumped) ~3h20m behind, well <24h, AND
  the post-merge hook synced errors=0 with `content ilike '%CGCPostingPreferences%'` = 2 +
  `%Phase 4%(deferred)%Outstand%` = 2 confirming the Phase-3 Rollout text is in `donny_knowledge`
  → [freshness-proxy], (b) met; (c) `concepts/light-app-kit.md` in index.md + the `[2026-07-18] ...
  Light-theme polish Phase 3` log.md ingest entry names it, new raw session catalogued in Sources.
- Worked: [freshness-proxy] again resolved (b) on an UPDATE-only compound sync — `CGCPostingPreferences`
  is a single distinctive token unique to the new Rollout text (no line-wrap), so the RAG hit is
  unambiguous; the multi-word `%StripeConnectSetup chrome-only%` probe read 0 (wrapped-phrase
  false-negative — exactly why single hyphenated/code tokens are the right probe). Docs-only PR #286
  skipped Codex per convention.
- Failed: none (validator). Third consecutive rollout-phase (Phase 1/2/3) knowledge-sync closed clean.
  The run is post-merge (PR #286 already merged) → this entry strands on the worktree → persisted via a
  dedicated `chore/verify-knowledge-runlog-286` PR (documented pattern, no work branch to bundle into).
- Remember: re-confirms [freshness-proxy] + single-token-probe + post-merge-strand → chore-PR pattern
  for a rollout-phase knowledge-sync. Pick a hyphen/camelCase token unique to the NEW text (here
  `CGCPostingPreferences`) — never a multi-word phrase that can wrap. (advisory)

### [2026-07-18] Light-theme polish Phase 2 knowledge-sync validation (PR #282 code + PR #283 docs)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the light-theme
  polish Phase 2 session.
- Happened: (a) wiki lint — path-based orphan/index-completeness check clean (0 across
  concepts+entities+analyses on origin/main), no contradictions (compounded onto
  [[Light-App Kit]] — extended its Rollout to Phase 1/2/3 + added the 3rd gotcha; no new page);
  (b) raw `RAG_LAST` 2026-07-18T16:47:43Z vs `LAST_WIKI_SYNC` 2026-07-18T17:55:13Z (~1h, well
  <24h) AND the post-merge hook synced errors=0 with `content ilike '%reviewsRef%'` = 2 +
  `%is not a %forwardRef%component%` = 2 confirming the new gotcha text is in `donny_knowledge`
  → [freshness-proxy], (b) met; (c) the updated `concepts/light-app-kit.md` is in index.md + the
  `[2026-07-18] ... Light-theme polish Phase 2` log.md ingest entry names it.
- Worked: [freshness-proxy] applied cleanly on an UPDATE-only compound sync — `reviewsRef` is
  unique to the new gotcha #3 text within the synced wiki dirs, so the RAG hit is unambiguous
  despite the ~1h-stale raw `max(updated_at)`. Docs-only PR #283 skipped Codex per convention.
- Failed: none (validator). The run is inherently post-merge (PR #283 already merged), so this
  entry strands on the worktree → persisted via a dedicated `chore/verify-knowledge-runlog-283`
  PR (the documented pattern when there's no work branch to bundle into).
- Remember: re-confirms [freshness-proxy] + the post-merge-strand → dedicated-chore-PR pattern
  for a rollout-phase (compound, no net-new page) knowledge-sync. (advisory)

### [2026-07-16] Donny desktop fixed-overlay knowledge-sync validation (PRs #236/#237)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the Donny desktop
  fixed-overlay fix.
- Happened: (a) wiki lint — path-based orphan/index-completeness check clean (0 across
  concepts+entities+analyses), no contradictions (compounded a new §4 onto
  [[Mobile Viewport & Fixed Positioning]], no new page); (b) raw `RAG_LAST` 2026-07-14T21:30:17Z <
  `LAST_WIKI_SYNC` 2026-07-16T11:39:28Z (~2d) — the classic UPDATE-only `max(updated_at)`-not-bumped
  case (compound-onto-existing-page, no net-new insert), BUT the post-merge hook synced wiki
  errors=0/updated=71 and `content ilike '%shadow-2xl%'` = 2 rows + `%docked side-panel%` = 2 rows
  confirm the new §4 text is in `donny_knowledge` → [freshness-proxy], (b) met; (c) the updated
  concept is in index.md + the `[2026-07-16] ingest` log.md entry.
- Worked: [freshness-proxy] resolved (b) decisively — `shadow-2xl` is unique to my §4 within the
  synced wiki dirs (grep-confirmed), so a RAG hit is unambiguous proof despite the stale timestamp.
- Failed: none (validator). Post-merge run → its entry rides a dedicated `chore/verify-knowledge-runlog-236`
  PR (no work branch to bundle into), matching the existing `chore/verify-knowledge-runlog-NNN` pattern.
- Remember: re-confirms [freshness-proxy] for an UPDATE-only (compound) sync — pick a token unique to
  the *new* text (here `shadow-2xl`) so the content-ilike proof is unambiguous. (advisory)

### [2026-06-28] Dragon Rewards UI launch gate knowledge-sync (PR #200) — (re-added; was stranded on the gate branch)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for PR #200.
- Happened: (a) 0 orphans; the DRE concept runbook updated to the two-switch launch (⚠️ marked resolved),
  no contradiction; (b) sync errors=0 (UPDATE-only) + `content ilike '%DRAGON_REWARDS_ENABLED%'` = 2 +
  two-switch runbook = 2 → [freshness-proxy], flag confirmed is_enabled=false; (c) raw session in index.md
  Sources + the `[2026-06-28] update` log.md entry.
- Worked: updating the runbook in the same PR cleared the Codex P2.
- Failed: none (validator). Committed post-squash-merge on the gate branch → re-added here.
- Remember: re-confirms the post-merge-strand carry-forward + do-knowledge-sync-before-final-Codex patterns. (advisory)

### [2026-06-28] Dezzy SEO articles knowledge-sync (PR #198) — (re-added; was stranded on the seo branch)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for PR #198.
- Happened: (a) 0 orphans; suite page marks the Domain-6 SEO slice shipped + the rest gated, no
  contradictions; (b) sync errors=0 (sync:wiki updated=60/inserted=0 — UPDATE-only; +1 page vs prior = the
  DRE concept page from #196) and `content ilike '%dezzy-seo-articles%'` = 2 + SEO-slice text = 2 →
  [freshness-proxy], (b) met; (c) raw session in index.md Sources + the `[2026-06-28] ingest` log.md entry.
- Worked: hit the DRE PR #196 merge mid-flight → one MEMORY.md conflict resolved keep-both before CI/merge.
- Failed: none (validator). Committed post-squash-merge on the seo branch → re-added here.
- Remember: re-confirms two-worktree keep-both + [freshness-proxy] + post-merge-strand carry-forward. (advisory)

### [2026-06-27] Dezzy press & events knowledge-sync (PR #197) — (re-added; was stranded on the press-events branch)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for PR #197.
- Happened: (a) 0 orphans; the suite page marks Domain 4 shipped (resolved the Codex P3 contradiction where
  the doc still called #4 deferred); (b) sync errors=0 (sync:wiki updated=59/inserted=0 — UPDATE-only,
  extended the suite page) and `content ilike '%dezzy-press-events%'` = 2 + Domain-4 cloud-routine text = 2 →
  [freshness-proxy], (b) met; (c) raw session in index.md Sources + the `[2026-06-27] ingest` log.md entry.
- Worked: re-running Codex AFTER the knowledge-sync commit turned the P3 clean.
- Failed: none (validator). Committed post-squash-merge on the press-events branch → re-added here.
- Remember: do the knowledge-sync before the FINAL Codex pass so the branch is self-consistent. (advisory)

### [2026-06-27] Dezzy weekly brief knowledge-sync (PR #195) — (re-added; was stranded on the weekly-brief branch)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for PR #195.
- Happened: (a) wiki lint — path-based orphan check clean (0; no new page, compounded the capstone into
  [[Dezzy Agent (Playbook Suite)]]), no contradictions; (b) sync errors=0 (sync:wiki updated=59/inserted=0 —
  UPDATE-only, no net-new page → raw `RAG_LAST` stayed pinned at 01:35Z), but `content ilike '%dezzy-weekly-brief%'`
  = 2 rows + "Monday capstone / orchestrate, not embed" = 2 rows confirm the extended page is in the RAG →
  [freshness-proxy] applies, (b) met; LAST_WIKI_SYNC 03:03Z − RAG_LAST is <24h regardless; (c) raw session in
  index.md Sources + the `[2026-06-27] ingest` log.md entry, suite page already cataloged.
- Worked: [freshness-proxy] resolved (b) decisively on an update-only sync — content-presence over timestamp.
- Failed: none (validator). The entry was committed post-squash-merge on the weekly-brief branch so it never
  reached main → re-added here (same strand-then-carry-forward as #194).
- Remember: re-confirms [freshness-proxy] + the post-merge-strand carry-forward pattern. (advisory)

### [2026-06-27] Dezzy content playbooks knowledge-sync (PR #194) — (re-added; was stranded on the content branch)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for PR #194.
- Happened: (a) wiki lint — path-based orphan/index-completeness check clean (0 orphans across
  concepts+entities+analyses), no contradictions (new page compounds [[Founder Playbooks]] + cross-links
  the sibling's [[Dezzy Agent (Playbook Suite)]]); (b) RAG_LAST 2026-06-28T01:35:37Z > LAST_WIKI_SYNC
  2026-06-28T01:34:52Z, post-merge hook synced wiki errors=0 / +1 inserted = dezzy-content-playbooks.md,
  `content ilike '%Dezzy Content Playbooks%'` = 2 rows (138 total); (c) concepts/dezzy-content-playbooks.md
  in index.md + the `[2026-06-27] ingest` log.md entry.
- Worked: the two-worktree merge conflict (sibling dezzy-outreach PR #193 landed first) resolved keep-both
  on index.md/MEMORY.md before the validator ran → first-pass green; post-merge hook made (b) green.
- Failed: none (validator). The entry itself was committed post-squash-merge on the content branch so it
  never reached main → re-added here.
- Remember: the verify-knowledge run is inherently post-merge, so its run-log entry can strand on a
  just-merged branch — carry it forward in the NEXT session's docs PR (done here). (advisory)

### [2026-06-27] Internal Donny profile-read fix knowledge-sync (docs PR #186)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for PR #185.
- Happened: (a) wiki lint — path-based orphan/index-completeness check clean (0 critical), no
  contradictions (compounded the existing internal-only-users page, no new page); (b) RAG: raw
  `RAG_LAST` 2026-06-26 12:49:59Z vs `LAST_WIKI_SYNC` 2026-06-27 16:50:01Z = ~28h gap, BUT the
  post-merge hook synced wiki errors=0 and `content ilike` confirms the new text
  ("profile-read trap", "resolveDonnyProfile") is in `donny_knowledge` → fresh (the sync was a
  page-UPDATE not a net-new page, so `max(updated_at)` stayed pinned to the prior insert); (c)
  concepts/internal-only-users.md in index.md + the `[2026-06-27] ingest` log.md entry.
- Worked: content-ilike resolved the (b) timestamp ambiguity decisively — the new content's
  presence is stronger proof than `max(updated_at)`.
- Failed: none (validator). The raw timestamp check would have false-flagged (b) without the
  content-presence cross-check.
- Remember: the `updated_at`-not-bumped-on-update quirk → **promoted to a [freshness-proxy] Lesson**.

### [2026-06-26] AIOS Stakeholder Invite backfill (docs PR #183)
- Output: emitted `done:true` (all 3 met) closing the backfill knowledge-sync loop for PR #178.
- Happened: (a) wiki lint clean (0 critical; orphan check clean, new page cataloged; Codex caught + I fixed one dangling `[[verify-knowledge]]` link pre-merge); (b) RAG_LAST 12:34:35Z ≥ LAST_WIKI_SYNC 12:33:57Z (hook synced wiki errors=0, +1 inserted = aios-stakeholder-invite.md; wiki now 52 pages); (c) new concept in index.md + the `[2026-06-26] ingest` backfill log.md entry.
- Worked: forward-link-then-backfill closed cleanly — the dangling `[[AIOS Stakeholder Invite]]` link the UI-polish run dropped now resolves to a real page, and I re-added the cross-links.
- Failed: none (validator). Note: the repo's branch-protection now blocks `gh pr merge` until CI (verify/lighthouse/smoke) is green — had to `gh pr checks --watch` then merge (the earlier same-session merges had pre-green checks).
- Remember: branch protection requires green CI before merge — poll `gh pr checks <pr> --watch` then merge; a one-line bookkeeping PR still pays full CI, so prefer bundling run-log entries into the work PR when timing allows. (advisory)

### [2026-06-26] AIOS UI polish knowledge-sync (docs PR #181)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the AIOS internal-dashboard UI polish session.
- Happened: (a) wiki lint — orphan/index-completeness check clean (0 critical), no contradictions; (b) RAG_LAST 12:14:27Z ≥ LAST_WIKI_SYNC 12:13:52Z (post-merge hook synced wiki errors=0, +1 inserted = aios-internal-shell.md; 122 rows total); (c) concepts/aios-internal-shell.md in index.md + the `[2026-06-26] ingest` log.md entry.
- Worked: post-merge hook synced RAG before the validator ran → (b) green on the first pass (matches the [2026-06-24] Remember note).
- Failed: none.
- Remember: re-confirms the advisory pattern — docs-PR merge + main ff → hook makes (b) green before verify runs → first-pass `done:true` is the expected path. (advisory; already noted 2026-06-24)

### [2026-06-24] Test-Mode Stripe UX knowledge-sync (PR #169)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the test-mode Stripe UX session.
- Happened: ran all 3 checks. (a) orphan re-check on origin/main clean; (b) RAG_LAST 19:15:10Z > LAST_WIKI_SYNC 19:14:40Z, post-merge hook synced wiki errors=0 (+1 inserted = the new concept page); (c) new concept + updated entity both in index.md + the `[2026-06-24] ingest` log.md entry.
- Worked: post-merge hook auto-synced RAG before the validator ran, so (b) was already green — no fix iteration needed.
- Failed: none.
- Remember: when knowledge-sync merges via the docs PR and main is fast-forwarded, the post-merge hook makes (b) green before this validator runs — first-pass `done:true` is the expected path. (advisory)

_No runs recorded before this._

<!-- Template for each run (newest on top):
### [YYYY-MM-DD HH:MM] <what was validated>
- Output: <the verdict block this run emitted; never a duplicate>
- Happened: <which checks ran, what the verdict was>
- Worked: <what went well>
- Failed: <which checks failed / were BLOCKED>
- Remember: <advisory takeaway; note "→ promoted to Lessons" when durable>
-->
