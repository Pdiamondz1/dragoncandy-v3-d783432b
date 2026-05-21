-- S3-1: Atomic counter-offer supersession via SELECT FOR UPDATE
CREATE OR REPLACE FUNCTION create_counter_offer(
  p_application_id uuid,
  p_sender_id uuid,
  p_sender_role text,
  p_proposed_rate numeric DEFAULT NULL,
  p_proposed_timeline text DEFAULT NULL,
  p_message text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app record;
  v_offer record;
BEGIN
  -- Lock the application row to serialize concurrent counter-offers
  SELECT * INTO v_app
    FROM campaign_applications
    WHERE id = p_application_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- Update application status
  UPDATE campaign_applications
    SET status = 'counter_offered', updated_at = now()
    WHERE id = p_application_id;

  -- Decline ALL pending counter-offers on this application
  UPDATE application_counter_offers
    SET status = 'declined', updated_at = now()
    WHERE application_id = p_application_id
      AND status = 'pending';

  -- Insert the new counter-offer
  INSERT INTO application_counter_offers (
    application_id, sender_id, sender_role,
    proposed_rate, proposed_timeline, message, status
  )
  VALUES (
    p_application_id, p_sender_id, p_sender_role,
    p_proposed_rate, p_proposed_timeline, p_message, 'pending'
  )
  RETURNING * INTO v_offer;

  RETURN row_to_json(v_offer);
END;
$$;
