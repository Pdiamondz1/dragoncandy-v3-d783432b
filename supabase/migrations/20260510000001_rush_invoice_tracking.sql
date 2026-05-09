-- Add invoice tracking columns to rush_surcharge_log
ALTER TABLE rush_surcharge_log
  ADD COLUMN stripe_invoice_item_id TEXT,
  ADD COLUMN invoiced_at TIMESTAMPTZ,
  ADD COLUMN paid_at TIMESTAMPTZ;

-- Extend payment_events CHECK constraint to accept 'rush' entity type
ALTER TABLE payment_events DROP CONSTRAINT payment_events_entity_type_check;
ALTER TABLE payment_events ADD CONSTRAINT payment_events_entity_type_check
  CHECK (entity_type IN ('collaboration', 'sponsorship', 'rush'));
