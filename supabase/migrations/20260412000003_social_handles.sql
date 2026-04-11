-- TASK-004: Add social_handles jsonb column to promotion_submissions
-- Stores optional social media handles captured during submission.
-- Expected shape: {"instagram": "@handle", "tiktok": "@handle", ...}
-- Nullable with empty object default so existing rows are unaffected
-- and current code that doesn't SELECT this column continues to work.

ALTER TABLE public.promotion_submissions
  ADD COLUMN social_handles JSONB DEFAULT '{}';

-- Add a comment documenting the expected schema for future developers
COMMENT ON COLUMN public.promotion_submissions.social_handles IS
  'Optional social handles: {"instagram","tiktok","facebook","x","youtube"}. Values are strings (e.g. "@handle").';
