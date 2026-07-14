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
  is squash-diverged; author knowledge-sync docs on a fresh branch for a clean PR.
- **[runlog-in-pr] Bundle this MEMORY.md Run Log entry INTO the docs PR commit**, not a
  separate follow-up. Forgetting it (as on the #176 run) costs a whole extra PR cycle just to
  persist one bookkeeping line.
- **[rag-verify] `donny_knowledge` has no `source_id` column** — verify retrievability with
  `content ilike '%<distinctive phrase>%'`, not a source/id filter (the query errors otherwise).

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

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
