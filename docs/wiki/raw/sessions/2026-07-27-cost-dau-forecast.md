# Session — Cost model + DAU forecast (/internal/forecast) — 2026-07-27

Sub-project 3 of 4 of the AIOS "true weight/cost + how it scales" founder ask. Built an admin-only
`/internal/forecast` page + a pure forecast model.

## What shipped (branch `feat/internal-cost-dau-forecast`, off origin/main)

- `src/lib/internal/forecastModel.ts` — pure `buildForecast(input)`: for Today / 500K / 750K / 1M DAU →
  registered users, peak concurrent, DB/storage, pooled DB conns vs ceiling, compute tier, Supabase $,
  AI $ (capped), other opex, total cost, revenue, gross margin ($ + %), cost/DAU. Constants: `FORECAST_KEYS`
  + `DEFAULT_ASSUMPTIONS` (9 keys), `SUPABASE_PRICING`, `PEAK_CONCURRENT_PER_GB=2000`, `AI_FLOOR_USD=250`,
  default coefficient fallbacks. Reuses `COMPUTE_TIERS`/`GB` from `weightThresholds`.
- `src/hooks/internal/useForecastAssumptions.ts` — read 9 KV rows + admin update (existing `aios_dashboard_settings`
  admin-UPDATE RLS; no new backend).
- `supabase/migrations/20260727120000_forecast_assumptions_settings.sql` — seeds the 9 keys. **Founder-gated,
  NOT applied.**
- `src/components/internal/ForecastTable.tsx` (+ test) — the four-scenario table + a recharts cost-vs-revenue
  line chart. `src/components/internal/ForecastAssumptionsPanel.tsx` — live-tunable inputs.
- `src/pages/internal/InternalForecast.tsx` — wires the hooks → model → table + panel.
- `src/App.tsx` + `InternalLayout.tsx` — admin-gated route + Operate-group nav.

## Key decisions / gotchas

- **Full unit-economics** (cost + revenue + margin), founder-chosen. Revenue via a business funnel
  (business_share → paying_conversion → ARPU), matching "creators earn, businesses pay".
- **Admin-only page.** The cost inputs (`operating_expenses`, `aios_cost_stats`) are admin-only RLS, so a
  non-admin would silently see $0 opex → inflated margin. Gated like `/internal/expenses`. Caught by the
  spec review. The stakeholder-facing margin line goes into the scorecard (deferred, needs #350 on main).
- **Measured vs assumed.** Load-run coefficients (DB conns/concurrent ≈ 27/4000; egress bytes/request) are
  measured; the tier heuristic + growth/monetization are labelled assumptions. Coefficient derivation guards
  null AND zero denominators → documented defaults + a visible note.
- **AI cap = min(uncapped, max($250 floor, 15% revenue))** — the pricing-architecture kill-switch, floor
  restored after spec review flagged the drop.
- **No DAU tracking exists** → the forecast is a what-if capacity/cost model, not a growth projection. "Today"
  is measured-only (— for DAU-derived rows).
- **Off origin/main** (no #346/#350): source real registered users from `usePlatformStats().users.total`, NOT
  `users_total_real` (absent from `PlatformWeightRow`'s type on this branch — would fail typecheck).
- recharts under jsdom needs a `ResizeObserver` stub in the component test.

## Review

Two spec-review rounds (admin-gating; egress/tier/AI-floor constants; #350-status refs; 8→9 key sync) + two
plan-review rounds (real-user source P1; §10 tests; hints; formatting). Subagent-driven build (7 tasks). 17
tests, typecheck + lint + build green, Codex second review.
