# Session — Synthetic Weight Engine, Phase 1 (private crew lane)

Date: 2026-07-23
Branch: `feat/synthetic-weight-phase-1`
Plan: `docs/superpowers/plans/2026-07-23-synthetic-weight-engine-phase-1-crew-lane.md`
Builds on: Phase 0 safety spine (PR #327 / `5d66baa1`).

## What shipped

The first live-cohort behavior engine for the Synthetic Weight Engine, entirely in the `sim/`
Node harness — **no DB migrations, no edge-function changes**. It mints a real N=25 cohort
(≈65% creators / 35% Hoboken restaurants) on prod and drives the full **free-rails** marketplace
funnel **inside private crews** so bots only ever interact with bots.

New harness files: `sim/personas.ts` (deterministic curated-pool + seeded-PRNG cohort),
`sim/clients.ts` (service-role + bot-JWT client factory), `sim/mint.ts` (synthetic-only mint +
cohort/persona stamp + `readCohort`), `sim/session.ts` (per-bot magiclink→verify session),
`sim/types.ts` (cohort state + `Action` union), `sim/behavior/actions.ts` (RLS-real executors),
`sim/behavior/graph.ts` (`planDay` pure planner + `runDay` serial executor), `sim/run.ts` +
`sim/cli.ts` (boot-gated `dry-run`/`mint`/`tick`/`purge`), `sim/tsconfig.json` (harness type gate),
and `.github/workflows/synthetic-weight.yml` (dormant, `workflow_dispatch`-only scheduler).
40 unit tests; app + sim typecheck clean; production build clean.

## Key decisions

- **Private crew lane** (founder-chosen over a public-marketplace lane): crew campaigns
  (`group_id` set) are visible only to member bots and are never broadcast, so real users can't
  see or apply — **guaranteed isolation with zero new metric-exclusion surfaces**. Trade-off:
  no public liveness yet (a later, deliberate phase). The behavior planner has a hard invariant +
  test that it never creates a public (`group_id IS NULL`) campaign.
- **Every marketplace write is RLS-real, as the bot** (per-bot JWT via `mintBotSession`, the
  `staging-login.mjs` pattern adapted to prod synthetic users). Service-role is used ONLY for
  minting, `email_verified`, cohort reads, and teardown. The happy-path content funnel uses direct
  RLS writes, **not** the service-role-only `transition_content_status` RPC.
- **No bot ever sends an outbound email:** `record_crew_activity` is called RPC-only (never the
  frontend `create-notification` leg). `uploadDeliverable` writes a metadata-only `file_uploads`
  row (no storage object) so teardown stays fully covered by `purge_synthetic_data`.
- **Go-live is two deliberate switches, never a merge:** merging leaves prod byte-unchanged
  (harness + dormant workflow; kill switch OFF). Task 8 (founder-gated live smoke: flip
  `SYNTHETIC_BOTS_ENABLED` on → `mint --n 5` → `tick`s → assert `aios_*` metrics unchanged +
  `get_simulation_stats` shows the cohort → `purge` → zero residue) is parked for the founder's
  `SIM_*` secrets + kill-switch authorization. Enabling the daily cron is the second switch.

## Verified live against prod (read-only / rollback-wrapped)

- `handle_new_user` reads `role`/`full_name`, derives `business_profiles.account_type` from role,
  does NOT set `email_verified`, and registers `synthetic_users` with **only** `user_id` → so
  `mintBot` sets `email_verified` and stamps `cohort`+`persona` itself.
- The real funnel writes (the plan reviewer's Task 4 corrections were all TRUE): hire =
  `accept_application_with_collaboration` (which itself sets the app `accepted` + creates the
  collab `ON CONFLICT DO NOTHING` + accepts an already-`accepted` app → so hire is one atomic,
  idempotent RPC); submit = direct `content_status='submitted'`; completion = dual-party
  `useProjectComplete` (crew campaigns skip payout); review `review_type` ∈
  `business_to_creator`/`creator_to_business`.
- **Teardown holds for crews** (the gap Phase 0's non-crew proof left): a rollback-wrapped test
  minted a synthetic business + crew + crew campaign, then `purge_synthetic_data()` returned
  `purged_users:1` with **every residual 0** — the `campaigns.group_id → creator_groups` RESTRICT
  does not bite because the campaign cascades (via `user_id → profiles`) before its crew.
- `file_uploads` has no NOT-NULL-without-default columns; no status-transition guard trigger on
  `campaign_collaborations` blocks the `active→completed` finalize (triggers are updated_at,
  revision-limit, single-slot, content-submitted-at only).

## Reviews

- **Plan-document review:** approved the safety spine/structure; flagged Task 4's funnel-action
  mappings — all verified TRUE and corrected in the plan before coding (hire/submit/completion,
  email-attribution).
- **Spec-compliance review:** all Task 1–7 deliverables complete + faithful; runtime-shape items
  all verified clean (RPC param names, insert shapes).
- **Code-quality review:** three safety invariants confirmed; no blocking issues; two "Important"
  resilience fixes applied — (1) `hire` made a single atomic idempotent RPC (dropped the redundant
  non-atomic pre-accept); (2) `planCollaboration` re-drives a no-op'd finalize so a collaboration
  can never wedge silently between "both requested" and "completed" (+regression test).
- **Codex second review:** (run against `origin/main` at branch finish).

## Recurring lessons

- With 30+ worktrees, migration-timestamp prefixes collide (see the collision memory); Phase 1
  avoided this by adding no migrations.
- Verify a reviewer's claim before accepting OR dismissing: the plan reviewer's Task 4 findings
  were real; two of the spec reviewer's RPC-param concerns were false alarms (already verified
  from source). Output is a lead, not a verdict.
