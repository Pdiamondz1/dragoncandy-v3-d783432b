-- Durable payout idempotency markers on campaign_collaborations, so release-creator-payout can be
-- safely RE-ENTRANT: once money has moved for a collaboration, a re-invocation skips crediting and only
-- (re)runs the finalize state updates. This closes the re-entrancy gap documented in PR #328 — without a
-- durable marker, a retry could double-credit the non-idempotent wallet or double-pay after Stripe prunes
-- its ~24h idempotency key. See docs/wiki/concepts/payout-finalization-consistency.md.
--
-- Both columns are nullable + additive (never-drop rule). No backfill needed — existing rows predate the
-- marker and are handled by the escrow gate as before.
ALTER TABLE public.campaign_collaborations
  ADD COLUMN IF NOT EXISTS payout_executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

COMMENT ON COLUMN public.campaign_collaborations.payout_executed_at IS
  'Set by release-creator-payout the instant money moves (Stripe transfer OR pending-balance credit), BEFORE finalize. Non-null => the payout already executed: do NOT credit again on re-invocation, only (re)finalize. Enables safe retry + reconciliation of finalize failures.';
COMMENT ON COLUMN public.campaign_collaborations.stripe_transfer_id IS
  'Stripe transfer id for the creator payout (transfer path only; NULL for pending-balance payouts). Durable record of the transfer for idempotency + audit.';
