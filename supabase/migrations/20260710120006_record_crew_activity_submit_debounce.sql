-- Crews Phase 2 fix (Codex round 5, P2): make the content_submitted idempotency guard FULLY
-- server-side. 20260710120005 compared crew_activity.created_at (server) against the
-- collaboration's updated_at, which SubmitForReviewButton sets from the CLIENT clock
-- (new Date().toISOString()). Under a client-behind clock, a resubmit's client updated_at can be
-- earlier than the prior cycle's server created_at, so the guard would wrongly treat the old row
-- as covering the new cycle and suppress a legitimate resubmit (owner gets no row/notification).
--
-- Replace the timestamp COMPARISON with a short server-side DEBOUNCE: suppress a content_submitted
-- only when an identical one for this (campaign, participant) was recorded in the last 30 seconds
-- (now() vs created_at — both server clocks; no client value, no best-effort row). This is safe
-- because a creator CANNOT trigger a second *legitimate* content_submitted quickly: the collaboration
-- must cycle submitted -> revision_requested -> submitted (owner action), and SubmitForReviewButton
-- hides the Submit button while content_status='submitted'. So a distinct legit resubmit is always
-- minutes apart, while double-fires / retries / adversarial replays arrive within ms-seconds — the
-- window separates them cleanly and can never drop a real submit. Everything else is byte-identical
-- to 20260710120005 (the content_status='submitted' authz gate is preserved).
CREATE OR REPLACE FUNCTION public.record_crew_activity(
  p_campaign_id uuid, p_event_type text, p_collaboration_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_campaign record;
  v_uid uuid := auth.uid();
  v_participant uuid;
  v_visibility text;
  v_actor_name text;
  v_creator_name text;
  v_row_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT id, user_id, group_id, title INTO v_campaign
    FROM campaigns WHERE id = p_campaign_id;
  IF NOT FOUND OR v_campaign.group_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_event_type = 'campaign_posted' THEN
    IF NOT is_creator_group_owner(v_campaign.group_id, v_uid) THEN RAISE EXCEPTION 'unauthorized'; END IF;
    v_visibility := 'crew'; v_participant := NULL;
  ELSIF p_event_type = 'application_received' THEN
    IF NOT (is_active_group_member(v_campaign.group_id, v_uid)
            AND EXISTS (SELECT 1 FROM campaign_applications WHERE campaign_id = p_campaign_id AND creator_id = v_uid))
       THEN RAISE EXCEPTION 'unauthorized'; END IF;
    v_visibility := 'business'; v_participant := v_uid;
  ELSIF p_event_type = 'content_submitted' THEN
    -- authz: caller's own collaboration must actually be in 'submitted' state.
    IF NOT EXISTS (SELECT 1 FROM campaign_collaborations
                   WHERE campaign_id = p_campaign_id AND creator_id = v_uid
                     AND content_status = 'submitted')
       THEN RAISE EXCEPTION 'unauthorized'; END IF;
    -- server-side debounce: drop a duplicate within a short window (double-fire / retry / replay).
    IF EXISTS (
      SELECT 1 FROM crew_activity
      WHERE campaign_id = p_campaign_id AND participant_id = v_uid
        AND event_type = 'content_submitted'
        AND created_at > now() - interval '30 seconds'
    ) THEN
      RETURN NULL;
    END IF;
    v_visibility := 'business'; v_participant := v_uid;
  ELSIF p_event_type IN ('hired','content_approved','revision_requested','completed') THEN
    v_visibility := 'business';
    IF p_collaboration_id IS NOT NULL THEN
      SELECT creator_id INTO v_participant FROM campaign_collaborations
        WHERE id = p_collaboration_id AND campaign_id = p_campaign_id;
      IF v_participant IS NULL THEN RAISE EXCEPTION 'collaboration not on campaign'; END IF;
    ELSE
      SELECT creator_id INTO STRICT v_participant FROM campaign_collaborations
        WHERE campaign_id = p_campaign_id;
    END IF;
    IF p_event_type = 'completed' THEN
      IF v_uid <> v_campaign.user_id AND v_uid <> v_participant THEN RAISE EXCEPTION 'unauthorized'; END IF;
    ELSE
      IF v_uid <> v_campaign.user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown event_type %', p_event_type;
  END IF;

  SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_uid;
  IF v_participant IS NOT NULL THEN
    SELECT COALESCE(cp.creator_name, p.full_name) INTO v_creator_name
      FROM profiles p LEFT JOIN creator_profiles cp ON cp.user_id = p.id WHERE p.id = v_participant;
  END IF;

  INSERT INTO crew_activity (group_id, campaign_id, actor_id, participant_id, event_type, visibility, metadata)
  VALUES (v_campaign.group_id, p_campaign_id, v_uid, v_participant, p_event_type, v_visibility,
          jsonb_strip_nulls(jsonb_build_object(
            'campaign_title', v_campaign.title,
            'creator_name', v_creator_name)))
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'id', v_row_id, 'group_id', v_campaign.group_id, 'owner_id', v_campaign.user_id,
    'participant_id', v_participant, 'event_type', p_event_type,
    'campaign_id', p_campaign_id, 'campaign_title', v_campaign.title,
    'creator_name', v_creator_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_crew_activity(uuid, text, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.record_crew_activity(uuid, text, uuid) TO authenticated;
