-- Schedule account-metrics-capture.
--
-- Mirrors the content-performance-capture cron (migration 20260610150000):
-- pg_cron + net.http_post, with the URL and bearer held in Vault rather than
-- inlined here.
--
-- Until this exists the function is inert — deploying it accomplished nothing
-- operationally, which is the same "only runs when someone happens to trigger
-- it" failure the job was built to fix. It was left unscheduled deliberately
-- until two manual runs proved the response shape; both have now passed.
--
-- Runs at 09:30 UTC, 30 minutes AFTER content-performance-capture (09:00). The
-- offset is deliberate: this job issues PARALLEL requests (concurrency 5) on the
-- same shared OUTSTAND_API_KEY that the sequential post-capture job uses, and
-- Outstand's rate limits are dynamic and scale with connected-account count.
-- Overlapping them would put an avoidable burst on a shared budget.

-- Reuse the bearer already provisioned for the sibling job by COPYING it, so the
-- value is never written into a migration file or seen by whoever applies this.
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

-- Idempotent: drop any prior schedule before creating, so re-applying does not
-- leave two jobs racing each other against the same rate-limit budget.
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
    -- pg_net defaults to a FIVE SECOND timeout. This job takes 6-12s today (two
    -- accounts x three ranges, each an external call), so the default would make
    -- every scheduled run record a timeout error — a cron that looks healthy in
    -- cron.job and fails every night. Verified by running this exact command
    -- before scheduling: it returned
    --   'Timeout of 5000 ms reached. Total time: 5000.182000 ms'
    -- content-performance-capture escapes this only because it finishes in 1-4s.
    --
    -- 90s comfortably covers the function's own RUN_BUDGET_MS (60s) plus cold
    -- start, so the HTTP client outlives the work rather than the reverse.
    timeout_milliseconds := 90000
  );
  $cron$
);
