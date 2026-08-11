# verify-knowledge — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`
>
> **Validator caveat:** Lessons here are **advisory** — they may sharpen your prose and your
> `missing[]` remediation hints, or remind you what to watch for. They MUST NOT change the
> deterministic `met` checks (those stay reproducible: same state in, same verdict out).

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **[freshness-proxy] (b)'s authority is content presence, never `max(updated_at)` — and the
  original reason for that has EXPIRED, so don't re-derive it from the timestamp's behaviour.**
  This lesson used to read "`donny_knowledge.updated_at` is NOT reliably bumped on UPDATE", because
  the shared `handle_updated_at()` was a no-op stub on prod. **PR #385 restored it (2026-08-07)**;
  measured 2026-08-08, **231 of 237** rows have `updated_at > created_at`, so an update-only sync
  now *does* advance the timestamp. **The rule is unchanged on better grounds:** a moved timestamp
  proves only that *something* was written, whereas `content ilike '%<token the newest revision
  added>%'` proves the specific new text is retrievable. So a fresh-looking `RAG_LAST` is NOT
  evidence (b) is met — it is now capable of moving without the content being right, which is
  strictly *more* misleading than when it was frozen. Keep probing content. (Advisory: clarifies how
  to *read* (b); does not loosen it.) See [[Updated-At Trigger Drift]].

- **[scope-is-not-freshness] Check (b) proves a page is PRESENT, never that it is reachable by the
  RIGHT AUDIENCE — and the two failure modes look identical from here.** The probe queries
  `donny_knowledge` with the service role and no scope predicate, so it returns a row whether that
  row is `scope:'internal'`, `null`, or wrong. A page that leaks internal infra/ops content to
  consumer Donny passes (b) exactly as cleanly as one correctly walled off.

  **The default inverted on 2026-08-10, so what you are watching for inverted with it.**
  `sync-wiki-to-donny.mjs` now marks **every** wiki page `scope:'internal'` unless its exact
  `<dir>/<filename>` is in the `CONSUMER` allowlist, which is currently **empty** — so the correct
  expectation is that every `wiki:%` row reads `internal`, and a `NULL` one is the anomaly. The two
  denylists this replaced (`EXCLUDE`, gated behind a `SYNC_CURATE` flag the unattended post-merge
  sync never set, and `FORCE_INTERNAL`) are **gone**; do not look for them. A denylist failed open —
  it only held pages someone had enumerated — which is how 107 of 112 wiki rows sat consumer-reachable,
  including the page stating the live user count, the vendor-by-vendor burn, and that Stripe was in
  test mode.

  So: read `scope` alongside the probe and say so in prose. Flag any `wiki:%` row at `scope NULL`,
  and flag any addition to `CONSUMER` whose page has not been read end-to-end for content an end
  user must not see. `SYNC_DRY_RUN=1 node supabase/scripts/sync-wiki-to-donny.mjs` prints the split
  without POSTing. Report a scope miss as **advisory** (it is outside all three gated checks — do
  NOT put it in `missing[]`), but do report it: it is a live data-exposure defect, not a docs nit.
  (Advisory: adds a thing to watch; does not change any `met`.) See [[Dragon Rewards Engine (DRE)]]
  for the precedent leak.

- **[unmerged-branch] Validating a PRE-merge branch is legitimate — and (b) must stay anchored to
  `origin/main`.** `LAST_WIKI_SYNC` is defined on `origin/main`, so a branch's un-merged pages are
  correctly out of (b)'s scope: a `content ilike` probe returning `[]` for this session's pages is the
  **expected** result, not a fail. Do not "fix" it by running the sync — the RAG tracks `origin/main`,
  and the post-merge hook propagates merged content. Only (c) covers the branch's own pages
  (are they in `index.md` + `log.md`). (Advisory: clarifies scope; does not loosen the >24h rule.)
- **[claim-decay] A fix rots every doc that explained the bug — and the gated checks won't see it.**
  When a run's subject is a *prod behaviour change*, sweep the whole repo for the **claim**, not the
  subsystem: `git grep` a distinctive phrase from the old behaviour. PR #385 restoring
  `handle_updated_at()` falsified four files in one stroke — `knowledge-sync/SKILL.md`, its
  `MEMORY.md`, this skill's own gating rationale, and the live daily `knowledge-freshness-agent.md`
  — and all three checks stayed green because none of them live under `docs/wiki/`. The tell is a
  doc stating prod behaviour in the **present tense** with a confirmation date: that date is an
  expiry, not a warranty. Report it as advisory (it is out of (a)'s scope — do NOT put it in
  `missing[]`), then fix it as the caller. Distinct from [dated-analysis]: that one says a
  *historical* record is fine; this one says a *present-tense* claim is a liability.
