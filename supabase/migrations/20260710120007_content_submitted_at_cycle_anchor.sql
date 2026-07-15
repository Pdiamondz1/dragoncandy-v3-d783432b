-- Crews Phase 2 fix (Codex round 6, P2): give content_submitted a CYCLE-SCOPED, FULLY SERVER-SIDE
-- idempotency anchor. Round 5 replaced the client-clock anchor with a 30s debounce, but a debounce
-- is only time-based: a direct caller can replay once per window while content_status stays
-- 'submitted', re-notifying the owner. Round 4/5 ruled out the two obvious cycle anchors —
-- best-effort owner-action activity rows, and the client-set campaign_collaborations.updated_at
-- (its `handle_updated_at` trigger is a verified no-op, so updated_at is a browser timestamp).
--
-- Introduce an authoritative server-stamped marker: campaign_collaborations.content_submitted_at,
-- set by a narrow BEFORE UPDATE trigger ONLY when content_status transitions INTO 'submitted'
-- (now() — server clock). Each new submission cycle (including a resubmit after a revision) advances
-- it; a no-op update that leaves content_status='submitted' does not re-stamp. The RPC then suppresses
-- a content_submitted whose cycle already has a recorded activity row (created_at >= the marker) —
-- cycle-scoped AND server-side, depending on neither a client value nor a best-effort row.
--
-- The column is nullable + additive (no backfill; existing rows keep NULL). The trigger fires for all
-- collaborations but only writes this one new column — no paid-marketplace behavior change. A NULL
-- marker (legacy rows submitted before this column existed) falls back to the 30s debounce.

ALTER TABLE public.campaign_collaborations
  ADD COLUMN IF NOT EXISTS content_submitted_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_content_submitted_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Stamp a server timestamp each time the collaboration ENTERS the 'submitted' state.
  IF NEW.content_status = 'submitted' AND NEW.content_status IS DISTINCT FROM OLD.content_status THEN
    NEW.content_submitted_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_content_submitted_at ON public.campaign_collaborations;
CREATE TRIGGER trg_set_content_submitted_at
  BEFORE UPDATE ON public.campaign_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.set_content_submitted_at();

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
    -- authz: caller's own collaboration must be in 'submitted' state; capture its server-stamped
    -- submission time (the current cycle anchor). v_found distinguishes "no submitted collab
    -- (unauthorized)" from "submitted but marker NULL (legacy row)".
    SELECT content_submitted_at, true INTO v_submitted_at, v_found
      FROM campaign_collaborations
      WHERE campaign_id = p_campaign_id AND creator_id = v_uid AND content_status = 'submitted'
      ORDER BY content_submitted_at DESC NULLS LAST LIMIT 1;
    IF NOT COALESCE(v_found, false) THEN RAISE EXCEPTION 'unauthorized'; END IF;
    -- cycle-scoped idempotency: suppress if this cycle already has a recorded content_submitted.
    IF v_submitted_at IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM crew_activity
                 WHERE campaign_id = p_campaign_id AND participant_id = v_uid
                   AND event_type = 'content_submitted' AND created_at >= v_submitted_at) THEN
        RETURN NULL;
      END IF;
    ELSE
      -- legacy row (submitted before the marker existed): fall back to a 30s server-side debounce.
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
