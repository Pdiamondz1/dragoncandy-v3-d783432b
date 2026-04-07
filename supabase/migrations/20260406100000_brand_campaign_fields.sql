-- Brand Sponsorship Campaign fields
-- Adds columns to campaigns table for brand-specific campaign data

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type text DEFAULT 'business';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_creator_personas text[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS geographic_scope text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS per_creator_cap numeric;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS creator_count integer;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS hashtag_requirements text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS usage_rights_days integer;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS exclusivity_days integer;

-- Add index for filtering by campaign_type
CREATE INDEX IF NOT EXISTS idx_campaigns_campaign_type ON campaigns (campaign_type);

-- Update campaign_media media_type CHECK to allow 'brand_asset'
ALTER TABLE campaign_media DROP CONSTRAINT IF EXISTS campaign_media_media_type_check;
ALTER TABLE campaign_media ADD CONSTRAINT campaign_media_media_type_check
  CHECK (media_type IN ('reference_image', 'reference_video', 'ai_preview', 'raw_footage', 'brand_asset'));

-- Allow brand account_type to insert campaigns
-- Drop the existing insert policy and recreate to include brand
DROP POLICY IF EXISTS "Business users can create campaigns" ON campaigns;
CREATE POLICY "Business and brand users can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM business_profiles
      WHERE business_profiles.user_id = auth.uid()
      AND business_profiles.account_type IN ('restaurant', 'brand')
    )
  );
