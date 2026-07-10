-- Crews Phase 2 fix (Codex round 7, P2): gate the 'completed' event on the collaboration actually
-- being completed. 'completed' is the only business-visibility event authorized for a NON-owner (the
-- participant creator OR the owner — see the round-1 mutual-completion fix), so it is the only one a
-- non-owner could forge; Codex's concrete exploit is "a hired creator inserts a completed row before
-- the project is complete." Require campaign_collaborations.status = 'completed'. This is safe: the
-- sole caller (useProjectComplete) sets status='completed' immediately before firing, and only when
-- this caller won the completion race — so the gate never false-rejects a legitimate completion.
--
-- The other business events stay as-is by design: 'hired' / 'content_approved' / 'revision_requested'
-- are OWNER-ONLY (a non-owner is rejected by the v_uid <> v_campaign.user_id check), so they cannot be
-- cross-user forged; the owner recording an event about their own campaign in their own private crew
-- feed is inherently authorized, and gating them on their edge-function-mediated content_status
-- transitions would risk silently dropping legit rows (the best-effort wrapper swallows a RAISE) for no
-- security gain. Everything else is byte-identical to 20260710120007.
CREATE OR REPLACE FUNCTION public.record_crew_activity(
  p_campaign_id uuid, p_event_type text, p_collaboration_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_campaign record;
  v_uid uuid := auth.uid();
  v_participant uuid;
  v_collab_status text;
  v_visibility text;
  v_actor_name text;
  v_creator_name text;
  v_submitted_at timestamptz;
  v_found boolean;
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
    SELECT content_submitted_at, true INTO v_submitted_at, v_found
      FROM campaign_collaborations
      WHERE campaign_id = p_campaign_id AND creator_id = v_uid AND content_status = 'submitted'
      ORDER BY content_submitted_at DESC NULLS LAST LIMIT 1;
    IF NOT COALESCE(v_found, false) THEN RAISE EXCEPTION 'unauthorized'; END IF;
    IF v_submitted_at IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM crew_activity
                 WHERE campaign_id = p_campaign_id AND participant_id = v_uid
                   AND event_type = 'content_submitted' AND created_at >= v_submitted_at) THEN
        RETURN NULL;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM crew_activity
                 WHERE campaign_id = p_campaign_id AND participant_id = v_uid
                   AND event_type = 'content_submitted' AND created_at > now() - interval '30 seconds') THEN
        RETURN NULL;
      END IF;
    END IF;
    v_visibility := 'business'; v_participant := v_uid;
  ELSIF p_event_type IN ('hired','content_approved','revision_requested','completed') THEN
    v_visibility := 'business';
    IF p_collaboration_id IS NOT NULL THEN
      SELECT creator_id, status INTO v_participant, v_collab_status FROM campaign_collaborations
        WHERE id = p_collaboration_id AND campaign_id = p_campaign_id;
      IF v_participant IS NULL THEN RAISE EXCEPTION 'collaboration not on campaign'; END IF;
    ELSE
      SELECT creator_id, status INTO STRICT v_participant, v_collab_status FROM campaign_collaborations
        WHERE campaign_id = p_campaign_id;
    END IF;
    IF p_event_type = 'completed' THEN
      -- mutual (owner OR participant), and only when the collaboration is genuinely completed.
      IF v_uid <> v_campaign.user_id AND v_uid <> v_participant THEN RAISE EXCEPTION 'unauthorized'; END IF;
      IF v_collab_status <> 'completed' THEN RAISE EXCEPTION 'collaboration not completed'; END IF;
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
