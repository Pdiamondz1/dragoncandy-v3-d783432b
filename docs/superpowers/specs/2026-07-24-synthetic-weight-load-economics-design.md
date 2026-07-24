# Synthetic Weight Engine — Load Proof & Economics Simulation (Phases 2–4)

**Goal:** Measure how the DragonCandy app performs under 50K-DAU-equivalent load and what its real
expenses and revenue are at scale — fast — using the already-live synthetic bot engine, on prod, with
synthetic activity kept out of all real KPIs.

**Architecture:** Extend the live Phase-1 crew-lane harness (`sim/`) with (1) a **cross-tick session
pool** (the keystone — refresh tokens instead of re-minting, which lifts the per-IP auth 429 wall),
(2) a **concurrent load/burst driver** decoupled from the funnel planner, (3) **bulk population
seeding**, (4) **load + economics observability**, and (5) a **paid Stripe-test-mode revenue leg**.
Everything runs on the prod project (`zocahiffooqdybdhguqv`); the compute tier is ramped through the
test to produce a performance-and-cost-per-tier curve; load-test bloat is purged afterward.

**Tech Stack:** Node harness (`sim/`, tsx), Supabase (Postgres + SECURITY DEFINER RPCs, service-role
+ per-bot JWT), Stripe Connect **test mode**, GitHub Actions (dispatch + scheduled), React
`/internal/simulation` dashboard.

---

## 1. Context — what is already built (do not rebuild)

Phase 0 (safety spine) and Phase 1 (crew-lane free-rails engine) are **live on prod**. Confirmed by
reading the code:

- **Safety spine** (`supabase/migrations/20260723131000_synthetic_weight_safety_spine.sql`):
  `synthetic_users` registry auto-populated by `handle_new_user` (email `%@synthetic.dragoncandy.test`
  is the source of truth); `is_synthetic()` / `is_synthetic_campaign()` / `is_synthetic_org()`;
  `is_synthetic` stamp columns + `BEFORE INSERT` triggers on the 5 rootless/telemetry tables
  (incl. `donny_cost_ledger`); `platform_weight.*_real` split; the `aios_platform_stats` /
  `aios_revenue_stats` / `aios_cost_stats` synthetic exclusions; `get_simulation_stats()` (the one
  surface that SHOWS synthetic); `purge_synthetic_data()`; and the `SYNTHETIC_BOTS_ENABLED` kill
  switch (default off). **`sim_load_snapshots` table already exists** (empty).
- **Harness** (`sim/`): `personas.ts`, `mint.ts` (service-role `createUser` + `email_verified`),
  `session.ts` (`mintBotSession` magiclink→verify, now with 429 backoff), `clients.ts`
  (`serviceClient` / `botClient`), `behavior/graph.ts` (**pure** `planDay` + **serial** `runDay` —
  its own comment says "burst is Phase 4"), `behavior/actions.ts` (11 RLS-real crew-lane writes,
  free `fixed_price=0`, no Stripe, no Donny), `cli.ts` (`dry-run|mint|tick|purge`; `makeBotFor`
  already pools sessions **within one tick** but re-mints every tick), `env.ts` (fail-closed boot
  gate: test-Stripe keys + kill switch === true).
- **Dashboard**: `src/pages/internal/InternalSimulation.tsx` exists (reads `get_simulation_stats`).
- **Revenue infra already exists** to drive: `create-campaign-escrow`, `verify-campaign-escrow`,
  `release-creator-payout`, `refund-campaign-escrow` edge functions + `_shared/test-mode-connect.ts`
  + `_shared/test-mode-payment-methods.ts`.

**What this spec adds:** the session pool, the load driver, bulk seeding, the observability writers,
the tier-ramp runbook, and the paid revenue leg + capped Donny. It does **not** touch the safety
spine's contracts.

## 2. Decisions locked in brainstorming

1. **Load target = find-the-ceiling first, then a short soak.** Ramp concurrency until saturation;
   record latency/error/connections + **$/tier**; then soak at the chosen tier for steady-state
   economics. (50K DAU ≈ **~800–1,000 peak concurrent**; ramp to ~1,500 brackets it.)
2. **Revenue = both, phased.** Phase A gives **real costs now** + **modeled** revenue; Phase B adds
   **measured** revenue via real test-mode checkout.
3. **Single track, on prod.** Real users are themselves testers, so no separate clone project — run
   on prod, ramp the prod compute tier through the test, purge the load-test rows afterward. Safety
   spine keeps KPIs clean; kill switch halts within one tick.
4. **Test-mode Stripe only** — enforced by the existing boot gate; never a real charge.

## 3. The keystone — cross-tick session pool

Today `makeBotFor` (`cli.ts:80`) mints a fresh session per bot **every tick** (2 auth calls each).
That is the per-IP 429 wall and it caps both frequency and concurrency. Fix:

- Persist each bot's `{ access_token, refresh_token, expires_at }` to a gitignored on-disk pool file
  (harness-local; tokens are test-account bearer tokens for synthetic users — still treated as
  secrets, never logged/committed). New module `sim/session-pool.ts`.
