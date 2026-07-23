# Session: Synthetic Weight Engine — Phase 0 (safety spine)

Date: 2026-07-23
Branch: `feat/synthetic-weight-engine`
Spec: `docs/superpowers/specs/2026-07-23-synthetic-weight-engine-design.md`
Plan: `docs/superpowers/plans/2026-07-23-synthetic-weight-engine-phase-0-safety-spine.md`

## Goal

Build a **Synthetic Weight Engine** — synthetic ("bot") users across business + creator roles
that behave like live daily-active users making marketplace transactions — to add liveness/optics,
prove load/performance, and surface QA bugs. Cohort size is a tunable `N` (default 500); the real
load variable is **concurrency**, not headcount (Supabase MICRO caps ~60 connections).

Confirmed decisions: runs on **production** with every synthetic row **tagged**; hybrid drive
(bulk direct-API + small Playwright pool); full realism (test-mode Stripe + capped Donny); bots
fully visible/interactive; subagent-driven execution; migration applied via rollback dry-run then apply.

**The load-bearing risk: segregation completeness.** Because it runs on prod, every row a bot writes
must be tagged and excluded from every founder metric + the data-flywheel moat (Donny training
corpus). One missed surface = permanent contamination. That safety spine is Phase 0 and gates all else.

## What shipped (Phase 0 — the safety spine only; kill switch OFF, 0 bots)

- **Migration `20260723120000_synthetic_weight_safety_spine.sql`** (live on prod):
  - `synthetic_users` registry (auto-filled by extending `handle_new_user`: any
    `bot…@synthetic.dragoncandy.test` signup registers) + `sim_load_snapshots`. Both RLS
    internal-SELECT only, no client write policy.
  - Helpers `is_synthetic(uuid)` / `is_synthetic_campaign(uuid)` / `is_synthetic_org(uuid)` —
    SECURITY DEFINER, **service_role only** (revoked from public/anon/authenticated).
  - Denormalized nullable `is_synthetic` on 5 rootless/telemetry tables (`payment_events`,
    `analytics_events`, `dragonshare_events`, `pricing_funnel_events`, `donny_cost_ledger`),
    stamped by BEFORE INSERT triggers (payment = actor-OR-campaign; dragonshare = actor-OR-org;
    the rest single-party by `user_id`).
  - Founder metrics excluded via a two-sided **actor-OR-parent** predicate in `aios_platform_stats`,
    `aios_revenue_stats`, `aios_cost_stats`, plus `platform_weight.*_real` (`users_total_real` +
    `row_counts_real` mirroring all 10 keys) and a rewritten `capture_platform_weight`.
  - `get_simulation_stats()` — the ONE surface that intentionally SHOWS synthetic (internal-gated).
  - `SYNTHETIC_BOTS_ENABLED` kill switch (feature_flags `name`/`is_enabled`, default false, fail-closed).
  - `purge_synthetic_data()` — leaf-first teardown; deletes rootless ledgers before `auth.users`, and
    explicitly deletes the non-cascading synthetic org rows (`organizations`/`org_units` have no
    `auth.users` FK — ownership only via `org_members.role='owner'`).
