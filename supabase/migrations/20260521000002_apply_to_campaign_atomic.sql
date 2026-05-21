-- S2-4: Atomic application + invitation sync via RPC
CREATE OR REPLACE FUNCTION apply_to_campaign(
  p_campaign_id uuid,
  p_creator_id uuid,
  p_proposed_rate numeric,
  p_intro_message text,
  p_proposed_timeline text DEFAULT NULL,
  p_is_counter_offer boolean DEFAULT false
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

  v_app_status := CASE WHEN p_is_counter_offer THEN 'counter_offered' ELSE 'pending' END;

  -- Insert or update application
  INSERT INTO campaign_applications (
    campaign_id, creator_id, proposed_rate, intro_message,
    proposed_timeline, status
  )
  VALUES (
    p_campaign_id, p_creator_id, p_proposed_rate, p_intro_message,
    p_proposed_timeline, v_app_status
  )
  ON CONFLICT (campaign_id, creator_id) WHERE status <> 'rejected'
  DO UPDATE SET
    proposed_rate = EXCLUDED.proposed_rate,
    intro_message = EXCLUDED.intro_message,
    proposed_timeline = EXCLUDED.proposed_timeline,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING * INTO v_app;

  -- Sync any pending invitation to accepted/counter_offered
  v_invitation_status := CASE WHEN p_is_counter_offer THEN 'counter_offered' ELSE 'accepted' END;

  UPDATE campaign_invitations
    SET status = v_invitation_status, updated_at = now()
    WHERE campaign_id = p_campaign_id
      AND creator_id = p_creator_id
      AND status = 'pending';

  RETURN row_to_json(v_app);
END;
$$;
