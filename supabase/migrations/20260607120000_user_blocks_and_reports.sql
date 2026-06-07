-- 20260607120000_user_blocks_and_reports.sql
-- Apple App Store guideline 1.2 (UGC): block abusive users + report them in direct
-- messaging. Database-enforced. Scoped to DIRECT (campaign_id IS NULL) messages so
-- paid campaign collaboration messaging is unaffected.

-- 1) user_blocks (mirror brand_shortlists)
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_blocks_select ON public.user_blocks;
CREATE POLICY user_blocks_select ON public.user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS user_blocks_insert ON public.user_blocks;
CREATE POLICY user_blocks_insert ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
DROP POLICY IF EXISTS user_blocks_delete ON public.user_blocks;
CREATE POLICY user_blocks_delete ON public.user_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- 2) user_reports
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports(reported_id);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_reports_insert ON public.user_reports;
CREATE POLICY user_reports_insert ON public.user_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS user_reports_select ON public.user_reports;
CREATE POLICY user_reports_select ON public.user_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) symmetric block helper (used by RLS + the conversations RPC)
CREATE OR REPLACE FUNCTION public.is_blocked(user_a uuid, user_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;

-- 4) RPC wrappers called by the frontend (mirror flag_dragonshare_post)
CREATE OR REPLACE FUNCTION public.block_user(p_blocked_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_blocked_id = auth.uid() THEN RAISE EXCEPTION 'Cannot block yourself'; END IF;
  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- one-directional check (did *I* block them) for the toggle label
CREATE OR REPLACE FUNCTION public.is_user_blocked(p_other_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_other_id);
$$;
GRANT EXECUTE ON FUNCTION public.is_user_blocked(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_user(p_reported_id uuid, p_conversation_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_reports (reporter_id, reported_id, conversation_id, reason)
  VALUES (auth.uid(), p_reported_id, p_conversation_id, p_reason);
END;
$$;
GRANT EXECUTE ON FUNCTION public.report_user(uuid, uuid, text) TO authenticated;

-- 5) Hide direct messages between blocked users. Recreate the ACTIVE policy
--    "messages: select by participant" (from 20260506200000_security_messages_rls.sql),
--    preserving its full predicate, wrapped with the block filter. Do NOT add a second policy.
DROP POLICY IF EXISTS "messages: select by participant" ON public.messages;
CREATE POLICY "messages: select by participant"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    (
      sender_id = auth.uid()
      OR recipient_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.user_id = auth.uid()
          AND cp.left_at IS NULL
      )
    )
    AND NOT (campaign_id IS NULL AND public.is_blocked(sender_id, recipient_id))
  );

-- 6) Prevent sending direct messages between blocked users (additive trigger)
CREATE OR REPLACE FUNCTION public.prevent_blocked_direct_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.campaign_id IS NULL AND NEW.recipient_id IS NOT NULL
     AND public.is_blocked(NEW.sender_id, NEW.recipient_id) THEN
    RAISE EXCEPTION 'You cannot message a blocked user';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_blocked_direct_messages ON public.messages;
CREATE TRIGGER trg_prevent_blocked_direct_messages
  BEFORE INSERT ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.prevent_blocked_direct_messages();

