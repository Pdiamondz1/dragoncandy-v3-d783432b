-- FIX: CGC submissions failed with
--   "Could not find the 'social_handles' column of 'promotion_submissions' in the schema cache"
--
-- The submission flow (usePromotionSubmission) and the PromotionSubmission type both write/read
-- `social_handles` (the optional Instagram/TikTok/etc. handles a customer shares), but the column
-- was never present on the production table, so every INSERT was rejected by PostgREST.
--
-- Add it as a nullable JSONB column (additive, never drop/rename). Default '{}' so the app's
-- `social_handles: {...}` insert and existing rows are both valid.

alter table public.promotion_submissions
  add column if not exists social_handles jsonb default '{}'::jsonb;

-- Ask PostgREST to reload its schema cache so the new column is visible immediately.
notify pgrst, 'reload schema';
