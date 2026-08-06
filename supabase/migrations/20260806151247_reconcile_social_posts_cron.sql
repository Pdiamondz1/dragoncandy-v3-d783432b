-- Hourly reconciliation sweep (reconcile-social-posts edge function).
--
-- outstand-webhook is currently the ONLY writer of social_post_log. Every
-- publish path writes its donny_scheduled_posts row AFTER the Outstand
-- publish call returns, so a fast webhook delivery can beat that write, find
-- no matching schedule row, and -- since Outstand does not retry a 200
-- response -- the post is permanently unmeasured. A webhook outage loses
-- every post published during it, with no recovery. This job asks Outstand
-- directly what published and re-drives the SAME matching logic the webhook
-- already applies (see supabase/functions/reconcile-social-posts).
--
-- Hourly, not daily like content-performance-capture: the race this closes is
-- typically a sub-second write-ordering gap that resolves on the very next
-- run regardless of cadence, but the OTHER failure mode -- an actual webhook
-- outage -- is open-ended, and hourly bounds exposure to at most an hour of
-- missed deliveries without hammering the provider (24 calls/day against a
-- paginated, mostly-empty-page endpoint). Set an explicit
-- timeout_milliseconds -- pg_net's default is 5s and this job's own
-- RUN_BUDGET_MS is 60s.
--
-- Vault-based, mirroring content-performance-capture's cron exactly (not the
-- dead `app.settings.*` GUC pattern) -- see that migration's comment for why.
--
-- PREREQUISITE -- register these two Vault secrets per environment BEFORE this
-- runs (out-of-band; never commit the values; founder-gated per this branch's
-- task brief -- NOT created by this migration):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/reconcile-social-posts',
--     'reconcile_social_posts_url');
--   select vault.create_secret('<service_role_or_sb_secret_key>', 'reconcile_social_posts_key');
-- If a secret is missing, cron.schedule still succeeds but the job posts a
-- null url/bearer at runtime -- treat the two secrets as a hard gate.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('reconcile-social-posts')
where exists (select 1 from cron.job where jobname = 'reconcile-social-posts');

select cron.schedule(
  'reconcile-social-posts',
  '0 * * * *',                          -- hourly, on the hour
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_social_posts_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_social_posts_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cron$
);