- On use: if a cached token is unexpired, use it; if expired, **refresh** (`/auth/v1/token?grant_type=refresh_token`,
  one call) instead of re-minting (two calls + rate-limited `generate_link`). Only truly-absent bots
  mint fresh.
- Result: after the first mint, ongoing ticks/bursts cost ~1 refresh per bot per hour, not 2 mints
  per action — which is what makes both frequent ticking (busy) and high-concurrency bursts (load)
  feasible without tripping auth limits.

This is built and tested first; everything else depends on it.

## 4. Phase A — Load + real cost (fast numbers)

### 4a. Bulk population seeding (`sim/seed.ts`, new `bulk-seed` subcommand)
Seed a large believable population fast so browse/feed/search/dashboards look busy and the load
driver has real rows to hit. Service-role `createUser` is rate-limited one-by-one, so bulk-seed via a
**service-role SQL RPC** `seed_synthetic_cohort(p_n, p_cohort, p_creator_split)` that inserts
`auth.users` + lets `handle_new_user` build the downstream rows (or inserts profiles directly and
registers `synthetic_users`), in batches. Default **N=5,000** (~65% creator / 35% business). These
are seeded rows for depth; a smaller **active cohort (300–500)** drives real funnel movement via the
session pool. All rows carry the synthetic tag → excluded from KPIs, purgeable.

### 4b. Load/burst driver (`sim/load/driver.ts`, new `load` subcommand)
A concurrent request generator **separate from `planDay`** (which advances the funnel one stage/tick
and is not a load tool). The driver:
- Draws from the session pool (reused tokens) and fires a configurable **concurrency** of realistic
  **read-heavy** hot-endpoint calls a real DAU makes: campaign browse/search, feed, profile views,
  messages list, dashboard RPCs, a **sampled** write (apply/message). Weighted read:write mirrors real
  usage (~90:10).
- Ramps concurrency in steps (e.g. 50 → 200 → 500 → 1,000 → 1,500), holding each step long enough to
  read steady-state latency, until error rate or latency crosses a saturation threshold = **the
  ceiling** at the current tier.
- Emits a per-step result row; the harness fails loud on unexpected (non-429/503, non-throttle)
  errors, distinguishing *saturation* (expected, the signal) from *breakage* (a bug).

### 4c. Load observability (`capture_sim_load_snapshot()` RPC + harness wiring)
`sim_load_snapshots` exists; add a service-role SECURITY DEFINER RPC that samples
`pg_stat_activity` (active connections), `max_connections`, and `pg_stat_statements` (avg query ms),
plus the driver's measured `error_rate`, and inserts a labeled snapshot. The driver calls it on a
timer during each ramp step. (Confirm `pg_stat_statements` is enabled via `list_extensions` at
kickoff.)

### 4d. Tier-ramp runbook (`docs/runbooks/synthetic-load-tier-ramp.md`)
Operational, founder-gated at each step: run the ceiling ramp at the current tier → record the
saturation point + p95 latency + connection ceiling + **the tier's $/mo (from live Supabase billing)**
→ upgrade prod compute one step → re-run → repeat (MICRO→SMALL→MEDIUM→LARGE, as far as needed to hold
the target). Each resize is a brief prod restart (accepted). Produces the **performance-and-cost-per-
tier curve** — the core deliverable.

### 4e. Real cost readout + modeled revenue
- **Measured expenses:** AI = `sum(donny_cost_ledger.estimated_cost_usd) WHERE is_synthetic` over the
  window; storage = `platform_weight.storage_bytes` delta × Supabase $/GB; compute = the tier $/mo
  (prorated) from 4d.
- **Modeled revenue (Phase A):** projected GMV = active-cohort activity × avg campaign value × take-
  rate ladder. Clearly labeled "modeled," replaced by measured in Phase B.

## 5. Phase B — Measured revenue (real test-mode money) + full economics

### 5a. Paid bot-to-bot campaigns (extend `behavior/actions.ts` + `graph.ts`)
A **fraction** of synthetic campaigns become **paid** (`fixed_price > 0`, a realistic spread) instead
of free crew campaigns. For those, the bot business funds escrow through the **real**
`create-campaign-escrow` (test-mode card via `test-mode-payment-methods.ts`), the bot creator
completes, and `release-creator-payout` pays out (test-mode Connect). Still **bot-to-bot only**. The
platform take-rate lands in `payment_events` (auto-stamped `is_synthetic`), so:
- **Measured revenue** = `sum(platform_fee) on synthetic payment_events` = real take-rate on synthetic
  GMV.
- Payout guard: `release-creator-payout` already no-ops without a `stripe_account_id`; synthetic
  creators get test-mode Connect accounts only. No real transfer is possible.

### 5b. Capped Donny AI (sampled)
A small sampled fraction of campaign creations use `donny-campaign-generate`; Donny chat sampled — to
put realistic AI cost on the ledger. Hard **daily synthetic-AI USD ceiling** enforced in the harness
(re-read each tick); synthetic spend is already excluded from the real 15% cap by the spine, so bots
can never throttle the real platform.

