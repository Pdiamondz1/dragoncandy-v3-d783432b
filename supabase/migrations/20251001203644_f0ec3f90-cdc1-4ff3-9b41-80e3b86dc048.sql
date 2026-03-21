-- Add open_for_sponsorship flag to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS open_for_sponsorship boolean DEFAULT false;

-- Create campaign_sponsorships table for brand-restaurant partnerships
CREATE TABLE IF NOT EXISTS public.campaign_sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  sponsorship_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled')),
  proposal_message TEXT,
  terms JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, brand_id)
);

-- Enable RLS on campaign_sponsorships
ALTER TABLE public.campaign_sponsorships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaign_sponsorships
-- Brands can view their own sponsorships
CREATE POLICY "Brands can view their own sponsorships"
ON public.campaign_sponsorships
FOR SELECT
USING (
  brand_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

-- Restaurant owners can view sponsorships for their campaigns
CREATE POLICY "Restaurant owners can view campaign sponsorships"
ON public.campaign_sponsorships
FOR SELECT
USING (
  restaurant_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
  OR
  campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = auth.uid()
  )
);

-- Brands can create sponsorship proposals
CREATE POLICY "Brands can create sponsorship proposals"
ON public.campaign_sponsorships
FOR INSERT
WITH CHECK (
  brand_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid() AND account_type = 'brand'
  )
);

-- Brands and restaurant owners can update sponsorships
CREATE POLICY "Brands and restaurants can update sponsorships"
ON public.campaign_sponsorships
FOR UPDATE
USING (
  brand_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
  OR
  restaurant_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
  OR
  campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_campaign_sponsorships_campaign_id ON public.campaign_sponsorships(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sponsorships_brand_id ON public.campaign_sponsorships(brand_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sponsorships_status ON public.campaign_sponsorships(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_open_for_sponsorship ON public.campaigns(open_for_sponsorship) WHERE open_for_sponsorship = true;