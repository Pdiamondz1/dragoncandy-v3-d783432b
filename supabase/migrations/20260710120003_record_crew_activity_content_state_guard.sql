-- Crews Phase 2 fix (Codex round 2, P2): tighten the 'content_submitted' branch of the
-- forge-proof record_crew_activity RPC. Previously it authorized any participant creator
-- (a collaboration EXISTS on the campaign), so a hired crew creator could call the RPC
-- directly with p_event_type='content_submitted' even when they had NOT actually submitted,
-- inserting a false feed row and spamming the owner a bogus "New content submitted" bell/email.
-- The legit call fires from SubmitForReviewButton's onSuccess, which first sets
-- content_status='submitted' (awaited) — so the collaboration IS in 'submitted' state at call
-- time. Gate on that exact lifecycle state: an authenticated participant can only emit
-- 'content_submitted' when their own collaboration is genuinely 'submitted'. Everything else is
-- byte-identical to 20260710120002.
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
    -- lifecycle-gated (Codex round 2): only a participant whose own collaboration is
    -- actually in 'submitted' state may emit this — closes the forged-submission spam vector.
    IF NOT EXISTS (SELECT 1 FROM campaign_collaborations
                   WHERE campaign_id = p_campaign_id AND creator_id = v_uid
                     AND content_status = 'submitted')
       THEN RAISE EXCEPTION 'unauthorized'; END IF;
    v_visibility := 'business'; v_participant := v_uid;
  ELSIF p_event_type IN ('hired','content_approved','revision_requested','completed') THEN
    v_visibility := 'business';
    -- participant = the collaboration's creator (validated to belong to the campaign)
    IF p_collaboration_id IS NOT NULL THEN
      SELECT creator_id INTO v_participant FROM campaign_collaborations
        WHERE id = p_collaboration_id AND campaign_id = p_campaign_id;
      IF v_participant IS NULL THEN RAISE EXCEPTION 'collaboration not on campaign'; END IF;
    ELSE
      SELECT creator_id INTO STRICT v_participant FROM campaign_collaborations
        WHERE campaign_id = p_campaign_id;
    END IF;
    -- 'completed' is mutual (owner OR the participant creator finalizes); the rest are owner-only.
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
