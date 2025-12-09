-- Create promotions table for restaurant video promotions
CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  currency TEXT DEFAULT 'USD',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_redemptions INTEGER,
  current_redemptions INTEGER DEFAULT 0,
  video_max_duration INTEGER DEFAULT 30,
  qr_code_url TEXT,
  terms_conditions TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'expired', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Create promotion_submissions table for customer video submissions
CREATE TABLE public.promotion_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  video_url TEXT NOT NULL,
  video_duration INTEGER,
  marketing_rights_accepted BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One submission per customer email per promotion
  CONSTRAINT unique_customer_per_promotion UNIQUE (promotion_id, customer_email)
);

-- Create discount_codes table for generated codes
CREATE TABLE public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.promotion_submissions(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  is_redeemed BOOLEAN NOT NULL DEFAULT false,
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID,
  expires_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for promotions table
CREATE POLICY "Business owners can manage their promotions"
ON public.promotions
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Public can view active promotions"
ON public.promotions
FOR SELECT
USING (status = 'active' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE);

-- RLS Policies for promotion_submissions table
CREATE POLICY "Business owners can view submissions for their promotions"
ON public.promotion_submissions
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.promotions p
  WHERE p.id = promotion_submissions.promotion_id
  AND p.user_id = auth.uid()
));

CREATE POLICY "Business owners can update submissions for their promotions"
ON public.promotion_submissions
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.promotions p
  WHERE p.id = promotion_submissions.promotion_id
  AND p.user_id = auth.uid()
));

CREATE POLICY "Anyone can submit to active promotions"
ON public.promotion_submissions
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.promotions p
  WHERE p.id = promotion_submissions.promotion_id
  AND p.status = 'active'
  AND p.start_date <= CURRENT_DATE
  AND p.end_date >= CURRENT_DATE
  AND (p.max_redemptions IS NULL OR p.current_redemptions < p.max_redemptions)
));

-- RLS Policies for discount_codes table
CREATE POLICY "Business owners can view and manage codes for their promotions"
ON public.discount_codes
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.promotions p
  WHERE p.id = discount_codes.promotion_id
  AND p.user_id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX idx_promotions_business_id ON public.promotions(business_id);
CREATE INDEX idx_promotions_user_id ON public.promotions(user_id);
CREATE INDEX idx_promotions_status ON public.promotions(status);
CREATE INDEX idx_promotions_dates ON public.promotions(start_date, end_date);
CREATE INDEX idx_promotion_submissions_promotion_id ON public.promotion_submissions(promotion_id);
CREATE INDEX idx_promotion_submissions_status ON public.promotion_submissions(status);
CREATE INDEX idx_discount_codes_promotion_id ON public.discount_codes(promotion_id);
CREATE INDEX idx_discount_codes_code ON public.discount_codes(code);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_promotion_submissions_updated_at
  BEFORE UPDATE ON public.promotion_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for promotion videos
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('promotion-videos', 'promotion-videos', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for promotion-videos bucket
CREATE POLICY "Anyone can upload promotion videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'promotion-videos');

CREATE POLICY "Anyone can view promotion videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'promotion-videos');

CREATE POLICY "Business owners can delete their promotion videos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'promotion-videos' AND
  auth.uid() IS NOT NULL
);