- **[dated-analysis] A dated analysis page is not a contradiction just because reality moved on.**
  `claude-subagents-audit.md` still reads "zero custom `.claude/agents/`" and lists
  `rls-migration-reviewer` as deferred — both correct **as of its cycle**, and its own text says
  "none, **until this cycle**". With a dated Resolution block added, it is a historical record (the
  same rule SHIPPED_LOG states explicitly). Judge (a)'s contradiction half on whether pages assert
  conflicting **current** state, not on keyword staleness — a naive grep false-flags these critical.

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-08-11] Post-merge verify for PR #445 (legal-entity knowledge-sync, after #439)
- Output: verdict block `done:true` — all three checks met. (a) 114 pages on disk, **0** absent
  from `index.md`; (b) content probe `Delaware-formed` → 2 rows; (c) the session's page in both
  `index.md` and `log.md`.
- Happened: ran as the loop-close after `sync:internal` (`inserted=1 updated=136 errors=0`).
  Probe token was taken from the **added** lines of the newest in-scope revision on `origin/main`
  (`5620d212`, first-parent diff) exactly as (b) specifies — `Delaware-formed`, hyphenated so it
  cannot straddle a markdown line-wrap.
- Worked: [scope-is-not-freshness] read as prose, and the picture is now the *expected* one for a
  post-#437 wiki — **`wiki:%` namespace holds 0 rows** (the wiki reaches the RAG only as
  `internal-*` via `sync-internal-docs.mjs`), 137/137 rows `scope='internal'`, and
  **consumer-reachable = 0**. Nothing to flag.
- Worked: [freshness-proxy] earned its keep in a new way. The new page was an **INSERT**, so its
  `updated_at == created_at` and `ts_moved` read **false** — a timestamp gate would have
  false-negatived on precisely the page just added. The advisory `RAG_LAST` was fresh
  (2026-08-11T11:34:45Z) but played no part in the verdict.
- Failed: nothing. One process note worth carrying, below.
- Remember: **the post-merge RAG hook did NOT fire for this session, and the reason is
  positional, not broken.** That hook runs only when the **main checkout** fast-forwards; the main
  checkout was parked on `docs/capacitor-cors-sweep-spec` while *the worktree* held `main` (a
  `gh pr merge --delete-branch` had switched it there). So [rag-sync]'s "don't hand-sync" advice
  silently does not apply in that configuration — the sync had to be run by hand. The key file
  `supabase/scripts/.env.sync.local` is **gitignored, so it does not exist in a worktree**; it was
  copied in from the main checkout (verified `git check-ignore` first), used, and deleted. Check
  `git worktree list` before assuming the hook covered a merge.

