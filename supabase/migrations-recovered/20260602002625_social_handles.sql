-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260602002625 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

ALTER TABLE public.promotion_submissions
  ADD COLUMN IF NOT EXISTS social_handles JSONB DEFAULT '{}';

COMMENT ON COLUMN public.promotion_submissions.social_handles IS
  'Optional social handles: {"instagram","tiktok","facebook","x","youtube"}. Values are strings (e.g. "@handle").';
