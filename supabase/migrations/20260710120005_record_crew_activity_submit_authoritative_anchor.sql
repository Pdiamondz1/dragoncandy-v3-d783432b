-- Crews Phase 2 fix (Codex round 4, P2): re-anchor the content_submitted idempotency guard on
-- an AUTHORITATIVE signal. 20260710120004 keyed the "new submission cycle" boundary on the presence
-- of a prior revision_requested / content_approved *crew_activity* row — but those owner-action rows
-- are written through the fire-and-forget recordCrewActivity wrapper (errors swallowed). If that
-- best-effort write is delayed or fails, a legit resubmit would be wrongly suppressed and the owner
-- would get no row/notification for it.
--
-- Anchor instead on campaign_collaborations.updated_at, which the real Submit-for-Review DB write
-- always bumps (it MUST succeed for the flow to proceed — not best-effort). A content_submitted
-- crew_activity row created at/after the collaboration's current updated_at means we already
-- recorded THIS cycle → suppress. A genuine resubmit bumps updated_at to a newer value, so the
-- prior cycle's row is older → it records. This removes the dependency on best-effort rows entirely.
-- (Clock-skew note: updated_at is client-set and created_at is server-set; under a client-ahead
-- clock the guard may let a duplicate through — the accepted no-idempotency baseline — but it can
-- never WRONGLY suppress a legit resubmit, since a resubmit's updated_at is always far newer than
-- the prior cycle's row.) Everything else is byte-identical to 20260710120004.
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
  v_collab_updated timestamptz;
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
    -- gate: caller's own collaboration must actually be in 'submitted' state; capture its
    -- authoritative updated_at (the submit write bumps it) as the current cycle anchor.
    SELECT updated_at INTO v_collab_updated
      FROM campaign_collaborations
      WHERE campaign_id = p_campaign_id AND creator_id = v_uid AND content_status = 'submitted'
      ORDER BY updated_at DESC LIMIT 1;
    IF v_collab_updated IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
    -- idempotent per submission cycle: a content_submitted row at/after this cycle's submit
    -- means it is already recorded → no-op (returns NULL → wrapper sends no duplicate notice).
    IF EXISTS (
      SELECT 1 FROM crew_activity
      WHERE campaign_id = p_campaign_id AND participant_id = v_uid
        AND event_type = 'content_submitted'
        AND created_at >= v_collab_updated
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
