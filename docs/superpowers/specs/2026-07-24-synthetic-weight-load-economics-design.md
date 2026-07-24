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

> **Revision note (2026-07-24, post spec-review):** first draft hand-waved the revenue leg and
> silently reversed the foundational spec's "saturate only on a clone" safety design. This revision
> makes **Phase A** (load + real cost + *modeled* revenue) the fast, fully-specified committed
> deliverable, and scopes **Phase B** (measured revenue) honestly — its payment-settlement path is an
> explicit open fork, decided at the A/B boundary, because it means new payment code on prod.

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
- **Harness** (`sim/`): `personas.ts`, `mint.ts` (service-role `auth.admin.createUser` +
  `email_verified`), `session.ts` (`mintBotSession` magiclink→verify → `{access_token, refresh_token,
  expires_in}`, with 429 backoff), `clients.ts` (`serviceClient` / `botClient`), `behavior/graph.ts`
  (**pure** `planDay` + **serial** `runDay` — its own comment says "burst is Phase 4"),
  `behavior/actions.ts` (11 RLS-real crew-lane writes, free `fixed_price=0`, no Stripe, no Donny).
  **`run.ts`** holds the entrypoint logic and the subcommand handlers, incl. `makeBotFor` (`run.ts:80`)
  which already pools sessions **within one tick** but re-mints every tick; **`cli.ts`** is a thin
  wrapper that imports `main` from `run.ts`. `env.ts` = fail-closed boot gate (test-Stripe keys +
  kill switch === true).
- **Dashboard**: `src/pages/internal/InternalSimulation.tsx` exists (reads `get_simulation_stats`).
- **Revenue infra that exists but is NOT headlessly drivable as-is:** `create-campaign-escrow`
  creates a **hosted Stripe Checkout Session** (returns a `url`); escrow flips to `held` only via
  `stripe-webhook`'s `checkout.session.completed` — i.e. it needs a **browser** to complete the hosted
  page. `_shared/test-mode-payment-methods.ts` only restricts `payment_method_types` to `['card']`
  (not a charging helper). `release-creator-payout` / `verify-campaign-escrow` /
  `refund-campaign-escrow` + `_shared/test-mode-connect.ts` exist. See §5 for how the revenue leg
  actually settles.

**What this spec adds:** the session pool, the load driver, bulk seeding, the observability writers,
the tier-ramp runbook, and (Phase B) the paid revenue leg + capped Donny. It does **not** touch the
safety spine's contracts.

## 2. Decisions locked in brainstorming (+ reconciliations)

1. **Load target = find-the-ceiling first, then a short soak.** Ramp concurrency until the
   **saturation knee** — clear, sustained latency/error degradation — **not a true outage** (see §4b
   for why the knee, not the wall). Record latency/error/connections + **$/tier**; then soak at the
   chosen tier for steady-state economics. (50K DAU ≈ **~800–1,000 peak concurrent**; ramp to ~1,500
   brackets it.)
2. **Revenue = both, phased.** Phase A gives **real costs now** + **modeled** revenue; Phase B adds
   **measured** revenue via a real test-mode payment path (settlement mechanism = §5 fork).
3. **Single track, on prod — explicitly reversing the foundational spec's "saturate only on a clone"
   mitigation.** The foundational spec (§8/§14) mandated a hard reserved-headroom ceiling and a
   separate clone for any true saturation test, to protect real users. We override that here because
   the ~30 "real" users are themselves testers and this is pre-launch — so we run on prod, ramp the
   prod compute tier through the test, and purge afterward. **Owned consequence:** during each
   saturation window the app (and `/internal`, the daily 14:00 cron, and the observability RPCs
   themselves) degrade for everyone; we ramp only to the knee, pin runs to the lowest-traffic slot,
   and never during the 14:00 tick. Safety spine still keeps KPIs clean; kill switch still halts
   within one tick.
4. **Test-mode Stripe only** — enforced by the existing boot gate; never a real charge.

## 3. The keystone — cross-tick session pool (`sim/session-pool.ts`, new)

