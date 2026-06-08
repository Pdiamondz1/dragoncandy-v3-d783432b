# Wiki Log

## [2026-06-08] ingest | Weekly Sync — Outstand Webhook, Analytics RLS, Type Fixes

Automated maintenance ingest closing the gap since 2026-06-07. Three workstreams
captured: (1) Outstand publish webhook (`outstand-webhook` edge function #74)
closes the `donny_scheduled_posts` lifecycle `scheduled → published/failed` in real
time via HMAC-signed Outstand events; (2) analytics events anon RLS fix — logged-out
visitors were silently dropping flywheel data, resolved with a `user_id IS NULL`
INSERT policy; (3) DB/type patches — invalid `'withdrawn'` enum literal in
`get_user_conversations`, block/report RPC types, Vitest Deno exclusion.
Core-doc counts corrected: 73 → 74 edge functions, 60 → 63 pages, 183 → 185 hooks.
Pages created: [[Weekly Sync Session (2026-06-08)]] (source).
Pages updated: [[Outstand]] (publish webhook section), [[Donny AI]] (lifecycle closed),
[[Supabase]] (count, anon RLS note, new audit table, enum fix), [[DragonCandy Platform]]
(scale 63/185/74), [[Data Flywheel]] (anon event gap note);
index.md (1 new source entry). Also synced `CLAUDE.md` (73→74, ×2) and
`PROJECT_CONTEXT.md` (scale 63/185/74, §5 Outstand webhook, §10 73→74).

## [2026-06-08] update | Capacitor Phase 3 + hook count correction

Follow-up pass from the same sync session: (1) updated [[Capacitor Native Shell]] to
document Phase 2 native share sheet, Phase 3 iOS CTA gating (`WebOnly`), and
block/report feature — all shipped on this branch but missing from the entity.
(2) hooks count corrected 185 → 192 (docs:scale on current branch state) in
[[DragonCandy Platform]] and `PROJECT_CONTEXT.md`. No new source pages (already
covered by [[Weekly Sync Session (2026-06-08)]]).

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
