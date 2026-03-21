-- Add 'brand' to the user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'brand';

-- Extend business_profiles table with brand-specific fields
ALTER TABLE public.business_profiles 
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'restaurant' CHECK (account_type IN ('restaurant', 'brand'));

ALTER TABLE public.business_profiles 
ADD COLUMN IF NOT EXISTS sponsorship_budget NUMERIC(12,2);

ALTER TABLE public.business_profiles 
ADD COLUMN IF NOT EXISTS brand_category TEXT;

ALTER TABLE public.business_profiles 
ADD COLUMN IF NOT EXISTS marketing_objectives TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.business_profiles.account_type IS 'Distinguishes between restaurant businesses and sponsor brands';
COMMENT ON COLUMN public.business_profiles.sponsorship_budget IS 'Available marketing budget for brand sponsors';
COMMENT ON COLUMN public.business_profiles.brand_category IS 'Category of brand (e.g., food_beverage, retail, technology)';
COMMENT ON COLUMN public.business_profiles.marketing_objectives IS 'Brand campaign goals and objectives';

-- Update RLS policies to include brand role
-- The existing policies already use auth.uid() = user_id, so they will work for brands too
-- No policy changes needed as brands will use the same business_profiles table