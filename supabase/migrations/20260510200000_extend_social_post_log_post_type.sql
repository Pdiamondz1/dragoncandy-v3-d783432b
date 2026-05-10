-- Extend social_post_log.post_type to support UGC promotion and DragonShare sources
ALTER TABLE social_post_log
  DROP CONSTRAINT IF EXISTS social_post_log_post_type_check;

ALTER TABLE social_post_log
  ADD CONSTRAINT social_post_log_post_type_check
  CHECK (post_type IN ('amplification', 'cross_post', 'standalone', 'campaign', 'ugc_promotion', 'dragonshare'));
