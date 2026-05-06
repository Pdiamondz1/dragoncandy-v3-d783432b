-- Outstand integration: per-business mapping to Outstand social_account_ids.
-- Tokens are NOT stored here — Outstand owns OAuth state. This table only
-- records which Outstand social_account_ids belong to which restaurant.

CREATE TABLE public.business_outstand_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outstand_social_account_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'x', 'youtube')),
  platform_handle TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_business_outstand_account UNIQUE (business_id, outstand_social_account_id)
);

CREATE INDEX idx_business_outstand_accounts_business_id
  ON public.business_outstand_accounts(business_id);
CREATE INDEX idx_business_outstand_accounts_business_status
  ON public.business_outstand_accounts(business_id, status);
CREATE INDEX idx_business_outstand_accounts_outstand_id
  ON public.business_outstand_accounts(outstand_social_account_id);

ALTER TABLE public.business_outstand_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own outstand accounts"
ON public.business_outstand_accounts
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own outstand accounts"
ON public.business_outstand_accounts
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND business_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own outstand accounts"
ON public.business_outstand_accounts
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own outstand accounts"
ON public.business_outstand_accounts
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to outstand accounts"
ON public.business_outstand_accounts
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_business_outstand_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_business_outstand_accounts_updated_at
BEFORE UPDATE ON public.business_outstand_accounts
FOR EACH ROW
EXECUTE FUNCTION public.touch_business_outstand_accounts_updated_at();
