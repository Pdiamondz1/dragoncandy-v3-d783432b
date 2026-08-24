-- pg_cron for instagram-refresh-sweep. Vault-sourced URL + bearer (mirrors
-- 20260723190000_reconcile_pending_flushes_cron).
--
-- WHY A SCHEDULE IS PART OF THE FEATURE, NOT A FOLLOW-UP.
--
-- Instagram has no refresh token: the 60-day access token IS the credential, and
-- Meta will only extend it while it is still valid. So a connection nobody opens
-- for 60 days is not stale, it is DEAD, and the only recovery is the user
-- consenting again.
--
-- `instagram-connection.ts` refreshes on the read path, which covers active
-- users for free. This job covers the rest — which is precisely the population
-- the read path cannot reach, and therefore the entire reason the sweep exists.
-- Shipping the function without this migration would have left a guard that
-- never runs, protecting exactly nobody while looking complete. (Caught by the
-- Codex second review.)
--
-- DAILY is deliberate, not conservative. The sweep acts once a connection has
-- less than 15 days of life left, so it gets ~15 attempts before anything is
-- lost — several consecutive days of Meta or cron trouble cost nothing, and a
-- tighter schedule would only add load. 04:00 UTC keeps it away from the 3am
-- AIOS routines.
--
-- PREREQUISITE Vault secret per environment (out-of-band, never committed — same
-- pattern as the rest of the scheduled fleet):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/instagram-refresh-sweep',
--     'instagram_refresh_sweep_url');
--   -- aios_ingest_key must already hold the project's sb_secret_… service-role key
--   -- (shared with AIOS). instagram-refresh-sweep authorizes the bearer via
--   -- _shared/ingest-auth.ts (isAuthorizedIngest), which accepts the injected
--   -- service-role key OR AIOS_INGEST_SECRET.
--
-- NOTE the failure mode this shares with every other Vault-driven job here: if
-- the secret is absent, `net.http_post` is called with a NULL url and the job
-- fails quietly in cron.job_run_details rather than anywhere anyone looks. Check
-- there before concluding the function is broken.
--
-- cron.schedule upserts by job name, so re-applying is idempotent (updates the
-- existing job in place).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'instagram-refresh-sweep',
  '0 4 * * *',                          -- daily 04:00 UTC; the 15-day window gives ~15 retries
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'instagram_refresh_sweep_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
