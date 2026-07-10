-- Crews Phase 2 — Task 2: forge-proof record_crew_activity RPC (the only write path
-- for crew_activity). Client passes ONLY (campaign_id, event_type, collaboration_id?);
-- the RPC enforces a per-event authorization matrix on auth.uid(), re-derives everything
-- server-side, inserts, and returns facts (the frontend fans out notifications separately).
-- Crews are FREE — there is no 'paid' event.
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
  SELECT id, user_id, group_id, title INTO v_campaign
    FROM campaigns WHERE id = p_campaign_id;
  IF NOT FOUND OR v_campaign.group_id IS NULL THEN
    RETURN NULL;                       -- no-op off the crew path
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
    IF NOT EXISTS (SELECT 1 FROM campaign_collaborations WHERE campaign_id = p_campaign_id AND creator_id = v_uid)
       THEN RAISE EXCEPTION 'unauthorized'; END IF;
    v_visibility := 'business'; v_participant := v_uid;
  ELSIF p_event_type IN ('hired','content_approved','revision_requested','completed') THEN
    IF v_campaign.user_id <> v_uid THEN RAISE EXCEPTION 'unauthorized'; END IF;   -- owner only
    v_visibility := 'business';
    IF p_collaboration_id IS NOT NULL THEN
      SELECT creator_id INTO v_participant FROM campaign_collaborations
        WHERE id = p_collaboration_id AND campaign_id = p_campaign_id;
      IF v_participant IS NULL THEN RAISE EXCEPTION 'collaboration not on campaign'; END IF;
    ELSE
      -- STRICT so ambiguity (>1) / none (0) actually RAISEs; v1 single-winner => exactly one row.
      SELECT creator_id INTO STRICT v_participant FROM campaign_collaborations
        WHERE campaign_id = p_campaign_id;
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
