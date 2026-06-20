# Wiki Log

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
