-- ============================================================
-- Allow reject from 'submitted' after max revisions
-- ============================================================
-- Follow-up to 20260723120000. The restored transition_content_status faithfully
-- reproduced the original state machine, where 'rejected' is reachable ONLY from
-- 'revision_requested' (with revision_count >= 2). But reject-content is designed to
-- open a dispute "after all revisions are exhausted", and if a creator RESUBMITS after
-- the 2nd revision request the collaboration returns to 'submitted' — from which the
-- original graph allowed only approved/auto_approved/revision_requested. The business
-- was then trapped in approve-only (enforce_revision_limit blocks a 3rd revision, and
-- the state machine blocked reject), forced to pay for unsatisfactory content.
--
-- Fix: also permit submitted -> rejected when revision_count >= 2. Purely additive to
-- the transition graph; every other transition is byte-identical to 20260723120000.
-- The 'rejected' side-effect branch already auto-transitions to 'disputed' regardless
-- of the prior state, so no other change is needed.
--
-- A forward migration (not an edit of 20260723120000, which is already applied to prod)
-- keeps the recorded migration and the live object in lockstep. CREATE OR REPLACE
-- preserves the existing ACL; the REVOKE/GRANT are re-asserted for self-containment.
-- ============================================================

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
      -- CHANGED vs 20260723120000: also allow rejecting a resubmission once the
      -- revision budget is spent, so a dispute can be opened instead of forcing approval.
      IF p_new_status IN ('approved', 'auto_approved', 'revision_requested') THEN
        v_valid := true;
      ELSIF p_new_status = 'rejected' THEN
        v_valid := v_revision_count >= 2;
      END IF;
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

-- Re-assert the service-role-only posture (CREATE OR REPLACE preserves ACL, but keep
-- this self-contained so a fresh apply of just this migration is also correct).
REVOKE EXECUTE ON FUNCTION public.transition_content_status(uuid, text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_content_status(uuid, text, uuid, text) TO service_role;
