-- Crews Phase 2 fix (Codex round 3, P2): make the 'content_submitted' event idempotent PER
-- SUBMISSION CYCLE. The branch already requires the caller's collaboration to be in 'submitted'
-- state, but that state persists across many calls, so a replay (adversarial, or an innocent UI
-- double-fire / retry) would insert duplicate feed rows AND send the owner duplicate
-- "New content submitted" bell/email. A blanket UNIQUE(campaign,participant,event) was rejected
-- during review because it would break a legitimate RESUBMIT after a revision request.
--
-- Cycle-scoped de-dup instead: suppress a content_submitted insert when one already exists for
-- this (campaign, participant) that is NEWER than the most recent owner action
-- (content_approved / revision_requested) — i.e. we already recorded this submission cycle. A
-- genuine resubmit after revision_requested starts a NEW cycle (the prior content_submitted is
-- older than that revision row) and therefore still records. Returns NULL on suppression, and the
-- thin wrapper only fires create-notification when the RPC returns a row, so the duplicate owner
-- notification is suppressed too. Other events keep their prior behavior (they carry no
-- notification side effect — only content_submitted does — so their private-feed row duplicates
-- stay an accepted, cosmetic non-issue). Everything else is byte-identical to 20260710120003.
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
    IF NOT EXISTS (SELECT 1 FROM campaign_collaborations
                   WHERE campaign_id = p_campaign_id AND creator_id = v_uid
                     AND content_status = 'submitted')
       THEN RAISE EXCEPTION 'unauthorized'; END IF;
    -- idempotent per submission cycle: skip if this cycle's submit is already recorded.
    IF EXISTS (
      SELECT 1 FROM crew_activity ca
      WHERE ca.campaign_id = p_campaign_id AND ca.participant_id = v_uid
        AND ca.event_type = 'content_submitted'
        AND ca.created_at > COALESCE((
          SELECT max(ca2.created_at) FROM crew_activity ca2
          WHERE ca2.campaign_id = p_campaign_id AND ca2.participant_id = v_uid
            AND ca2.event_type IN ('content_approved','revision_requested')
        ), '-infinity'::timestamptz)
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
