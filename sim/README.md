# Synthetic Weight Engine — harness (`sim/`)

Generates and drives synthetic ("bot") users on **production** to add liveness/optics,
prove load/performance, and surface QA bugs — **without** contaminating the data-flywheel
moat or founder-facing `/internal` metrics.

> **Phase 0 (this branch) ships the *safety spine* only.** No bots are minted by default,
> nothing runs on a schedule, and the master kill switch is **OFF**. Phases 1–4 (identity,
> behavior engine, drive adapters, scheduler, load proof) are separate plans and do not run
> until this spine is merged, verified, and deliberately enabled.

Spec: `docs/superpowers/specs/2026-07-23-synthetic-weight-engine-design.md`
Plan: `docs/superpowers/plans/2026-07-23-synthetic-weight-engine-phase-0-safety-spine.md`

---

## The safety spine (what's live after this branch)

Everything a bot writes is tagged at the **DB layer** and excluded from every founder
metric + the training corpus. The tag cannot be "forgotten" by the harness because the
**email is the source of truth**.

| Mechanism | Where |
|---|---|
| Every bot email is `bot…@synthetic.dragoncandy.test` | harness (mint) |
| Auto-registered into `public.synthetic_users` by the existing `handle_new_user` trigger | migration |
| `is_synthetic(uuid)` / `is_synthetic_campaign(uuid)` / `is_synthetic_org(uuid)` helpers (service-role only) | migration |
| Denormalized `is_synthetic` flag on 5 rootless/telemetry tables, stamped by `BEFORE INSERT` triggers (`payment_events`, `analytics_events`, `dragonshare_events`, `pricing_funnel_events`, `donny_cost_ledger`) | migration |
| Founder metrics exclude synthetic via a **two-sided actor-OR-parent** predicate (`aios_platform_stats`, `aios_revenue_stats`, `aios_cost_stats`, `platform_weight.*_real`, `donny-cost-rollup`) | migration + edge fn |
| Live-mode money guard — never settle real money to a synthetic creator (`shouldRefuseSettlement`, unit-tested; live-mode fail-closed) | `release-creator-payout` + `_shared/synthetic-guard.ts` |
| Email suppression to `@synthetic.dragoncandy.test` recipients (protects sender reputation) | `send-notification-email`, `send-welcome-email`, `create-notification` |
| `get_simulation_stats()` — the ONE surface that intentionally SHOWS synthetic (founder `/internal/simulation` dashboard) | migration + `src/pages/internal/InternalSimulation.tsx` |
| `purge_synthetic_data()` — leaf-first teardown to zero residue, incl. the non-cascading org rows | migration |
| Master kill switch `SYNTHETIC_BOTS_ENABLED` (feature_flags, **default false**, fail-closed) | migration |

---

## Fail-closed boot safety (`sim/env.ts`)

Every harness action MUST call `assertRuntimeBootSafety(client)` first. It refuses to run unless:

1. `SIM_STRIPE_SECRET_KEY` starts with `sk_test_` **and** `SIM_STRIPE_PUBLISHABLE_KEY` starts
   with `pk_test_` (a live key throws — synthetic flows are **test-mode Stripe only**), and
2. `SYNTHETIC_BOTS_ENABLED` reads back **exactly `true`** from `feature_flags`. `false`, a
   missing row, or any read error → `null` → **refuse** (never default to "on").

`assertBootSafety(...)` is a pure, unit-tested predicate (`sim/env.test.ts`); the network
readers (`readKillSwitch`, `assertRuntimeBootSafety`) wrap it. Run the unit tests:

```bash
npx vitest run sim/            # 6 passed (env.test.ts + synthetic-guard.test.ts)
```

---

## Phase 0 proof — segregation + teardown (reproducible)

The spine was proven end-to-end on a **5-bot round-trip**, executed **rollback-wrapped**
against prod (persists nothing) under `REPEATABLE READ` so concurrent real activity cannot
cause a false mismatch. The proof asserts, in one transaction:

- **Mint** 5 bots (2 business w/ auto-orgs + 3 creators) via `auth.users` inserts → the
  `handle_new_user` trigger builds every downstream profile/org row and registers each in
  `synthetic_users`.
- **Mixed activity**: a bot business posts a campaign; synthetic rows land in
  `analytics_events` / `payment_events` / `donny_cost_ledger`.
- **Founder metrics byte-identical** before vs. after: `aios_platform_stats`,
  `aios_revenue_stats`, and `aios_cost_stats` (each minus its `generated_at`) are unchanged
  — the cohort is fully excluded.
- **SHOW side**: `get_simulation_stats()` reports `bots_total = 5`, `synthetic_campaigns = 1`.
- **Teardown**: `purge_synthetic_data()` returns **every** residual = 0 (incl. `orgs` /
  `org_units`), and `get_simulation_stats()` reads all-zero afterward.
- `ROLLBACK` — prod carries zero synthetic footprint.

The proof SQL is the canonical validation; it is safe to re-run (rollback-wrapped) any time
the spine changes. See the session log / wiki concept `synthetic-weight-engine` for the full
script. `auth.users` has exactly one insert trigger (`handle_new_user`, pure SQL — no external
call), so a rollback-wrapped mint fires no webhook/email.

**Live teardown** (when real synthetic rows exist): delete synthetic storage objects via the
Storage API first (direct `storage.objects` deletes are blocked by `protect_delete()`), then
`select purge_synthetic_data();` — assert the returned report is all-zero.

---

## Safety preconditions (before ever minting on prod)

- `SYNTHETIC_BOTS_ENABLED` deliberately flipped **on** (two-switch launch, mirrors DRE).
- Harness environment carries **test** Stripe keys only (`SIM_STRIPE_*` = `sk_test_`/`pk_test_`).
- Cohort size `N` and concurrency are tunables; **concurrency** (not headcount) is the load
  variable — Supabase MICRO caps at ~60 connections.
- Kill switch is re-read before every tick; flipping it off halts within one tick.
- Teardown (`purge_synthetic_data()` + storage) verified to zero residue.

---

## Phase 1+ scaffolding (not built yet)

- `sim/package.json` declares the intended harness deps (`@supabase/supabase-js`,
  `@faker-js/faker`) — **not installed** in Phase 0 (the spine + proof need neither).
- Planned: `mintBots.ts` (service-role `auth.admin.createUser` with `email_confirm` +
  `profiles.email_verified = true`), a per-bot daily behavior graph over the real
  content-delivery state machine, a direct-API drive adapter + a small Playwright pool for
  real test-mode Stripe checkout, and a scheduled GitHub Actions runner.
- Bots interact only with bots (keeps real users' history clean and teardown simple).
