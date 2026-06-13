# Analytics Events Scaling — Design

**Date:** 2026-06-13
**Status:** Approved (design), pending spec review
**Worktree/branch:** `analytics-events` / `worktree-analytics-events`

## Context

`analytics_events` is the largest table in the production database by a wide
margin and was flagged (by Donny's platform-weight analysis) as a scaling risk.
Investigation reframed the problem:

- **335,163 rows / 192 MB** — ~**81% of the entire 236 MB database** (160 MB
  table + 32 MB indexes).
- **99.99%** of rows (335,120) are a single `event_type`: **`performance_metric`**,
  emitted by `src/components/analytics/PerformanceMonitor.tsx`. The rest — likes,
  page-load times, JS errors — total **43 rows**.
- Driven by just **7 users** (121K rows are anonymous/logged-out tabs). The main
  generator is `memory_used` logged **every 30 s per open tab**, plus every
  browser `measure` entry and a per-mount `page_load_time`. Each is a ~500-byte
  row (full `user_agent` + `page_url` + payload).
- **The data is write-only.** The read functions in `useOptimizedAnalytics.ts`
  (`getAnalyticsData`, `getPopularPages`, `getUserActivityTrends`) that would
  surface performance metrics are **not called by any component**. Nothing reads
  or displays it.
- Donny's two suggestions were off-target: the `created_at` index it proposed
  **already exists** (`idx_analytics_events_created_at`), and the "1 GB storage
  ceiling" is **Supabase file Storage (uploads)** — a separate concern from this
  database table.

**Intended outcome:** stop persisting dead telemetry to Postgres, reclaim the
~190 MB it occupies, and add a self-adjusting retention policy so the table stays
bounded as the app scales — wired into the existing `/internal/weight` monitoring
so growth is visible and actionable.

## Goals / Non-goals

**Goals**
1. Stop writing `performance_metric` rows to the database (go-forward).
2. Purge the 335K existing `performance_metric` rows and reclaim disk.
3. Add an automated, self-adjusting retention policy (time ceiling + row budget).
4. Surface a watermark alert on `/internal/weight` when the table nears its budget.

**Non-goals (YAGNI)**
- Routing web-vitals to an external tool (Sentry/PostHog) — explicitly declined.
- Aggregation/rollup downsampling of old events — documented as the next tier
  beyond the row budget, not built now.
- Dropping the unused `idx_analytics_events_page_url` index — optional, deferred.
- Any change to Supabase file Storage / the 1 GB upload ceiling.

## Design

### Part 1 — Stop the firehose at the source (frontend)

Three surgical edits; no architectural change. Real business events continue
through the existing `useAnalyticsBatch` path untouched.

- **`src/components/analytics/PerformanceMonitor.tsx`**
  - Remove the 30 s `memory_used` `setInterval` block and the
    `PerformanceObserver('measure')` block (the two high-frequency emitters).
  - **Keep** the `window 'error'` → `javascript_error` and `'unhandledrejection'`
    → `unhandled_promise_rejection` handlers (useful, negligible volume).
  - The component continues to register only the error handlers.

- **`src/hooks/useAnalytics.ts`**
  - Remove the `measurePageLoad` `useEffect` that emits
    `trackPerformance('page_load_time', …)`.
  - Reimplement `trackPerformance` as a **dev-only `console.debug` no-op** that
    performs **no DB insert**. Keeping the method on the context (a safe stub)
    preserves the `AnalyticsContextType` interface so no consumers break, and
    structurally guarantees `performance_metric` can never be persisted again.

Net effect: `performance_metric` insert rate → **0**.

### Part 2 — One-time purge + reclaim (operational, prod)

Run **after** the Part 1 frontend change is live in prod (so rows aren't
re-accumulating during cleanup):

```sql
DELETE FROM public.analytics_events WHERE event_type = 'performance_metric';
VACUUM (FULL, ANALYZE) public.analytics_events;   -- run outside a txn
```

`VACUUM FULL` rebuilds the table + indexes, returning ~190 MB to disk (table
~160 MB → <1 MB; DB ~236 MB → ~46 MB). Brief `ACCESS EXCLUSIVE` lock —
negligible at 38 users. There is no DELETE RLS policy, so this runs via the
service-role/MCP path (RLS-bypassing) as the table owner. Executed via the
Supabase MCP `execute_sql` (VACUUM cannot run inside the migration transaction).

### Part 3 — Self-adjusting retention (migration + pg_cron)

Mirrors the existing `capture_platform_weight()` pattern
(`supabase/migrations/20260611170000_platform_weight.sql`): `SECURITY DEFINER`,
`SET search_path = public`, `REVOKE`/`GRANT`, idempotent `cron.schedule`.

A new migration adds `purge_stale_analytics_events()` that deletes by **whichever
bound is tighter**:

1. **Time ceiling** — `created_at < now() - interval '90 days'`.
2. **Row budget** — keep at most the newest **1,000,000** rows; delete older.
   The budget is the automation: as event volume rises, the effective time window
   auto-shrinks to hold the table at the cap. No manual re-tuning.

```sql
CREATE OR REPLACE FUNCTION public.purge_stale_analytics_events()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_budget   constant int := 1000000;  -- raise only when upgrading Supabase tier
  v_max_age  constant interval := interval '90 days';
  v_cutoff   timestamptz;
BEGIN
  -- 1. time ceiling
  DELETE FROM public.analytics_events WHERE created_at < now() - v_max_age;

  -- 2. row-budget trim: drop everything older than the newest v_budget rows
  SELECT created_at INTO v_cutoff
  FROM public.analytics_events
  ORDER BY created_at DESC
  OFFSET v_budget LIMIT 1;

  IF v_cutoff IS NOT NULL THEN
    DELETE FROM public.analytics_events WHERE created_at < v_cutoff;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_stale_analytics_events() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_stale_analytics_events() TO service_role;

SELECT cron.schedule(
  'purge-stale-analytics-events',
  '30 4 * * *',                                    -- daily 04:30 UTC
  $$SELECT public.purge_stale_analytics_events();$$
);
```

`pg_cron` is already installed. `cron.schedule` upserts by job name → re-applying
is idempotent. The `OFFSET v_budget LIMIT 1` cutoff is O(n) on `created_at`
(indexed) and runs fine at this scale; if the table ever reaches tens of millions
this becomes the trigger to adopt the documented rollup tier.

**Future tier (documented, not built):** at genuinely high scale, downsample old
raw events into daily aggregate rows and purge raw — the standard warehouse
pattern. The row budget is the bridge until then.

### Part 4 — Watermark alert on `/internal/weight`

The existing `capture_platform_weight()` already snapshots
`row_counts.analytics_events` and `db_bytes` daily. Surface a budget watermark in
the existing alert surface.

- **`src/lib/internal/weightThresholds.ts`**
  - Add `ANALYTICS_EVENTS_ROW_BUDGET = 1_000_000` and warn/critical ratios
    (e.g. `0.8` / `0.95`). Keep this constant in sync with the SQL `v_budget`
    (documented as a paired knob).
  - Add `computeAnalyticsBudgetAlert(rowCount: number | undefined): WeightAlert[]`
    returning an `info`/`warning`/`critical` alert as the latest
    `analytics_events` count approaches/exceeds the budget, with guidance to
    raise the cap / upgrade tier (mirroring the existing `upgradeHint` style).
- **`src/pages/internal/InternalWeight.tsx`**
  - Merge it into the rendered alerts:
    `const alerts = [...computeWeightAlerts(snapshots), ...computeAnalyticsBudgetAlert(latest.row_counts?.analytics_events)]`.
  - No new UI primitives — reuses the existing alert card rendering.

## Data flow

```
Browser tab
  ├─ (REMOVED) memory_used / measure / page_load_time  → performance_metric  ✗
  └─ likes / errors / page_view / user_action / campaign_event
        → useAnalyticsBatch (batch of 10 / 5s) → analytics_events (INSERT)

pg_cron (daily 04:30 UTC) → purge_stale_analytics_events()
        → DELETE by 90d ceiling, then trim to newest 1,000,000 rows

pg_cron (daily 08:30 UTC, existing) → capture_platform_weight()
        → platform_weight.row_counts.analytics_events, db_bytes
        → /internal/weight → computeWeightAlerts + computeAnalyticsBudgetAlert
```

## Testing & Verification

- **Unit:** add cases to the `weightThresholds` test suite for
  `computeAnalyticsBudgetAlert` (below/at warn/at critical/undefined).
- **Build:** `npm run build` + `npm run typecheck` after frontend edits.
- **DB (MCP, prod):**
  - Pre/post: `count(*)` and `pg_total_relation_size('analytics_events')`
    (expect ~190 MB reclaimed; DB ~236 MB → ~46 MB).
  - `SELECT jobname, schedule FROM cron.job WHERE jobname='purge-stale-analytics-events';`
  - Function-level smoke: confirm `purge_stale_analytics_events()` runs without
    error and is a no-op on a small/recent table.
- **Prod after deploy (per CLAUDE.md):** poll `analytics_events` count over time
  to confirm **no new `performance_metric` rows**; screenshot `/internal/weight`
  showing the largest-tables card and (when applicable) the watermark alert.

## Deployment ordering

Per the deploy-ordering discipline (avoid purging then re-accumulating):

1. Merge **Part 1 + Part 4** frontend PR → wait for Lovable prod deploy →
   verify `performance_metric` insert rate is 0.
2. Apply **Part 3** migration (retention function + cron + grants) to prod.
3. Run **Part 2** one-time purge (`DELETE` + `VACUUM FULL ANALYZE`) via MCP.
4. Verify reclaimed size + cron registration + no re-accumulation.

## Files touched

- `src/components/analytics/PerformanceMonitor.tsx` (remove emitters, keep errors)
- `src/hooks/useAnalytics.ts` (drop page_load effect; `trackPerformance` → no-op)
- `src/lib/internal/weightThresholds.ts` (budget constant + alert fn)
- `src/pages/internal/InternalWeight.tsx` (merge watermark alert)
- `src/lib/internal/weightThresholds.test.ts` (new test cases)
- `supabase/migrations/20260613_*_analytics_events_retention.sql` (new)
- Operational (not a file): one-time purge + VACUUM via MCP.
