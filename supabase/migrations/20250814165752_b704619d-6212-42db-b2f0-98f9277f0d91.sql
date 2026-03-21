-- Drop the existing function and recreate with new return structure
DROP FUNCTION IF EXISTS public.get_user_conversations(uuid);

-- Create updated function with campaign conversation support
CREATE OR REPLACE FUNCTION public.get_user_conversations(user_uuid uuid)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_title text, last_message_at timestamp with time zone, unread_count bigint, other_participant_name text, other_participant_avatar text, campaign_id uuid, campaign_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  -- Direct conversations
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
    -- For direct conversations, get the other participant's name with better fallback logic
    CASE WHEN c.type = 'direct' THEN
      (SELECT COALESCE(
         p.full_name, 
         p.email,
         'Unknown User'
       )
       FROM public.conversation_participants cp
       JOIN public.profiles p ON p.id = cp.user_id
       WHERE cp.conversation_id = c.id 
       AND cp.user_id != user_uuid 
       AND cp.left_at IS NULL
       LIMIT 1)
    ELSE c.title
    END as other_participant_name,
    -- For direct conversations, get the other participant's avatar
    CASE WHEN c.type = 'direct' THEN
      (SELECT p.avatar_url 
       FROM public.conversation_participants cp
       JOIN public.profiles p ON p.id = cp.user_id
       WHERE cp.conversation_id = c.id 
       AND cp.user_id != user_uuid 
       AND cp.left_at IS NULL
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

  UNION ALL

  -- Campaign conversations (for messages where user is involved in campaign)
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
    -- Get the other participant's name for campaign messages
    CASE 
      WHEN camp.user_id = user_uuid THEN
        -- If current user is the campaign owner, show the creator's name
        (SELECT COALESCE(
           cp.creator_name,
           p.full_name,
           p.email,
           'Creator'
         )
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp ON cp.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
      ELSE
        -- If current user is the creator, show the business owner's name
        (SELECT COALESCE(
           bp.business_name,
           p.full_name,
           p.email,
           'Business Client'
         )
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_name,
    -- Get the other participant's avatar for campaign messages
    CASE 
      WHEN camp.user_id = user_uuid THEN
        -- If current user is the campaign owner, show the creator's avatar
        (SELECT COALESCE(cp.avatar_url, p.avatar_url)
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp ON cp.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
      ELSE
        -- If current user is the creator, show the business owner's avatar
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
    camp.user_id = user_uuid OR 
    EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc 
      WHERE cc.campaign_id = camp.id 
      AND cc.creator_id = user_uuid
    )
  )

  ORDER BY last_message_at DESC NULLS LAST;
END;
$function$