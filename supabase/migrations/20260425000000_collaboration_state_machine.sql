-- ============================================================
-- Collaboration State Machine Migration
-- 1. Expand content_status CHECK constraint
-- 2. Add new columns to campaign_collaborations
-- 3. Create state transition function
-- 4. Create content_disputes table
-- 5. Joint approval trigger on campaign_applications
-- 6. Brand budget tracking (budget_spent + RPCs)
-- 7. Tighten campaign-deliverables bucket policies
-- 8. Update insert_payment_event RPC whitelist
-- ============================================================

-- ============================================================
-- 1. Expand content_status CHECK constraint
-- ============================================================
ALTER TABLE campaign_collaborations
  DROP CONSTRAINT IF EXISTS campaign_collaborations_content_status_check;

ALTER TABLE campaign_collaborations
  ADD CONSTRAINT campaign_collaborations_content_status_check
  CHECK (content_status IN (
    'pending', 'in_progress', 'submitted', 'revision_requested',
    'approved', 'auto_approved', 'rejected', 'disputed', 'resolved'
  ));

-- ============================================================
-- 2. Add new columns to campaign_collaborations
-- ============================================================
ALTER TABLE campaign_collaborations
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_extended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS dispute_outcome TEXT CHECK (dispute_outcome IN ('refund', 'partial_payment', 'approved'));

-- ============================================================
-- 3. Create state transition function
-- ============================================================
CREATE OR REPLACE FUNCTION transition_content_status(
  p_collaboration_id UUID,
  p_new_status TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
) RETURNS TABLE(old_status TEXT, new_status TEXT)
AS $$
DECLARE
  v_current_status TEXT;
  v_revision_count INTEGER;
  v_valid BOOLEAN := false;
BEGIN
  -- Lock the row for update
  SELECT cc.content_status, COALESCE(cc.revision_count, 0)
    INTO v_current_status, v_revision_count
    FROM campaign_collaborations cc
    WHERE cc.id = p_collaboration_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collaboration % not found', p_collaboration_id;
  END IF;

  -- Validate transition
  CASE v_current_status
    WHEN 'pending' THEN
      v_valid := p_new_status = 'in_progress';
    WHEN 'in_progress' THEN
      v_valid := p_new_status = 'submitted';
    WHEN 'submitted' THEN
      v_valid := p_new_status IN ('approved', 'auto_approved', 'revision_requested');
    WHEN 'revision_requested' THEN
      IF p_new_status = 'submitted' THEN
        v_valid := true;
      ELSIF p_new_status = 'rejected' THEN
        v_valid := v_revision_count >= 2;
      END IF;
    WHEN 'rejected' THEN
      v_valid := p_new_status = 'disputed';
    WHEN 'disputed' THEN
      v_valid := p_new_status = 'resolved';
    ELSE
      v_valid := false;
  END CASE;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status;
  END IF;

  -- Apply side effects and update
  CASE p_new_status
    WHEN 'in_progress' THEN
      UPDATE campaign_collaborations
        SET content_status = p_new_status,
            content_started_at = now()
        WHERE id = p_collaboration_id;

    WHEN 'submitted' THEN
      IF v_current_status = 'revision_requested' THEN
        -- Resubmission: increment revision_count
        UPDATE campaign_collaborations
          SET content_status = p_new_status,
              submitted_at = now(),
              review_extended = false,
              revision_count = revision_count + 1
          WHERE id = p_collaboration_id;
      ELSE
        -- First submission
        UPDATE campaign_collaborations
          SET content_status = p_new_status,
              submitted_at = now(),
              review_extended = false
          WHERE id = p_collaboration_id;
      END IF;

    WHEN 'revision_requested' THEN
      UPDATE campaign_collaborations
        SET content_status = p_new_status,
            submitted_at = NULL
        WHERE id = p_collaboration_id;

    WHEN 'rejected' THEN
      -- Store dispute reason and auto-transition to disputed
      UPDATE campaign_collaborations
        SET content_status = 'disputed',
            dispute_reason = COALESCE(p_reason, 'Content rejected after maximum revisions')
        WHERE id = p_collaboration_id;

      -- Override new_status for the return value
      old_status := v_current_status;
      new_status := 'disputed';
      RETURN NEXT;
      RETURN;

    ELSE
      -- approved, auto_approved, disputed, resolved
      UPDATE campaign_collaborations
        SET content_status = p_new_status
        WHERE id = p_collaboration_id;
  END CASE;

  old_status := v_current_status;
  new_status := p_new_status;
  RETURN NEXT;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Create content_disputes table
-- ============================================================
CREATE TABLE IF NOT EXISTS content_disputes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id UUID NOT NULL REFERENCES campaign_collaborations(id) ON DELETE CASCADE,
  initiated_by     UUID NOT NULL REFERENCES profiles(id),
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  outcome          TEXT CHECK (outcome IN ('refund', 'partial_payment', 'approved')),
  resolved_by      UUID REFERENCES profiles(id),
  resolved_at      TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_disputes_collaboration ON content_disputes(collaboration_id);