### 5c. Economics RPC + dashboard (`get_simulation_economics()` + extend `InternalSimulation.tsx`)
A new internal-gated SECURITY DEFINER RPC returning the **synthetic** economics (mirrors the `aios_*`
shape but for `is_synthetic` rows): GMV, platform fee (revenue), payouts, AI/infra/storage cost,
active-user count, and the derived unit economics — **revenue/active-user, cost/active-user,
contribution margin** — plus the latest `sim_load_snapshots` summary. The dashboard renders the
tier×concurrency performance curve and the economics table side by side. This is the readable
deliverable.

### 5d. Purge-after
After the run, `purge_synthetic_data()` clears the load-test bloat; assert zero residue and
`row_counts_real == row_counts` (the existing teardown proof). The persistent "busy" cohort can be
kept or purged per founder choice.

## 6. Safety (unchanged contracts + additions)

- **Kill switch** gates every network subcommand (existing boot gate); flipping
  `SYNTHETIC_BOTS_ENABLED` off halts within one tick.
- **Test-Stripe-only** boot assertion (existing) — refuses a live key.
- **Synthetic tagging** is automatic (email → registry → `is_synthetic`); every KPI surface already
  excludes it; the load/economics readouts are the deliberate SHOW surfaces (`get_simulation_*`).
- **Daily synthetic-AI USD ceiling** (new, Phase B) caps runaway AI spend independent of the real cap.
- **Session-pool file** is gitignored and treated as secret material.
- **Teardown proof** unchanged — purge to zero residue.

## 7. Files

**New:** `sim/session-pool.ts` (+ test), `sim/seed.ts` (+ test), `sim/load/driver.ts` (+ test),
`docs/runbooks/synthetic-load-tier-ramp.md`, migration
`supabase/migrations/<ts>_sim_load_economics_rpcs.sql` (`seed_synthetic_cohort`,
`capture_sim_load_snapshot`, `get_simulation_economics`).
**Modified:** `sim/cli.ts` (+`bulk-seed`,`load` subcommands; session pool wired into `makeBotFor`),
`sim/behavior/actions.ts` + `graph.ts` (paid-campaign leg + sampled Donny, Phase B),
`src/pages/internal/InternalSimulation.tsx` (load curve + economics), `.github/workflows/synthetic-weight.yml`
(dispatch inputs for `bulk-seed`/`load`).
**Reuse (no change):** the safety spine migration, `create-campaign-escrow` / `release-creator-payout`
/ `verify-campaign-escrow`, `test-mode-*` shared modules, `personas.ts`, `mint.ts`, `env.ts`.

## 8. Verification

- **Session pool:** a second tick reuses tokens (0 fresh mints, only refreshes) — asserted in a test
  with a fake auth server; no 429 under rapid re-tick.
- **Segregation (the critical test, unchanged):** snapshot every `aios_*` RPC + `platform_weight.*_real`
  before a run; after seeding 5,000 + a load run + economics, the **real** numbers are byte-identical
  while `get_simulation_*` shows the synthetic activity.
- **Load:** `sim_load_snapshots` shows connection saturation at the ceiling; after a tier upgrade the
  latency/error curve improves — captured per tier.
- **Money safety:** boot gate rejects `sk_live_`; no synthetic `payment_events` with a real charge; no
  real Connect transfer.
- **Economics:** `get_simulation_economics()` GMV × take-rate reconciles with `sum(platform_fee)` on
  synthetic `payment_events`; unit economics computed at each tier.
- **Teardown:** purge → zero residue + `row_counts_real == row_counts`.
- **Gates:** `npm run build`, `npm run typecheck`, `npm run test`, edge-function-reviewer +
  data-exposure-reviewer on every new/changed RPC/edge fn, Codex second review before each PR.

## 9. Tunables (defaults; adjust at kickoff)

Seed N = 5,000 (65/35). Active cohort = 300–500. Ramp concurrency = 50→1,500. Tiers =
MICRO→SMALL→MEDIUM→LARGE. Paid-campaign fraction (Phase B) ≈ 30%, `fixed_price` spread realistic.
Donny fraction ≤ 10% of creations + daily synthetic-AI USD ceiling. Read:write ≈ 90:10.

## 10. Open questions / risks

- **Concurrency vs the harness runner.** One GitHub runner may not push 1,500 concurrent requests
  from a single process/IP; may need a runner matrix or a local high-concurrency run. Resolve at
  Phase A build (measure single-runner ceiling first).
- **`pg_stat_statements`** must be enabled for avg-query-ms (confirm at kickoff; degrade gracefully if
  absent).
- **Prod compute resize** during the ramp restarts the DB briefly and may interrupt the daily cron —
  schedule ramps off the 14:00 UTC tick.
- **Bulk-seed via SQL** must still fire the synthetic tagging path (register every seeded user in
  `synthetic_users`) or teardown/exclusion leaks — verify in the seed test.
