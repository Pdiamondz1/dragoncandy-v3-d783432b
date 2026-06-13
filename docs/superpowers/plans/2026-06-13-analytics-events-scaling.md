# Analytics Events Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop persisting the `performance_metric` telemetry firehose to Postgres, purge the ~335K dead rows it created, and add a self-adjusting retention policy with a monitoring watermark so `analytics_events` stays bounded as the app scales.

**Architecture:** Three frontend edits remove the high-frequency emitters and neuter `trackPerformance` to a no-op (zero `performance_metric` inserts). A pure helper + UI wire-up adds a budget watermark alert to the existing `/internal/weight` page. A SQL migration adds a `SECURITY DEFINER` purge function + daily `pg_cron` job (90-day ceiling OR 1M-row budget, whichever is tighter). A one-time prod purge + `VACUUM FULL` reclaims the disk — run after the stop-write change is live.

**Tech Stack:** React 18 + TypeScript (strict), Vitest, Supabase Postgres (pg_cron), Supabase MCP for prod DB operations.

**Spec:** `docs/superpowers/specs/2026-06-13-analytics-events-scaling-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/components/analytics/PerformanceMonitor.tsx` | Browser telemetry registration | Modify — remove memory/measure emitters, keep error handlers |
| `src/hooks/useAnalytics.ts` | Analytics tracking API | Modify — drop page-load effect, make `trackPerformance` a no-op |
| `src/lib/internal/weightThresholds.ts` | Pure scaling-alert rules | Modify — add budget constant + `computeAnalyticsBudgetAlert` |
| `src/lib/internal/weightThresholds.test.ts` | Unit tests for the above | Modify — add budget-alert cases |
| `src/pages/internal/InternalWeight.tsx` | `/internal/weight` page | Modify — merge budget alert into rendered alerts |
| `supabase/migrations/20260613120000_analytics_events_retention.sql` | Retention function + cron | Create |
| Prod DB (via MCP, no file) | One-time purge + VACUUM | Operational |

**Deployment ordering (critical):** stop-write frontend (Tasks 1) ships and is verified live → retention migration applied (Task 5) → one-time purge + VACUUM (Task 6). This avoids purging rows that the old client would immediately re-accumulate. Tasks 2–4 (watermark) are independent and ride along in the same frontend PR.

---

## Task 1: Stop the `performance_metric` firehose (frontend)

**Files:**
- Modify: `src/components/analytics/PerformanceMonitor.tsx`
- Modify: `src/hooks/useAnalytics.ts`

This is telemetry removal — the verification is a clean build/typecheck plus confirming (later, in prod) that no new `performance_metric` rows appear. There is no unit test added here; the existing codebase does not mock these browser/Supabase paths and a brittle mock would add no real safety.

- [ ] **Step 1: Edit `PerformanceMonitor.tsx` — remove the two high-frequency emitters, keep error handlers**

Replace the whole `useEffect` body so it only registers the error listeners. Final file:

```tsx
import React, { useEffect } from 'react';
import { useAnalyticsContext } from './AnalyticsProvider';

export const PerformanceMonitor: React.FC = () => {
  const { trackEvent } = useAnalyticsContext();

  useEffect(() => {
    // Capture client-side errors (low volume, genuinely useful).
    const errorHandler = (event: ErrorEvent) => {
      trackEvent('javascript_error', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
      });
    };

    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      trackEvent('unhandled_promise_rejection', {
        reason: event.reason?.toString(),
        stack: event.reason?.stack
      });
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  }, [trackEvent]);

  return null; // This component doesn't render anything
};
```

This removes the `PerformanceObserver('measure')` loop and the 30 s `memory_used` `setInterval` (the source of ~99.99% of rows), and drops the now-unused `trackPerformance` import.

- [ ] **Step 2: Edit `useAnalytics.ts` — drop the page-load effect and neuter `trackPerformance`**

In `src/hooks/useAnalytics.ts`:

Replace the `trackPerformance` callback (currently routing to `trackEventOptimized('performance_metric', …)`) with a no-op that never touches the DB:

```ts
  // Performance telemetry is intentionally NOT persisted to analytics_events
  // (it was 99.99% of the table and read by nothing — see the analytics-events
  // scaling spec, 2026-06-13). Kept as a dev-only no-op so the context
  // interface stays stable and the firehose can never be reintroduced.
  const trackPerformance = useCallback(
    (metric: string, value: number, context?: Record<string, unknown>) => {
      if (import.meta.env.DEV) {
        console.debug('[perf]', metric, value, context);
      }
    },
    []
  );
```

