-- Add 'releasing' intermediate state to escrow_status CHECK constraint.
-- This state signals "Stripe transfer in progress" for the two-phase commit
-- pattern in release-creator-payout.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'campaigns'::regclass
    AND conname LIKE '%escrow_status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE campaigns DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_escrow_status_check
  CHECK (escrow_status IN ('none', 'pending', 'held', 'releasing', 'released', 'refunded'));
