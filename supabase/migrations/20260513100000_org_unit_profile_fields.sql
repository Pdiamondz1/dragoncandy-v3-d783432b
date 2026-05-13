-- Add profile fields to org_units so each location can have its own identity
ALTER TABLE org_units
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS brand_category TEXT,
  ADD COLUMN IF NOT EXISTS sample_content_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_parent_brand BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS x_url TEXT,
  ADD COLUMN IF NOT EXISTS other_social_url TEXT;
