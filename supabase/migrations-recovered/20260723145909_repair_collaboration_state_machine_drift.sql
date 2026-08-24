-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260723145909 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- ============================================================
-- REPAIR: content-delivery collaboration state-machine drift
-- ============================================================
-- Incident: 20260425000000_collaboration_state_machine (and the intermediate
-- 20260408100001_add_rejected_content_status / 20260408100002_revision_limit_trigger)
-- are recorded in schema_migrations as applied, but several of their objects do
-- NOT exist in the prod database (recorded != actual -- a phantom-applied migration).
-- This migration restores ONLY the missing state-machine logic objects, idempotently.
-- ============================================================

-- 1. Expand content_status CHECK constraint (5 -> 9 values)
ALTER TABLE public.campaign_collaborations
  DROP CONSTRAINT IF EXISTS campaign_collaborations_content_status_check;

ALTER TABLE public.campaign_collaborations
  ADD CONSTRAINT campaign_collaborations_content_status_check
  CHECK (content_status IN (
    'pending', 'in_progress', 'submitted', 'revision_requested',
    'approved', 'auto_approved', 'rejected', 'disputed', 'resolved'
  ));

-- 2. Brand budget tracking column (missing)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS budget_spent NUMERIC DEFAULT 0;

-- 3. State transition function (missing) -- faithful restore, SECURITY DEFINER, search_path pinned
CREATE OR REPLACE FUNCTION public.transition_content_status(
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
  SELECT cc.content_status, COALESCE(cc.revision_count, 0)
    INTO v_current_status, v_revision_count
    FROM campaign_collaborations cc
    WHERE cc.id = p_collaboration_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collaboration % not found', p_collaboration_id;
  END IF;

  IF p_actor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM campaign_collaborations cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.id = p_collaboration_id
      AND (cc.creator_id = p_actor_id OR c.user_id = p_actor_id)
    ) THEN
      RAISE EXCEPTION 'Access denied: not a participant in collaboration %', p_collaboration_id;
    END IF;
  END IF;

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

  CASE p_new_status
    WHEN 'in_progress' THEN
      UPDATE campaign_collaborations
        SET content_status = p_new_status,
            content_started_at = COALESCE(content_started_at, now())
        WHERE id = p_collaboration_id;

    WHEN 'submitted' THEN
      IF v_current_status = 'revision_requested' THEN
        UPDATE campaign_collaborations
          SET content_status = p_new_status,
              submitted_at = now(),
              review_extended = false,
              revision_count = revision_count + 1
          WHERE id = p_collaboration_id;
      ELSE
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
      UPDATE campaign_collaborations
        SET content_status = 'disputed',
            dispute_reason = COALESCE(p_reason, 'Content rejected after maximum revisions')
        WHERE id = p_collaboration_id;
      old_status := v_current_status;
      new_status := 'disputed';
      RETURN NEXT;
      RETURN;

    ELSE
      UPDATE campaign_collaborations
        SET content_status = p_new_status
        WHERE id = p_collaboration_id;
  END CASE;

  old_status := v_current_status;
  new_status := p_new_status;
  RETURN NEXT;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Service-role only. Closes the IDOR the original 20260425000000 shipped (no REVOKE):
-- a default PUBLIC grant + the participant check only running when p_actor_id IS NOT NULL
-- would let any client pass p_actor_id=NULL and drive any collaboration's state.
REVOKE EXECUTE ON FUNCTION public.transition_content_status(uuid, text, uuid, text) FROM public, anon, authenticated;

-- 4. content_disputes table (missing)
CREATE TABLE IF NOT EXISTS public.content_disputes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id UUID NOT NULL REFERENCES public.campaign_collaborations(id) ON DELETE CASCADE,
  initiated_by     UUID NOT NULL REFERENCES public.profiles(id),
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  outcome          TEXT CHECK (outcome IN ('refund', 'partial_payment', 'approved')),
  resolved_by      UUID REFERENCES public.profiles(id),
  resolved_at      TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_disputes_collaboration ON public.content_disputes(collaboration_id);
CREATE INDEX IF NOT EXISTS idx_content_disputes_status ON public.content_disputes(status);

ALTER TABLE public.content_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view content disputes" ON public.content_disputes;
CREATE POLICY "Participants can view content disputes"
  ON public.content_disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc
      JOIN public.campaigns c ON c.id = cc.campaign_id
      WHERE cc.id = collaboration_id
      AND (cc.creator_id = auth.uid() OR c.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role full access to content disputes" ON public.content_disputes;
CREATE POLICY "Service role full access to content disputes"
  ON public.content_disputes FOR ALL
  USING (
    coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  )
  WITH CHECK (
    coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  );

-- 5. Joint-approval recompute trigger on campaign_applications (missing)
CREATE OR REPLACE FUNCTION public.recompute_final_approval()
RETURNS trigger AS $$
DECLARE
  v_has_sponsorship BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM campaign_sponsorships cs
    WHERE cs.campaign_id = NEW.campaign_id
    AND cs.status IN ('accepted', 'active')
  ) INTO v_has_sponsorship;

  IF v_has_sponsorship THEN
    IF NEW.brand_approval_status = 'approved' AND NEW.restaurant_approval_status = 'approved' THEN
      NEW.final_approval_status := 'approved';
    ELSIF NEW.brand_approval_status = 'rejected' OR NEW.restaurant_approval_status = 'rejected' THEN
      NEW.final_approval_status := 'rejected';
    ELSE
      NEW.final_approval_status := 'pending';
    END IF;
  ELSE
    NEW.final_approval_status := NEW.restaurant_approval_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

DROP TRIGGER IF EXISTS trg_recompute_final_approval ON public.campaign_applications;
CREATE TRIGGER trg_recompute_final_approval
  BEFORE INSERT OR UPDATE OF brand_approval_status, restaurant_approval_status
  ON public.campaign_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_final_approval();

-- 6. Brand budget tracking RPCs (missing)
CREATE OR REPLACE FUNCTION public.increment_budget_spent(
  p_campaign_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  new_spent NUMERIC;
  caller_role TEXT;
BEGIN
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
$$ LANGUAGE plpgsql SET search_path = 'public';

CREATE OR REPLACE FUNCTION public.decrement_budget_spent(
  p_campaign_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  new_spent NUMERIC;
  caller_role TEXT;
BEGIN
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
$$ LANGUAGE plpgsql SET search_path = 'public';

-- 7. Server-side revision-limit guard (missing) -- from 20260408100002
CREATE OR REPLACE FUNCTION public.enforce_revision_limit()
RETURNS trigger AS $$
BEGIN
  IF NEW.content_status = 'revision_requested'
     AND (OLD.content_status IS DISTINCT FROM 'revision_requested')
  THEN
    IF COALESCE(OLD.revision_count, 0) >= 2 THEN
      RAISE EXCEPTION 'Maximum revision limit (2) reached. Content must be approved or rejected.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

DROP TRIGGER IF EXISTS trg_enforce_revision_limit ON public.campaign_collaborations;
CREATE TRIGGER trg_enforce_revision_limit
  BEFORE UPDATE ON public.campaign_collaborations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_revision_limit();
