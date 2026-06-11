# Wiki Log

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
