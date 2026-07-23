-- pg_cron for auto-approve-content. Vault-sourced URL + bearer (mirrors 20260627000100_dre_award_cron).
--
-- Revives auto-approval: the function was deployed (v60) but had NEVER been scheduled — no pg_cron
-- job existed for it — so overdue 'submitted' content was never auto-approved and creators were never
-- auto-paid. This makes the scheduler source-controlled so a fresh deploy actually invokes the function
-- (previously it was a manual dashboard/SQL step that was skipped). See 20260723120000 (the
-- state-machine drift repair) + docs/wiki/concepts/content-delivery-state-machine.md.
--
-- PREREQUISITE Vault secrets per environment (out-of-band, never committed — same pattern as the
-- rest of the scheduled fleet, e.g. dre_award_engine_url):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/auto-approve-content', 'auto_approve_content_url');
--   -- aios_ingest_key must already hold the project's sb_secret_… service-role key (shared with AIOS).
--   -- auto-approve-content authorizes the bearer via _shared/ingest-auth.ts (isAuthorizedIngest),
--   -- which accepts the injected service-role key OR AIOS_INGEST_SECRET.
--
-- cron.schedule upserts by job name, so re-applying is idempotent (updates the existing job in place).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'auto-approve-content',
  '*/15 * * * *',                       -- every 15 min (DragonRush review window is 4h — ample headroom)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'auto_approve_content_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
