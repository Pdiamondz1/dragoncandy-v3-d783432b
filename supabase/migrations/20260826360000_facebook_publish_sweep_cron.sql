-- pg_cron for facebook-publish-sweep. Vault-sourced URL + bearer, mirroring
-- 20260826280000 (instagram-publish-sweep), 20260825130000
-- (instagram-refresh-sweep) and 20260723190000 (reconcile-pending-flushes).
--
-- WHY A SECOND JOB RATHER THAN ONE SWEEP OVER BOTH PLATFORMS.
--
-- The queue is shared and the schedule is not, because `claim_publish_job`
-- takes `p_rate_limit` and the two platforms do not agree on what that number
-- is. Instagram's 100-per-rolling-24-hours is Meta's own published cap;
-- Facebook's Page limit is a formula over engaged users that cannot be
-- evaluated before a call, so the Facebook sweep passes a SELF-IMPOSED bound
-- instead (see RATE_LIMIT_POSTS in `_shared/facebook-publish.ts`). One sweep
-- claiming the globally-oldest job would apply whichever number it happened to
-- be holding to whichever account it happened to claim.
--
-- Two functions also mean a Meta outage on one product cannot stall the other:
-- the skip lists are per-run, so a shared sweep spending its ten iterations on
-- a throttled platform would starve the healthy one.
--
-- WHY EVERY MINUTE. Same reason as the Instagram sweep: this interval IS the
-- worst-case lateness on "post at 6pm", and it doubles as the poll loop for
-- Meta's transcode, which finishes on its own clock. The cost of a tick with
-- nothing due is one `claim_publish_job` call that returns `nothing due` on a
-- partial index and stops.
--
-- The claim TTL (15 minutes, in the function) is deliberately far longer than
-- the interval, so ticks overlapping on a slow Meta call contend on the
-- advisory lock rather than stealing each other's jobs.
--
-- PREREQUISITE Vault secret per environment (out-of-band, never committed):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/facebook-publish-sweep',
--     'facebook_publish_sweep_url');
--   -- aios_ingest_key must already hold the project's service-role key, shared
--   -- with AIOS. facebook-publish-sweep authorizes the bearer via
--   -- _shared/ingest-auth.ts (isAuthorizedIngest), which accepts the injected
--   -- service-role key OR AIOS_INGEST_SECRET.
--
-- THE FAILURE MODE THIS SHARES WITH EVERY VAULT-DRIVEN JOB HERE: if the secret
-- is absent, `net.http_post` is called with a NULL url and the job fails
-- quietly in cron.job_run_details rather than anywhere anyone looks. The UI
-- would show a queue of jobs sitting at `queued` with no error on any of them,
-- which reads as "nothing was scheduled" rather than "the scheduler is dead".
-- Check cron.job_run_details as part of go-live, not after the first complaint.
--
-- cron.schedule upserts by job name, so re-applying is idempotent.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'facebook-publish-sweep',
  '* * * * *',                          -- every minute: this is the "post at 6pm" promise
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_publish_sweep_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