-- 7) Recreate get_user_conversations verbatim (body from
--    20260515000001_fix_conversation_visibility_pre_message.sql) with SET search_path = public
--    preserved (added by 20260524183858), plus ONE added block-exclusion clause in Branch 1
--    (the DIRECT-conversation branch). Branch 2 (campaign) is COMPLETELY UNCHANGED.
CREATE OR REPLACE FUNCTION public.get_user_conversations(
  user_uuid uuid,
  p_org_unit_id uuid DEFAULT NULL
)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_title text, last_message_at timestamp with time zone, unread_count bigint, other_participant_name text, other_participant_avatar text, campaign_id uuid, campaign_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  -- Branch 1: Direct conversations (from conversations table)
  SELECT
    c.id as conversation_id,
    c.type as conversation_type,
    c.title as conversation_title,
    c.last_message_at,
    COALESCE(
      (SELECT COUNT(*) FROM public.messages m
       WHERE m.conversation_id = c.id
       AND m.recipient_id = user_uuid
       AND m.read_at IS NULL), 0
    ) as unread_count,
    CASE WHEN c.type = 'direct' THEN
      (SELECT COALESCE(p.full_name, p.email, 'Unknown User')
       FROM public.conversation_participants cp2
       JOIN public.profiles p ON p.id = cp2.user_id
       WHERE cp2.conversation_id = c.id
       AND cp2.user_id != user_uuid
       AND cp2.left_at IS NULL
       LIMIT 1)
    ELSE c.title
    END as other_participant_name,
    CASE WHEN c.type = 'direct' THEN
      (SELECT p.avatar_url
       FROM public.conversation_participants cp2
       JOIN public.profiles p ON p.id = cp2.user_id
       WHERE cp2.conversation_id = c.id
       AND cp2.user_id != user_uuid
       AND cp2.left_at IS NULL
       LIMIT 1)
    ELSE NULL
    END as other_participant_avatar,
    NULL::uuid as campaign_id,
    NULL::text as campaign_status
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = user_uuid
  AND cp.left_at IS NULL
  AND c.is_archived = false
  AND (p_org_unit_id IS NULL OR c.org_unit_id = p_org_unit_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cpb
    WHERE cpb.conversation_id = c.id
      AND cpb.user_id <> user_uuid
      AND cpb.left_at IS NULL
      AND public.is_blocked(user_uuid, cpb.user_id)
  )

  UNION ALL

  -- Branch 2: Campaign conversations (from campaigns table)
  -- Now visible as soon as an application exists, even before any messages
  SELECT
    NULL::uuid as conversation_id,
    'campaign'::text as conversation_type,
    CONCAT('Campaign: ', camp.title) as conversation_title,
    COALESCE(
      (SELECT MAX(m.created_at) FROM public.messages m
       WHERE m.campaign_id = camp.id
       AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)),
      -- Fall back to application date when no messages exist yet
      (SELECT MAX(ca_ts.created_at) FROM public.campaign_applications ca_ts
       WHERE ca_ts.campaign_id = camp.id
       AND ca_ts.status NOT IN ('rejected', 'withdrawn'))
    ) as last_message_at,
    COALESCE(
      (SELECT COUNT(*) FROM public.messages m
       WHERE m.campaign_id = camp.id
       AND m.recipient_id = user_uuid
       AND m.read_at IS NULL), 0
    ) as unread_count,
    CASE
      WHEN camp.user_id = user_uuid THEN
        COALESCE(
          (SELECT COALESCE(cp2.creator_name, p.full_name, p.email, 'Creator')
           FROM public.campaign_collaborations cc
           JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
           LEFT JOIN public.profiles p ON p.id = cc.creator_id
           WHERE cc.campaign_id = camp.id
           LIMIT 1),
          -- Fall back to applicant name when no collaboration exists yet
          (SELECT COALESCE(p.full_name, p.email, 'Applicant')
           FROM public.campaign_applications ca_name
           JOIN public.profiles p ON p.id = ca_name.creator_id
           WHERE ca_name.campaign_id = camp.id
           AND ca_name.status NOT IN ('rejected', 'withdrawn')
           ORDER BY ca_name.created_at DESC
           LIMIT 1)
        )
      ELSE
        (SELECT COALESCE(bp.business_name, p.full_name, p.email, 'Business Client')
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_name,
    CASE
      WHEN camp.user_id = user_uuid THEN
        COALESCE(
          (SELECT COALESCE(cp2.avatar_url, p.avatar_url)
           FROM public.campaign_collaborations cc
           JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
           LEFT JOIN public.profiles p ON p.id = cc.creator_id
           WHERE cc.campaign_id = camp.id
           LIMIT 1),
          (SELECT p.avatar_url
           FROM public.campaign_applications ca_av
           JOIN public.profiles p ON p.id = ca_av.creator_id
           WHERE ca_av.campaign_id = camp.id
           AND ca_av.status NOT IN ('rejected', 'withdrawn')
           ORDER BY ca_av.created_at DESC
           LIMIT 1)
        )
      ELSE
        (SELECT COALESCE(bp.logo_url, p.avatar_url)
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_avatar,
    camp.id as campaign_id,
    camp.status::text as campaign_status
  FROM public.campaigns camp
  WHERE (
    -- Has messages (existing behavior)
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.campaign_id = camp.id
      AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)
    )
    OR
    -- Creator has an active application (pre-message visibility)
    EXISTS (
      SELECT 1 FROM public.campaign_applications ca
      WHERE ca.campaign_id = camp.id
      AND ca.creator_id = user_uuid
      AND ca.status NOT IN ('rejected', 'withdrawn')
    )
    OR
    -- Restaurant owns campaign with active applications
    (camp.user_id = user_uuid AND EXISTS (
      SELECT 1 FROM public.campaign_applications ca2
      WHERE ca2.campaign_id = camp.id
      AND ca2.status NOT IN ('rejected', 'withdrawn')
    ))
  )
  AND (
    camp.user_id = user_uuid
    OR EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc
      WHERE cc.campaign_id = camp.id
      AND cc.creator_id = user_uuid
    )
    OR EXISTS (
      SELECT 1 FROM public.campaign_applications ca3
      WHERE ca3.campaign_id = camp.id
      AND ca3.creator_id = user_uuid
      AND ca3.status NOT IN ('rejected', 'withdrawn')
    )
  )
  AND (p_org_unit_id IS NULL OR camp.org_unit_id = p_org_unit_id)

  ORDER BY last_message_at DESC NULLS LAST;
END;
$function$;
