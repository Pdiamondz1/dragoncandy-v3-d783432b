-- pg_cron for reconcile-pending-flushes. Vault-sourced URL + bearer (mirrors 20260723120003_auto_approve_content_cron).
--
-- Re-drives durable pending_balance_flushes rows still 'claimed' (money not confirmed moved) through the
-- shared executeFlushTransfer, so a wallet→Stripe transfer that never confirmed inline gets replayed
-- exactly-once (same `flush_${id}` idempotency key → same transfer, never a double-pay) instead of being
-- stranded. See docs/wiki/concepts/payout-finalization-consistency.md.
--
-- PREREQUISITE Vault secrets per environment (out-of-band, never committed — same pattern as the
-- rest of the scheduled fleet, e.g. auto_approve_content_url):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/reconcile-pending-flushes', 'reconcile_pending_flushes_url');
--   -- aios_ingest_key must already hold the project's sb_secret_… service-role key (shared with AIOS).
--   -- reconcile-pending-flushes authorizes the bearer via _shared/ingest-auth.ts (isAuthorizedIngest),
--   -- which accepts the injected service-role key OR AIOS_INGEST_SECRET.
--
-- cron.schedule upserts by job name, so re-applying is idempotent (updates the existing job in place).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'reconcile-pending-flushes',
  '*/15 * * * *',                       -- every 15 min (5-min age guard means no contention with a first attempt)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_pending_flushes_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
