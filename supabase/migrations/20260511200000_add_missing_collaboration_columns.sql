-- Add columns that were defined in the collaboration state machine migration
-- but never applied to the production database.
ALTER TABLE campaign_collaborations
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_extended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS dispute_outcome TEXT CHECK (dispute_outcome IN ('refund', 'partial_payment', 'approved'));
