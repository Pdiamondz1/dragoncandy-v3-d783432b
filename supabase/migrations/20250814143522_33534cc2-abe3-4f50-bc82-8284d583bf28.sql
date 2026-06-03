-- Add function to get other participant ID from conversation
CREATE OR REPLACE FUNCTION public.get_other_participant_id(conversation_uuid uuid, user_uuid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
DECLARE
  other_user_id UUID;
BEGIN
  SELECT cp.user_id INTO other_user_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = conversation_uuid 
  AND cp.user_id != user_uuid 
  AND cp.left_at IS NULL
  LIMIT 1;
  
  RETURN other_user_id;
END;
$function$;

-- Optimize message queries with better indexing
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_read_status ON public.messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_participants_lookup ON public.conversation_participants(conversation_id, user_id) WHERE left_at IS NULL;