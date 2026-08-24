-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260805030017 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'account_metrics_capture_key') then
    perform vault.create_secret(
      (select decrypted_secret from vault.decrypted_secrets where name = 'content_capture_key'),
      'account_metrics_capture_key',
      'Bearer for the account-metrics-capture cron (copy of content_capture_key)'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'account_metrics_capture_url') then
    perform vault.create_secret(
      'https://zocahiffooqdybdhguqv.supabase.co/functions/v1/account-metrics-capture',
      'account_metrics_capture_url',
      'Invocation URL for the account-metrics-capture cron'
    );
  end if;
end $$;

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
    body    := '{}'::jsonb
  );
  $cron$
);
