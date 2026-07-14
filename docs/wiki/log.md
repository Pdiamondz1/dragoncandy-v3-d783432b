# Wiki Log

## [2026-07-14] ingest | Donny mobile quick-action navigate fix
Founder-reported "Donny chat prompts not clickable" root-caused as two stacked defects, neither a
pointer bug: navigate quick-actions changed the route BEHIND the fullscreen mobile chat sheet
(fixed — the sheet closes first on mobile; desktop's docked panel unchanged), and the `?brief=`
handoff's ~1-min non-streaming `donny-campaign-generate` fetch dropped on mobile ("Failed to send a
request to the Edge Function") while `donny_cost_ledger` proved the server finished. New source
[[Donny Mobile Quick-Action Navigate Session]]; compounded the overlay-must-close-before-navigate
rule into [[Donny Chat UX]]. Deferred: streaming/keepalive for `donny-campaign-generate` (the
[[Edge Function Streaming]] pattern).

## [2026-07-07] ingest | AIOS Agent-Loop Audit (3 gaps)
Captured the 3-gap AIOS agent-loop audit (prompted by a YouTube agent-loop video). New source
[[AIOS Agent-Loop Audit]] + new concept [[AIOS Runtime Spend Source-of-Truth]] (the runtime-vs-dev
spend reframe + the two-constraint `donny_cost_ledger` gotcha — the `auth.users` FK AND the `tier`
CHECK both blocked user-less/embedding inserts). Gaps: make-validator meta-skill (#217, knowledge
captured on that branch via [[Validator Skills]]); `/internal/loops` mission control (#218); spend
source-of-truth A+B+C (#220 — deployed + proven live, first-ever embedding rows landed). Refreshed
PROJECT_CONTEXT (Active Workstreams) + DATABASE_SCHEMA (`donny_cost_ledger` nullable user_id + tier
'embedding'). Compounded onto [[Founder Playbooks]] / [[Self-Improving App]] rather than duplicating.

## [2026-07-07] update | make-validator skill (validator authoring meta-skill)
Built the deferred *automate-last* step of the [[Validator Skills]] work: a project-scoped
`make-validator` meta-skill (`.claude/skills/make-validator/`) that authors or retrofits validators
to the one verdict contract (`{done,checklist,missing}`). Two modes — NEW (scaffold `verify-<slug>`)
and RETROFIT (append the block to an existing judge skill). Dogfooded the retrofit path on
`verify-prod` and `verify-db-schema`: both were *counted* as validators by Loop Scout but emitted
only a prose `## Done` section — each now appends the machine-readable block (gating checks explicit,
subjective parts advisory), purely additively. Updated [[Validator Skills]] (authoring section +
retrofit note + Loop Memory cross-link) and seeded the skill's `MEMORY.md`. Skills + docs only — no
schema/RLS/edge-fn/secret/app-code, no prod risk. Gap 1 of a 3-gap AIOS agent-loop audit (prompted by
the "Agent Loops Clearly Explained" video); gaps 2 (`/internal/loops` observability) + 3 (spend
source-of-truth) sequenced next. Source [[make-validator skill]]. Branch `feat/make-validator-skill`.

## [2026-07-07] ingest | Find Creators "near me" location/radius search
Ingested the location-search build session. The restaurant [[Find Creators]] page got a prominent
location + radius control: default **near me** off the restaurant's saved `business_profiles` location
(0 keystrokes), a city/ZIP "Another area" override, radius chips (10/25/50/100/Any), "Nearest first"
sort, "· N mi away" on cards, and a "Widen to Any location" empty-state nudge. All **client-side** over
the existing geo stack (haversine + Google geocoding + static US-city table), **no schema change**. The
buried Advanced-Filter Zip/City/Country inputs were **consolidated** into the one control and **county
was dropped**. New concept [[Creator Location Search]]. Founder calls during Codex review: put the
control on the hidden **brand** page too (role-neutral copy + role-aware center + brands default to no
active radius so nothing is silently hidden), and prefer **ZIP-precise geocoding** over the static
city-centroid (geocoded wins; freeform-`location` fallback for legacy profiles). **Codex-clean after six
rounds** — each caught a real effect-sync-staleness or edge-case bug (stale center on reset/mode paths,
brand-default auto-hide, ZIP precision, legacy-`location` placement). Frontend-only; branch
`feat/find-creators-location-search`.

## [2026-07-07] analysis | Claude Subagents audit
Applied the "How to Build Claude Subagents Better Than 99% of People" video's subagents playbook to DragonCandy audit-first. Factual anchor: zero custom `.claude/agents/`. Produced `analyses/claude-subagents-audit.md` (7-dimension rubric + current-usage assessment + ranked custom-subagent backlog), filed `subagents-audit` findings at `/internal/findings`, and shipped the #1 quick win: the read-only `edge-function-reviewer` subagent wired into the `careful` deploy checklist.

## [2026-07-07] analysis | Claude Skills framework audit
Applied Anthropic's 9-category Claude Skills playbook (the "How employees use Claude Skills" talk +
the lessons post) to DragonCandy's two skill surfaces. Scored the 9 dev `.claude/skills/` skills and
Donny (10 Founder Playbooks / 38 `donny-chat` tools / the `donny_knowledge` RAG) against a 7-criterion
rubric, built a 9-category coverage matrix, and produced a value×effort-ranked backlog. Verdict: the
dev library is genuinely strong (exemplary gotchas + progressive disclosure); the real gaps are whole
**missing categories** (Library/API-reference, Code-scaffolding, Runbooks) and no on-demand safety
skill — plus `codex-review` lacking run-memory, and Donny playbooks not consuming run history. Shipped
the `careful` safety skill as the #1 quick win; filed the rest as `skills-audit` findings.
Pages created: [[Claude Skills Framework Audit]]

## [2026-06-28] update | Landing: kill old-design flash + lighten it (crash/perf)
Root-caused the "old white landing flashes then the dark one loads" bug to a **stale prerendered
shell** hardcoded in `index.html` (instant-LCP shell never updated after the redesign) — not a
service worker / CDN cache. Replaced it with a content-free dark splash (logo on `#1A1A2A`) that
can't go stale. Then a landing **performance pass** to cut the mobile/Lovable "A problem repeatedly
occurred" WebKit crash: code-split the route (dark Suspense fallback), rewrote `Reveal` to ONE shared
IntersectionObserver + CSS (dropping ~20 per-element Framer-Motion observers + the animation engine),
made placeholder `blur-3xl` blobs static + gated infinite `float`/`shimmer` behind reduced-motion, and
in-view-gated `VideoSlot` autoplay (`preload=none`). New concept [[Landing Prerendered Shell &
Performance]]. Codex-clean after 2 P2s (synchronous reduced-motion init; legacy `matchMedia.addListener`
fallback for older iOS WebKit). Branch `fix/landing-flash-and-perf`.

## [2026-06-28] update | Landing fixes — brief-save + Business CTAs + nav
Fixed the landing "Save this brief — sign up free" trust bug — `pendingBrief` was written to
localStorage but never read, so a guest's brief was silently discarded after signup — via a tested
`src/lib/pendingBrief.ts` consumed at `OnboardingWizard` completion (business/brand → campaign builder
pre-filled through the existing `?brief=`; creator → key cleared). Also added a "Join as a Business" CTA
(hero + bottom) with a flag-gated `?role=` pre-select on `AuthPage`, and repointed 3 dead header nav
anchors to real section IDs. Updated [[Anonymous Brief Generator]] with a post-signup section. Branch
`feat/landing-fixes-brief-save`; the subjective "less generic" redesign is a separate next effort.

## [2026-06-27] ingest | Dragon Rewards Engine v1 (Engine + Tiers + Badges)
Ingested the DRE v1 build session — the first sub-project decomposed from the 6-phase parent
spec [[DragonCandy — Dragon Rewards Engine (DRE) Full System Spec]] (PR #191). v1 ships the
**configurable Dragon Points ledger + an idempotent award engine + the 5-tier system + tier
badges** (≈ parent Phases 1–2). The award engine is a **consumer of events the platform already
emits** ([[DragonShare]] posts/boosts, campaign completions/launches, profile completion,
ratings) via a **cron-invoked edge function** (`dre-award-engine`, every 5 min) — NOT a DB
trigger (the trigger→pg_net→edge-fn path is dead in prod), mirroring `expire-social-hooks`. It's
an **idempotent anti-join**: `dre_pending_events()` returns source rows lacking a ledger row on
the `(user_id,event_type,source_id)` unique key; balances are recomputed from the ledger (never
incremented) so re-runs self-heal. **Config-driven** (`dre_config` JSONB — point values, tier
thresholds, `go_live_at`) so retuning needs no deploy. Tiers require **DP AND a verified
milestone** (points alone never unlock). Notifications are **in-app-only/forward-only/coalesced**
via [[Notification Delivery]] (`type:'dragon_points_award'`, no email map); a far-future
`go_live_at` sentinel keeps the historical backfill silent until the founder sets the cutover.
A `public_dragon_tiers` view exposes tier-only (never balance) so the badge renders on public
profiles under the own-row balance RLS. Spec + plan each passed their reviewer loop (which caught
the `campaign_launched` `status<>'draft'` bug + the `completed_at` sourcing); whole-branch review
fixed 1 Important (null `occurred_at` batch-abort) + 2 Minor; **Codex second review clean**. Build
✓, typecheck ✓, 11/11 unit tests ✓. Founder go-live (migrations/Vault/deploy/cron/`go_live_at`)
is pending.
Pages created: concepts/dragon-rewards-engine.md, raw/sessions/2026-06-27-dre-engine-tiers-badges.md
Pages updated: index.md (Concepts + Sources), PROJECT_CONTEXT.md (active workstream),
DATABASE_SCHEMA.md (Dragon Rewards tables + view)

## [2026-06-27] ingest | Dezzy Outreach v1 (the company-facing growth agent's first domain)
Ingested the Dezzy AI — Outreach Machine v1 session. **Dezzy** is DragonCandy's company-facing
growth agent (counterpart to user-facing Donny), proposed in
`analyses/the-core-idea-two-agents-one-company.md` (the founder renamed the doc's "Dame" →
"Dezzy"). The keystone decision captured: **Dezzy is NOT a new agent runtime — it is a branded
suite of [[Founder Playbooks]]** on the existing AIOS rails. v1 ships **domain #3, the Outreach
Machine**: a report-only/draft-only `dezzy-outreach` Founder Playbook + one new admin-gated read
tool `get_reactivation_targets` (3 segments — stalled campaigns / dormant creators / lapsed
restaurants; public-handles-only/no-emails, org-aware, captured-boosts-only). The runner drafts a
ready-to-paste reactivation message per target in the **Dezzy voice**; it **sends nothing** (the
founder copy-sends). Two Codex P2 fixes this session: business-handle privacy parity (the creator
public-visibility filter was missing on both `business_profiles` queries) and active-org-members
(`invitation_status='active'`). Deployed `aios-playbook-run` v7→v8 via MCP (verify_jwt=false
preserved); ran twice on prod — `done_check.done=true`, counts 4/11/9 matching live SQL, regex-
confirmed no email/PII leak. Also closed a pre-existing `index.md` **orphan**: the core-idea
analysis (added by PR #189's wiki-save-answer) was never cataloged.
Pages created: concepts/dezzy-agent-playbook-suite.md, raw/sessions/2026-06-27-dezzy-outreach-v1.md
Pages updated: index.md (Concepts + Sources + Analyses [orphan fix]),
analyses/the-core-idea-two-agents-one-company.md (Dame→Dezzy rename note, domain #3 shipped, See Also),
PROJECT_CONTEXT.md (active workstream)

## [2026-06-26] ingest | AIOS Stakeholder Invite backfill (PR #178)
Backfilled the AIOS Stakeholder Invite feature (PR #178, shipped + deployed) into the wiki — it
had merged without a wiki page, a gap the `verify-knowledge` wikilink/orphan check surfaced
during the AIOS UI polish knowledge-sync (which had to drop a dangling `[[AIOS Stakeholder Invite]]`
forward link). New concept `concepts/aios-stakeholder-invite.md`: the admin-only invite-by-email
for **internal-only** AIOS accounts, the `handle_new_user` hard-block keystone (skip consumer
profiles when `account_scope='internal'`), the `manage-internal-users` choke point
(invite/list/revoke, `verify_jwt=false`, last-admin guard), and the 2 Codex P2 catches (stale
trigger body, never-accepted re-invite gap). Re-added the now-valid `[[AIOS Stakeholder Invite]]`
cross-links to `[[AIOS Internal Shell]]`. PROJECT_CONTEXT already carried the #178 workstream
bullet — no core-doc change needed.
Pages created: concepts/aios-stakeholder-invite.md, raw/sessions/2026-06-26-aios-stakeholder-invite.md
Pages updated: index.md (Concepts + Sources), concepts/aios-internal-shell.md (cross-links)

## [2026-06-26] ingest | AIOS Internal Dashboard UI Polish (PR #179)
Ingested the 2026-06-26 AIOS UI polish session. The `/internal/*` shell was reworked from a
single wrapping row of 11 nav pills into a grouped left sidebar (Monitor/Operate) on desktop
+ a mobile hamburger drawer (shadcn Sheet), with a pinned — **not floating** — "Ask Donny"
entry; new shared `PageContainer`/`PageHeader` primitives were adopted across all 12 internal
pages; Briefings/Strategy got a mobile doc-list height cap and Findings' evidence `<pre>` now
wraps. Presentational only (no schema/auth/data/RLS/gating change); Codex-clean; 568 tests
pass. Captured the "pin Donny, don't float it" decision (consistent with the standing
no-floating-FAB feedback).
Pages created: concepts/aios-internal-shell.md, raw/sessions/2026-06-26-aios-ui-polish.md
Pages updated: index.md (Concepts + Sources), PROJECT_CONTEXT.md (active workstream)

## [2026-06-24] lint | Fix 2 wiki-save-answer orphans
The `verify-knowledge`/lint orphan check (run as the close-the-loop step of the prior
knowledge-sync) caught 2 analysis pages on `main` missing from `index.md`:
[[Competitive Advantage]] and [[Influencer/Creator Outreach]] — both Donny save-answer pages
from PRs #164/#165. Added their index entries. Confirms the known gap: the `wiki-save-answer`
flow adds a page + syncs RAG but does NOT update `index.md`, so its pages land as catalog
orphans until a later knowledge-sync lint catches them.
Pages updated: index.md

## [2026-06-24] ingest | Loop Memory shipped + Security-Advisor Triage (deferred)
Ingested the 2026-06-24 session. Captured that the [[Loop Memory Protocol]] shipped (Phase 1,
PR #161) — added a Status line + second source to that page. Recorded the #161 merge/deploy
(conflation with the notification PR, index/log merge-conflict resolved keep-both, edge-fn
deploy via MCP since Lovable is frontend-only, and the verify-prod lazy-chunk blind spot where
the landing `index-*.js` hash stays unchanged because the changes were in lazy route chunks).
Created [[SECURITY DEFINER Advisor Triage]] — the reusable 3-signal triage method
(frontend `.rpc()` / referenced in an RLS policy / returns `trigger`) and the **deliberate
decision to defer** acting on the 149 prod security advisors pre-launch (43 keep-by-design /
32 revoke-safe; no changes made). Refreshed `PROJECT_CONTEXT.md`.
Pages created: [[Loop Memory & Security Triage Session]], [[SECURITY DEFINER Advisor Triage]]
Pages updated: [[Loop Memory Protocol]], index.md
Note: cross-links [[Self-Improving App]], [[Validator Skills]], [[Supabase]], [[QA CI/CD Gate]].

## [2026-06-23] update | Loop Memory Protocol
Added the Loop Memory Protocol concept page — the contract for a co-located two-zone
`MEMORY.md` (curated **Lessons** read before a run + append-only **Run Log** written after)
that lets an orchestration loop self-improve across runs. The "Output" half of the source
prompt is satisfied by *pointing at* each loop's existing artifact (wiki page, `log.md`,
`result_summary_md`) rather than duplicating it; the validator verdict block's `missing[]`
feeds the Run Log Failed/Remember zone. Phase 1 applies it to the `autoresearch` (pilot),
`knowledge-sync`, `verify-knowledge`, and `wiki-ops` skills; Phase 2 (DB-backed memory for
cloud routines via `aios_loop_memory` + `aios-report-ingest`) is designed but deferred.
Pages created: [[Loop Memory Protocol]]
Pages updated: index.md
Note: cross-links [[Validator Skills]], [[Self-Improving App]], [[Founder Playbooks]].

## [2026-06-23] ingest | Notification Email Audit (PR #161)
Ingested the notification-email audit session. A creator's dead "View Campaign" button
(`href="undefined"` — a duplicate `create-notification` invite email + the one template with no
`baseUrl` fallback) cascaded into auditing every button in `send-notification-email`, then a
caller-payload trace that surfaced the keystone finding: the function's **self-only auth gate
403s any frontend caller emailing the counterparty**, silently dropping 9 transactional emails
(likes, content-started, joint approvals, project + sponsorship completion). All 6 frontend flows
rerouted through `create-notification` (service-key send + the in-app bell they lacked); 2
broadcast type names fixed; 3 missing templates added (`campaign_cancelled`, `dispute_alert`,
`org_invite`); buttons cross-checked against `src/App.tsx` + guarded against `/undefined`. Codex
caught the like-email pref-gating (kept intentional) and an empty-greeting fallback. Distilled the
durable rule into [[Notification Delivery]].
Pages created: [[Notification Delivery]], [[Notification Email Audit Session]]
Pages updated: index.md

## [2026-06-22] ingest | Origin Story & Knowledge-Sync Automation (PRs #154–#162)
Ingested the session that authored the canonical DragonCandy origin story into the AIOS
strategy library (one cohesive story with the three-sided restaurant/creator/brand vision
woven in; founder canon fixes: Joe Castelo single-L = CEO who leads sales; CRO→CEO sweep
across 7 docs) and built the knowledge-sync automation (npm run sync:internal/sync:wiki via
with-env.mjs + gitignored .env.sync.local, an auto post-merge git hook, and a committed
installer run on npm install). Gotchas captured: Windows pathToFileURL ESM import,
verify-by-content (not counts) on internal_docs.content_md + donny_knowledge.content, and the
key must reach the merge-triggering shell. No schema/RLS/edge-fn/secret change.
Pages created: [[Origin Story & Knowledge-Sync Automation Session]], [[Knowledge-Sync Automation]].
Pages updated: [[Self-Improving App]], index.md.

## [2026-06-21] ingest | Patch-Based Corrections (PRs #151/#152)
Ingested the patch-based strategy-doc corrections session. Internal Donny now proposes a
`strategy_doc` correction as small find/replace `edits` ({old_string,new_string,replace_all?})
instead of regenerating the whole 5–50KB document; the `propose_correction` handler re-reads the
current `internal_docs.content_md`, applies the edits server-side (new pure module
`donny-chat/doc-edits.ts`), and POSTs the reconstructed FULL `proposed_value` — so ingest, the
`aios_corrections` row, the drift-checked apply RPC, and `wiki-commit-pr` are unchanged, and "a
human approves" holds. Shrinking Donny's OUTPUT cut the ~130s correction turn to seconds, ending
the mobile streamed-`fetch` "Load failed"; this resolves the residual the [[Edge Function
Streaming]] page predicted. Gotcha: backticks inside the backtick-delimited system-prompt template
literal broke the Deno bundle (caught only at `supabase functions deploy`, not `npm run build`) —
fixed in #152. Codex second review clean; 11 new unit tests; donny-chat deployed to prod.
Pages created: [[Patch-Based Corrections]], [[Patch-Based Corrections Session]].
Pages updated: [[Edge Function Streaming]], [[Wiki Index]].

## [2026-06-20] ingest | Donny Chat Input & Timestamps (PR #140)
Ingested the Donny chat UX session. Shared `DonnyChatInput` single-line `<input>` → auto-growing
`<textarea>` (Enter sends / Shift+Enter newline) so a long prompt stays readable instead of
scrolling off-screen; added per-message timestamps (time inside each bubble) + teal date dividers,
rendering the pre-existing `created_at`. Shipped to both the consumer chat panel and internal Donny;
the two surfaces' opposite (light vs dark) backgrounds forced the time-inside-bubble + teal-chip
choice. Codex (required second review) caught a P2: day-divider grouping must compare against the
previous *visible* message, since hidden `role:'tool'` rows would suppress a real day boundary —
fixed via `startsNewDayGroup`. Prod-verified on dragoncandy.io (both viewports, 0 console errors).
Pages created: [[Donny Chat Input & Timestamps Session]], [[Donny Chat UX]].
Pages updated: [[Donny AI]], [[Wiki Index]].

## [2026-06-20] update | Founder Playbooks — session close-out
Closed out the Founder Playbooks session: PR #132 (feature) and #137 (wiki ingest) merged,
the runner deployed (v5), and the first prod run of the Weekly KPI variance seed verified
end-to-end (real live stats via the session-JWT path, done_check parsed, report-only honored).
Donny RAG synced (sync-wiki-to-donny: +1 inserted / 32 updated / 0 errors) so
[[Founder Playbooks]] is now retrievable. Added a Status block to the page.
Pages updated: [[Founder Playbooks]].

## [2026-06-20] ingest | AIOS Founder Playbooks v1 (+ verify-db-schema skill)

Ingested the Founder Playbooks session (PR #132). A Playbook is a founder-authored saved repeatable
internal task (task · preferences · done-criteria · allowed-proposals) that internal Donny runs on
demand **report-only + propose** — it reports and may *propose* a correction through the existing
/internal/corrections gate; nothing auto-applies. It is the landing spot the Self-Improving App's Loop
Scout candidates were missing (surface → land → run, via a "Promote to playbook" action). Key
architecture: self-contained runner (can't import donny-chat, which serve()s at load), runs under the
caller's session JWT so the auth.uid()-gated live-stats RPCs return real data, verify_jwt=false for the
browser preflight, concurrency guard + stale-reap + 3-state done-check chip. Verified end-to-end in prod
(the first run reported real live stats, not the no-session stub). Also captured the verify-db-schema dev
skill.
Pages created: [[Founder Playbooks]].
Pages updated: [[Self-Improving App]], [[Wiki Index]].

## [2026-06-20] ingest | Loop Scout first run — triage + two cron builds

Both AIOS automation loops went live and were validated (Loop 1 self-healed RAG then no-op'd;
Loop 2 filed 5 fresh `[loop]` findings). All five triaged: **2 built, 2 wontfix, 1 acknowledged**.
Built `expire-social-hooks` (PR #133 — dead cleanup control; daily Vault-backed pg_cron; auth
hardened to the shared ingest gate; Codex caught a missing `verify_jwt=false` P1) and
`expire-email-verification-tokens` (PR #134 — pure-SQL pg_cron; lossless security
data-minimization). wontfix `donny-scheduled-posts-dispatch` (publishing is human-gated by design)
and `donny-analytics-alerts-cron` (per-user request API, not a cron; Scout hallucinated an
analytics_events job). acknowledged `donny-cost-rollup-cron` (real dead cost-cap control but the
naive cron would flap — per-user vs platform `current_stage` writer conflict + ledger undercount).
Fixed a stale `aios_ingest_key` Vault secret (held legacy JWT, not the sb_secret). Lesson:
report-only is what makes an autonomous auditor safe — wrong candidates cost only a triage.
Pages updated: [[Self-Improving App]]. New source: [[Loop Scout First Run]].

## [2026-06-19] ingest | AIOS automation loops — knowledge-sync self-heal + Loop Scout

Two sequenced AIOS loops shipped (PR #130), prompted by a screenshot framework for ranking
automation "loop candidates" — the **4-Condition Test** (repeats? / rule judges done? / afford
wasted runs? / has data + tools?). **Loop 1:** the daily knowledge-freshness agent upgraded from
detector → detector + **self-healer** — it now auto-runs the blessed `sync-wiki-to-donny.mjs` when
`donny_knowledge` lags the already-merged wiki (case b) and keeps flagging the human case (case a,
substantive work shipped but un-ingested). Writes are exactly two (findings POST + idempotent sync);
the invariant *a human merges first* holds (only propagates merged content). Two timestamps separate
the cases (`LAST_WIKI` all dirs vs `LAST_WIKI_SYNC` concepts/entities/analyses); the script's exit
code is the success authority (a timestamp compare would false-fail on sources/index/log-only
commits). **Loop 2:** a new monthly **Loop Scout** routine (cron `0 8 1 * *`) that runs the
4-Condition Test over repeated work + telemetry and files the top ~5 ranked candidates as
`aios_findings` (`source:"loop-scout"`, `[loop]`-tagged, severity = build priority) at
`/internal/findings`. No schema/UI change. Two spec-review rounds stood in for Codex (docs-only).
Pages updated: [[Self-Improving App]].

## [2026-06-18] ingest | AIOS ingest-secret key rotation fix

A new Supabase `sb_secret_…` key rotated prod's service-role credential, silently 401'ing
the three daily 3am AIOS routines + the content-performance-capture pg_cron since
2026-06-11 (auto-injected callers like Donny stayed green; stored-copy callers — cloud-
routine env, Vault — went stale). Fixed with a shared `_shared/ingest-auth.ts` gate that
accepts the injected service-role key OR a stable `AIOS_INGEST_SECRET` (value = the
sb_secret key, so it also serves the agents' PostgREST reads); applied to
aios-report-ingest, donny-knowledge-sync, content-performance-capture, and the
google-workspace-proxy service-bearer path. PR #129; deployed via CLI + verified end-to-end
(pg_net through the Vault secret returned 400/200, not 401). RAG sync deferred to merge.
Pages updated: [[Self-Improving App]], [[Supabase]], index.md.
Raw: raw/sessions/2026-06-18-aios-ingest-secret-rotation.md.

## [2026-06-18] ingest | Donny chat → Create-a-Campaign pre-fill

Session extract of PR #124 (branch `worktree-DC-Donny-and-bug-fixing`). When a restaurant asks
Donny to create a campaign, the chat now hands a distilled brief to the Create-a-Campaign builder
via a `?brief=` param so it opens pre-filled on the Launchpad instead of blank. New
`prepare_campaign` sub-agent tool in `donny-orchestrator` (role-aware `…/campaigns/create?brief=`
route, encoded server-side); `campaign_agent` scoped to existing campaigns; `useCampaignCreator`
reacts to the param (deduped, same-route safe) and auto-runs the existing generation. Also fixed a
latent broken route (`/dashboard/brand/campaigns/new` → `…/campaigns/create`). Codex-clean (P2
same-route-param miss caught and fixed). Edge fn deployed to prod via Supabase CLI.
Source: [[Donny Campaign Pre-fill Session]].
Pages updated: [[Donny AI]] (new "Chat → Campaign-Builder Pre-fill" section), `index.md`.

## [2026-06-18] ingest | Save-to-knowledge — capturing a Donny answer as a new wiki page

Session extract of the AIOS Save-to-knowledge work (branch `worktree-DC-AIOS-save-answer`). Added a
founder-clicked, admin-gated "Save to knowledge" button on each `/internal/donny` answer that opens a
GitHub PR creating a **new** `docs/wiki/<concepts|analyses>/<file>.md` page from the answer; on merge,
`donny-knowledge-sync` folds it into Donny's RAG. The `wiki-save-answer` edge function is a deliberate
sibling of `wiki-commit-pr` (the answer has no correction row, so it accepts client field values under
a stricter guard: admin gate, 2-folder whitelist, kebab filename, server-built frontmatter,
YAML-sanitized title/tags/question), PR-only. No schema/secret/DB-row; reuses `GITHUB_WIKI_TOKEN`. v1
ships deterministic defaults (no AI metadata); the page records the originating question as provenance.
Two-stage subagent reviews + final review caught the YAML-newline title risk and input-hardening nits.
Source: [[Donny Answer to Wiki Session]].
Pages updated: [[Self-Improving App]] (new "Answer capture" section), `index.md`.

## [2026-06-18] ingest | Wiki-Commit-PR — correction write-back to the wiki

Session extract of the AIOS wiki-commit-PR work (branch `worktree-DC-AIOS-Donny`). Added a
founder-clicked, admin-gated "Open wiki PR" button on `/internal/corrections` that opens a GitHub
PR committing an approved strategy-doc correction back to its `docs/wiki/…` file, so the next
`donny-knowledge-sync` no longer reverts it. Three slices: additive `aios_corrections` PR-tracking
columns, the `wiki-commit-pr` edge function (admin gate, server-derived path/content, GitHub
Contents+Pulls, idempotent/self-healing), and the UI button + hook. PR-only (never main push);
one-time `GITHUB_WIKI_TOKEN` prerequisite. Whole branch Codex-clean; idempotency gotchas (PUT 422 on
unchanged content; supabase-js `.update()` returns `{error}` not throw) caught by Codex and fixed.
Source: [[Wiki-Commit-PR Session]].
Pages updated: [[Self-Improving App]] (new "Correction write-back" section), `index.md`.

## [2026-06-17] ingest | Investor Pitch Deck + Capital Raise Cost Model

Session-end extract of the investor fundraising work (branch `worktree-DC-pitch-deck`, PR #111,
open at ingest). Built a brand-faithful pitch deck at the unlisted `/pitch` route (15 slides,
`src/pitch/`, image-per-page PDF via `npm run pitch:pdf`) and a sourced ~$3M capital-raise cost
model (`docs/DragonCandy_Capital_Raise_Cost_Model.md`, 18-mo, 50/30/20). Added brand acquisition
(founder+AE led, raise unchanged) and a Donny super-agent/AGI Vision slide selling model-agnostic
adaptability. Gotchas captured: fixed 1280×720 slide canvas (overflow-verify with scrollHeight),
prod-build-only render, gitignored PDF, and the inline-base64 Drive-upload limit.
Source: [[Investor Pitch Deck & Cost Model Session]].
Pages created: [[Investor Pitch Deck & Cost Model Session]], [[Investor Pitch Deck & Capital Raise]].

## [2026-06-13] ingest | Weekly sync — Google Workspace, Dashboard calm, Analytics fix (PRs #82–#107)

Automated wiki-sync routine. Watermark: 2026-06-11. New raw extract:
`raw/sessions/2026-06-13-weekly-sync.md`. Sources ingested covering 26 commits (PRs #82–#107)
across five feature areas.

**Google Workspace / Connections (6 PRs, 2026-06-12/13):** AIOS Connections pillar shipped.
Per-user Google OAuth + HMAC-signed state, `google_workspace_accounts` table (service-role-only,
zero RLS), `google-workspace-proxy` edge function (single audited gateway), Drive file hub
(list/create/rename/trash/upload + embedded preview), ops-deck dark restyle of `/internal`,
Donny Workspace export (markdown → Google Doc), Gmail compose deep-link (zero-scope; full drafts
deferred to Workspace-day), metrics → living Sheet (service-bearer, Monday brief auto-flow),
Google Chat bot scaffold (ships dark, 503 until `GOOGLE_CHAT_PROJECT_NUMBER`). Founder GCP
gotchas documented: publish OAuth consent to Production, register exact callback path, enable
Sheets API separately.

**AIOS post-ship polish (PRs #82–#84, 2026-06-11):** founders-only login page, access-denied
card with account-switch + email display, sign-out control in AIOS header.

**Dashboard UX calm (3 PRs, 2026-06-12):** all three role dashboards (Business/Creator/Brand)
replaced cluttered layouts with calm hierarchy. New shared kit: `DashboardGreeting`,
`HeroPrimaryAction`, `StatsRow`, `NeedsAttentionSection`, `RecentActivitySection`. Legacy
`DashboardHero`, `DashboardStatsGrid`, `QuickActionButtons` retired. Presentation-only — no
hook/data-flow changes.

**Donny fixes:** input-first mobile tray (PR #94), empty-answer fix for platform/revenue/scaling
questions (PR #105).

**Analytics firehose fix (PR #106):** stopped `performance_metric` event persistence to Postgres,
purged 335K dead rows, added self-adjusting retention (90d + 1M-row budget), budget watermark
on `/internal/weight`.

**Codex second reviewer (PR #107):** mandatory Codex review step added to `CLAUDE.md` Code
Review Standards.

**Codebase scale corrected (old → new):** 60 pages → 73, 183 hooks → 206, 73 edge functions → 80
(in PROJECT_CONTEXT.md and CLAUDE.md).

Pages created: [[Google Workspace]] (entity), [[Google Workspace Connections Session]] (source).
Pages updated: [[Donny AI]] (80 fns, Workspace export tools, mobile fixes), [[Supabase]] (80 fns),
[[DragonCandy Platform]] (scale 73/206/80, Google Workspace integration); index.md (2 new entries).

## [2026-06-11] update | DragonCandy AIOS shipped (8 PRs)

The AIOS internal operating surface shipped end to end (PRs #64–#79, spec
`docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`): `/internal` dashboard (two tiers:
admin vs stakeholder), live stats RPCs, platform-weight scaling snapshots + alerts, operating
expenses vs revenue, internal-scoped Donny RAG (46 strategy/wiki docs; consumer-leak closed and
sentinel-verified), Internal Donny (admin-verified donny-chat tool set; Codex gate took 3 rounds —
de-admin history retention and a surface-relabel bypass, both fixed), and two report-only Monday
cloud routines (bug & error sweep → `aios_findings` triage; weekly operating brief → `aios_briefings`
publish gate; first brief validated 2026-06-11). All agent writes flow through `aios-report-ingest`.
Pages updated: [[Self-Improving App]] (Phases 3 and 5 first slices built; prod donny_knowledge
no-longer-empty flag resolved), PROJECT_CONTEXT.md (workstream entry).

## [2026-06-11] ingest | Content Engine Phase B Session

Ingested the 2026-06-11 session: Content Engine **Phase B shipped + verified in prod** — a creator
gets a Donny content brief (`content_briefs`) and acts on it in one tap via DragonShare, with
`dragonshare_posts.source_brief_id` + pre-filled `caption` recorded (3 slices, PRs #60–#63). A
deep-link query race in `usePreselectedOrg` had silently nulled both the caption pre-fill AND
`source_brief_id` for two slices (org query keyed on the live URL param that a cleanup effect deleted
mid-flight); fixed in PR #63 by capturing params at mount. Phase C (engagement → brief, populating
`content_briefs.social_post_log_id`) is next.
Pages created: [[Content Engine Phase B Session]] (source), [[Content Engine]] (concept),
[[Deep-Link Param Query Race]] (concept).
Pages updated: [[Self-Improving App]] (Phase 6 → Content Engine, A+B built), [[DragonShare]]
(source_brief_id + caption), index.md.

## [2026-06-10] analysis | Content engine data audit (foundation-first)

Audited prod signal data for the planned Donny content-strategy engine. Verdict: context data is live
(business/creator profiles, business_contexts) and Donny's generative functions are reusable, but
content-performance signal is dark — `social_analytics_cache` and the entire `toast_*` schema are
**absent from prod**, `dragonshare_engagement` is empty, the Outstand per-post analytics endpoint is
never called, and the only big dataset (`analytics_events`, 326k) is web telemetry, not content
performance. Conclusion: a data-driven recommender isn't buildable yet; sequence **foundation-first**
(Phase A "turn on the signal" → Phase B recommender). More prod migration drift surfaced.
Pages created: [[Content Engine Data Audit]] (analysis). Pages updated: index.md.

## [2026-06-10] update | Slice 3 promoted to prod + empty-RAG finding

Promoted Slice 3 to prod (zocahiffooqdybdhguqv): applied both migrations (the `'wiki'` source_type +
idempotency index, and the `match_donny_knowledge` search_path fix) and deployed the
`donny-knowledge-sync` edge function (ACTIVE, identical bundle to staging). Verified: `'wiki'` accepted,
index present, RPC runs clean.

Flag (verified): **prod `donny_knowledge` is empty (0 rows).** The seed scripts
(`supabase/seed/donny-knowledge-seed.ts` + `embed-knowledge.ts`) were apparently never run in prod, so
Donny's RAG has had **no knowledge base** in production — it answers from its system prompt + live
context only. Consequence: the autoresearch wiki sync will be Donny's first populated RAG knowledge in
prod. Decision pending: also load the ~75-chunk hand-seed, or let the wiki be the knowledge source.
Recorded on [[Self-Improving App]].

## [2026-06-10] update | Slice 3 — Donny learns (staging) + RAG drift flag

Built Phase 2 of the self-improving loop: verified wiki pages now sync into Donny's RAG store.
Shipped: migration adding a `'wiki'` source_type + idempotency index on `donny_knowledge`
(`20260610120000_donny_knowledge_wiki_source.sql`), the `donny-knowledge-sync` edge function
(service-role, OpenAI `text-embedding-3-small`, idempotent upsert by `metadata.source_id`), embedding
pricing in `_shared/cost-ledger.ts`, a `sync-donny` skill mode, and `supabase/scripts/sync-wiki-to-donny.ts`.
Migration + function deployed to **staging** (mhffqrawgizhprbobcta).

DB-side verified on staging: `'wiki'` rows accepted, idempotency index rejects duplicate source_id,
and a stored 1536-d embedding is retrievable (similarity 1.0 via the pgvector operator). Live OpenAI
sync is the operator's step (needs the staging service-role key + OPENAI_API_KEY secret).

Flag (verified → fixed): **Donny's vector RAG was broken on staging** — `match_donny_knowledge` had
`search_path = 'public'` but pgvector lives in `extensions` on staging, so the `<=>` operator didn't
resolve and retrieval fell back to FTS. Prod unaffected. Migration-drift class. Fixed via
`20260610130000_fix_match_donny_knowledge_search_path.sql` (search_path → `public, extensions`),
applied to staging. Recorded on [[Self-Improving App]], cross-linked [[Migration Replay Drift]].
Pages updated: [[Self-Improving App]] (Phase 2 built + fixed flag), log.

## [2026-06-10] autoresearch loop | Slice 2 demo — budget 2, 2 gaps closed

First autonomous `loop` run. Lint found no missing/orphan pages (wiki well-linked); all gaps were
thin-coverage core systems with no dedicated page. Ranked top 5: Organizations, Toast POS, File
Management, Messaging/Notifications, Donny scheduled posts. Ran budget=2 on the top two.

### Iteration 1 | Organizations (entity)
Status: kept
Domain: technical
Sources: supabase/migrations/20260426200000_team_accounts.sql (+org_unit_stripe, backfill, view),
src/hooks/useOrgData.ts, src/hooks/useOrgMembers.ts, src/types/org.ts, src/pages/OrgUnitsPage.tsx +
OrgBillingPage.tsx, supabase/functions/invite-member (internal, file-path grounded).
Pages created: [[Organizations]].
Pages updated: index.md, [[DragonCandy Platform]] (backlink).
Note: Flagged then verified (live DB, 2026-06-10) — the `sync_brand_logo_from_business_profile`
trigger (`trg_sync_brand_logo` on `business_profiles`) DOES exist in prod, so logo sync works; the
real issue is migration drift (trigger absent from migration files → lost on clean replay). Flag
reclassified on [[Organizations]], cross-linked [[Migration Replay Drift]]. Kept as a wiki flag.

### Iteration 2 | File Management (entity)
Status: kept
Domain: technical
Sources: supabase/migrations/20250617123640_*.sql (+file_uploads_org_unit), src/hooks/useFileQuery.ts,
useFileUploadMutations.ts, useFilePermissions.ts, useFileComments.ts, useSignedUrl.ts,
src/components/files/*, supabase/functions/bulk-download-campaign-content + release-creator-payout.
Pages created: [[File Management]].
Pages updated: index.md, [[DragonCandy Platform]] (backlink).
Note: Flagged — `file_versions` and `file_tags` are schema-only (queried/displayed but no write paths);
private buckets + signed URLs, opposite security model from DragonShare's public `content_file_path`.

### Budget exhausted (2/2). Remaining ranked gaps for a future run: Toast POS (external+internal),
### Messaging/Notifications, Donny scheduled posts, Analytics/funnel, Reviews & ratings.

## [2026-06-10] update | Autoresearch skill + Self-Improving App concept

Stood up the `/autoresearch` skill (`.claude/skills/autoresearch/SKILL.md`) — a domain-swap of
Karpathy's `autoresearch` loop (vendored at `/autoresearch`): research a knowledge gap → adversarially
verify → keep only if it passes an acceptance gate → ingest into the wiki → log → repeat. The wiki is
the artifact that improves each iteration (his loop lowers `val_bpb`; ours grows verified knowledge).
Orchestrates the existing [[wiki-ops]] and `deep-research` skills; writes only to `docs/wiki/`.
Slice 1 of an agile rollout — ships on-demand mode; autonomous `loop` and Donny sync are documented,
validated later. Recorded the architecture + 5-phase smart-app roadmap (incl. Donny learning on the
same loop via `donny_knowledge`).
Pages created: [[Self-Improving App]] (concept).
Pages updated: index.md (1 new concept entry).

## [2026-06-10] autoresearch | North Star & KPI scorecard (Slice 1 demo)
Status: kept
Domain: strategy
Sources: PROJECT_CONTEXT.md §2/§3/§8 (internal); 2025 SaaS benchmark reports — SaaS Capital,
Optifai, First Page Sage, ScaleXP, HiBob, The SaaS CFO, Vena, Vitally, Lighter Capital (external,
≥2 independent per metric).
Pages created: [[North Star & KPI Scorecard]] (analysis).
Pages updated: index.md (1 new analyses entry).
Note: First on-demand `/autoresearch` run. Validated CAC-payback, LTV:CAC, and NRR targets as
well-calibrated; raised two flags for the user — churn kill-switch has no stated unit (monthly vs
annual), and the rev/employee <$400K gate reads as a Y2–Y3 maturity target, not a Y1 trigger.

## [2026-06-07] ingest | Core Docs Recent Updates Sync

Synced core docs + wiki with codebase work that landed 2026-06-01 → 2026-06-06,
after the 2026-06-02 Plan B ingest. Corrected codebase scale to 60 pages / 183 hooks /
**73 edge functions** (docs said 67/71). Captured six shipped workstreams: DragonShare
notifications pipeline (`dragonshare-notify` fanout + dashboard activity parity), iOS
camera capture (Capacitor Phase 2 begins), legal pages, Outstand account recovery + real
profile photos, CGC submission unblock, and QA staging Plan C (e2e smoke gate).
Pages created: [[Core Docs Recent Updates Sync Session]] (source); [[Outstand]] (entity — first dedicated page).
Pages updated: [[DragonShare]] (notifications & activity section), [[Capacitor Native Shell]]
(Phase 2 camera + legal pages), [[Donny AI]] (73 functions), [[Supabase]] (73 functions),
[[DragonCandy Platform]] (scale 60/183/73 + Outstand link), [[QA CI/CD Gate]] (Plan C shipped);
index.md (2 new entries). Also synced `CLAUDE.md` (67→73) and `PROJECT_CONTEXT.md`
(scale, §5 workstreams, §6 enum triage, §10, live metrics).
Carried forward: `campaign_status` enum still missing `in_progress` (see [[Counter-Offer Enum Fix Session]]).

## [2026-06-02] update | QA Staging — frontend env-wiring gap

Post-verification finding folded into the QA staging pages: the app was hardwired to
prod (`client.ts` hardcoded the prod Supabase URL/key, ignoring `VITE_SUPABASE_URL`;
edge callers already used the env var → split-brain). Fixed client.ts + 3 hardcoded
callers to read the env var with prod fallback.
Pages updated: [[QA Staging Supabase (Plan B) Session]] (new "Frontend Env-Wiring Gap"
section), [[Supabase]] (env-wiring caveat).

## [2026-06-02] ingest | QA Staging Supabase (Plan B)

Ingested the Plan B session extract: standing up the isolated staging Supabase project
(`dragoncandy-staging`, ref `mhffqrawgizhprbobcta`) for the CI/CD gate — 213-migration
replay with a 7-class remediation, 71 edge functions deployed, 9 secrets set, Stripe
single-sandbox alignment + webhook endpoint, CSP parity + `cap:sync` verified.
Pages created: [[QA Staging Supabase (Plan B) Session]] (source); [[QA CI/CD Gate]],
[[Migration Replay Drift]] (concepts).
Pages updated: [[Supabase]] (staging env + drift + verify_jwt note), [[Stripe Connect]]
(single-sandbox alignment), index.md (3 new entries).

## [2026-06-01] ingest | Repo-State Sync — DragonShare, Capacitor, Delivery Cluster

Full session-extract ingest closing the gap since the 2026-05-24 backfill. Three new raw
session extracts synthesized from specs/plans/commits (2026-04-27 → 2026-06-01), then ingested.
Pages created: [[DragonShare]], [[Capacitor Native Shell]] (entities);
[[Trust-Then-Flag Model]], [[Two-Path Boost Payment]], [[Payments Split by Surface]] (concepts);
[[DragonShare Amplification Engine Session]], [[Apple App Store Capacitor Phase 1 Session]],
[[Campaign Delivery, Scheduling & Notifications Session]] (sources).
Pages updated: [[DragonDash]], [[Stripe Connect]], [[Supabase]], [[Donny AI]],
[[DragonCandy Platform]] (entities); [[Data Flywheel]] (concept); index.md (8 new entries).
Contradiction flagged: the DragonShare admin-queue/Donny-scoring model from the original
2026-04-27 spec was superseded by the trust-then-flag model — recorded in [[Trust-Then-Flag Model]].
Also synced core docs: PROJECT_CONTEXT scale (60/184/71) + DragonShare/Capacitor status,
DATABASE_SCHEMA (`user_roles`, `donny_scheduled_posts`), prd/product-vision native-app note.

## [2026-05-24] ingest | Session Handoff Backfill — 6 Source Pages

Backfill of 6 session handoff source pages from accumulated sessions:
Pages created: [[Code Architecture Audit Session]],
[[SEO Audit Session]], [[Realtime Edge Cases Session]],
[[Donny Audit Phase 1 Session]], [[Donny Audit Phase 2 Session]],
[[Counter-Offer Enum Fix Session]]
Pages updated: [[Donny AI]] (added phase 1/2 session links),
[[Supabase]] (added architecture audit, realtime, enum fix links),
[[TypeScript Patterns]] (added architecture audit link),
[[Error Handling Patterns]] (added realtime edge cases link),
[[Campaign Lifecycle]] (added realtime, enum fix links),
[[Pricing Architecture]] (added phase 1/2 session links),
index.md (6 new source entries)

## [2026-05-23] ingest | Phase 1 Seeding — 5 Core Documents
Initial wiki seeding from 5 high-value project documents:
PROJECT_CONTEXT.md, content-delivery-system-flows.md, STRIPE_PRICES.md,
DATABASE_SCHEMA.md, and code architecture audit handoff.
Pages created: [[Project Context]], [[Content Delivery System Flows]],
[[Stripe Prices]], [[Database Schema]], [[Code Architecture Audit Remediation]],
[[DragonCandy Platform]], [[Donny AI]], [[DragonDash]], [[Stripe Connect]],
[[Supabase]], [[Content Delivery State Machine]], [[Campaign Lifecycle]],
[[Take-Rate Ladder]], [[Data Flywheel]], [[Musk's Algorithm]],
[[Pricing Architecture]], [[TypeScript Patterns]], [[Error Handling Patterns]]
Pages updated: none (initial seeding)

## [2026-06-10] update | Flag: toast-token-refresh dead-GUC cron

Flagged that the `toast-token-refresh` pg_cron job uses the unset `app.settings.*`
GUC pattern (silently dead in prod); Toast tokens may not be refreshing. Deferred
(Toast blocked on pending API access); fix onto the Vault-cron recipe when Toast resumes.
Pages updated: [[Content Engine Data Audit]] (flag + drift section), [[Migration Replay Drift]]
(runtime-variant section + cross-ref). Part of the content-performance-capture build (Phase A keystone).

## [2026-06-10] update | Content-performance capture keystone SHIPPED

Phase A keystone of the content engine is live in staging + prod: content_performance
table + RLS, content-performance-capture edge fn, Vault-based pg_cron (daily 09:00 UTC).
Validated end-to-end vs the 1 real prod post — confirmed Outstand /posts/{id}/analytics
returns an aggregated_metrics envelope (total_* fields); mapping + idempotency verified.
social_analytics_cache also replayed to prod (dashboard drift fix).
Pages updated: [[Content Engine Data Audit]] (keystone shipped banner + payload shape).

## [2026-06-11] update | Content Engine Phase C SHIPPED — performance loop closed

Phase C (PR #73) bridges dragonshare_posts → social_post_log → content_performance, closing
the brief→action→performance loop. One migration: social_post_log gains dragonshare_post_id +
source_brief_id, content_performance gains source_brief_id, plus two SECURITY DEFINER triggers
(BEFORE-INSERT resolves source_brief_id from the originating post; AFTER-INSERT sets
content_briefs.social_post_log_id first-wins) with EXECUTE revoked (advisor 0028/0029). Frontend
publishDraft writes dragonshare_post_id; content-performance-capture forwards source_brief_id.
Verified on staging + prod via SQL trigger probes; build/typecheck/CI green. Resolved gating
unknown: social_post_log is written only when a human clicks "Post Now" on the boost auto-draft.
Pages updated: [[Content Engine]] (Phase C built + mechanism), [[Self-Improving App]] (Phase 6
loop closed), [[DragonShare]] (published-post link), index.md.

## [2026-06-11] update | Content Engine Phase D SHIPPED — creator brief history + performance card

Phase D (PR #77) puts the first UI on the loop: a "Your content briefs" card on the creator
dashboard. Present-day value is persistence — briefs were generate-and-forget; the card gives a
creator their history and lights up with earned engagement as it flows. One read-path migration: the
SECURITY DEFINER RPC `get_creator_brief_performance`, gated on `content_briefs.creator_id =
auth.uid()`, which bridges the cross-user RLS gap (Phase C writes `content_performance.user_id` = the
publisher/restaurant, not the brief's creator, and the table is owner-only). The RPC reduces each
post to its most-mature milestone snapshot (7d>72h>24h, `distinct on`) before summing, so 24h/72h/7d
rows don't multiply-count. Frontend: `useCreatorBriefPerformance`, `deriveBriefStatus` (+tests),
`BriefPerformanceCard` (mirrors the DragonShare activity card), surgical one-function `types.ts` add.
Verified staging + prod (aggregation probe 2 posts/435 views proving latest-milestone; anon-exec
revoked, authenticated granted; build/typecheck/vitest/CI green). Empty in prod today by data reality
(no paying boosts) — shows "Not posted yet" until a real boost + publish flows. Two new learnings
recorded: cross-user reads belong in an ownership-gated definer RPC (not a loosened table policy), and
milestoned snapshots must be reduced-then-summed.
Pages updated: [[Content Engine]] (Phase D built + RLS bridge + learnings), [[Self-Improving App]]
(Phase 6 loop surfaced to creators), index.md.

## [2026-06-11] ingest | Content Engine Phase D Session

Archived the Phase D session handoff to `raw/sessions/` and created the per-session source page (the
concept synthesis had already landed inline in PR #78, but the raw-session archive + `sources/` page —
the provenance layer — were missing; corrected here so the session is recorded as a traceable source,
matching every prior Content Engine phase). Captures the cross-user RLS-bridge reasoning, the
milestone reduce-then-sum aggregation, the surgical-`types.ts` requirement for new RPCs, and the
headless authenticated-REST verification approach.
Pages created: [[Content Engine Phase D Session]] (source).
Pages updated: index.md.

## [2026-06-11] ingest | Content Engine Phase C Session

Backfilled the missing per-session source page for Content Engine Phase C (the return-half link, PR
#73). Phase C was built between the Phase-B-complete handoff and the Phase D handoff without its own
`.claude/handoffs/` or `raw/sessions/` document, so — unlike Phase B and Phase D — it had no source
page; its knowledge lived only inside the [[Content Engine]] concept synthesis. Created the source
page anchored on the approved Phase C spec (a git-tracked source doc) with an explicit provenance note
that no standalone transcript exists. Closes the exact gap the `handoff-wiki-archive-always` discipline
guards against. Captures the resolved gating unknown (only a human "Post Now" click writes
`social_post_log`, not the boost), the BEFORE/AFTER SECURITY DEFINER trigger mechanism, first-wins +
one-to-many `source_brief_id` forwarding, and the EXECUTE-revoke contrast vs. the Phase D read RPC.
Pages created: [[Content Engine Phase C Session]] (source).
Pages updated: [[Content Engine]] (See Also), [[Content Engine Phase B Session]] (See Also),
[[Content Engine Phase D Session]] (See Also), index.md.

## [2026-06-11] update | Content Engine — Outstand measurability + honest "unmeasured" state

Investigated why prod content_performance metrics are all-zero. Verdict: the capture pipeline is
correct (zeros faithfully preserved); the zeros stem from an EMPTY metrics_by_account in Outstand's
analytics payload, not a measured zero. Outstand exposes no deletion/archival signal (no analytics
status field; webhooks are post.published/post.error only), and empty metrics_by_account is ambiguous
(deleted/archived/disconnected/never-published/not-yet-populated). The captured mJuDd post has been
empty for 5+ days — likely fundamentally unmeasurable. Shipped an honest surface: the Phase D RPC
get_creator_brief_performance now returns measurable_post_count (raw-derived), and the creator card
adds an 'unmeasured' state ("Metrics unavailable") instead of implying a measured "0 views" —
subsuming the user-raised deletion/archival concern Outstand can't signal. No capture/edge-fn change,
no new column.
Pages updated: [[Outstand]] (analytics & measurability findings), [[Content Engine]] (Known Issues +
unmeasured state).

## [2026-06-11] analysis | Platform API Registration Plan

Filed a tracking doc for the external registrations that unblock the Content Engine's dark signal.
Context: per-post Outstand analytics return empty metrics_by_account and account-level
social_analytics_cache is empty (0 rows); Outstand is a temporary bridge; the durable signal needs
direct platform API access (Meta IG/FB, X, TikTok, YouTube) + Toast, each requiring external
registration/approval (weeks to 6–12 months). Per-platform checklist with lead times + a Meta deep-dive
grounded against live Meta docs (Instagram-Login vs Facebook-Login paths, Business/Creator-only,
Advanced Access → Business Verification + App Review, 2–4 wk review, instagram_manage_insights). Records
the architecture principle (registrations = a source-adapter swap behind social_analytics_cache, not an
app rebuild) and the Step-0 interim probe for Outstand's account-level endpoint.
Pages created: [[Platform API Registration Plan]] (analysis).
Pages updated: index.md.

## [2026-06-11] update | Platform API Registration Plan — deep dives (YouTube, TikTok, X, Toast)

Added live-docs-verified deep dives for the four remaining platforms (Meta was done in the original).
Key findings: YouTube `yt-analytics.readonly` is a sensitive scope → Google OAuth verification +
security assessment, 4–6 wks (+ token-refresh gotcha matching our dead-cron history); TikTok maps cleanly
to user.info.stats (account totals) + video.list (per-video), app review w/ video demo, plus a new 2026
Creator Search Insights API (no per-creator OAuth); X moved to PAY-PER-USE on 2026-02-06 (no free tier
for new devs; ~$0.005/read, 2M/mo cap; legacy Basic/Pro existing-subscribers-only) — lowest priority;
Toast is a formal Integration Partner Application (compliance/privacy/security/legal vetting → signed
agreement → sandbox → certification → GA), longest lead, start first. Updated the status table (X row,
YouTube/TikTok lead times) and Sources.
Pages updated: [[Platform API Registration Plan]].

## [2026-06-20] ingest | AIOS Workspace reading, Strategy-library import & in-UI knowledge merge
Ingested the `feat/aios-workspace-knowledge-merge` session (3 slices, 26 commits, Codex-clean after
4 fix waves). Slice A: internal Donny can READ AIOS-folder Drive docs (pure drive-export.ts +
guarded/streamed readDcFile + read_file proxy action + internal-only workspace_read_file tool). Slice B
(keystone): the in-UI approve-&-merge pipeline — wiki-merge-pr edge function (list/preview/merge → GitHub
squash-merge → batched donny-knowledge-sync) + a self-hiding PendingKnowledgePanel on /internal/corrections;
deletes the GitHub trip AND the Lovable deploy from every knowledge capture. Slice C: import an AIOS Doc
into the Strategy library (wiki-import-doc reads server-side, opens a donny-wiki-import/ PR riding the
Slice-B panel). Invariants held: a human merges first; merge surface is wiki-paths-only; no schema/secret/
scope change. Gotchas captured: verify_jwt=false required for browser-invoked edge fns; donny-knowledge-sync
returns 200 even on per-page errors and caps pages at 100 (batch at 20); buildSyncPage must match
sync-internal-docs.mjs exactly to avoid duplicate RAG rows; merge gate path regex must match the producer
contract yet stay traversal-proof.
Pages created: [[In-UI Knowledge Merge]]. Pages updated: [[Google Workspace]], [[Self-Improving App]],
[[Donny AI]], index.md.

## [2026-06-20] update | Validator Skills concept
Added the Validator Skills concept page: the verdict-block contract (reusing the Founder
Playbooks done_check shape), the validator pattern (read-and-judge only, verdict block last),
and the bounded generate→validate→fix loop. Foundation for the Knowledge loop.
Pages created: [[Validator Skills]]

## [2026-06-20] ingest | Validator Skills → Loops Session
Ingested the validator-skills-loops session: one verdict-block contract (reusing the Founder
Playbooks `done_check` shape, so `aios-playbook-run`'s parser reads it with no new code), the
`verify-knowledge` validator (read-and-judge only; wiki-lint + RAG-freshness + index/log checks),
a bounded knowledge-sync verify→fix loop, and Loop Scout scoring condition-2 by validator
presence. On its first real run the validator caught 2 pre-existing wiki orphans (Donny
save-answer pages absent from index.md) and the loop closed them in 2 iterations.
Pages created: [[Validator Skills → Loops Session]]. Pages updated: [[Validator Skills]], index.md.

## [2026-06-20] ingest | AIOS Kill-switch Playbook + Loop-callable Playbooks Session
Ingested the feat/aios-killswitch-playbook-loop session. A1: a report-only
`kill-switch-watch` Founder Playbook (one idempotent seed migration) turning PROJECT_CONTEXT
§3's four kill-switches into a repeatable green/watch/breach/not-yet-measurable check, honestly
scoped as an armed-watch scaffold (three switches lack a data source — out of scope). A4 (the
prompt's literal "so any loop can call it"): a `playbook-runner-agent` cloud-routine that makes
any playbook loop-callable — it executes the playbook via Supabase MCP execute_sql + a capability
map (sidestepping the auth.uid()-gated RPCs that bind the session-JWT runner) and surfaces a
deduped finding on breach/watch only through aios-report-ingest (breach→critical, watch→medium;
all-green posts nothing; no auto-resolve). No schema (beyond seed INSERT), edge-fn, secret, or
auth change; Donny never writes directly. Codex-clean.
Pages created: [[AIOS Kill-switch Playbook + Loop-callable Playbooks Session]]. Pages updated: [[Founder Playbooks]], [[Self-Improving App]], [[North Star & KPI Scorecard]], index.md.

## [2026-06-20] ingest | donny-chat keepalive streaming (PR #148)
Ingested the donny-chat streaming session. Internal Donny 504'd on long Strategy-doc
corrections at Supabase's **150s request idle timeout** (NOT the 400s Pro wall-clock) because
the function was fully non-streaming. Fix: the internal surface now streams an NDJSON response
(status/text/heartbeat/done/error) with an early first byte, via a pure unit-tested
stream-accumulator (SSE parse + tool_use reconstruction + usage merge) and a unified
callModel/runTurn that keeps the consumer JSON path unchanged. Client-cancel handled
(ReadableStream.cancel + guarded close — Codex P2). Also captured the earlier same-session
tool-pairing replay fix (PR #146: history.ts enforceToolPairing). Codex-clean.
Pages created: [[Edge Function Streaming]]. Pages updated: [[Donny Chat UX]], index.md.

## [2026-06-21] lint | Wiki index orphans (verify-knowledge catch)
verify-knowledge (the validator) flagged 3 analysis pages on main present on disk but not
linked in index.md (index-incompleteness): 18-month-tech-engineering-donny-ai-1m-users,
part-1-engineering-aios-operations, tech-infrastructure-cost-breakdown-updated — all from
wiki-save-answer merges (that flow still doesn't update index.md). Added an index entry for
each. No content changed. Pages updated: index.md.

## [2026-06-24] ingest | Test-Mode Stripe UX (PR #168)
Ingested the test-mode Stripe UX session. Created [[Test-Mode Stripe UX]] (concept):
one-tap test-mode payout bypass (auto-create a fully-enabled Custom connected account
server-side, no hosted Express screens) + card-only checkout across all 4 Checkout-session
creators, all gated on sk_test_/pk_test_ so live mode is byte-for-byte unchanged. Captured
the gotchas: vitest can't load runtime https:// imports (type-only Stripe import + pure
isTestKey extracted to stripe-mode.ts); MCP edge-fn deploy must preserve verify_jwt per
function (list_edge_functions is ground truth, not config.toml) and name files by full repo
path; the transient "Verification Pending" → "Connected" capability lag; dashboard-link
degradation is test-mode-only (Codex P2). Live-verified the prefill flips payouts_enabled.
Pages created: [[Test-Mode Stripe UX]]. Pages updated: [[Stripe Connect]], index.md.

## [2026-06-24] ingest | Stripe Webhook Revival + Dual-Secret (PRs #173, #174)
Ingested the stripe-webhook revival session. The prod Stripe webhook had never delivered
(empty `stripe_webhook_events`) because `STRIPE_WEBHOOK_SECRET` was unset, which let
`stripe_onboarding_complete` go stale-false and block payouts. Captured two fixes:
trust-true/verify-false `verifyPayoutReady` at every payout gate (PR #173) + dual-secret
platform/Connect verification (`webhookSigningSecrets`, PR #174) so the one function accepts
events from both endpoint scopes (each has its own signing secret). Plus the operational
rules: Snapshot-not-Thin payload, Vault≠Edge-Function-Secrets, a warm isolate holding stale
env (redeploy forces the secret pickup), MCP byte-diff deploy verification, and the
probe-based 500-vs-400 health signal. Deployed `stripe-webhook` v156 (MCP, verify_jwt=false).
Pages created: [[Stripe Webhook Delivery]]. Pages updated: [[Stripe Connect]], index.md.

## [2026-06-27] ingest | Internal Donny Profile-Read Fix (PR #185)
Ingested the read-side sequel to PR #180. `donny-chat/index.ts` loaded the caller's
`profiles` row with `.single()` + `throw "Profile not found"`, blocking **Internal Donny**
entirely for internal-only users (no profiles row) — the *read* counterpart to PR #180's FK
*write* fix. Captured the fix: a pure unit-tested `donny-chat/profile.ts` `resolveDonnyProfile()`
(real profile → returned; consumer + none → still throws; internal-only + none → synthesized
minimal profile, greeting name from `auth.users`), call site `.single()`→`.maybeSingle()`,
consumer behavior unchanged. Plus the operational lesson: a 172KB function is too large for a
safe MCP `deploy_edge_function` re-paste, so `donny-chat` deploys via the **Supabase CLI**
(`functions deploy --no-verify-jwt`, auto-bundles from disk); CLI access was added this session
(founder PAT → `supabase login --token`). Deployed **v134** (verify_jwt=false, boot-checked).
Extended [[Internal-Only AIOS Users]] with "The profile-read trap" section + a read-side rule
of thumb. Pages updated: [[Internal-Only AIOS Users]], index.md (Sources).

## [2026-06-26] ingest | Internal-Only AIOS User FKs (PR #180)
Ingested the internal-only-user FK session. Adrian — the first internal-only AIOS user
(`account_scope='internal'`, PR #178, no `profiles` row) — hit "Google connect failed —
internal error" and a silent Internal Donny failure. Root cause: AIOS-surface tables
foreign-key `user_id → profiles(id)`, which assumes every internal user is a consumer user;
the FK violation surfaced as the opaque "internal error" because a Supabase `PostgrestError`
is not an `Error` instance and the proxy's `instanceof Error ? … : "internal error"` catch
erased it. Captured two fixes: repoint 3 AIOS FKs (`google_workspace_accounts`,
`donny_conversations`, `donny_tool_executions`) to `auth.users(id)` (non-destructive, 1:1
with profiles.id; consumer tables left on profiles), and a pure `describeError` normalizer
+ `google-workspace-proxy` v20 deploy so future DB failures show their real message+code.
Both applied to prod during the session. Pages created: [[Internal-Only AIOS Users]].
Pages updated: [[Google Workspace]], [[Error Handling Patterns]], index.md.

## [2026-06-27] ingest | Dezzy Content Playbooks (Domains 1 + 2)
Ingested the Dezzy content-playbooks session. Built the content half of Dezzy AI (the
"Dame AI"/Dezzy growth-agent spec) as two report-only AIOS Founder Playbooks seeded into
`aios_playbooks` — `dezzy-content-calendar` (5 company social posts/wk, Mon–Fri rotation) and
`dezzy-website-updates` (changelog/landing/announcement drafts for shipped features). Key
reframe: **Dezzy is a branded suite of [[Founder Playbooks]] + scheduled routines, not a new
agent runtime** — so the slice is a pure seed migration (no new read tool, no edit to
`aios-playbook-run`, no new table, no UI), grounded entirely in the six existing aggregate read
tools. Deliberately does not touch `aios-playbook-run/index.ts` (the file the sibling
`DC-Dezzy-AI` worktree edits for `dezzy-outreach`) → zero merge conflict. Non-fabrication is
enforced via `preferences_md` + a traceability `done_criteria` and marked placeholders
(`[CREATOR / @handle]`, `[RESTAURANT]`, `[STAT — verify]`). Seed applied to prod; live "Run now"
is a founder-gated step. Pages created: [[Dezzy Content Playbooks]]. Pages updated: index.md
(Concepts + Sources).

## [2026-06-27] ingest | Dezzy Weekly Operating Brief (Domain 5)
Ingested the Dezzy weekly-brief session — the Domain 5 capstone of the Dezzy suite. Seeded a
fourth report-only Founder Playbook, `dezzy-weekly-brief`: an admin-only Monday action console
(one-line summary, platform numbers, what worked/didn't, top 3 actions, a Dezzy-queue checklist,
system health). Two decisions: it is a SEPARATE admin-only playbook (not an extension of the
stakeholder weekly brief weekly-brief-agent → aios_briefings → /internal/briefings), so
founder-internal candor/directives stay off the publishable surface — it reconciles to that
brief's KPIs via get_latest_briefing; and it ORCHESTRATES (points to dezzy-outreach /
dezzy-content-calendar / dezzy-website-updates) rather than embedding their runs, so it needs no
tool to read aios_playbook_runs → pure seed (no aios-playbook-run edit, no new table/UI). Dezzy
now covers Domains 1, 2, 3, 5; only 4 (Press & Events) and 6 (Amplification/DRE) remain.
Compounded into [[Dezzy Agent (Playbook Suite)]] (capstone section + refreshed Deferred). Pages
updated: [[Dezzy Agent (Playbook Suite)]], index.md (Sources).

## [2026-06-27] ingest | Dezzy Press & Events scout (Domain 4)
Ingested the Dezzy press-events session — Domain 4 of the suite, and the FIRST Dezzy domain that
ships as a scheduled CLOUD routine rather than a Founder Playbook. Reason: the aios-playbook-run
runner has no web access, and press/event discovery needs the open web — so it lives on the cloud
routine rail (which has WebSearch), modeled on Loop Scout. `dezzy-press-events-agent` runs monthly,
web-scans press/podcast/publication/conference opportunities (grounded in PROJECT_CONTEXT + the
strategy library), and files the top ~10 as deduped [press]/[event]-tagged aios_findings via
aios-report-ingest for founder triage at /internal/findings. Zero-infra (reuses the findings rail —
no new table/UI/edge-fn/migration); report-only (only write = the findings POST). Disciplines:
URL-required (no verifiable URL → don't file), $0-budget-aware, severity-as-priority but never
critical, and re-scan skips acknowledged/wontfix/resolved. Codex caught + fixed a P2 (a
self-contradictory high-severity rule). Dezzy now covers Domains 1, 2, 3, 4, 5; only #6
(Amplification/DRE) remains. Compounded into [[Dezzy Agent (Playbook Suite)]] (Domain 4 section +
refreshed status/Deferred). Pages updated: [[Dezzy Agent (Playbook Suite)]], index.md (Sources).

## [2026-06-28] ingest | Dezzy Weekly SEO Article (Domain 6 SEO slice)
Ingested the Dezzy SEO-article session — the SEO/organic-discovery slice of Domain 6, and the FIFTH
Dezzy playbook. `dezzy-seo-articles` drafts one publish-ready SEO article per run targeting a
high-intent search term for $0 organic acquisition (founder publishes to the blog); grounded keyword
selection via get_platform_stats (which side to grow, with the "creators before restaurants" GTM rule
overriding raw counts) + get_internal_doc. Pure seed (no new tool/edit/table/UI). Disciplines: E-E-A-T
"genuinely useful, not keyword-stuffed" with no fabricated proof points (DragonCandy has no published
case studies yet), and no fabrication — any stat/feature/page-path traces to a tool or is a
[CONFIRM PATH]/placeholder (links founder-confirmed, no invented URLs). Key finding: the rest of
Domain 6 (milestone-celebration core, case studies, referral thank-yous, boost-performing-content) is
GATED — a read-only prod probe found dragon_point_events / dragon_point_balances /
dragonshare_engagement empty (PR #196 applied the DRE schema but held the award-engine cron) + no
milestone event to read + no referral table; they reopen when the DRE award engine goes live. All six
Dezzy domains now have a shipped slice or a documented gate. Compounded into
[[Dezzy Agent (Playbook Suite)]] (Domain-6 section + refreshed status/Deferred). Pages updated:
[[Dezzy Agent (Playbook Suite)]], index.md (Sources).

## [2026-06-28] update | DRE Go-Live Runbook & Readiness Check
Added a go-live runbook + readiness check to [[Dragon Rewards Engine (DRE)]] (read-only prod probe +
engine-code read; no prod change). Findings: the DRE is fully deployed + cron-live (jobid 7, every 5
min) and the silent backfill already ran (dragon_point_events=98, dragon_point_balances=24,
dre_pending_events()=0). go_live_at=2099 gates ONLY the in-app bell, not awarding and not UI
visibility — DragonPointsCard/DragonTierBadge render with no go_live/feature-flag gate in src/, so
~24 users likely already see their points/tiers. "Go-live" = flip go_live_at to enable forward award
notifications (effectively irreversible) — a founder business launch decision, not an engineering
deploy. Runbook documents pre-flight, the admin-gated dre_config flip, verification, and limited
rollback. Pages updated: [[Dragon Rewards Engine (DRE)]].

## [2026-06-28] update | Dragon Rewards UI Launch Gate
Gated the consumer Dragon Rewards display behind the DRAGON_REWARDS_ENABLED feature flag (seeded OFF),
fixing the accidental pre-launch exposure where ~24 real users already saw points/tiers (go_live_at gates
only the bell, not the UI). DragonPointsCard (dashboards) + DragonTierBadge (public profiles + inside the
card) now render null until the flag is on. Chose a feature flag over go_live_at because dre_config is
authenticated-read but the public profile routes are anon-accessible — go_live_at would hide anon badges
post-launch; feature_flags has a public read + fail-safe-off useFeatureFlag. New useDragonRewardsEnabled()
wrapper; jsdom gate test; seed migration applied to prod. Launch is now TWO switches (flag→UI, go_live_at→
bell) — the DRE go-live runbook was updated accordingly (a Codex P2 catch). Engine/ledger/awarding
unchanged; fully reversible. Pages updated: [[Dragon Rewards Engine (DRE)]] (runbook), index.md (Sources).

## [2026-06-28] ingest | Landing Redesign & Public Lead Capture
Ingested the 2026-06-28 landing redesign + lead-capture session (branch feat/landing-luxe-redesign, off
origin/main). `/frontend-design` rebuilt the public landing into a Dark Luxe Editorial experience and added a
first public lead-capture pipeline. New concept page concepts/landing-lead-capture.md captures two reusable
patterns: (1) a SCOPED dark theme — a `.dark` wrapper + bg-dc-dark redefines the dark CSS vars for the landing
subtree only (next-themes writes only to <html>, so no leak into the app), with the Radix-portal-escapes-.dark
and literal-classes-don't-respond caveats; plus the Reveal scroll primitive and MediaSlot/VideoSlot branded
placeholder slots (Nano Banana Pro-ready). (2) a CLOSED-ANON-DML lead pipeline — public.leads has internal-only
RLS and NO anon INSERT/SELECT policy (PII), the capture-lead edge fn (verify_jwt=false) inserts as service role
+ Resend-notifies, guarded by a honeypot and a fail-open per-IP throttle (5/10min). Copy broadened
restaurant→business (kept creator); rewards section flag-gated (DRAGON_REWARDS_ENABLED, action-based copy, no
fabricated bonus). Backend deployed to prod (MCP + re-deployed from disk via the newly-installed Supabase CLI)
and curl-verified (valid/honeypot/bad-email/preflight/throttle); no new security advisor for leads. Codex-clean
after 2 P2s (brand-gate the form/CTA; add the throttle). RAG sync + verify-knowledge are post-merge (post-merge
hook on the docs/ ff). Pages created: concepts/landing-lead-capture.md. Pages updated: index.md (Concepts +
Sources). Core docs: PROJECT_CONTEXT.md (active workstream), DATABASE_SCHEMA.md (leads table).

## [2026-06-28] update | DRE rewards rename → "Creator standing"
Founder feedback: the fantasy tier names + "Dragon Points" read corny for the older/professional
audience. Renamed the USER-FACING labels only: currency Dragon Points → Reputation (Rep); tiers
Egg→Rising / Scout→Established / Knight→Pro / Master→Elite / Legend→Icon; fantasy emojis dropped (clean
colored pill). Display-only — the tier keys (egg/scout/…), dragon_point_* tables, dragon_points_award
type, DRAGON_REWARDS_ENABLED flag, and internal DP/DRE names are unchanged (no migration). Touched
dragonTiers.ts labels, DragonPointsCard/DragonTierBadge copy, the gate test, and the dre-award-engine
award-notification copy (redeployed v2, verify_jwt preserved, boot-checked 401). Tests 7/7, build green,
Codex-clean. The milestone-celebration playbook (next) inherits these names. Pages updated:
[[Dragon Rewards Engine (DRE)]] (Display naming note).

## [2026-06-28] update | Landing copy — rewards rename consistency + honest paste-URL framing
Two landing-copy fixes. (1) Rename tail: the redesign's flag-gated DragonRewardsSection (now live since
rewards were enabled) still had corny "Dragon Rewards / Dragon Points / Dragon Egg→Legend" prose while its
tier-ladder badges auto-rendered the new labels — updated the eyebrow ("Creator Standing"), heading
("Reputation"), and body ("from Rising to Icon"), + conditional-emoji render. (2) Founder-flagged
false-advertising: the paste-a-URL claims overpromised accuracy ("complete"/"ready-to-run" campaign "built
from your website"). Reframed honestly across HowItWorks / WhyDragonCandy / AudienceLanes /
BriefGeneratorPreview as a fast FIRST DRAFT you review+tweak, "works best from your homepage or menu" (input
guidance set at the point of entry, incl. the preview placeholder). Feature/value intact; the overpromise
removed. Deferred follow-up: a tiny preview guardrail that gently flags a clearly-irrelevant/empty page
result. Copy-only; no logic/backend change.

## [2026-06-28] ingest | Anonymous brief generator repair + Layered-v1 hardening
The landing's free "paste a URL → brief" teaser (BriefGeneratorPreview / generate-anonymous-brief) was
500ing on every prod call: it delegated to the user-gated donny-campaign-generate with the service-role
key, which 401s (auths only a user JWT / Donny OAuth). Rewrote generate-anonymous-brief self-contained
(own fetch+extract + a hardcoded-Haiku call — NOT getModelConfig, which defaults to Sonnet), with an
HTTP-200 error-discriminator contract (functions.invoke exposes the body only on 2xx, so the old 429
rate_limited path was dead), Layered-v1 abuse hardening (global daily cap as the real cost ceiling +
best-effort per-IP + honeypot + hardened SSRF guard) and a thin-page source_quality signal feeding a
gentle preview note. Spec passed independent review (6 fixes) before build; Codex caught 2 P1s
(trailing-dot FQDN SSRF bypass; malformed-IPv6 → failed inet insert → cap-accounting bypass), both
fixed. Deployed via CLI (verify_jwt=true preserved) + live-verified on prod. Pages created:
[[Anonymous Brief Generator]] (+ See-Also [[Landing Lead Capture]]).

## [2026-06-28] ingest | Dezzy milestone-celebration playbook (Domain 6 amplification core)
Un-gated now that the DRE award engine is live + dragon_point_events is populated. Added a 7th
read tool get_recent_milestones to aios-playbook-run (mirrors get_reactivation_targets): service-role
admin client (own-row RLS on the DRE tables), event_type ilike first/milestone, 30d window, capped 15,
profile_visibility='public' join, resolved BY EVENT_TYPE ROLE PREFIX (not creator-first, so a
dual-profile user's business milestone isn't misattributed), tier returned as the display label
(tierLabel mirrors src/lib/dragonTiers.ts). Plus a report-only dezzy-milestone-celebrations seed
playbook drafting #DragonDashed celebratory posts (current DC Rewards / DC Points / Rising→Icon naming)
with a false-recency warning for updated_at-sourced events. Codex caught + fixed 1 P1 (migration
timestamp collision with leads_capture) + 2 P2s (business.first_campaign is a COMPLETION not a launch;
role-prefix resolution). Deployed + data-layer-verified on prod (12 recent milestones, all public, 0
leak). All six Dezzy domains now have a shipped slice; #6's core is live. Pages updated:
[[Dezzy Agent (Playbook Suite)]] (Domain 6 section + status + Deferred).

## [2026-06-29] ingest | DC AIOS Strategy Library Management (audit + safe archive + core-file protection)
Built strategy-library management for the AIOS: the `internal_docs` library (a projection of git docs
feeding Internal Donny's RAG + Dezzy) gained a reversible **archive**, **Core-File protection**, and a
**monthly audit**. Migration `20260629120000_…`: `is_core` + archive triple, a seed + `BEFORE INSERT`
trigger (`search_path=''`), service-role detection RPCs (`dedup_candidate_pairs` cosine via pgvector
`<=>` + `internal_doc_exact_dupes` via `source_hash`), and admin-gated `internal_doc_archive`
(core-guarded; deletes the RAG row) / `internal_doc_unarchive`. The keystone: `donny-knowledge-sync` is
now **archive-aware** (skips the RAG write for an archived doc, self-heals stray rows) so a re-sync
never resurrects an archived doc, and it computes `source_hash`. Archived docs are hidden from both
`get_internal_doc` readers; `/internal/strategy` gained an admin Archive/Un-archive UI + Core badge; a
monthly `strategy-library-audit-agent` files dupe/conflict/orphan/bloat findings to `/internal/findings`
(report-only). Full prod rollout + keystone smoke passed (advisors clean, 84/84 `source_hash` backfilled,
archive→re-sync→not-resurrected→un-archive→restored). Pages created: [[Strategy Library Management]]
(concept) + the raw session source. Pages updated: index.md (Concepts + Sources), DATABASE_SCHEMA
(`internal_docs` note), PROJECT_CONTEXT (workstream bullet). Founder go-live: create the monthly
`/schedule` routine.

## [2026-07-09] ingest | Creator Groups + Private Group Campaigns
Ingested the Creator Groups ("crews") + private group campaigns build (branch
`feat/creator-groups-private-campaigns`, 26 commits; schema live on prod, frontend deploys on
merge). A business builds a standing private roster of creators (owner = business user, invite→accept
lifecycle) and posts a campaign scoped to a crew that only active members see and one-tap apply to
with no payment (free `fixed_price=0` removes the Stripe readiness gate). Private visibility rides
the existing `campaigns` SELECT chokepoint (`published AND (group_id IS NULL OR is_active_group_member)`);
both apply gates (`apply_to_campaign` RPC + `can_create_application`) tightened to member+published;
cross-owner targeting blocked by the `enforce_campaign_group_ownership` trigger; escrow uncoupled for
free crews with every checkout entry point guarded — paid/public path byte-unchanged. Durable gotchas:
verify columns against prod not migration files (`creator_count` exists only in `ai_analysis` JSONB,
not as a column — writing it top-level 500s the insert), `group_id` must be in every campaign
`.select()` the accept/escrow flow reads, `saveDraft` needs the crew overrides, `create-notification`
emails only mapped types, grant asymmetry on the definer helpers (`is_active_group_member` stays
anon-executable, the rest revoked). Pages created: [[Creator Groups (Crews)]] (concept) + the raw
session source. Pages updated: index.md (Concepts + Sources), DATABASE_SCHEMA (new tables + `group_id`
+ functions), PROJECT_CONTEXT (workstream bullet). Codex ran 10 rounds (all real findings fixed, 2
false positives pushed back); final clean pass pending the Codex rate-limit reset. RAG sync is
post-merge (post-merge hook on the main ff).

## [2026-07-10] ingest | Schedule / Calendar Agenda-First Simplification
Founder feedback ("schedule calendar not easy to navigate in mobile… need the simplest UX workflow")
→ made scheduling **agenda-first**. Mobile + desktop now default to one scrolling day-by-day list of
upcoming posts — one "＋ Schedule" button, an always-visible "Today", and a tap-the-month "jump to
date" picker (bottom Sheet on mobile, Popover on desktop via `useIsMobile`). Design reframe: *simplest =
the default path, not deleting options* — so the desktop Week/Month/Day grids (drag-to-reschedule
intact) were kept as an **optional toggle**, and the Month grid gained readable post chips instead of
dots. A pure, unit-tested `AgendaItem` model + adapters normalize two data sources ([[Outstand]] `Post`
+ campaign deadlines + sponsorships) into one `AgendaView`. Also fixed the standalone `/calendar`
"＋ Schedule" **silent no-op** (now navigates to the composer) and the campaign review panel's dead-end
(the screenshot: dropped the overlapping timeline, honest conditional header, actionable empty state).
8 TDD tasks (subagent-driven), per-task + whole-branch Opus reviews (44px touch targets, responsive
`variant`, Month-legend gating) and **Codex-clean after one P2** (sponsorship events were dropped from
the agenda → mobile parity restored by reusing `SponsorshipMarkerDetail`). Frontend-only — no schema /
edge / data change. Pages created: [[Schedule Agenda View]] (concept) + the raw session source. Pages
updated: index.md (Concepts + Sources), PROJECT_CONTEXT (workstream bullet). RAG sync + verify-knowledge
run post-merge (the post-merge hook fires on the `main` fast-forward).
