---
title: Synthetic Weight Engine
type: concept
created: 2026-07-23
updated: 2026-07-23
sources: [2026-07-23-synthetic-weight-engine-phase-0.md, 2026-07-23-synthetic-weight-engine-phase-1.md]
tags: [synthetic, bots, load-testing, segregation, safety-spine, aios, metrics, teardown]
---
# Synthetic Weight Engine

A system for minting synthetic ("bot") users across business + creator roles that behave like live
daily-active users making marketplace transactions — to add **liveness/optics**, prove **load/
performance**, and surface **QA bugs**. Cohort size is a tunable `N` (default 500); the real load
variable is **concurrency**, not headcount (Supabase MICRO caps ~60 connections, so scale is proven
by pressuring connections under burst, not by transaction count).

It runs on **production**, so its defining constraint is **segregation completeness**: every row a bot
writes must be tagged and excluded from every founder metric and the data-flywheel moat (Donny's
training corpus). One missed surface = permanent contamination. That safety spine is **Phase 0** and
gates everything else. Phase 0 shipped 2026-07-23 (`feat/synthetic-weight-engine`); **Phase 1** (the
private-crew behavior engine, below) followed on `feat/synthetic-weight-phase-1`. The kill switch is
**OFF** and there are **0 bots**, so both phases are present but inert.

## Architecture — the safety spine

Tagging is done at the **DB layer** so the harness cannot "forget" it:

- **Email is the source of truth.** Every bot is minted with `bot…@synthetic.dragoncandy.test`. The
  existing `handle_new_user` trigger is extended to auto-register any such signup into
  `public.synthetic_users` (registry: `user_id` PK → `auth.users` ON DELETE CASCADE, `cohort`,
  `persona`).
- **Helpers** (SECURITY DEFINER, **service-role only**): `is_synthetic(uuid)` (in-registry),
  `is_synthetic_campaign(uuid)` (campaign owner), `is_synthetic_org(uuid)` (org owner via
  `org_members.role='owner'`).
- **Denormalized `is_synthetic boolean`** (nullable) on the 5 rootless/telemetry tables that can't be
  traced to a single user FK — `payment_events`, `analytics_events`, `dragonshare_events`,
  `pricing_funnel_events`, `donny_cost_ledger` — stamped by `BEFORE INSERT` triggers. This is the
  column a future LoRA export keys on.
- **Exclusion — the two-sided actor-OR-parent predicate.** A row is excluded from a founder metric iff
  a synthetic actor **OR** a synthetic parent/counterparty is involved — never a single FK. Applied
  in `aios_platform_stats` / `aios_revenue_stats` / `aios_cost_stats`, `capture_platform_weight`'s
  `row_counts_real`, and the edge-fn `donny-cost-rollup`. Compounds the same discipline as
  [[Service-Role Data Exposure]] (server-side re-assertion of the intended scope).
- **Kill switch** `SYNTHETIC_BOTS_ENABLED` (feature_flags `name`/`is_enabled`, default false,
  **fail-closed** — the harness refuses to run unless it reads back exactly `true`; mirrors the DRE
  two-switch launch, see [[Dragon Rewards Engine (DRE)]]).
- **Money guard** (`release-creator-payout` + pure `_shared/synthetic-guard.ts`): never settle real
  money to/from a synthetic user; refuses live-mode settlement if **either** the creator or the
  campaign owner is synthetic; a `synthetic_users` read error in live mode fails **closed**. Bots use
  test-mode Stripe only (see [[Test-Mode Stripe UX]]).
