-- Dimensions the analytics layer needs, plus the idempotency key the webhook
-- choke point upserts on.
--
-- GRAIN: (outstand_post_id, platform) — one row per post per platform, which is
-- what every downstream aggregate wants. A unique index on outstand_post_id
-- ALONE would break useSponsorshipAmplification, which deliberately inserts one
-- row per account for a single provider post id. Verified 0 violating pairs on
-- prod before adding.
ALTER TABLE public.social_post_log
  ADD CONSTRAINT social_post_log_post_platform_key
  UNIQUE (outstand_post_id, platform);

-- All additive and nullable — never a rename, per CLAUDE.md. NULL means "not
-- known", which for `format` is deliberately preferred over a guess: a wrong
-- format is indistinguishable from a real finding and would silently poison
-- every later "reels beat photos" conclusion.
ALTER TABLE public.social_post_log
  ADD COLUMN IF NOT EXISTS hashtags text[],
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS format text;

COMMENT ON COLUMN public.social_post_log.format IS
  'Post format from donny_scheduled_posts.content_type (photo|reel|story|video|carousel|tweet|thread). NULL when no schedule row exists — never inferred.';
COMMENT ON COLUMN public.social_post_log.creator_id IS
  'The creator whose content this post carries, resolved from campaign_collaborations. Enables "which creator should I hire again".';

-- New columns inherit the existing own-row SELECT policy; the webhook writes with
-- the service-role key and bypasses RLS. No policy change needed.
