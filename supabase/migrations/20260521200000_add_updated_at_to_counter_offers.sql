-- Add missing updated_at column to application_counter_offers
-- The create_counter_offer RPC references this column but it was never created
ALTER TABLE application_counter_offers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE application_counter_offers
  SET updated_at = created_at
  WHERE updated_at IS NULL;
