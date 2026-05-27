-- Migration: Add CGC posting preferences JSONB to business_profiles
-- Spec ref: Section 3.5, Section 4.3 Migration 2
-- Schema: { auto_post_enabled: bool, default_platforms: string[],
--           default_timing: "immediate"|"optimal", caption_style: "ai"|"template",
--           custom_caption_template: string|null }

ALTER TABLE business_profiles
ADD COLUMN cgc_posting_preferences JSONB DEFAULT NULL;

COMMENT ON COLUMN business_profiles.cgc_posting_preferences IS
  'CGC auto-post preferences. NULL = system defaults (all platforms, immediate, AI captions).';
