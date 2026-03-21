-- Fix user display names by updating the RPC function
CREATE OR REPLACE FUNCTION public.get_user_conversations(user_uuid uuid)
RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_title text, last_message_at timestamp with time zone, unread_count bigint, other_participant_name text, other_participant_avatar text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
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
         -- Extract name from email if full_name is null
         CASE 
           WHEN p.email IS NOT NULL THEN 
             INITCAP(REPLACE(SPLIT_PART(p.email, '@', 1), '.', ' '))
           ELSE 'Unknown User'
         END
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
    END as other_participant_avatar
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = user_uuid 
  AND cp.left_at IS NULL
  AND c.is_archived = false
  ORDER BY c.last_message_at DESC NULLS LAST;
END;
$function$;