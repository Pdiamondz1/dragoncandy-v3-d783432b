-- Daily cleanup cron for the expire-social-hooks edge function.
--
-- expire-social-hooks does three idempotent, tightening-only sweeps:
--   1. campaign_social_hooks: pending -> expired after a 72h lifecycle window
--   2. delegated_posting_permissions: active -> revoked for completed/cancelled campaigns
--   3. delegated_posting_permissions: active -> revoked once past their own expires_at
-- The function existed but nothing invoked it, so stale hooks never expired and
-- finished-campaign posting delegations were never revoked (least-privilege debt).
-- Surfaced by the AIOS Loop Scout (finding loop-candidate:expire-social-hooks).
--
-- Vault-based, NOT the dead `app.settings.*` GUC pattern (those GUCs are unset in
-- prod, so the toast-token-refresh cron that uses current_setting('app.settings.*')
-- is silently dead there). Mirrors content-performance-capture: BOTH the URL and the
-- bearer come from Vault, so this identical file replays cleanly on staging and prod
-- with no per-env substitution.
--
-- The bearer is the operator-managed AIOS_INGEST_SECRET (sb_secret_… key), accepted
-- by the function via _shared/ingest-auth.ts. Because the function accepts that value
-- explicitly (not just the auto-injected service-role key), a Supabase-initiated key
-- rotation can no longer silently 401 this job — the failure class fixed in PR #129.
--
-- PREREQUISITE — register these two Vault secrets per environment BEFORE this runs
-- (out-of-band; never commit the values). `aios_ingest_key` already exists (shared
-- with the AIOS routines); only the URL secret is job-specific:
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/expire-social-hooks',
--     'expire_social_hooks_url');
--   -- aios_ingest_key must already hold the project's sb_secret_… key.
-- If a secret is missing, cron.schedule still succeeds but the job posts a null
-- url/bearer at runtime — so treat the two secrets as a hard gate.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- cron.schedule upserts by job name, so re-applying this migration is idempotent.
select cron.schedule(
  'expire-social-hooks',
  '0 1 * * *',                          -- daily 01:00 UTC (isolated from other jobs)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                where name = 'expire_social_hooks_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                 from vault.decrypted_secrets
                                                 where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
