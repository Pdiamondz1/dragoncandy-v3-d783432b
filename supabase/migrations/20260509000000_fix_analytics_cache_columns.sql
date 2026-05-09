-- Existing rows use string labels ("7d", "30d") as period values,
-- which are not valid timestamps. Clear stale data before altering.
truncate social_analytics_cache;

alter table social_analytics_cache
  alter column period_start type timestamptz using period_start::timestamptz,
  alter column period_end   type timestamptz using period_end::timestamptz;
