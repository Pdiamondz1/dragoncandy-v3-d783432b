-- pg_net defaults to a FIVE SECOND timeout. This job survives only because it
-- currently finishes in 1-4s; Task 5 grows its input. Without this, every
-- scheduled run would record a timeout while cron.job still looked healthy.
-- The sibling account-metrics-capture cron hit exactly this and is pinned to 90s.
select cron.unschedule('content-performance-capture')
where exists (select 1 from cron.job where jobname = 'content-performance-capture');

select cron.schedule(
  'content-performance-capture',
  '0 9 * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'content_capture_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'content_capture_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cron$
);
