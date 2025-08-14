-- Drop the existing INSERT policy for messages
DROP POLICY IF EXISTS "Users can send messages in campaigns they participate in" ON public.messages;

-- Create updated INSERT policy that allows both campaign and conversation messages
CREATE POLICY "Users can send messages in campaigns or conversations they participate in" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  (auth.uid() = sender_id) AND (
    -- Campaign messages (existing logic)
    (campaign_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM campaigns WHERE id = campaign_id AND user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM campaign_collaborations WHERE campaign_id = messages.campaign_id AND creator_id = auth.uid())
    )) OR
    -- Direct conversation messages (new logic)
    (conversation_id IS NOT NULL AND 
      EXISTS (SELECT 1 FROM conversation_participants 
              WHERE conversation_id = messages.conversation_id 
              AND user_id = auth.uid() 
              AND left_at IS NULL)
    )
  )
);