- **Email suppression** to bot addresses in `send-notification-email` / `send-welcome-email` /
  `create-notification` (the in-app row is still written; only the outbound Resend leg is suppressed,
  backstopped by the sender's own suffix guard — see [[Notification delivery choke point]]).
- **SHOW side:** `get_simulation_stats()` (internal-gated) + the `/internal/simulation` founder
  dashboard is the ONE surface that intentionally shows synthetic. `platform_weight`'s **physical**
  fields (`db_bytes`/`storage_bytes`) and count **totals** deliberately include synthetic (bots use
  real disk/rows/connections — that's the load-proof); the parallel `*_real` columns carry the
  synthetic-excluded growth view, and `/internal/weight` shows the total with a "real" subcount.
- **Teardown:** `purge_synthetic_data()` (service-role only, leaf-first) deletes the rootless ledgers
  **before** `auth.users` (so `ON DELETE SET NULL` links aren't lost) and explicitly deletes the
  **non-cascading** synthetic org rows (`organizations`/`org_units` have no `auth.users` FK — ownership
  is only via `org_members.role='owner'`).

## The Phase 0 proof (segregation + teardown)

Validated on a 5-bot round-trip run **rollback-wrapped** against prod (persists nothing), under
`REPEATABLE READ` so concurrent real activity can't cause a false mismatch: mint 5 bots (2 business
w/ auto-orgs + 3 creators) → mixed real↔bot activity → the real `aios_*` RPCs are **byte-identical**
before/after (minus `generated_at`) → `get_simulation_stats` shows the cohort → `purge_synthetic_data()`
returns **every residual = 0** → ROLLBACK. Reproducible any time the spine changes. Enablers:
`set_config('request.jwt.claim.sub', <admin uuid>, true)` fakes `auth.uid()` so the internal-gated RPCs
run (see [[Testing auth.uid() RPCs and RLS on prod]]); `auth.users` has exactly one insert trigger
(`handle_new_user`, pure SQL, no external call) so a rollback-wrapped mint fires no webhook/email.

## Phase 1 — the private-crew behavior engine

The first live-cohort engine, entirely in the `sim/` harness — **no DB migrations, no edge-function
changes** (it only *uses* the Phase 0 spine + existing crew/content/review RPCs). It mints a real
N=25 cohort (≈65% creators / 35% Hoboken restaurants) and drives the full **free-rails** funnel
**inside private crews** so bots only ever interact with bots.

- **Isolation is structural.** Crew campaigns (`group_id` set) are visible only to member bots via
  the `campaigns` SELECT RLS and are never broadcast — real users literally can't see or apply. The
  chosen lane (over a public-marketplace lane) needs **zero new metric-exclusion surfaces**; the pure
  planner has a hard invariant + test that it never creates a public (`group_id IS NULL`) campaign.
- **Every marketplace write is RLS-real, as the bot** (a per-bot JWT minted via the `staging-login`
  magiclink→verify pattern, adapted to prod synthetic users). Service-role is used ONLY for minting,
  `email_verified`, cohort reads, and teardown. The content funnel uses **direct RLS writes**, not the
  service-role-only `transition_content_status` RPC.
- **Funnel** (one stage advanced per tick, so a fresh cohort drains over several ticks and a steady
  cohort keeps flowing): crew → invite → accept → post free crew campaign → apply →
  hire (one atomic `accept_application_with_collaboration` RPC) → upload (metadata-only `file_uploads`,
  no storage object) → submit → **dual-party completion** (both parties request; the 2nd flips to
  `completed`; crew campaigns skip payout) → review → repeat. `record_crew_activity` is RPC-only (no
  `create-notification` leg) so **a bot never triggers an outbound email**.
- **Teardown holds for crews** (the gap Phase 0's non-crew proof left): `purge_synthetic_data()`
  leaves zero residue even with a crew campaign present — the `campaigns.group_id → creator_groups`
  RESTRICT does not bite because the campaign cascades (via `user_id → profiles`) before its crew
  (verified rollback-wrapped on prod). See [[Content Delivery State Machine]] for the funnel it drives.
- **Go-live is two deliberate switches, never a merge.** Merging leaves prod byte-unchanged (harness +
  a dormant `workflow_dispatch`-only workflow; kill switch OFF). Task 8 (founder-gated live smoke:
  flip `SYNTHETIC_BOTS_ENABLED` on → `mint --n 5` → `tick`s → assert `aios_*` metrics unchanged +
  `get_simulation_stats` shows the cohort → `purge` → zero residue) is parked for the founder's
  `SIM_*` secrets + kill-switch authorization; enabling the daily cron is the second switch.

### Phase 1 gotchas learned

- **`file_uploads` needs `bucket_name`/`filename`/`original_filename`/`mime_type`** (all NOT NULL, no
  default) beyond `file_path`/`file_size`/`uploaded_by` — the Codex second review caught the missing
  four (every `uploadDeliverable` would 23502 and wedge the funnel). A multi-statement `execute_sql`
  schema check had silently returned only its last result set, hiding this (see
  [[MCP execute_sql returns only the LAST statement's result]]).
- **GitHub Actions script-injection:** workflow inputs must pass through `env:` vars, never be
  interpolated into a `run:` shell that holds secrets (Codex P1).
- **`hire` is one atomic RPC** — `accept_application_with_collaboration` itself sets the app
  `accepted` + creates the collab `ON CONFLICT DO NOTHING` + accepts an already-`accepted` app, so a
  manual pre-accept is redundant and only adds a non-atomic wedge window.

## Known issues / gotchas

- **`CREATE OR REPLACE` of a shared trigger fn silently reverts later migrations.** The plan said
  "reproduce `handle_new_user` from `20260427220001`", but two later migrations had changed it
  (`account_scope='internal'` guard for [[AIOS Stakeholder Invites]]; `ON CONFLICT DO UPDATE`
  re-signup refresh). The first spine migration reverted both on prod. **Always diff a shared function
  against its CURRENT prod definition (`pg_get_functiondef`), never an old migration file.** Fixed by
  corrective migration `20260723132000`.
- **Apply actor-OR-parent to EVERY party of a multi-party table.** Two rounds of Codex review caught
  single-party predicates: the payout guard (creator only → creator + campaign owner) and the
  `messages` count (`sender_id` only → sender + recipient). `dragonshare_boosts` correctly checks all
  three of its parties. When counting or gating a table with more than one participant, enumerate them
  all.
- **Codex earned four fixes across three rounds** — the mandatory second reviewer is high-value on a
  segregation guarantee where a single missed surface breaks the moat.
- **Physical vs growth counts are different questions.** `platform_weight` deliberately keeps
  synthetic-inclusive totals (scaling: real disk/rows) AND `*_real` (growth). Don't "fix" a scaling
  surface to `*_real` — it would undercount real load.
- **MCP hand-bundle vs CLI for edge-fn deploys.** MCP `deploy_edge_function` hand-bundles are
  transcription-risky for large HTML email templates (`send-notification-email` is 1063 lines); prefer
  `supabase functions deploy <name> --project-ref … --no-verify-jwt` from the worktree (auto-bundles
  from disk). Always preserve each function's existing `verify_jwt`.

## See Also
- [[Service-Role Data Exposure]] — the same "re-assert the intended scope server-side" discipline.
- [[AIOS runtime spend source of truth]] — `donny_cost_ledger` / the 15% AI cap the synthetic
  exclusion protects.
- [[Testing auth.uid() RPCs and RLS on prod]] — the rollback + `set_config` technique the proof uses.
- [[AIOS Stakeholder Invites]] — the `account_scope='internal'` guard the corrective migration restored.