Today `makeBotFor` (`run.ts:80`) mints a fresh session per bot **every tick** (2 auth calls each).
That is the per-IP 429 wall and it caps both frequency and concurrency. Fix:

- Persist each bot's session to a **gitignored** on-disk pool file (harness-local; these are bearer
  tokens for synthetic test accounts — still treated as secrets, never logged/committed). Store
  `{ access_token, refresh_token, expires_at }` where **`expires_at` is derived** at mint time as
  `now + expires_in` (`mintBotSession` returns `expires_in`, a duration — not `expires_at`).
- On use: unexpired token → use it; expired → **refresh** (`/auth/v1/token?grant_type=refresh_token`,
  one call) instead of re-minting (two calls + the rate-limited `generate_link`). Only truly-absent
  bots mint fresh.
- Result: after the first mint, ongoing ticks/bursts cost ~1 refresh per bot per hour, not 2 mints
  per action — which makes both frequent ticking (busy) and high-concurrency bursts (load) feasible
  without tripping auth limits. Wire it into `makeBotFor`.

Built and tested first (fake-auth-server test asserts a second tick does **0 fresh mints**, only
refreshes); everything else depends on it.

## 4. Phase A — Load + real cost (fast numbers, the committed deliverable)

### 4a. Bulk population seeding (`sim/seed.ts`, new `bulk-seed` subcommand)
Two distinct populations, because seeding method depends on whether the bot must **act**:
- **Active cohort (300–500)** — must authenticate (magiclink→verify) to drive real funnel movement,
  so it is minted through the **existing `mint.ts` / `auth.admin.createUser` path** (GoTrue creates
  the `identities`/instance rows that make sessions work). Rate-limited, but only hundreds.
- **Depth cohort (default ~5,000)** — exists only to make browse/feed/search/dashboards look
  populated; **never authenticates**. Seed via a service-role SECURITY DEFINER RPC
  `seed_synthetic_cohort(p_n, p_cohort, p_creator_split)` that inserts, per bot, an `auth.users` row
  **and** its `profiles` + `creator_profiles`/`business_profiles` **and** the `synthetic_users`
  registry row, in batches. It must NOT insert `profiles` alone (`profiles.id` FKs `auth.users(id)`).
  No `identities` needed since depth bots never log in.
  **Idempotency w/ `handle_new_user`:** inserting the `auth.users` row fires the AFTER-INSERT
  `handle_new_user`, which itself inserts `profiles` + the role profile + (for the
  `@synthetic.dragoncandy.test` email) the `synthetic_users` row. So the RPC must set the
  `auth.users` NOT-NULL columns and `raw_user_meta_data->>'role'` (to drive the creator/business
  split), and make its own `profiles`/role/`synthetic_users` inserts idempotent (`ON CONFLICT DO
  NOTHING`) — otherwise it collides with the trigger's rows on a unique violation. (Simplest: let
  `handle_new_user` build them and have the RPC only insert `auth.users` with the right metadata,
  then verify.) The seed test asserts every seeded user is in `synthetic_users` (else
  exclusion/teardown leaks) and that `is_synthetic()` is true for a sample.

All rows carry the synthetic tag → excluded from KPIs, purgeable.

### 4b. Load/burst driver (`sim/load/driver.ts`, new `load` subcommand)
A concurrent request generator **separate from `planDay`** (which advances the funnel one stage/tick
and is not a load tool). The driver:
- Draws from the session pool (reused tokens) and fires a configurable **concurrency** of realistic
  **read-heavy** hot-endpoint calls a real DAU makes: campaign browse/search, feed, profile views,
  messages list, dashboard RPCs, a **sampled** write (apply/message). Weighted ~90:10 read:write.
- Ramps concurrency in steps (e.g. 50 → 200 → 500 → 1,000 → 1,500), holding each step long enough to
  read steady-state latency, until latency/error crosses the **saturation knee** at the current tier.
  We stop at the knee (measurable degradation), **not** a true outage, so `/internal` and the
  `capture_sim_load_snapshot` RPC stay responsive enough to record the very samples we need — pushing
  to a full DoS would blind the observability that is the point of the test.