Delete the entire `useEffect` block that calls `measurePageLoad()` / `trackPerformance('page_load_time', …)` (the mount effect). If `trackEventOptimized` becomes unused after this, leave the existing destructure as-is (other methods still use it) — only remove imports that are genuinely unreferenced (let the linter guide you).

- [ ] **Step 3: Build + typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

Run: `npm run build`
Expected: build completes successfully.

- [ ] **Step 4: Lint (catch unused imports/vars introduced by the removals)**

Run: `npm run lint`
Expected: no new errors. Prefix any genuinely-unused leftover with `_` or remove it.

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/PerformanceMonitor.tsx src/hooks/useAnalytics.ts
git commit -m "fix(analytics): stop persisting performance_metric firehose to Postgres"
```

---

## Task 2: Budget watermark helper (`computeAnalyticsBudgetAlert`) — TDD

**Files:**
- Modify: `src/lib/internal/weightThresholds.ts`
- Test: `src/lib/internal/weightThresholds.test.ts`

This is a pure function — full TDD. Mirrors the existing `computeWeightAlerts` style (info/warning/critical + an upgrade hint).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/internal/weightThresholds.test.ts`. Add `computeAnalyticsBudgetAlert` and `ANALYTICS_EVENTS_ROW_BUDGET` to the import list at the top, then:

```ts
describe('computeAnalyticsBudgetAlert', () => {
  it('stays quiet well under the budget', () => {
    expect(computeAnalyticsBudgetAlert(100_000)).toHaveLength(0);
  });

  it('stays quiet for an undefined row count', () => {
    expect(computeAnalyticsBudgetAlert(undefined)).toHaveLength(0);
  });

  it('warns at 80% of the budget', () => {
    const alerts = computeAnalyticsBudgetAlert(Math.round(ANALYTICS_EVENTS_ROW_BUDGET * 0.81));
    expect(alerts.some((a) => a.severity === 'warning')).toBe(true);
    expect(alerts.some((a) => a.severity === 'critical')).toBe(false);
  });

  it('goes critical at 95% of the budget', () => {
    const alerts = computeAnalyticsBudgetAlert(Math.round(ANALYTICS_EVENTS_ROW_BUDGET * 0.96));
    expect(alerts.some((a) => a.severity === 'critical')).toBe(true);
  });

  it('uses a title distinct from the disk alerts (no React key collision)', () => {
    const alerts = computeAnalyticsBudgetAlert(ANALYTICS_EVENTS_ROW_BUDGET);
    expect(alerts[0].title.toLowerCase()).not.toContain('disk');
    expect(alerts[0].title).toMatch(/analytics/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/internal/weightThresholds.test.ts`
Expected: FAIL — `computeAnalyticsBudgetAlert is not a function` / import error.

- [ ] **Step 3: Implement in `weightThresholds.ts`**

Add near the other constants:

```ts
/**
 * Soft cap the retention cron enforces on analytics_events
 * (purge_stale_analytics_events.v_budget). Keep these two in sync — raise both
 * only when deliberately upgrading the Supabase tier.
 */
export const ANALYTICS_EVENTS_ROW_BUDGET = 1_000_000;
const ANALYTICS_WARNING_RATIO = 0.8;
const ANALYTICS_CRITICAL_RATIO = 0.95;
```

Add the function (after `computeWeightAlerts`):

```ts
/**
 * Watermark alert for the analytics_events row budget. The daily retention cron
 * trims the table back to ANALYTICS_EVENTS_ROW_BUDGET, so crossing the warning
 * line means the *effective* retention window is shrinking below 90 days — the
 * signal to raise the cap or move to a larger Supabase tier.
 */
export function computeAnalyticsBudgetAlert(rowCount: number | undefined): WeightAlert[] {
  if (rowCount === undefined || rowCount <= 0) return [];
  const ratio = rowCount / ANALYTICS_EVENTS_ROW_BUDGET;
  const pct = Math.round(ratio * 100);
  const hint =
    'The daily retention job is holding the table at this cap, so older events ' +
    'are being trimmed sooner. Raise ANALYTICS_EVENTS_ROW_BUDGET (and the cron ' +
    'v_budget) or move to a larger Supabase tier.';

  if (ratio >= ANALYTICS_CRITICAL_RATIO) {
    return [{
      severity: 'critical',
      title: 'Analytics table at budget',
      detail: `analytics_events is at ${pct}% of its ${ANALYTICS_EVENTS_ROW_BUDGET.toLocaleString()}-row budget. ${hint}`,
    }];
  }
  if (ratio >= ANALYTICS_WARNING_RATIO) {
    return [{
      severity: 'warning',
      title: 'Analytics table nearing budget',
      detail: `analytics_events is at ${pct}% of its ${ANALYTICS_EVENTS_ROW_BUDGET.toLocaleString()}-row budget. ${hint}`,
    }];
  }
  return [];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/internal/weightThresholds.test.ts`
