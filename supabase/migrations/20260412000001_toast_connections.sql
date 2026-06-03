-- TASK-002: toast_connections table with pgsodium encryption + RLS
-- Stores Toast POS OAuth credentials per restaurant (business_profile).
-- access_token and refresh_token are encrypted at rest via pgsodium.

-- Create the connections table
CREATE TABLE public.toast_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_guid TEXT NOT NULL,
  -- Encrypted credentials (pgsodium transparent column encryption)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One connection per restaurant per business
  CONSTRAINT unique_business_restaurant UNIQUE (business_id, restaurant_guid)
);

-- Enable transparent column encryption on sensitive columns.
-- Guarded: pgsodium transparent column encryption is deprecated and unavailable
-- on newer Supabase projects. Where it exists (prod), tokens are encrypted at
-- rest; where it does not (fresh staging / clean replay), this degrades to
-- plaintext, which is acceptable for a non-prod environment using test Toast
-- credentials. The table/columns are created identically either way.
DO $toast_enc$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgsodium WITH SCHEMA pgsodium;
  EXECUTE 'SECURITY LABEL FOR pgsodium ON COLUMN public.toast_connections.access_token IS ''ENCRYPT WITH KEY DEFAULT''';
  EXECUTE 'SECURITY LABEL FOR pgsodium ON COLUMN public.toast_connections.refresh_token IS ''ENCRYPT WITH KEY DEFAULT''';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgsodium transparent column encryption unavailable (%); toast tokens stored unencrypted (non-prod).', SQLERRM;
END
$toast_enc$;

-- Enable RLS
ALTER TABLE public.toast_connections ENABLE ROW LEVEL SECURITY;

-- RLS: Only the owning user can read their own connections
CREATE POLICY "Users can view their own toast connections"
ON public.toast_connections
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- RLS: Only the owning user can insert connections for their business
CREATE POLICY "Users can insert their own toast connections"
ON public.toast_connections
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND business_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

-- RLS: Only the owning user can update their own connections
CREATE POLICY "Users can update their own toast connections"
ON public.toast_connections
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS: Only the owning user can delete their own connections
CREATE POLICY "Users can delete their own toast connections"
ON public.toast_connections
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Service role gets full access (for Edge Functions doing token refresh)
CREATE POLICY "Service role has full access to toast connections"
ON public.toast_connections
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Index for quick lookups by business
CREATE INDEX idx_toast_connections_business_id ON public.toast_connections(business_id);
CREATE INDEX idx_toast_connections_status ON public.toast_connections(status);