- Emits a per-step result row; fails loud on unexpected (non-429/503/throttle) errors, distinguishing
  *saturation* (expected, the signal) from *breakage* (a bug).
- **Single-egress-IP caveat:** one GitHub runner = one IP, subject to the same per-IP auth /
  PostgREST / Cloudflare limits — so a single-runner "ceiling" may reflect **client-side** limits, not
  the DB's true ceiling. Measure the single-runner ceiling first; if it's below the DB knee, fan out
  across a runner matrix. Headline the result as "sustained throughput proven," caveated by egress.

### 4c. Load observability (`capture_sim_load_snapshot()` RPC + harness wiring)
Add a service-role SECURITY DEFINER RPC that samples `pg_stat_activity` (active connections),
`max_connections`, `pg_stat_statements` (avg query ms), plus the driver's measured `error_rate`, and
inserts a labeled `sim_load_snapshots` row (the table + columns already exist). The driver calls it on
a timer during each ramp step. Confirm `pg_stat_statements` is enabled via `list_extensions` at
kickoff; degrade gracefully (null `avg_query_ms`) if absent.

### 4d. Tier-ramp runbook (`docs/runbooks/synthetic-load-tier-ramp.md`)
Founder-gated at each step: run the ceiling ramp at the current tier → record the knee + p95 latency
+ connection ceiling + **the tier's $/mo (from live Supabase billing)** → upgrade prod compute one
step → re-run → repeat (MICRO→SMALL→MEDIUM→LARGE, as far as needed to hold the target). Each resize is
a brief prod restart (accepted; schedule off the 14:00 cron). Produces the **performance-and-cost-per-
tier curve** — the core deliverable.

### 4e. Real cost readout + modeled revenue
- **Measured expenses:** AI = `sum(donny_cost_ledger.estimated_cost_usd) WHERE is_synthetic` over the
  window; storage = `platform_weight.storage_bytes` delta × Supabase $/GB; compute = the tier $/mo
  (prorated) from 4d.
- **Modeled revenue (Phase A):** projected GMV = active-cohort activity × avg campaign value × take-
  rate ladder. Clearly labeled "modeled," replaced by measured in Phase B.

## 5. Phase B — Measured revenue (real test-mode money) + full economics

Kept in scope (you chose "both, phased") but **honestly scoped**: it means new payment code exercised
on prod, so it starts only after Phase A's numbers land and the settlement fork below is decided.

### 5a. The schema reality (why this is not a free "reuse")
A paid campaign needs `fixed_price > 0`, but the `campaigns_group_free` CHECK
(`20260709120020_group_campaign_invariants.sql`: `group_id IS NULL OR COALESCE(fixed_price,0)=0`)
forces any priced campaign to be **public** (`group_id NULL`). Consequences, and how we handle them:
- **Broadcast/notifications:** the harness inserts campaigns **directly** (`bot.from('campaigns')
  .insert`), so it does not itself invoke `send-campaign-publish-notifications`. **Verify at kickoff**
  whether any DB trigger broadcasts on public-campaign insert; if so, add an `is_synthetic_campaign`
  early-return to that path (mirrors its existing `group_id`-set early-return) so synthetic campaigns
  never email/notify real testers. This guard is edge-function-reviewed + data-exposure-reviewed.
- **Visibility / real interaction:** a synthetic public paid campaign appears in real browse/feed and
  a real tester *could* apply. Per the "real users are testers" decision this is **accepted**, and it
  does **not** corrupt the synthetic economics: those are `is_synthetic`-filtered, so a real creator's
  collaboration (real, not synthetic) is excluded from the synthetic revenue/GMV. To keep the funnel
  bot-to-bot in practice, the bot business **self-hires its bot creator immediately** after posting
  (before a human realistically applies). We explicitly drop "strict bot-to-bot" for the paid leg.

