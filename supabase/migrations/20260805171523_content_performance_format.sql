-- content-strategy-recommend aggregates content_performance, not
-- social_post_log, so format has to reach this table or "do reels beat photos"
-- stays unanswerable. Additive and nullable; NULL means the source post had no
-- known format, never a guess.
ALTER TABLE public.content_performance
  ADD COLUMN IF NOT EXISTS format text;

COMMENT ON COLUMN public.content_performance.format IS
  'Copied from social_post_log.format at capture time. NULL when unknown.';
