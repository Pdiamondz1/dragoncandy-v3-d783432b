-- Fix: Include campaign applicants (not just collaborators) in conversation sidebar.
-- Without this, Creators can't see campaign messages during counter-offer negotiation
-- because campaign_collaborations records only exist after acceptance + escrow.

CREATE OR REPLACE FUNCTION public.get_user_conversations(
  user_uuid uuid,
  p_org_unit_id uuid DEFAULT NULL
)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_title text, last_message_at timestamp with time zone, unread_count bigint, other_participant_name text, other_participant_avatar text, campaign_id uuid, campaign_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  UNION ALL

  -- Branch 2: Campaign conversations (from campaigns table, using messages)
  -- Now includes applicants so Creators see conversations during negotiation
  SELECT
    NULL::uuid as conversation_id,
    'campaign'::text as conversation_type,
    CONCAT('Campaign: ', camp.title) as conversation_title,
    (SELECT MAX(m.created_at) FROM public.messages m
     WHERE m.campaign_id = camp.id
     AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)) as last_message_at,
    COALESCE(
      (SELECT COUNT(*) FROM public.messages m
       WHERE m.campaign_id = camp.id
       AND m.recipient_id = user_uuid
       AND m.read_at IS NULL), 0
    ) as unread_count,
    CASE
      WHEN camp.user_id = user_uuid THEN
        (SELECT COALESCE(cp2.creator_name, p.full_name, p.email, 'Creator')
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
      ELSE
        (SELECT COALESCE(bp.business_name, p.full_name, p.email, 'Business Client')
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_name,
    CASE
      WHEN camp.user_id = user_uuid THEN
        (SELECT COALESCE(cp2.avatar_url, p.avatar_url)
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
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
  WHERE EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.campaign_id = camp.id
    AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)
  )
  AND (
    camp.user_id = user_uuid
    OR EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc
      WHERE cc.campaign_id = camp.id
      AND cc.creator_id = user_uuid
    )
    OR EXISTS (
      SELECT 1 FROM public.campaign_applications ca
      WHERE ca.campaign_id = camp.id
      AND ca.creator_id = user_uuid
      AND ca.status NOT IN ('rejected', 'withdrawn')
    )
  )
  AND (p_org_unit_id IS NULL OR camp.org_unit_id = p_org_unit_id)

  ORDER BY last_message_at DESC NULLS LAST;
END;
$function$;
