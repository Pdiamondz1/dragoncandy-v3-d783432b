-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260524204400 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS disconnected_stripe_account_id TEXT;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS disconnected_stripe_account_id TEXT;
ALTER TABLE org_units ADD COLUMN IF NOT EXISTS disconnected_stripe_account_id TEXT;
