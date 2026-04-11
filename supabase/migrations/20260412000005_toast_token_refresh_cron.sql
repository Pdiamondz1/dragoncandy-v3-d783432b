-- TASK-008: pg_cron job to invoke toast-token-refresh every 30 minutes
-- pg_cron extension was already enabled in 20260407000003_auto_expire_promotions.sql
-- The Edge Function refreshes any token expiring within 45 minutes,
-- so a 30-minute interval guarantees at least one attempt before expiry.

SELECT cron.schedule(
  'toast-token-refresh',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/toast-token-refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