### [2026-08-10] Post-merge verify for PR #435 (RAG scope boundary knowledge-sync, after #434)
- Output: verdict `done:true` — all three met, `missing:[]`.
- Happened: (a) 113 in-scope pages, index-incompleteness **0**. The contradiction half needed a
  real judgment this time, because the session's own `log.md` entry *flagged* one: the new page
  says the wiki is deliberately absent from the consumer RAG, while [[Self-Improving App]] says
  "Donny retrieves them through the existing `match_donny_knowledge` RPC". **Not a
  contradiction** — that sentence is audience-agnostic and `match_donny_knowledge` is exactly the
  RPC internal Donny uses at internal scope, so no page asserts a conflicting *current* state
  ([dated-analysis]'s test). A flagged nuance is not automatically a critical finding.
  (b) newest in-scope revision `6df77138`; probe token **`internal_docs.archived_at`**, confirmed
  present in the first-parent added lines AND on exactly **one** page on disk, so a hit cannot be
  trivial → 1 row. Advisory `RAG_LAST` 2026-08-10 14:56Z corroborates. (c) both session pages
  (`donny-rag-scope-boundary`, `knowledge-sync-automation`) in `index.md` and `log.md`.
- Worked: the token-uniqueness pre-check again. The obvious candidates from the added lines were
  `` `CONSUMER` ``, `` `EXCLUDE` ``, `` `donny_knowledge` `` — all of which live on other pages
  and would have passed on content that predates this sync.
- Failed: nothing gating.
- Remember: **this validator's own passing condition is now scope-blind by design, and that is
  correct.** Since PR #434 every `wiki:%` row is `scope='internal'`, and (b) probes with the
  service role and no scope predicate, so it passes identically either way — exactly the
  [scope-is-not-freshness] warning, now with the *expected* value inverted. Flag a `wiki:%` row at
  `scope NULL` as advisory: it means either a sync ran from a pre-#434 checkout, or someone edited
  the `CONSUMER` allowlist. Both are worth a sentence in prose; neither flips a `met`.

### [2026-08-09] Post-merge verify for PR #418 (.com Phase 1 + esm.sh bundler outage knowledge-sync)
- Output: verdict `done:true` — all three criteria met, `missing:[]`.
- Happened: (a) 111 in-scope pages, index-incompleteness **0**. Contradiction half needed real work
  this time because the session's subject IS a behaviour change ([claim-decay]): swept every
  `esm.sh` mention in `docs/` + `.claude/` — all of them either document the incident or corroborate
  it (`donny-social-tools.md` independently records PR #415 sweeping esm.sh→npm: "because esm.sh
  specifiers were blocking redeploys"). **Nothing recommends esm.sh in the present tense**, so no
  rot. `dragoncandy.com` appears in exactly one in-scope page (the new one), so no page asserts a
  competing canonical-domain claim — `.io` is still canonical and every other page saying so is
  correct. (b) newest in-scope revision = the merge itself (`942fa8a6`, 282 insertions / 0
  deletions — both pages net-new); probed three tokens the revision **added** and which
  `grep` confirms appear in **no other in-scope page**: `INTERNAL_APP_ORIGINS`=2,
  `esm.sh/jose@5.9.6`=3, `caa7ca97`=2. (c) both pages in `index.md` + `log.md`, raw session
  catalogued in Sources.
- Worked: the token-uniqueness pre-check earned its keep in a new way. Both pages are 100%
  additions, so *every* token is "added" and the [freshness-proxy] trap (a token that already lived
  on an edited page) cannot arise — but a token could still be shared with an **older** page and
  pass trivially. Grepping first showed all three tokens live only in the two new pages plus the
  raw session, and `raw/` is never synced, so a `donny_knowledge` hit can only have come from this
  sync. Also spot-checked the live claims per the [2026-08-02] Remember: `donny-auto-pilot` is
  genuinely still v47 (entrypoint `_38`, untouched since June) and `verify-recaptcha` is absent
  from `list_edge_functions`, so both present-tense claims in the new pages are true today.
- Failed: nothing gating. One **advisory** worth stating: the caller had to repair a prod regression
  found *before* this validator ran — a fleet redeploy pinned to a pre-merge commit silently
  reverted another session's `donny-orchestrator` fix. All three checks here would have been green
  throughout, exactly as the [2026-08-02] entry warns: a green verdict means "the knowledge layer
  matches git", never "prod is correct".
- Remember: **(b) proves a page is *present*, never that it is *reachable by the right audience*.**
  Both new pages are `scope:'internal'`; the content probe passes identically whether scope is
  `internal`, `null`, or garbage, because it queries the table with the service role and no scope
  predicate. Had the caller's `FORCE_INTERNAL` fix been wrong, (b) would still have returned
  `done:true` while consumer Donny happily served deploy runbooks and DNS details to restaurant
  owners. → promoted to Lessons as [scope-is-not-freshness].

### [2026-08-08] Post-merge verify for PRs #385/#388/#391/#394 (handle_updated_at restore + status_changed_at anchors)
- Output: verdict `done:true` — all three criteria met, `missing:[]`.
- Happened: (a) 0 orphans / 106 pages; the three `log.md` hits for "handle_updated_at is a no-op"
  are historical append-only entries, not competing current-state claims ([dated-analysis]).
  (b) probed on tokens the newest in-scope revision (`17dac8e3`) **added**: `20260808020000` = 5
  rows, `escrow_status_changed_at` = 5, the consumer-rule sentence = 3 — all text created
  2026-08-08, so none could pass trivially. (c) `updated-at-trigger-drift.md` in `index.md`, both a
  `[2026-08-08] update` and `[2026-08-07] ingest` entry in `log.md`, raw session catalogued.
- Worked: the contradiction half of (a) paid off in an unexpected direction. Sweeping for pages
  still asserting the stub as *current* found none in the wiki — but four files **outside** (a)'s
  scope did: `knowledge-sync/SKILL.md`, `knowledge-sync/MEMORY.md`, this skill's own `SKILL.md`,
  and the live `knowledge-freshness-agent.md`. All fixed as the caller, after the verdict.
- Failed: nothing gating. The advisory was correctly kept OUT of `missing[]` (empty when `done:true`).
- Remember: **a fix silently rots every doc that explained the bug.** #385 restored the trigger and
  in doing so falsified four files at once — including this skill's own gating rationale and a daily
  cloud routine's. The tell is a doc that states prod behaviour in the **present tense** with a
  confirmation date; that date is an expiry, not a warranty. When a session changes prod behaviour,
  grep the whole repo for the *claim*, not just the subsystem — and note the checks stayed green
  throughout, because none of it lives under `docs/wiki/`. → promoted to Lessons as [claim-decay].

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
