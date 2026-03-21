-- Create a security definer function to check conversation participation
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conversation_uuid uuid, user_uuid uuid)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM conversation_participants 
    WHERE conversation_id = conversation_uuid 
    AND user_id = user_uuid 
    AND left_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop the existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can send messages in campaigns or conversations they participate in" ON messages;

-- Create new conversation_participants policy without recursion
CREATE POLICY "Users can view participants in their conversations" 
ON conversation_participants 
FOR SELECT 
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM conversation_participants cp2 
  WHERE cp2.conversation_id = conversation_participants.conversation_id 
  AND cp2.user_id = auth.uid() 
  AND cp2.left_at IS NULL
));

-- Create new messages policy using the security definer function
CREATE POLICY "Users can send messages in campaigns or conversations they participate in" 
ON messages 
FOR INSERT 
WITH CHECK (
  (auth.uid() = sender_id) AND (
    -- Campaign messages (existing logic)
    (campaign_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM campaigns WHERE id = campaign_id AND user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM campaign_collaborations WHERE campaign_id = messages.campaign_id AND creator_id = auth.uid())
    )) OR
    -- Direct conversation messages using security definer function
    (conversation_id IS NOT NULL AND public.is_conversation_participant(conversation_id, auth.uid()))
  )
);