-- Add brand_approval_status and restaurant_approval_status to campaign_applications for joint selection
ALTER TABLE campaign_applications 
ADD COLUMN IF NOT EXISTS brand_approval_status TEXT DEFAULT 'pending' CHECK (brand_approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS restaurant_approval_status TEXT DEFAULT 'pending' CHECK (restaurant_approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS final_approval_status TEXT DEFAULT 'pending' CHECK (final_approval_status IN ('pending', 'approved', 'rejected'));

-- Add comment to explain the dual approval system
COMMENT ON COLUMN campaign_applications.brand_approval_status IS 'Brand sponsor approval status for joint creator selection';
COMMENT ON COLUMN campaign_applications.restaurant_approval_status IS 'Restaurant owner approval status for joint creator selection';
COMMENT ON COLUMN campaign_applications.final_approval_status IS 'Final approval status - approved only if both brand and restaurant approve';

-- Add payment tracking columns to campaign_sponsorships
ALTER TABLE campaign_sponsorships
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded')),
ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN campaign_sponsorships.payment_status IS 'Stripe payment status for sponsorship';
COMMENT ON COLUMN campaign_sponsorships.payment_intent_id IS 'Stripe PaymentIntent ID for tracking';