### 5b. Settlement mechanism — OPEN FORK, decided at the A/B boundary
`create-campaign-escrow` is hosted-checkout-only (browser + webhook); the harness has no browser. To
actually settle a test-mode payment we choose one of:
- **R1 — Playwright leg (most "real," matches foundational Phase 2):** a small Playwright pool
  (reuse `tests/e2e`) logs in as the bot business and completes the hosted test checkout with card
  `4242…`. Exercises the real checkout UX end-to-end; heavier to stand up + slower per transaction.
- **R2 — Programmatic test-mode escrow (headless, fast; recommended for speed):** a new synthetic-only
  edge function creates + confirms a **test-mode PaymentIntent** server-side and sets
  `escrow_status='held'`, writing the payment_event. Fits the harness (no browser), fast; but it is
  **new payment code** on prod → `careful` skill + edge-function-reviewer + data-exposure-reviewer,
  and it partly bypasses the real hosted-checkout/webhook path (slightly less "real").

Recommendation: ship Phase A, look at the numbers, then default to **R2** unless we specifically want
to load-test the checkout UX (then R1). Do not build either until that decision.

### 5c. Capped Donny AI (sampled)
A small sampled fraction of campaign creations use `donny-campaign-generate`; Donny chat sampled — to
put realistic AI cost on the ledger. Hard **daily synthetic-AI USD ceiling** enforced in the harness
(re-read each tick); synthetic spend is already excluded from the real 15% cap by the spine, so bots
can never throttle the real platform.

### 5d. Economics RPC + dashboard (`get_simulation_economics()` + extend `InternalSimulation.tsx`)
A new internal-gated SECURITY DEFINER RPC returning the **synthetic** economics (mirrors the `aios_*`
shape but for `is_synthetic` rows). **Revenue source (there is no `payment_events.platform_fee`
column):** measured GMV = `sum(fixed_price)` over synthetic paid campaigns that reached
`held`/completed; **revenue = GMV × take-rate** (the platform rate for the bot's tier — default 10%
free-tier unless a subscription tier is assigned). Also: payouts, AI/infra/storage cost, active-user
count, and the derived **revenue/active-user, cost/active-user, contribution margin** — plus the
latest `sim_load_snapshots` summary. The dashboard renders the tier×concurrency performance curve and
the economics table side by side.

### 5e. Purge-after
`purge_synthetic_data()` clears the load-test bloat; assert zero residue and `row_counts_real ==
row_counts`. The persistent "busy" cohort can be kept or purged per founder choice.

## 6. Safety (unchanged contracts + additions)

- **Kill switch** gates every network subcommand (existing boot gate); flipping off halts within one
  tick.
- **Test-Stripe-only** boot assertion (existing) — refuses a live key. R2 (if chosen) also asserts
  test-mode at the PaymentIntent call.
- **Synthetic tagging** is automatic (email → registry → `is_synthetic`); every KPI surface already
  excludes it; the load/economics readouts are the deliberate SHOW surfaces (`get_simulation_*`).
- **Broadcast suppression** (Phase B): no email/notification fires for synthetic campaigns (§5a).
- **Daily synthetic-AI USD ceiling** (Phase B) caps runaway AI spend independent of the real cap.
- **Session-pool file** is gitignored and treated as secret material.
- **Prod-degradation window** (§2.3) is owned, knee-only, off-cron, lowest-traffic slot.
- **Teardown proof** unchanged — purge to zero residue.

## 7. Files

