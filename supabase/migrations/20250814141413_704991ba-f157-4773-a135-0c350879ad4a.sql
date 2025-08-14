-- Fix infinite recursion in conversation_participants policies
-- First, drop the problematic policy
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;

-- Create a security definer function to check if user is in a conversation
CREATE OR REPLACE FUNCTION public.user_in_conversation(conversation_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = conversation_uuid 
    AND user_id = user_uuid 
    AND left_at IS NULL
  );
END;
$function$;

-- Recreate the policy using the security definer function
CREATE POLICY "Users can view participants in their conversations" 
ON public.conversation_participants 
FOR SELECT 
USING (
  user_id = auth.uid() OR 
  public.user_in_conversation(conversation_id, auth.uid())
);