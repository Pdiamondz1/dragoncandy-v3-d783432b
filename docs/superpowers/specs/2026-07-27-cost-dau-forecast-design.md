# Cost Model + DAU Forecast — Design Spec

> Sub-project **3 of 4** in the founder ask to make the `/internal` (AIOS) dashboard show the app's
> true weight/cost and how it scales. (1 = synthetic metric parity, **PR #346 open**; 4 = plain-language
> stakeholder scorecard, **PR #350 open**; 2 = live infra telemetry + scaling headroom, still scoped.)
> Neither #346 nor #350 is on `main` yet, so this branch is cut from `origin/main` and references only
> code present there (it must **not** import `scorecardModel` / `useScorecardSettings` / `aios_stakeholder_burn`).

**Date:** 2026-07-27 · **Branch:** `feat/internal-cost-dau-forecast` · **Status:** design, pre-plan

## 1. Goal

A new **`/internal/forecast`** page ("Scale & Cost") that answers, for **Today / 500K / 750K / 1M
DAU**, side by side: the infrastructure footprint, the Supabase tier required, total monthly cost,
projected revenue at our pricing, and **gross margin** — so the founder and non-technical stakeholders
can state *"at 1M daily users we run at ~NN% margin, and here's what gets us there."*

**Model scope: full unit-economics** (cost + revenue + margin), per the founder's brainstorm decision.

## 2. Framing — this is a capacity/cost *what-if*, not a growth projection

There is **no DAU/MAU tracking in the app today** (confirmed: the only "active users" references are in
the synthetic load driver). With ~40 real users and no DAU signal, the forecast is deliberately a
**what-if model**: *"if the platform reaches X DAU, this is the footprint and the economics."* It is
driven by **measured coefficients** where we have them + **founder-editable assumptions** where we
don't, with every figure labelled **MEASURED / DERIVED / ASSUMED** so it is honest to show an investor.
It is explicitly **not** a projection of *when* we reach those DAU levels.

## 3. Scope

**In scope**
- A pure `forecastModel.ts` producing the four-scenario model (deterministic, no LLM, unit-tested).
- A `/internal/forecast` page rendering the scenario table + an admin-editable assumptions panel.
- One migration seeding the assumption rows into the existing `aios_dashboard_settings` KV table.

**Out of scope** (own sub-projects / future)
- Live real-time infra telemetry (real connections/latency/CPU/RAM) — that is **sub-project 2**.
- Actual DAU/MAU instrumentation — none exists; not built here (would change the framing from what-if
  to projection, a separate effort).
- Persisting forecast history / scenario snapshots over time.
- The **scorecard tie-in** (feeding one margin line into `scorecardModel`) — deferred: `scorecardModel`
  lives on PR #350 (not yet merged), so this page ships independent of it and the one-line tie-in is a
  small follow-up once #350 is on `main` (see §11).

## 4. The model — `src/lib/internal/forecastModel.ts` (pure, deterministic, tested)

Mirrors the established pattern of `scorecardModel.ts` / `weightThresholds.ts`: a framework-free module
of constants + pure functions, locked by unit tests. Signature:

```ts
buildForecast(input: ForecastInput): ForecastModel
// ForecastModel = { scenarios: ForecastScenario[]; coefficients: DerivedCoefficients; notes: string[] }
// scenarios keyed by dau ∈ {current, 500_000, 750_000, 1_000_000}
```

### 4a. Inputs — MEASURED (from existing hooks, no new reads)

| Input | Source hook (on `origin/main`) | Use |
|---|---|---|
| `db_bytes`, `storage_bytes`, `users_total`, `users_total_real` (latest snapshot) | `usePlatformWeight` | current footprint → per-user DB/storage **hint** |
| `honest_peak_concurrency`, `db_active_conn_peak`, `max_connections`, `media_bytes`, `media_requests` | `useSimLoadMatrixSummary` | **measured** DB-conns-per-concurrent-user + egress-bytes-per-request + the pooled-connection ceiling |
| `users.total`, `users.by_role` (business vs creator) | `usePlatformStats` | current business/creator split → default `business_share_pct` hint |
| `mtd_spend_usd` | `useCostStats` | current AI serving spend → per-user AI hint |
| active recurring opex lines (Σ `monthly_amount_cents`) | `useOperatingExpenses` | the **fixed** monthly cost floor |
| `dragonshare_mtd.platform_fee_cents` | `useRevenueStats` | current revenue (≈$0 pre-revenue) |

**Real-vs-total discipline (sub-project 1's whole point — do not conflate):** the *registered-user*
baseline and business/creator split use the **real** counts (`users_total_real`, `usePlatformStats`'s
synthetic-excluded `users.total`/`by_role`) — never the synthetic-inclusive ones. `db_bytes` /
`storage_bytes` are **physical (synthetic-inclusive)** by nature; the model uses them only for the
"Today" column and the `fixedDbOverhead` floor, where synthetic-inclusive is the *conservative*
direction (over-states today's size, so it never forecasts below reality) — labelled as such.

### 4b. Derived (MEASURED) coefficients

- `dbConnsPerConcurrent = db_active_conn_peak / honest_peak_concurrency` — from the 200K matrix run
  (~27 / 4,000 ≈ **0.0068 pooled DB conns per concurrent user**; the proof that the DB is *not* the
  binding constraint far out).
- `egressBytesPerRequest = media_bytes / media_requests` — from the same run; the storage-egress unit.

**Fallback is guarded on null AND zero:** if `useSimLoadMatrixSummary` returns null (no matrix run), OR
the denominator is 0 (`honest_peak_concurrency` / `media_requests` = 0), each coefficient falls back to a
documented default constant (`DEFAULT_DB_CONNS_PER_CONCURRENT`, `DEFAULT_EGRESS_BYTES_PER_REQUEST`) and a
`notes[]` line is added ("measured ceiling unavailable — using default"). No `Infinity`/`NaN` ever reaches
a rendered figure.

### 4c. Assumptions — EDITABLE (founder-tunable, stored in `aios_dashboard_settings`)

**Nine** keys, each seeded with a conservative default. The UI shows a **derived hint** next to editable
ones (e.g. "current data suggests ~X") but the stored value is what the model uses. Defaults are the
spec's starting point; the founder tunes them live (no deploy) via the admin panel.

| Key (`aios_dashboard_settings`) | Meaning | Default | Drives |
|---|---|---|---|
| `forecast_registered_per_dau` | registered users per 1 daily-active | 4 | DB + storage (accumulation base) |
| `forecast_db_kb_per_user` | DB bytes per registered user | 150 KB | DB size |
| `forecast_storage_kb_per_user` | file storage per registered user | 2,048 KB (2 MB) | storage size |
| `forecast_peak_concurrency_pct` | peak concurrent as % of DAU | 8% | connections + compute tier |
| `forecast_requests_per_dau` | media/content requests per DAU per day | 40 | egress volume |
| `forecast_ai_cost_per_dau_cents` | AI serving $ per DAU per month (pre-cap) | 0.5¢ | AI spend (before the 15% cap) |
| `forecast_business_share_pct` | % of registered users that are businesses | 20% | revenue funnel |
| `forecast_paying_conversion_pct` | % of businesses on a paid plan | 15% | revenue funnel |
| `forecast_arpu_usd` | blended monthly revenue per paying business (sub + take-rate) | $149 | revenue |

### 4d. Constants — Supabase pricing (documented, founder-verifiable)

Encoded like `weightThresholds`'s `COMPUTE_TIERS` (provenance: the founder's Supabase plan; **verify
at plan time** — pricing drifts). Reuses `COMPUTE_TIERS` (compute $/mo + RAM) and `DISK_LIMIT_BYTES`.

```ts
SUPABASE_PRICING = {
  proBaseUsd: 25,            // Pro plan base
  includedDiskGb: 8,         // included on the spend-capped plan (== DISK_LIMIT_BYTES)
  diskOverageUsdPerGb: 0.125,
  includedEgressGb: 250,
  egressOverageUsdPerGb: 0.09,
}

// Model constants (documented planning values — labelled ASSUMED in the UI, not derivable from data):
PEAK_CONCURRENT_PER_GB = 2000  // peak concurrent users supported per GB compute RAM (tier-selection
                               // heuristic). NOT measured — the 200K run's knee was client-side, not
                               // RAM/DB — so the tier column is tagged ASSUMED. Founder-tunable later.
AI_FLOOR_USD = 250             // the pre-revenue AI-spend floor from PROJECT_CONTEXT §8
                               // ("15% of revenue ($250/mo floor pre-revenue)").
DEFAULT_DB_CONNS_PER_CONCURRENT = 0.0068     // fallback when the load-matrix summary is null/zero
DEFAULT_EGRESS_BYTES_PER_REQUEST = 120_000   // ~120 KB/request fallback (order-of-magnitude of the run)
```

### 4e. Per-scenario math

For each DAU level `d`:
- `registered = d × registered_per_dau`
- `peakConcurrent = d × peak_concurrency_pct`
- `dbBytes = fixedDbOverhead + registered × db_kb_per_user` (fixedDbOverhead = measured current
  `db_bytes` minus current-user contribution, floored at the current value — never forecast *below* today)
- `storageBytes = registered × storage_kb_per_user`
- `pooledDbConns = peakConcurrent × dbConnsPerConcurrent` → compared to `max_connections` ceiling
- **Compute tier**: smallest `COMPUTE_TIERS` entry meeting a throughput heuristic
  (`peakConcurrent ≤ ram_gb × PEAK_CONCURRENT_PER_GB`); beyond XL → "custom / contact Supabase"
  (mirrors `computeWeightAlerts`' top-tier message).
- **Supabase $/mo** = `proBaseUsd` + tier compute $ + disk overage (`max(0, dbGb − includedDiskGb) ×
  diskOverageUsdPerGb`) + egress overage, where
  `monthlyEgressGb = (d × requests_per_dau × 30 × egressBytesPerRequest) / GB` and overage =
  `max(0, monthlyEgressGb − includedEgressGb) × egressOverageUsdPerGb`.
- **Revenue/mo** = `registered × business_share_pct × paying_conversion_pct × arpu_usd`.
- **AI $/mo** = `min(uncapped, cap)` where `uncapped = d × ai_cost_per_dau_cents / 100` and the cap is
  the pricing architecture's **15% of revenue with a $250/mo floor**: `cap = max(AI_FLOOR_USD, 0.15 ×
  revenue)`. The model surfaces **both** `uncapped` and the applied figure so the cap is visible, and
  adds a `notes[]`/flag when `uncapped > cap` ("AI demand exceeds the 15%/floor cap → service
  degradation or a cap breach at this scale"). For the **Today** column, AI uses the *measured*
  `mtd_spend_usd` (≈$225/mo) directly, not the modeled `uncapped`.
- **Other opex** = current fixed opex (held flat; it's founder tooling, not activity-scaled).
- **Total cost** = Supabase + AI + other opex.
- **Gross margin** = revenue − total cost; **margin %** = margin / revenue (guarded when revenue = 0).
- **Cost per DAU** = total cost / d.

### 4f. Honesty rails

- Every output cell tagged **MEASURED / DERIVED / ASSUMED**; the page renders a legend and visually
  separates measured columns from assumed ones.
- AI spend **self-caps at 15% of revenue** — surfaced explicitly.
- `dbBytes`/`storageBytes` never forecast below today's measured value.
- Connection headroom shown against the **measured** `max_connections` ceiling, with the 200K-run
  finding noted ("DB was ~30% utilised at 4,000 concurrent — not the binding constraint").
- **The "Today" column is measured, not modeled** — since there is no DAU signal it does not run the
  DAU→registered/concurrent bridges. It shows, labelled "current (measured)": registered users =
  `users_total_real`; DB/storage = measured `db_bytes`/`storage_bytes`; peak concurrent = the measured
  `honest_peak_concurrency` from the last load run (or "—" if none); Supabase = the current tier's base
  + compute (no modeled overage); **AI = measured `mtd_spend_usd`**; other opex = measured; revenue =
  measured MTD; margin from those. **Cost/DAU is "—" for Today** (no DAU denominator). Any row without a
  measured source shows "—", never a fabricated value.

## 5. The page — `src/pages/internal/InternalForecast.tsx` (dark ops-deck)

**Admin-only page** (see §8 for why): its Total-cost inputs (`operating_expenses`, `aios_cost_stats`)
are admin-only RLS, so a non-admin would silently see $0 opex and an overstated margin — the exact
number this page exists to get right. It is therefore gated like `/internal/expenses` (the Operate
group), and the *stakeholder* reach is the scorecard's one-line margin tie-in (§11), which uses the
stakeholder-safe aggregate burn — not this page. Because every viewer is an admin, the assumptions panel
is directly editable (no read-only variant needed).

- `PageContainer` / `PageHeader` ("Scale & cost forecast", subtitle stating it's a what-if capacity
  model). Reuses `StatCard`, `SectionHeading`, `ErrorCard`, recharts (already a dep, used on Weight).
- **Scenario table** — columns Today / 500K / 750K / 1M; row groups: *Footprint* (registered users,
  peak concurrent, DB, storage, pooled DB conns vs ceiling) → *Tier* (compute tier, disk) → *Cost*
  (Supabase, AI capped, other opex, **total**) → *Economics* (revenue, gross margin $ + %, cost/DAU).
  On mobile the table scrolls inside an `overflow-x-auto` container (never widens the page).
- **Cost-vs-revenue chart** — a small recharts line across the DAU axis (total cost vs revenue; the
  crossover is the break-even story). Optional-but-recommended; degrade to table-only if data thin.
- **Assumptions panel** — the 9 editable values; each row shows label · current value · derived hint.
  Writes go direct to `aios_dashboard_settings` (`.update({ value }).eq('key', …)`) under the existing
  admin-UPDATE RLS — the same concrete pattern `useCurrentTierIndex` reads with (no dependency on #350's
  `useScorecardSettings`, which isn't on this branch).
- **Legend** — measured vs assumed key.

## 6. Backend — one founder-gated migration, no new RPC/RLS

- `supabase/migrations/<ts>_forecast_assumptions_settings.sql`: `INSERT … ON CONFLICT (key) DO NOTHING`
  the 8 `forecast_*` rows into `aios_dashboard_settings` with their default jsonb values.
- **No new table, RPC, or policy** — `aios_dashboard_settings` already has internal-SELECT +
  admin-UPDATE RLS (used by `useCurrentTierIndex` read + `useScorecardSettings` write). The forecast
  reads current cost/revenue via the same hooks the Expenses page already uses; it does **not** need
  #350's `aios_stakeholder_burn()` RPC.
- **Careful gate**: applying the migration is founder-gated (matches the project's migration discipline).
  The page degrades gracefully pre-migration: missing keys → the model uses the coded defaults, and the
  panel shows "defaults (not yet saved)".

## 7. Hooks

- `src/hooks/internal/useForecastAssumptions.ts` — reads the 9 keys from `aios_dashboard_settings` in
  one query (`select('key,value').in('key', FORECAST_KEYS)`), maps to a typed `ForecastAssumptions`
  object with coded-default fallback per key; plus `useUpdateForecastAssumption` (admin write via
  `.update({ value }).eq('key', …)`, invalidates the query). No dependency on #350 code.
- Reuses `usePlatformWeight`, `useSimLoadMatrixSummary`, `usePlatformStats`, `useCostStats`,
  `useOperatingExpenses`, `useRevenueStats` — all already on `origin/main`.

## 8. Routing & nav

- `src/App.tsx` — `<Route path="forecast" element={<InternalForecast />} />`, **admin-gated the same way
  `/internal/expenses` is** (whatever guard/wrapper that route already uses — mirror it exactly). The
  page reads admin-only cost sources, so it must not be reachable by a non-admin internal stakeholder.
- `src/components/internal/InternalLayout.tsx` — add a "Forecast" item to the **admin-only Operate
  group** (where Expenses lives), icon e.g. `TrendingUp`. It is **not** in the non-admin Monitor group.

## 9. Error / empty / degradation states

- Platform-weight or load-matrix query error → the affected measured coefficient falls back to a
  documented default + a `notes[]` line; the page still renders (never a hard blank).
- `useSimLoadMatrixSummary` null (no matrix run) → default `dbConnsPerConcurrent`/`egressBytesPerRequest`
  + a visible "using defaults — no load run captured" note.
- Revenue = 0 (pre-revenue) → margin % shows "—" rather than a divide-by-zero; margin $ still shows the
  (negative) burn, framed as "monthly burn at this scale".
- All follow the scorecard's honest-`info`-state precedent — never a false green or a fabricated number.

## 10. Testing

- `src/lib/internal/forecastModel.test.ts` — coefficient derivation (incl. the null-load-matrix
  fallback); DAU→registered/concurrent; DB/storage never below today; tier selection at each band + the
  beyond-XL "custom" case; disk & egress overage math; the **15% AI cap** (both uncapped > cap and
  uncapped < cap); revenue funnel; margin + margin% (incl. revenue = 0 guard); assumption overrides
  change outputs as expected.
- `src/components/internal/ForecastTable.test.tsx` (+ panel) — renders the four scenario columns from a
  fixture model; measured vs assumed legend present; the `notes[]` degradation line renders when
  load-matrix is null; the assumptions panel renders the 9 editable inputs (the page is admin-only, so
  there is no non-admin variant to test at the component level — the access control is the route guard,
  verified by parity with the `/internal/expenses` route). (`// @vitest-environment jsdom` +
  `import "@testing-library/jest-dom"` per the project's per-file jsdom rule.)

## 11. Stakeholder tie-in (deferred follow-up)

Once **PR #350 (scorecard) is on `main`**, add one derived line to `scorecardModel`'s headroom/economics
story — e.g. *"At 1M daily users we'd run at ~NN% gross margin"* — so non-technical stakeholders get the
forecast's punchline without the table. Small, isolated; specified here so it isn't forgotten, but not
built in this branch (avoids stacking on an unmerged PR).

## 12. Review gates

- No service-role / RLS / SECURITY DEFINER change (reads existing hooks; the only write is an
  admin-gated `aios_dashboard_settings` UPDATE under a pre-existing policy), so **data-exposure-reviewer
  is not required** — but the migration + write path get a normal review. **The one access-control check
  that matters: the `/internal/forecast` route must be admin-gated exactly like `/internal/expenses`**
  (its cost inputs are admin-only RLS) — verify route parity, not just the nav placement.
- **Codex second review** (`codex review --base main`) before finishing — mandatory.
- **knowledge-sync**: wiki concept `docs/wiki/concepts/cost-dau-forecast.md`, SHIPPED_LOG entry,
  PROJECT_CONTEXT §5 line; RAG sync after merge.

## 13. File structure

| File | Responsibility |
|---|---|
| `src/lib/internal/forecastModel.ts` | pure model + Supabase pricing constants + `FORECAST_KEYS`/defaults |
| `src/lib/internal/forecastModel.test.ts` | model unit tests (the contract) |
| `src/hooks/internal/useForecastAssumptions.ts` | read 8 KV assumptions + admin update mutation |
| `src/components/internal/ForecastTable.tsx` | the four-scenario table (pure render of the model) |
| `src/components/internal/ForecastAssumptionsPanel.tsx` | admin-editable / read-only assumptions |
| `src/pages/internal/InternalForecast.tsx` | page: wires hooks → model → table + panel + chart |
| `supabase/migrations/<ts>_forecast_assumptions_settings.sql` | seed the 8 KV rows (idempotent) |
| `src/App.tsx` · `src/components/internal/InternalLayout.tsx` | route + nav |
| `docs/wiki/concepts/cost-dau-forecast.md` + SHIPPED_LOG + §5 | knowledge layer |

## 14. Open questions for the founder (defaults chosen; tune anytime)

The nine assumption defaults in §4c are the model's starting point and are editable live in the UI, so
none blocks the build. The founder may want to set `arpu_usd`, `paying_conversion_pct`, and
`registered_per_dau` to their own numbers before showing the board — these three most move the margin.
