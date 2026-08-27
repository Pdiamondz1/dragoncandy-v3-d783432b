-- pg_cron for publish-media-reaper. Vault-sourced URL + bearer, mirroring
-- 20260826280000 / 20260826360000 (the two publish sweeps) and 20260825130000.
--
-- WHY DAILY, WHERE THE SWEEPS RUN EVERY MINUTE.
--
-- The sweeps' interval IS a product promise -- it is the worst-case lateness on
-- "post at 6pm". Nothing here is late. The shortest retention this collects is
-- six hours, so running more often than once a day cannot delete anything
-- sooner; it would only ask the same question more times and get the same
-- answer. The cost of being wrong, meanwhile, is bounded by how often it runs.
--
-- 04:20 UTC because `instagram-refresh-sweep` holds 04:00 and there is no
-- reason for two daily jobs to contend for the same minute.
--
-- WHAT A RUN THAT DELETES NOTHING MEANS. Almost always: nothing is old enough,
-- which is the healthy state. It is NOT evidence the reaper works -- an empty
-- bucket and a broken query produce the same zero. The response distinguishes
-- them: `scanned` counts what the query selected, `deleted` counts what Storage
-- confirmed removing, and they are reported separately for exactly this reason.
--
-- PREREQUISITE Vault secret per environment (out-of-band, never committed):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/publish-media-reaper',
--     'publish_media_reaper_url');
--   -- aios_ingest_key must already hold the project's service-role key.
--
-- THE FAILURE MODE EVERY VAULT-DRIVEN JOB HERE SHARES: an absent secret means
-- `net.http_post` is called with a NULL url and the job fails quietly. Note
-- also that `cron.job_run_details` reporting `succeeded` is a WEAKER claim than
-- it looks -- pg_net is asynchronous, so it means the request was queued, not
-- that the function answered. The verdict is in `net._http_response`.
--
-- cron.schedule upserts by job name, so re-applying is idempotent.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'publish-media-reaper',
  '20 4 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'publish_media_reaper_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
