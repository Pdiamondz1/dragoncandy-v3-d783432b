-- Phase 2 — Group-scoped private campaigns: apply_to_campaign group guard.
-- Reproduces the current apply_to_campaign body (from 20260525000001) verbatim and
-- inserts a GROUP GUARD immediately after the caller-identity check: for a group
-- campaign, only an active group member (or an explicitly pending-invited creator)
-- may apply. No-op for existing rows (all group_id IS NULL).

CREATE OR REPLACE FUNCTION apply_to_campaign(
  p_campaign_id uuid,
  p_creator_id uuid,
  p_proposed_rate numeric,
  p_intro_message text,
  p_proposed_timeline text DEFAULT NULL,
  p_is_counter_offer boolean DEFAULT false,
  p_portfolio_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_status application_status;
  v_app record;
  v_invitation_status text;
BEGIN
  -- Enforce caller is the creator
  IF auth.uid() IS DISTINCT FROM p_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: creator_id must match authenticated user';
  END IF;

  -- Group campaigns: only active members (or an explicitly pending-invited creator) may apply.
  IF EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND group_id IS NOT NULL) THEN
    IF NOT (
         public.is_active_group_member(
           (SELECT group_id FROM campaigns WHERE id = p_campaign_id), p_creator_id)
      OR EXISTS (SELECT 1 FROM campaign_invitations
                 WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id AND status = 'pending')
    ) THEN
      RAISE EXCEPTION 'Not eligible to apply to this group campaign';
    END IF;
  END IF;

  v_app_status := CASE WHEN p_is_counter_offer THEN 'counter_offered' ELSE 'pending' END;

  INSERT INTO campaign_applications (
    campaign_id, creator_id, proposed_rate, intro_message,
    proposed_timeline, status, portfolio_url
  )
  VALUES (
    p_campaign_id, p_creator_id, p_proposed_rate, p_intro_message,
    p_proposed_timeline, v_app_status, p_portfolio_url
  )
  ON CONFLICT (campaign_id, creator_id) WHERE status <> 'rejected'
  DO UPDATE SET
    proposed_rate = EXCLUDED.proposed_rate,
    intro_message = EXCLUDED.intro_message,
    proposed_timeline = EXCLUDED.proposed_timeline,
    status = EXCLUDED.status,
    portfolio_url = EXCLUDED.portfolio_url,
    updated_at = now()
  RETURNING * INTO v_app;

  v_invitation_status := CASE WHEN p_is_counter_offer THEN 'counter_offered' ELSE 'accepted' END;

  UPDATE campaign_invitations
    SET status = v_invitation_status, updated_at = now()
    WHERE campaign_id = p_campaign_id
      AND creator_id = p_creator_id
      AND status = 'pending';

  RETURN row_to_json(v_app);
END;
$$;
