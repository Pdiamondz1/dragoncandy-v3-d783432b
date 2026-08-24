-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260510143144 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS duplicated_from UUID REFERENCES campaigns(id) ON DELETE SET NULL;
