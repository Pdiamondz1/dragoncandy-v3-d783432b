-- Daily per-post performance capture (content-performance-capture edge function).
--
-- Vault-based, NOT the dead `app.settings.*` GUC pattern. Project memory records
-- those GUCs are unset in prod, so the existing `toast-token-refresh` cron (which
-- uses current_setting('app.settings.supabase_url' / '.service_role_key')) is
-- silently dead there. This job reads everything from Supabase Vault instead.
--
-- Replay-safe & env-agnostic: BOTH the target URL and the bearer come from Vault,
-- so this identical file applies cleanly to staging and prod with no per-env
-- substitution (a stray `db push` can't bake in a wrong project URL).
--
-- PREREQUISITE — register these two Vault secrets per environment BEFORE this runs
-- (out-of-band; never commit the values):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/content-performance-capture',
--     'content_capture_url');
--   select vault.create_secret('<service_role_or_sb_secret_key>', 'content_capture_key');
-- If a secret is missing, cron.schedule still succeeds but the job posts a null
-- url/bearer at runtime — the same failure class this design exists to avoid — so
-- treat the two secrets as a hard gate.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- cron.schedule upserts by job name, so re-applying this migration is idempotent.
select cron.schedule(
  'content-performance-capture',
  '0 9 * * *',                          -- daily 09:00 UTC
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                where name = 'content_capture_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                 from vault.decrypted_secrets
                                                 where name = 'content_capture_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