CREATE INDEX idx_content_disputes_status ON content_disputes(status);

ALTER TABLE content_disputes ENABLE ROW LEVEL SECURITY;

-- Participants can view disputes for their collaborations
CREATE POLICY "Participants can view content disputes"
  ON content_disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_collaborations cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.id = collaboration_id
      AND (cc.creator_id = auth.uid() OR c.user_id = auth.uid())
    )
  );

-- Service role can do everything (edge functions handle dispute resolution)
CREATE POLICY "Service role full access to content disputes"
  ON content_disputes FOR ALL
  USING (
    coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  )
  WITH CHECK (
    coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  );

-- ============================================================
-- 5. Joint approval trigger on campaign_applications
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_final_approval()
RETURNS trigger AS $$
DECLARE
  v_has_sponsorship BOOLEAN;
BEGIN
  -- Check if the campaign has an active sponsorship
  SELECT EXISTS (
    SELECT 1 FROM campaign_sponsorships cs
    WHERE cs.campaign_id = NEW.campaign_id
    AND cs.status IN ('accepted', 'active')
  ) INTO v_has_sponsorship;

  IF v_has_sponsorship THEN
    -- Joint approval: both brand and restaurant must approve
    IF NEW.brand_approval_status = 'approved' AND NEW.restaurant_approval_status = 'approved' THEN
      NEW.final_approval_status := 'approved';
    ELSIF NEW.brand_approval_status = 'rejected' OR NEW.restaurant_approval_status = 'rejected' THEN
      NEW.final_approval_status := 'rejected';
    ELSE
      NEW.final_approval_status := 'pending';
    END IF;
  ELSE
    -- No sponsorship: final mirrors restaurant approval
    NEW.final_approval_status := NEW.restaurant_approval_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_final_approval ON campaign_applications;
CREATE TRIGGER trg_recompute_final_approval
  BEFORE UPDATE OF brand_approval_status, restaurant_approval_status
  ON campaign_applications
  FOR EACH ROW
  EXECUTE FUNCTION recompute_final_approval();

-- ============================================================
-- 6. Brand budget tracking
-- ============================================================
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS budget_spent NUMERIC DEFAULT 0;

-- increment_budget_spent: atomic, server-only, follows increment_pending_balance pattern
CREATE OR REPLACE FUNCTION increment_budget_spent(
  p_campaign_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  new_spent NUMERIC;
  caller_role TEXT;
BEGIN
  -- Only callable from edge functions (service_role), not from client
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role != 'service_role' THEN
    RAISE EXCEPTION 'increment_budget_spent is server-only';
  END IF;

  UPDATE campaigns
  SET budget_spent = COALESCE(budget_spent, 0) + p_amount
  WHERE id = p_campaign_id
  RETURNING budget_spent INTO new_spent;

  RETURN new_spent;
END;
$$ LANGUAGE plpgsql;

-- decrement_budget_spent: atomic, server-only, uses GREATEST to prevent negative
CREATE OR REPLACE FUNCTION decrement_budget_spent(
  p_campaign_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  new_spent NUMERIC;
  caller_role TEXT;
BEGIN
  -- Only callable from edge functions (service_role), not from client
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role != 'service_role' THEN
    RAISE EXCEPTION 'decrement_budget_spent is server-only';
  END IF;

  UPDATE campaigns
  SET budget_spent = GREATEST(COALESCE(budget_spent, 0) - p_amount, 0)
  WHERE id = p_campaign_id
  RETURNING budget_spent INTO new_spent;

  RETURN new_spent;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. Tighten campaign-deliverables bucket policies
-- ============================================================

-- Bucket is already private (set in 20260408100000), ensure it stays that way
UPDATE storage.buckets SET public = false WHERE id = 'campaign-deliverables';

-- Drop overly permissive SELECT policies
DROP POLICY IF EXISTS "campaign_deliverables_select" ON storage.objects;
DROP POLICY IF EXISTS "Collaboration participants can view deliverables" ON storage.objects;

-- Service-role-only SELECT policy (edge functions generate signed URLs)
CREATE POLICY "Service role can read campaign deliverables"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campaign-deliverables'
    AND coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  );

-- Keep existing creator upload policy (campaign_deliverables_upload) — no changes needed

-- ============================================================
-- 8. Update insert_payment_event RPC whitelist
-- ============================================================
CREATE OR REPLACE FUNCTION insert_payment_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_campaign_id UUID,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  IF p_event_type NOT IN (
    'content_started', 'content_submitted', 'revision_requested',
    'content_resubmitted', 'review_extended', 'file_accessed'
  ) THEN
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
