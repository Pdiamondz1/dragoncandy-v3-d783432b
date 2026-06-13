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
