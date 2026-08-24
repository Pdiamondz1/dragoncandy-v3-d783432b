-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260805030119 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

select cron.unschedule('account-metrics-capture')
where exists (select 1 from cron.job where jobname = 'account-metrics-capture');

select cron.schedule(
  'account-metrics-capture',
  '30 9 * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'account_metrics_capture_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'account_metrics_capture_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cron$
);
