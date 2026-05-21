-- S3-2 + S3-4: Atomic collaboration creation + campaign activation + sibling rejection
CREATE OR REPLACE FUNCTION accept_application_with_collaboration(
  p_application_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app record;
  v_campaign record;
  v_collab record;
BEGIN
  -- Lock and update the application
  SELECT * INTO v_app
    FROM campaign_applications
    WHERE id = p_application_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.status NOT IN ('pending', 'counter_offered') THEN
    RAISE EXCEPTION 'Application is no longer pending (status: %)', v_app.status;
  END IF;

  UPDATE campaign_applications
    SET status = 'accepted',
        restaurant_approval_status = 'approved',
        updated_at = now()
    WHERE id = p_application_id;

  -- Lock the campaign row
  SELECT * INTO v_campaign
    FROM campaigns
    WHERE id = v_app.campaign_id
    FOR UPDATE;

  -- Idempotent collaboration insert
  INSERT INTO campaign_collaborations (
    campaign_id, creator_id, application_id, status
  )
  VALUES (
    v_app.campaign_id, v_app.creator_id, p_application_id, 'active'
  )
  ON CONFLICT (campaign_id, creator_id) DO NOTHING
  RETURNING * INTO v_collab;

  -- Activate campaign when escrow is held
  IF v_campaign.escrow_status = 'held' THEN
    UPDATE campaigns
      SET status = 'active', updated_at = now()
      WHERE id = v_app.campaign_id;
  END IF;

  -- Auto-decline sibling pending/counter_offered applications
  UPDATE campaign_applications
    SET status = 'rejected',
        rejection_reason = 'Auto-declined: another applicant was selected for this campaign.',
        updated_at = now()
    WHERE campaign_id = v_app.campaign_id
      AND id <> p_application_id
      AND status IN ('pending', 'counter_offered');

  RETURN json_build_object(
    'application_id', p_application_id,
    'campaign_id', v_app.campaign_id,
    'creator_id', v_app.creator_id,
    'status', 'accepted'
  );
END;
$$;
