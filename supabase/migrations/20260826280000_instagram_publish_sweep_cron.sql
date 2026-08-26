-- pg_cron for instagram-publish-sweep. Vault-sourced URL + bearer, mirroring
-- 20260825130000 (instagram-refresh-sweep) and 20260723190000
-- (reconcile-pending-flushes).
--
-- WHY EVERY MINUTE, WHERE THE REFRESH SWEEP IS DAILY.
--
-- The two jobs answer different questions and the schedules are not
-- interchangeable. The refresh sweep acts on a 15-day window, so daily gives it
-- fifteen attempts and a tighter schedule would only add load. This one carries
-- the product promise "post at 6pm" -- the cron interval IS the worst-case
-- lateness a user sees -- and it is also the poll loop for Meta's transcode,
-- which finishes on its own clock somewhere in the tens of seconds. Anything
-- slower than a minute makes a Reel wait for the next tick after it was ready.
--
-- The cost of the extra frequency is close to nothing: a tick with nothing due
-- is one `claim_publish_job` call that returns `nothing due` on a partial index
-- and stops.
--
-- A `*/5` variant was considered and rejected for exactly the poll reason. The
-- claim TTL (15 minutes, in the function) is deliberately far longer than the
-- interval, so ticks overlapping on a slow Meta call contend on the advisory
-- lock rather than stealing each other's jobs.
--
-- PREREQUISITE Vault secret per environment (out-of-band, never committed):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/instagram-publish-sweep',
--     'instagram_publish_sweep_url');
--   -- aios_ingest_key must already hold the project's service-role key, shared
--   -- with AIOS. instagram-publish-sweep authorizes the bearer via
--   -- _shared/ingest-auth.ts (isAuthorizedIngest), which accepts the injected
--   -- service-role key OR AIOS_INGEST_SECRET.
--
-- THE FAILURE MODE THIS SHARES WITH EVERY VAULT-DRIVEN JOB HERE: if the secret
-- is absent, `net.http_post` is called with a NULL url and the job fails
-- quietly in cron.job_run_details rather than anywhere anyone looks. That is
-- worse here than elsewhere -- a refresh sweep that silently does not run costs
-- a connection in 60 days, this one silently never posts anything at all, and
-- the UI would show a queue of jobs sitting at `queued` with no error on any of
-- them. Check cron.job_run_details before concluding the function is broken,
-- and check it as part of go-live rather than after the first complaint.
--
-- cron.schedule upserts by job name, so re-applying is idempotent.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'instagram-publish-sweep',
  '* * * * *',                          -- every minute: this is the "post at 6pm" promise
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'instagram_publish_sweep_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
