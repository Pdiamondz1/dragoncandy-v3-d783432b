-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260527042443 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

CREATE INDEX IF NOT EXISTS idx_donny_scheduled_posts_promotion
ON donny_scheduled_posts (user_id, status)
WHERE metadata->>'source' = 'promotion';