**New:** `sim/session-pool.ts` (+ test), `sim/seed.ts` (+ test), `sim/load/driver.ts` (+ test),
`docs/runbooks/synthetic-load-tier-ramp.md`, migration
`supabase/migrations/<ts>_sim_load_economics_rpcs.sql` (`seed_synthetic_cohort`,
`capture_sim_load_snapshot`, `get_simulation_economics`). **Phase B only:** the R1 Playwright leg
(`tests/e2e/…`) **or** the R2 programmatic-escrow edge function — whichever the §5b fork picks; a
one-line `is_synthetic_campaign` guard in the broadcast path if a trigger is found.
**Modified:** `sim/run.ts` (session pool wired into `makeBotFor`; `bulk-seed`/`load` subcommand
handlers), `sim/cli.ts` (only if the subcommand list/usage string needs the new commands),
`sim/behavior/actions.ts` + `graph.ts` (paid-campaign leg + sampled Donny, Phase B),
`src/pages/internal/InternalSimulation.tsx` (load curve + economics),
`.github/workflows/synthetic-weight.yml` (dispatch inputs for `bulk-seed`/`load`).
**Reuse (no change):** the safety spine migration, `release-creator-payout` /
`verify-campaign-escrow`, `test-mode-*` shared modules, `personas.ts`, `mint.ts`, `env.ts`.

## 8. Verification

- **Session pool:** a second tick reuses tokens (0 fresh mints, only refreshes) — asserted with a
  fake auth server; no 429 under rapid re-tick.
- **Segregation (the critical test, unchanged):** snapshot every `aios_*` RPC + `platform_weight.*_real`
  before a run; after seeding 5,000 + a load run + economics, the **real** numbers are byte-identical
  while `get_simulation_*` shows the synthetic activity.
- **Seeding:** every seeded depth user has a valid `auth.users` + `profiles` + `synthetic_users` row
  (FK holds, tag set); active cohort can mint a session.
- **Load:** `sim_load_snapshots` shows connection saturation at the knee; after a tier upgrade the
  latency/error curve improves — captured per tier; observability RPCs stay responsive (knee, not
  outage).
- **Money safety:** boot gate rejects `sk_live_`; no synthetic `payment_events` with a real charge; no
  real Connect transfer; **no notification/email fires for any synthetic campaign**.
- **Economics:** `get_simulation_economics()` revenue = measured synthetic GMV × take-rate;
  reconciles with the paid-campaign `fixed_price` sum; unit economics computed at each tier.
- **Teardown:** purge → zero residue + `row_counts_real == row_counts`.
- **Gates:** `npm run build`, `npm run typecheck`, `npm run test`, edge-function-reviewer +
  data-exposure-reviewer on every new/changed RPC/edge fn (esp. the R2 escrow path + broadcast guard),
  Codex second review before each PR.

## 9. Tunables (defaults; adjust at kickoff)

Depth seed N = 5,000 (65/35). Active cohort = 300–500. Ramp concurrency = 50→1,500 (stop at knee).
Tiers = MICRO→SMALL→MEDIUM→LARGE. Paid-campaign fraction (Phase B) ≈ 30%, `fixed_price` spread
realistic. Donny fraction ≤ 10% of creations + daily synthetic-AI USD ceiling. Read:write ≈ 90:10.

## 10. Open questions / risks

- **Settlement fork (§5b)** — R1 Playwright vs R2 programmatic PaymentIntent — is an unresolved
  design decision that gates Phase B; decide with Phase A numbers in hand. Recommended default R2.
  Treat it as a **hard gate**, not a default that slips through: R2 is new prod payment code touching
  real Stripe infra, so it only proceeds through an explicit decision + `careful` +
  edge-function-reviewer + data-exposure-reviewer.
- **Single-egress-IP ceiling (§4b)** — a single-runner result may reflect client-side/per-IP limits,
  not the DB's true ceiling; may need a runner matrix. Caveat the "50K-DAU load proof" headline.
- **Prod-degradation window (§2.3)** — knee-only, off-cron, lowest-traffic; still degrades the app +
  observability for testers during the window.
- **`pg_stat_statements`** must be enabled for avg-query-ms (confirm at kickoff; degrade gracefully).
- **Broadcast trigger (§5a)** — confirm at kickoff whether a DB trigger broadcasts on public-campaign
  insert; add the `is_synthetic_campaign` guard only if so.
- **Paid campaigns are public** (schema-forced) — "strict bot-to-bot" is dropped for the paid leg;
  synthetic economics stay clean via `is_synthetic` filtering, accepted per the testers decision.