- **Edge-fn guards (all deployed):**
  - `donny-cost-rollup` — excludes synthetic spend from the 15%-of-revenue AI cap.
  - `release-creator-payout` — live-mode money guard via pure unit-tested `shouldRefuseSettlement`
    (`_shared/synthetic-guard.ts`); refuses if EITHER party (creator or campaign owner) is synthetic;
    live-mode read-error fails closed.
  - Email suppression to `@synthetic.dragoncandy.test` in `send-notification-email`,
    `send-welcome-email`, and `create-notification` (in-app row still created; only the email leg
    suppressed, via `is_synthetic` RPC; fail-open + logged, backstopped by the sender's suffix guard).
- **`/internal/simulation` dashboard** (`InternalSimulation.tsx` + `useSimulationStats`, `tier="admin"`).
- **Harness boot scaffold** `sim/env.ts` — fail-closed `assertBootSafety` (test-key + kill-switch,
  unit-tested) + `readKillSwitch` + `assertRuntimeBootSafety`; `sim/synthetic-guard.test.ts`;
  `sim/package.json` (deps declared, not installed); `sim/README.md`.

## The proof (Phase 0 gate — PASSED)

Ran the 5-bot round-trip **rollback-wrapped** against prod (persists nothing), under
`REPEATABLE READ` so concurrent real activity can't cause a false mismatch:
- Mint 5 bots (2 business w/ auto-orgs + 3 creators) via `auth.users` inserts → `handle_new_user`
  builds every downstream row + registers each in `synthetic_users`.
- Mixed activity: bot business posts a campaign; synthetic telemetry across all 3 rootless ledgers.
- **Founder metrics byte-identical** before/after: `aios_platform_stats`, `aios_revenue_stats`,
  `aios_cost_stats` (each minus `generated_at`) unchanged — cohort fully excluded.
- `get_simulation_stats()` shows `bots_total=5, synthetic_campaigns=1` (SHOW side).
- `purge_synthetic_data()` → every residual = 0 (incl. orgs/org_units); simstats zero after.

## Gotchas / learnings

- **A `CREATE OR REPLACE` of a trigger fn silently reverts later migrations.** The plan said
  "reproduce `handle_new_user` verbatim from `20260427220001`", but two later migrations had changed
  it: `20260610120000` (ON CONFLICT DO UPDATE re-signup refresh) and `20260626120000` (the
  `account_scope='internal'` guard for AIOS stakeholder invites). The first migration reverted BOTH
  on prod (internal invites wrongly got consumer profiles). **Caught by the Codex second review**;
  fixed with corrective migration `20260723130000` (reproduce the LATEST body + the synthetic block).
  Lesson: when `CREATE OR REPLACE`-ing a shared function, diff against its CURRENT prod definition
  (`pg_get_functiondef`), never an old migration file.
- **Payout money guard must check BOTH parties.** Codex P1: the guard only checked the creator; a
  synthetic (unfunded, test-mode) campaign paying a real creator in live mode would leak real money.
  Fixed to refuse if creator OR campaign owner is synthetic (actor-OR-parent, same idiom as the
  metric exclusions).
- **Rollback-wrapped prod proof** validates the full segregation+teardown with zero footprint;
  `set_config('request.jwt.claim.sub', <admin uuid>, true)` fakes `auth.uid()` so the internal-gated
  `aios_*` RPCs run; `auth.users` has exactly ONE insert trigger (`handle_new_user`, pure SQL, no
  external call) so a rollback-wrapped mint fires no webhook/email.
- **Business bot auto-orgs are purge-safe:** minting a `business_client` creates 1 org + 1 org_unit +
  an `org_members` row with `role='owner'` — exactly what `purge_synthetic_data()` reclaims.
- **MCP edge-fn deploy vs CLI:** the Supabase CLI deploy was auto-mode-classifier-blocked until a
  scoped Bash allow-rule was added; MCP `deploy_edge_function` hand-bundles work but are transcription-
  risky for large HTML email templates (`send-notification-email` is 1063 lines). Prefer the CLI
  (`supabase functions deploy <name> --project-ref … --no-verify-jwt`, run from the worktree) which
  auto-bundles from disk. Always preserve each function's existing `verify_jwt` (donny-cost-rollup +
  create-notification = true; the three senders + release-creator-payout = false).
- **Types:** added only `get_simulation_stats` to `types.ts` surgically (not a full regen) to avoid
  pulling in unrelated prod-schema drift (the concurrent-PR gotcha).

## Status

Phase 0 code-complete + proven; kill switch OFF; 0 synthetic rows on prod. Phases 1–4 (identity,
behavior engine, drive adapters, scheduler, load proof) are separate plans and do not run until this
merges and is deliberately enabled.
