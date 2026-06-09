-- Fix: direct-conversation avatars in the messages list
--
-- get_user_conversations returned only profiles.avatar_url for DIRECT conversations,
-- so a business/brand or creator participant who never set a personal profiles.avatar_url
-- showed a blank/initial avatar in the conversation list. (Campaign conversations already
-- COALESCE the role-appropriate logo/avatar — this brings direct conversations in line.)
--
-- Only the direct-branch `other_participant_avatar` subquery changes; everything else is
-- reproduced verbatim from the current definition.

CREATE OR REPLACE FUNCTION public.get_user_conversations(user_uuid uuid, p_org_unit_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_title text, last_message_at timestamp with time zone, unread_count bigint, other_participant_name text, other_participant_avatar text, campaign_id uuid, campaign_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
      (SELECT COALESCE(
         (SELECT cp_av.avatar_url FROM public.creator_profiles cp_av WHERE cp_av.user_id = cp2.user_id LIMIT 1),
         (SELECT bp_av.logo_url FROM public.business_profiles bp_av WHERE bp_av.user_id = cp2.user_id LIMIT 1),
         p.avatar_url
       )
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
  SELECT
    NULL::uuid as conversation_id,
    'campaign'::text as conversation_type,
    CONCAT('Campaign: ', camp.title) as conversation_title,
    COALESCE(
      (SELECT MAX(m.created_at) FROM public.messages m
       WHERE m.campaign_id = camp.id
       AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)),
      (SELECT MAX(ca_ts.created_at) FROM public.campaign_applications ca_ts
       WHERE ca_ts.campaign_id = camp.id
       AND ca_ts.status NOT IN ('rejected'))
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
          (SELECT COALESCE(p.full_name, p.email, 'Applicant')
           FROM public.campaign_applications ca_name
           JOIN public.profiles p ON p.id = ca_name.creator_id
           WHERE ca_name.campaign_id = camp.id
           AND ca_name.status NOT IN ('rejected')
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
           AND ca_av.status NOT IN ('rejected')
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
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.campaign_id = camp.id
      AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)
    )
    OR
    EXISTS (
      SELECT 1 FROM public.campaign_applications ca
      WHERE ca.campaign_id = camp.id
      AND ca.creator_id = user_uuid
      AND ca.status NOT IN ('rejected')
    )
    OR
    (camp.user_id = user_uuid AND EXISTS (
      SELECT 1 FROM public.campaign_applications ca2
      WHERE ca2.campaign_id = camp.id
      AND ca2.status NOT IN ('rejected')
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
      AND ca3.status NOT IN ('rejected')
    )
  )
  AND (p_org_unit_id IS NULL OR camp.org_unit_id = p_org_unit_id)

  ORDER BY last_message_at DESC NULLS LAST;
END;
$function$;
