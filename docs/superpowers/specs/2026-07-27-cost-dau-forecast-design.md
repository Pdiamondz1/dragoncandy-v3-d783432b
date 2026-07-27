# Cost Model + DAU Forecast — Design Spec

> Sub-project **3 of 4** in the founder ask to make the `/internal` (AIOS) dashboard show the app's
> true weight/cost and how it scales. (1 = synthetic metric parity, shipped PR #346; 4 = plain-language
> stakeholder scorecard, shipped PR #350; 2 = live infra telemetry + scaling headroom, still scoped.)

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

### 4b. Derived (MEASURED) coefficients

- `dbConnsPerConcurrent = db_active_conn_peak / honest_peak_concurrency` — from the 200K matrix run
  (~27 / 4,000 ≈ **0.0068 pooled DB conns per concurrent user**; the proof that the DB is *not* the
  binding constraint far out). If `useSimLoadMatrixSummary` returns null (no matrix run captured), fall
  back to a documented default and add a `notes[]` line ("measured ceiling unavailable — using default").
- `egressBytesPerRequest = media_bytes / media_requests` — from the same run; the storage-egress unit.

### 4c. Assumptions — EDITABLE (founder-tunable, stored in `aios_dashboard_settings`)

Eight keys, each seeded with a conservative default. The UI shows a **derived hint** next to editable
ones (e.g. "current data suggests ~X") but the stored value is what the model uses. Defaults are the
spec's starting point; the founder tunes them live (no deploy) via the admin panel.

| Key (`aios_dashboard_settings`) | Meaning | Default | Drives |
|---|---|---|---|
| `forecast_registered_per_dau` | registered users per 1 daily-active | 4 | DB + storage (accumulation base) |
| `forecast_db_kb_per_user` | DB bytes per registered user | 150 KB | DB size |
| `forecast_storage_kb_per_user` | file storage per registered user | 2,048 KB (2 MB) | storage size |
| `forecast_peak_concurrency_pct` | peak concurrent as % of DAU | 8% | connections + compute tier |
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
  includedDiskGb: 8,        // included on the spend-capped plan (== DISK_LIMIT_BYTES)
  diskOverageUsdPerGb: 0.125,
  includedEgressGb: 250,
  egressOverageUsdPerGb: 0.09,
}
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
  diskOverageUsdPerGb`) + egress overage (`monthlyEgressGb` from `d × egressBytesPerRequest ×
  requests_per_dau_per_month`, minus `includedEgressGb`, × rate).
- **Revenue/mo** = `registered × business_share_pct × paying_conversion_pct × arpu_usd`.
- **AI $/mo** = `min(d × ai_cost_per_dau_cents/100, 0.15 × revenue)` — the **15%-of-revenue hard cap**
  from the pricing architecture; the model shows both the uncapped and capped figure so the cap is visible.
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
- The "Today" column is computed from the same model with `d = max(1, current DAU proxy)`; since there
  is no DAU signal, "Today" uses current **registered users** directly (bypassing the DAU→registered
  step) and is labelled "current (measured)".

## 5. The page — `src/pages/internal/InternalForecast.tsx` (dark ops-deck)

- `PageContainer` / `PageHeader` ("Scale & cost forecast", subtitle stating it's a what-if capacity
  model). Reuses `StatCard`, `SectionHeading`, `ErrorCard`, recharts (already a dep, used on Weight).
- **Scenario table** — columns Today / 500K / 750K / 1M; row groups: *Footprint* (registered users,
  peak concurrent, DB, storage, pooled DB conns vs ceiling) → *Tier* (compute tier, disk) → *Cost*
  (Supabase, AI capped, other opex, **total**) → *Economics* (revenue, gross margin $ + %, cost/DAU).
  On mobile the table scrolls inside an `overflow-x-auto` container (never widens the page).
- **Cost-vs-revenue chart** — a small recharts line across the DAU axis (total cost vs revenue; the
  crossover is the break-even story). Optional-but-recommended; degrade to table-only if data thin.
- **Assumptions panel** — the 8 editable values; **admin-only edit** (`useInternalAccess().isAdmin`),
  read-only display for non-admin (mirrors the Overview AI-spend gate + scorecard editability). Each
  row shows label · current value · derived hint. Writes go direct to `aios_dashboard_settings`
  (`.update({ value }).eq('key', …)`) under the existing admin-UPDATE RLS — same path as
  `useScorecardSettings`.
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

- `src/hooks/internal/useForecastAssumptions.ts` — reads the 8 keys from `aios_dashboard_settings` in
  one query (`select('key,value').in('key', FORECAST_KEYS)`), maps to a typed `ForecastAssumptions`
  object with coded-default fallback per key; plus `useUpdateForecastAssumption` (admin write, same
  pattern as `useUpdateScorecardHeadline`, invalidates the query).
- Reuses `usePlatformWeight`, `useSimLoadMatrixSummary`, `usePlatformStats`, `useCostStats`,
  `useOperatingExpenses`, `useRevenueStats` — all already on `origin/main`.

## 8. Routing & nav

- `src/App.tsx` — `<Route path="forecast" element={<InternalForecast />} />` (not admin-gated; matches
  `weight`/`scorecard` — the page is viewable by internal stakeholders, only the *edit* is admin-gated).
- `src/components/internal/InternalLayout.tsx` — add a "Forecast" item to the Monitor group
  (icon e.g. `TrendingUp`), near Weight/Scorecard.

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
- `src/pages/internal/InternalForecast.test.tsx` (or a component test for the table/panel) — renders the
  four scenario columns; measured vs assumed legend present; **admin sees editable inputs, non-admin sees
  read-only** values; degradation note renders when load-matrix is null. (`// @vitest-environment jsdom`
  + `import "@testing-library/jest-dom"` per the project's per-file jsdom rule.)

## 11. Stakeholder tie-in (deferred follow-up)

Once **PR #350 (scorecard) is on `main`**, add one derived line to `scorecardModel`'s headroom/economics
story — e.g. *"At 1M daily users we'd run at ~NN% gross margin"* — so non-technical stakeholders get the
forecast's punchline without the table. Small, isolated; specified here so it isn't forgotten, but not
built in this branch (avoids stacking on an unmerged PR).

## 12. Review gates

- No service-role / RLS / SECURITY DEFINER change (reads existing hooks; the only write is an
  admin-gated `aios_dashboard_settings` UPDATE under a pre-existing policy), so **data-exposure-reviewer
  is not required** — but the migration + write path get a normal review.
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

The eight assumption defaults in §4c are the model's starting point and are editable live in the UI, so
none blocks the build. The founder may want to set `arpu_usd`, `paying_conversion_pct`, and
`registered_per_dau` to their own numbers before showing the board — these three most move the margin.
