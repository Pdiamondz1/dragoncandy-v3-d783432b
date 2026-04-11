-- TASK-013: Create promotion_redemptions ledger table
-- Records each individual redemption event from Toast webhooks.
-- This is the authoritative source; discount_codes.is_redeemed and
-- promotions.current_redemptions are denormalized caches updated
-- in the same transaction.

CREATE TABLE public.promotion_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  discount_code_id UUID REFERENCES public.discount_codes(id) ON DELETE SET NULL,
  toast_event_guid TEXT,
  toast_order_id TEXT,
  connection_id UUID REFERENCES public.toast_connections(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'toast' CHECK (source IN ('toast', 'manual', 'dragoncandy')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one redemption per Toast event GUID
CREATE UNIQUE INDEX idx_promotion_redemptions_toast_guid
  ON public.promotion_redemptions(toast_event_guid)
  WHERE toast_event_guid IS NOT NULL;

-- Lookups by promotion (for metrics/sparkline)
CREATE INDEX idx_promotion_redemptions_promotion_id
  ON public.promotion_redemptions(promotion_id);

-- Lookups by discount code
CREATE INDEX idx_promotion_redemptions_code_id
  ON public.promotion_redemptions(discount_code_id);

-- Enable RLS
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

-- Business owners can view redemptions for their promotions
CREATE POLICY "Business owners can view their redemptions"
ON public.promotion_redemptions
FOR SELECT TO authenticated
USING (
  promotion_id IN (
    SELECT id FROM public.promotions WHERE user_id = auth.uid()
  )
);

-- Service role has full access (webhook writes)
CREATE POLICY "Service role full access to redemptions"
ON public.promotion_redemptions
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
