-- ============================================================
-- Payment Safety Migration
-- Creates: payment_events, stripe_webhook_events
-- Fixes: campaign-deliverables storage policy
-- Adds: insert_payment_event RPC, increment_pending_balance RPC
-- ============================================================

-- 1. payment_events (append-only ledger)
CREATE TABLE IF NOT EXISTS payment_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('collaboration', 'sponsorship')),
  entity_id     UUID NOT NULL,
  campaign_id   UUID REFERENCES campaigns(id),  -- nullable for wallet withdrawals
  actor_id      UUID REFERENCES profiles(id),
  actor_role    TEXT NOT NULL CHECK (actor_role IN ('business', 'creator', 'brand', 'system', 'stripe')),
  -- Role mapping from DB: business_client -> 'business', content_creator -> 'creator', brand -> 'brand'
  -- System/cron events use 'system', Stripe webhook events use 'stripe'
  amount_cents  INTEGER,
  currency      TEXT DEFAULT 'usd',
  stripe_id     TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_entity ON payment_events (entity_type, entity_id, created_at);
CREATE INDEX idx_payment_events_campaign ON payment_events (campaign_id, created_at);
CREATE INDEX idx_payment_events_stripe ON payment_events (stripe_id) WHERE stripe_id IS NOT NULL;

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Append-only: no UPDATE, no DELETE policies
CREATE POLICY "Collaboration participants can view payment events"
  ON payment_events FOR SELECT
  USING (
    entity_type = 'collaboration' AND (
      EXISTS (SELECT 1 FROM campaign_collaborations cc WHERE cc.id = entity_id AND cc.creator_id = auth.uid())
      OR
      EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid())
    )
  );

CREATE POLICY "Sponsorship participants can view payment events"
  ON payment_events FOR SELECT
  USING (
    entity_type = 'sponsorship' AND (
      EXISTS (
        SELECT 1 FROM campaign_sponsorships cs
        WHERE cs.id = entity_id
        AND (
          cs.brand_id IN (SELECT bp.id FROM business_profiles bp WHERE bp.user_id = auth.uid())
          OR cs.restaurant_id IN (SELECT bp.id FROM business_profiles bp WHERE bp.user_id = auth.uid())
          OR cs.creator_id IN (SELECT cp.id FROM creator_profiles cp WHERE cp.user_id = auth.uid())
        )
      )
    )
  );

-- 2. stripe_webhook_events (idempotency)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id      TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No permissive policies: only service_role (edge functions) can read/write

-- 3. Fix campaign-deliverables storage policy
DROP POLICY IF EXISTS "Users can view campaign deliverables" ON storage.objects;

CREATE POLICY "Collaboration participants can view deliverables"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campaign-deliverables'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      EXISTS (
        SELECT 1 FROM file_uploads fu
        JOIN campaigns c ON c.id = fu.campaign_id
        WHERE fu.file_path = name
        AND fu.bucket_name = 'campaign-deliverables'
        AND c.user_id = auth.uid()
      )
    )
  );

-- 4. RPC: insert_payment_event (client-safe, whitelisted event types)
CREATE OR REPLACE FUNCTION insert_payment_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_campaign_id UUID,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  IF p_event_type NOT IN ('content_started', 'content_submitted', 'revision_requested', 'content_resubmitted') THEN
    RAISE EXCEPTION 'Invalid event type: %. Only content events allowed from client.', p_event_type;
  END IF;

  IF p_entity_type = 'collaboration' THEN
    IF NOT EXISTS (
      SELECT 1 FROM campaign_collaborations cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.id = p_entity_id
      AND (cc.creator_id = auth.uid() OR c.user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  INSERT INTO payment_events (event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, metadata)
  VALUES (
    p_event_type, p_entity_type, p_entity_id, p_campaign_id, auth.uid(),
    (SELECT CASE
      WHEN role = 'content_creator' THEN 'creator'
      WHEN role = 'business_client' THEN 'business'
      WHEN role = 'brand' THEN 'brand'
      ELSE 'business'
    END FROM profiles WHERE id = auth.uid()),
    p_metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: increment_pending_balance (atomic, NULL-safe)
CREATE OR REPLACE FUNCTION increment_pending_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_profile_type TEXT
) RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
  caller_role TEXT;
BEGIN
  -- Only callable from edge functions (service_role), not from client
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role != 'service_role' THEN
    RAISE EXCEPTION 'increment_pending_balance is server-only';
  END IF;

  IF p_profile_type = 'creator' THEN
    UPDATE creator_profiles
    SET pending_balance = COALESCE(pending_balance, 0) + p_amount
    WHERE user_id = p_user_id
    RETURNING pending_balance INTO new_balance;
  ELSE
    UPDATE business_profiles
    SET pending_balance = COALESCE(pending_balance, 0) + p_amount
    WHERE user_id = p_user_id
    RETURNING pending_balance INTO new_balance;
  END IF;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
