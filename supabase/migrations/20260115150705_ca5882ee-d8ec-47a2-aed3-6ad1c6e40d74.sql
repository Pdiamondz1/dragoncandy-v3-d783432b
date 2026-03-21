-- DragonDash V1: Add delivery options, pricing types, escrow, and payout fields

-- Add DragonDash fields to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'standard' CHECK (delivery_type IN ('standard', 'expedited', 'dragonrush')),
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT 'bid_range' CHECK (pricing_type IN ('fixed', 'bid_range')),
ADD COLUMN IF NOT EXISTS fixed_price NUMERIC,
ADD COLUMN IF NOT EXISTS escrow_status TEXT DEFAULT 'none' CHECK (escrow_status IN ('none', 'pending', 'held', 'released', 'refunded')),
ADD COLUMN IF NOT EXISTS escrow_payment_intent_id TEXT;

-- Add timer and content tracking fields to campaign_collaborations table
ALTER TABLE public.campaign_collaborations
ADD COLUMN IF NOT EXISTS content_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS content_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS content_status TEXT DEFAULT 'pending' CHECK (content_status IN ('pending', 'in_progress', 'submitted', 'revision_requested', 'approved'));

-- Add Stripe Connect fields to creator_profiles table
ALTER TABLE public.creator_profiles
ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pending_balance NUMERIC DEFAULT 0;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_campaigns_delivery_type ON public.campaigns(delivery_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_pricing_type ON public.campaigns(pricing_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_escrow_status ON public.campaigns(escrow_status);
CREATE INDEX IF NOT EXISTS idx_collaborations_content_status ON public.campaign_collaborations(content_status);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_stripe_account ON public.creator_profiles(stripe_account_id) WHERE stripe_account_id IS NOT NULL;