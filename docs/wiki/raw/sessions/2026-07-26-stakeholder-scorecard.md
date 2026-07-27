# Session — Plain-language Stakeholder Scorecard (2026-07-26)

Branch: `feat/internal-stakeholder-scorecard` (fresh off `origin/main`). **Sub-project 4 of 4** in the
founder ask to make the AIOS dashboard show the app's true weight/cost and scaling. Sub-projects 1
(synthetic metric parity, PR #346), 2 (live infra telemetry), 3 (cost model + DAU forecast) are separate;
2 and 3 remain scoped/not-built.

## What shipped

A new `/internal/scorecard` page — "How DragonCandy is doing" — that translates the raw AIOS metrics into
four **plain-language** stories a non-technical stakeholder (co-founders, board, advisors on AIOS invite
accounts) can read and speak to investors about, plus a print-optimized **"Export snapshot"** one-pager.

Founder framing that shaped it: the existing metrics are technical ("only I truly understand them"); the
app is **pre-revenue by design**, so the investor-grade story is *traction + capital efficiency + scale
readiness + honest revenue framing*, not revenue.

## The four stories (deterministic, never LLM)

Each: headline number + a "what it means" line + an auto `green/amber/info` signal, under a **founder-set
headline** (editable by admin, stored as an `aios_dashboard_settings` KV row).

- **Traction** — real people building (real-only counts from `aios_platform_stats`); "+N in the last 30
  days" derived from `platform_weight.users_total_real`. green unless real users declined.
- **Capital efficiency** — "~$X/month to run the whole platform"; green if net burn ≤ ceiling **and** AI
  under the 15% cap.
- **Scale headroom** — "~100× room before infra costs rise" (`DISK_LIMIT_BYTES / db_bytes`, clamped
  friendly). Labeled **infrastructure capacity** (physical, synthetic-inclusive → conservative), NOT under
  the "real users only" stamp.
- **Revenue readiness** — "pre-revenue by design; the money switch is built, not flipped" (static; info).

## Key decisions / gotchas

- **Aggregate-burn RPC (`aios_stakeholder_burn`)** — the burn inputs (`operating_expenses`,
  `donny_cost_ledger`) are **admin-only**, but the page targets non-admin stakeholders. A small
  SECURITY-DEFINER, `is_internal_user()`-gated RPC returns ONLY the aggregate `{opex, ai_spend, revenue,
  net_burn}` (no line items / no per-model breakdown), so everyone reads the same figure. It reuses the
  internal-gated `aios_revenue_stats()` for the revenue term but **inlines** the `donny_cost_ledger` sum
  (never calls the admin-only `aios_cost_stats()`). data-exposure-reviewer: PASS.
- **Real-only vs physical:** user/traction/revenue are synthetic-excluded (real-only stamp); the headroom
  card is intentionally physical `db_bytes` (there is no `db_bytes_real`) — correct for a tier question and
  conservative (real usage is far smaller), labeled "incl. test data" so it can't read as a real-user figure.
- **Deterministic phrasing** — a stakeholder-facing figure must be exact/reproducible; zero LLM, zero
  `donny_cost_ledger` cost.
- **Two Codex P2/P3 fixes:** (P2) a failed/loading burn RPC used to feed `net_burn_cents: 0` → a false
  "~$0/month · green" card; now `buildScorecard` renders an honest "Burn data unavailable" **info** state
  when `burn` is null. (P3) `growthLast30Days` could pick the latest snapshot as its own baseline when all
  prior snapshots were >30 days old → a false "+0"; now it always baselines off a prior point (most recent
  at/before the window start, else the earliest).
- **Repo conventions applied:** vitest env is `node`; the component test uses the per-file
  `// @vitest-environment jsdom` + jest-dom pragma. `aios_dashboard_settings` is a KV table with an
  existing admin-UPDATE RLS policy (no client INSERT) → the headline row is **seeded** in the migration and
  admins edit it via a direct `.update()`.

## Files

Migration `20260726173000_scorecard_settings_and_burn.sql` (KV seeds + RPC; founder-gated apply);
`useScorecardSettings.ts`, `useScorecardBurn.ts`, `scorecardModel.ts` (+ tests), `ScorecardStoryCard.tsx`,
`ScorecardSnapshot.tsx`, `InternalScorecard.tsx` (+ test); `users_total_real` typed on
`usePlatformWeight.ts`; route in `App.tsx` (non-admin, matches `weight`); nav item in `InternalLayout.tsx`.

## Verification

typecheck ✓ · lint 0 ✓ · 11 unit/component tests ✓ · build ✓ · **data-exposure-reviewer PASS** · Codex
clean (2 real P2/P3 fixed) · spec-reviewed (2 rounds) + plan-reviewed.

## Deploy (load-bearing)

Apply migration `20260726173000` at the careful gate (seeds the two KV rows + creates the RPC), then
verify `/internal/scorecard` on prod (a non-admin stakeholder should see all four cards incl. burn).
