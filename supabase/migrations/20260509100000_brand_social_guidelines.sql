ALTER TABLE business_profiles
ADD COLUMN IF NOT EXISTS brand_social_guidelines JSONB DEFAULT NULL;

COMMENT ON COLUMN business_profiles.brand_social_guidelines IS
  'Brand social media guidelines: voice_tone, required_hashtags, mandatory_disclosures, prohibited_words, default_cta';
