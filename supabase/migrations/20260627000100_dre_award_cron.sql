-- pg_cron for dre-award-engine. Vault-sourced URL + bearer (NOT app.settings GUCs).
-- PREREQUISITE Vault secrets per environment (out-of-band, never committed):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/dre-award-engine', 'dre_award_engine_url');
--   -- aios_ingest_key must already hold the project's sb_secret_… key (shared with AIOS).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dre-award-engine',
  '*/5 * * * *',                        -- every 5 minutes (near-real-time)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'dre_award_engine_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
