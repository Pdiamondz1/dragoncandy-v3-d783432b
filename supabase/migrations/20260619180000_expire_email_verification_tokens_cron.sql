-- Daily cleanup of dead email verification tokens (security data-minimization).
--
-- email_verification_tokens rows are credential-shaped (token + user_id). Once a
-- token is past expires_at it is non-functional, and the durable verification
-- outcome is persisted on profiles.email_verified (set by the verify-email fn) —
-- so deleting expired rows is LOSSLESS. Keeping dead tokens only retains a
-- guessable-token <-> user linkage longer than needed.
--
-- A one-shot cleanup existed (20260407000000_clean_stale_data.sql deleted rows by
-- created_at); this makes it recurring. Surfaced by the AIOS Loop Scout
-- (finding loop-candidate:email-verification-token-cleanup).
--
-- Pure-SQL pg_cron (no edge fn / auth / Vault) — same shape as the cleanup-stale-
-- presence job. cron.schedule upserts by name, so re-applying is idempotent.

create extension if not exists pg_cron;

select cron.schedule(
  'expire-email-verification-tokens',
  '30 5 * * *',                         -- daily 05:30 UTC (isolated from other jobs)
  $$ delete from public.email_verification_tokens where expires_at < now(); $$
);
