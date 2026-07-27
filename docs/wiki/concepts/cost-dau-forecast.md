---
title: Cost Model + DAU Forecast
type: concept
created: 2026-07-27
updated: 2026-07-27
sources: [2026-07-27-cost-dau-forecast.md]
tags: [aios, internal, forecast, cost, scaling, unit-economics, dashboard]
---
# Cost Model + DAU Forecast

The admin-only **`/internal/forecast`** ("Scale & cost forecast") page: for **Today / 500K / 750K /
1M DAU**, the infra footprint → required Supabase tier → total monthly cost → revenue → **gross
margin**. Sub-project 3 of 4 in the AIOS "show the app's true weight/cost and how it scales" ask
(1 = [[Internal Real-vs-Total Metrics]]; 4 = [[Stakeholder Scorecard]]; 2 = live infra telemetry, scoped).

## What it is — and isn't

There is **no DAU/MAU tracking in the app**, so this is deliberately a **what-if capacity/cost model,
not a growth projection**: *"if the platform reaches X DAU, this is the footprint and the economics."*
Every figure is tagged **measured / derived / assumed** so it is honest to show a board or investor.
"Today" is measured-only — DAU-derived rows render `—`, never a fabricated number.

## The model — `src/lib/internal/forecastModel.ts` (pure, deterministic, tested)

Mirrors [[Synthetic Weight Engine]]'s and the scorecard's pattern (constants + pure functions, locked by
unit tests). `buildForecast({ measured, assumptions })` → `{ scenarios, coefficients, notes }`.

- **Measured inputs** (existing hooks — no new reads): current footprint (`usePlatformWeight` latest →
  `db_bytes`/`storage_bytes`); the real registered-user baseline (`usePlatformStats().users.total`);
  the load-run ceiling (`useSimLoadMatrixSummary`); current AI/opex/revenue (`useCostStats`,
  `useOperatingExpenses`, `useRevenueStats`); the compute tier (`useCurrentTierIndex`).
- **Derived (measured) coefficients:** `dbConnsPerConcurrent = db_active_conn_peak / honest_peak_concurrency`
  (~27/4,000 from the 200K run — proof the DB isn't the binding constraint) and `egressBytesPerRequest =
  media_bytes / media_requests`. **Guarded on null AND zero denominators** → documented default constants +
  a `notes[]` line, so no `NaN`/`Infinity` reaches a cell.
- **9 editable assumptions** (`aios_dashboard_settings` KV, founder-tunable, labelled ASSUMED):
  `registered_per_dau`, `db_kb_per_user`, `storage_kb_per_user`, `peak_concurrency_pct`, `requests_per_dau`,
  `ai_cost_per_dau_cents`, `business_share_pct`, `paying_conversion_pct`, `arpu_usd`. Percentages store the
  whole-number percent (8 = 8%); the model divides by 100.
- **Per-scenario math:** registered = DAU × registered_per_dau; peak concurrent = DAU × peak%; DB/storage
  scale with registered users, **floored at today's measured value**; pooled DB conns = peak ×
  dbConnsPerConcurrent; compute tier = smallest `COMPUTE_TIERS` meeting `peak ≤ ramGb ×
  PEAK_CONCURRENT_PER_GB` (2000), else "Custom"; Supabase $ = base + compute + disk overage + egress overage;
  revenue via the **business funnel** (registered × business_share × paying_conversion × ARPU); **AI $ =
  min(uncapped, max($250 floor, 15% of revenue))** (the [[Donny AI Cost Architecture]] kill-switch);
  gross margin $ + % (null on revenue 0); cost/DAU.

## Why admin-only

The page reads **admin-only** sources (`operating_expenses`, `aios_cost_stats` RLS), so a non-admin would
silently see $0 opex and an inflated margin — the exact number the page exists to get right. It is therefore
gated like `/internal/expenses` (`<InternalRoute tier="admin">`, Operate nav group). The **stakeholder**
reach is instead a one-line margin figure fed into the [[Stakeholder Scorecard]] (deferred until PR #350 is on
`main`, since `scorecardModel` lives there).

## Backend

No new table/RPC/policy. One founder-gated migration (`20260727120000`) seeds the 9 `forecast_*` rows into the
existing `aios_dashboard_settings`; the admin panel writes via `.update().eq('key', …)` under its existing
admin-UPDATE RLS. **All nine must be seeded** or an unseeded key's edit matches zero rows and silently no-ops.
The page degrades to coded defaults before the migration is applied.

## Known Issues

- **Load-bearing deploy step:** apply migration `20260727120000` at the careful gate after merge; until then
  the assumptions are the coded defaults (not persisted, not editable-to-storage).
- The compute-tier heuristic (`PEAK_CONCURRENT_PER_GB`) is an **assumption**, not measured (the 200K run's knee
  was client-side); with the default 8% peak concurrency every projected band lands on "Custom" — an honest
  "needs dedicated compute" signal, tunable live.
- Off `origin/main` this branch cannot wire the scorecard tie-in (needs #350) — recorded as deferred.

## See Also

- [[Internal Real-vs-Total Metrics]] — sub-project 1; the real-vs-synthetic counting this dashboard family builds on.
- [[Stakeholder Scorecard]] — sub-project 4; the plain-language layer the forecast's margin line feeds (deferred).
- [[Synthetic Weight Engine]] — the load runs whose measured ceiling supplies the forecast's coefficients.
- [[AIOS Internal Shell]] — how `/internal/*` is navigated and laid out.