Expected: PASS (existing disk-alert tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/internal/weightThresholds.ts src/lib/internal/weightThresholds.test.ts
git commit -m "feat(internal): analytics_events budget watermark helper"
```

---

## Task 3: Wire the watermark alert into `/internal/weight`

**Files:**
- Modify: `src/pages/internal/InternalWeight.tsx`

- [ ] **Step 1: Import and merge the budget alert**

In `src/pages/internal/InternalWeight.tsx`:

Add `computeAnalyticsBudgetAlert` to the import from `@/lib/internal/weightThresholds`.

Replace the alerts line:

```ts
  const alerts = computeWeightAlerts(snapshots);
```

with:

```ts
  const alerts = [
    ...computeWeightAlerts(snapshots),
    ...computeAnalyticsBudgetAlert(latest.row_counts?.analytics_events),
  ];
```

`latest` is a `PlatformWeightRow` (returned by `usePlatformWeight`), which includes `row_counts`, so `latest.row_counts?.analytics_events` type-checks. No JSX changes — the existing alert card loop already renders `info`/`warning`/`critical` and keys by `alert.title` (the new title is distinct).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS. (If it complains that `row_counts` is absent on the alerts call, add `row_counts?: Record<string, number>` to the `WeightSnapshot` interface in `weightThresholds.ts` — but `latest` is `PlatformWeightRow`, so this should not be needed.)

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/pages/internal/InternalWeight.tsx
git commit -m "feat(internal): surface analytics_events budget watermark on /internal/weight"
```

---

## Task 4: Retention migration file (function + pg_cron)

**Files:**
- Create: `supabase/migrations/20260613120000_analytics_events_retention.sql`

This task only creates and commits the migration file. It is **applied to prod in Task 5** (Lovable does not deploy migrations — they go through Supabase MCP per project convention).

- [ ] **Step 1: Create the migration file**

```sql
-- Self-adjusting retention for analytics_events. Mirrors the
-- capture_platform_weight() pattern (SECURITY DEFINER, search_path pinned,
-- REVOKE/GRANT, idempotent cron.schedule). See the analytics-events scaling
-- spec (2026-06-13). pg_cron is already installed.
--
-- Deletes by whichever bound is tighter:
--   1. time ceiling  — created_at older than 90 days
--   2. row budget    — keep only the newest 1,000,000 rows
-- The row budget is the automation: as event volume rises, the effective time
-- window shrinks to hold the table at the cap. Keep v_budget in sync with
-- ANALYTICS_EVENTS_ROW_BUDGET in src/lib/internal/weightThresholds.ts.

CREATE OR REPLACE FUNCTION public.purge_stale_analytics_events()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_budget  constant integer  := 1000000;
  v_max_age constant interval  := interval '90 days';
  v_cutoff  timestamptz;
BEGIN
  -- 1. time ceiling
  DELETE FROM public.analytics_events
  WHERE created_at < now() - v_max_age;

  -- 2. row-budget trim: find the created_at of the newest row beyond the budget,
  --    then delete everything older than it.
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

-- cron.schedule upserts by job name, so re-applying is idempotent.
SELECT cron.schedule(
  'purge-stale-analytics-events',
  '30 4 * * *',                                    -- daily 04:30 UTC
  $$SELECT public.purge_stale_analytics_events();$$
);
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/20260613120000_analytics_events_retention.sql
git commit -m "feat(db): self-adjusting analytics_events retention (90d + 1M-row budget)"
```

---

## Task 5: Apply the retention migration to prod (MCP)

**Files:** none (operational; prod project `zocahiffooqdybdhguqv`)

> Do this only **after** the Task 1–4 frontend PR is merged and the stop-write change is confirmed live in prod (see Task 6 pre-check). Order: stop-write live → migration → purge.

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP `apply_migration` with name `analytics_events_retention` and the exact SQL body from Task 4.

- [ ] **Step 2: Verify the function and cron job exist**

Use MCP `execute_sql`:

```sql
SELECT proname FROM pg_proc WHERE proname = 'purge_stale_analytics_events';
SELECT jobname, schedule FROM cron.job WHERE jobname = 'purge-stale-analytics-events';
```
Expected: one function row; one cron row with schedule `30 4 * * *`.

- [ ] **Step 3: Smoke-run the function (no-op on current small/recent table)**

```sql
SELECT public.purge_stale_analytics_events();
SELECT count(*) FROM public.analytics_events;   -- unchanged vs. before (all rows < 90d, < 1M)
```
Expected: runs without error; count unchanged.

- [ ] **Step 4: Check advisors**

Use MCP `get_advisors` (type `security`) — confirm no new warning for the `SECURITY DEFINER` function (the explicit `REVOKE`/`SET search_path` mirrors the accepted `capture_platform_weight` pattern).

---

## Task 6: One-time purge + reclaim disk (MCP)

**Files:** none (operational; prod)

- [ ] **Step 1: Pre-check — confirm the stop-write change is live**

Run twice ~10 min apart via MCP `execute_sql`:

```sql
SELECT count(*) AS perf_rows
FROM public.analytics_events
WHERE event_type = 'performance_metric'
  AND created_at > now() - interval '15 minutes';
```
Expected: trends to **0** new rows — proving the deployed client stopped writing. Do not proceed until it does.

- [ ] **Step 2: Capture before-size**

```sql
SELECT count(*) AS total_rows,
       pg_size_pretty(pg_total_relation_size('public.analytics_events')) AS total_size,
       pg_size_pretty(pg_database_size(current_database())) AS db_size;
```
Record the numbers (expect ~335K rows, ~192 MB table, ~236 MB DB).

- [ ] **Step 3: Delete the dead rows**

```sql
DELETE FROM public.analytics_events WHERE event_type = 'performance_metric';
```
Expected: ~335,120 rows deleted; the ~43 real rows remain.

- [ ] **Step 4: Reclaim disk (VACUUM FULL — outside a transaction)**

Run via MCP `execute_sql` as a standalone statement (not inside a migration/txn):

```sql
VACUUM (FULL, ANALYZE) public.analytics_events;
```
Brief `ACCESS EXCLUSIVE` lock; trivial at current traffic.

- [ ] **Step 5: Capture after-size and confirm reclaim**

```sql
SELECT count(*) AS total_rows,
       pg_size_pretty(pg_total_relation_size('public.analytics_events')) AS total_size,
       pg_size_pretty(pg_database_size(current_database())) AS db_size;
```
Expected: ~43 rows, table <1 MB, DB ~46 MB (down from ~236 MB).

---

## Task 7: Final verification & memory note

- [ ] **Step 1: Frontend regression sanity**

Run: `npm run test`
Expected: trust the "Tests N passed, 0 failed" line (per project note, the runner exits non-zero due to unrelated pre-existing e2e file failures in nested worktrees). Confirm the `weightThresholds` suite passes.

- [ ] **Step 2: Prod UI check (per CLAUDE.md)**

After deploy, open `/internal/weight` (internal admin): confirm the "Largest tables" card shows `analytics_events` dropped to a tiny count, and that no budget watermark alert is firing. Screenshot desktop + mobile viewports.

- [ ] **Step 3: Confirm no re-accumulation (next day)**

Re-run the Step-1 perf-row query from Task 6 the following day: still ~0 `performance_metric` rows. Confirm `platform_weight` snapshot shows the reduced `analytics_events` count and `db_bytes`.

- [ ] **Step 4: Record a project memory**

Add a `project`-type memory: analytics_events firehose fixed — `performance_metric` no longer persisted; one-time purge reclaimed ~190 MB; self-adjusting retention cron (`purge-stale-analytics-events`, 90d + 1M-row budget) live; budget knob is paired between SQL `v_budget` and `ANALYTICS_EVENTS_ROW_BUDGET`. Link to the spec.

---

## Notes for the implementer

- **DRY/paired knob:** the row budget lives in two places by necessity (SQL `v_budget` and TS `ANALYTICS_EVENTS_ROW_BUDGET`). Both files' comments call this out — change them together.
- **Do not** touch the Supabase file-Storage 1 GB ceiling here; that's a separate billing/CDN decision (the spec's non-goals).
- **Do not** drop `idx_analytics_events_page_url` in this work (deferred optional optimization).
- Migrations deploy via MCP, not Lovable push (frontend-only deploy). Keep Task 5/6 prod ops separate from the frontend merge.
