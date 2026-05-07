-- Security fix #3: Messages RLS gap for conversation-scoped messages
-- The original SELECT policy only checked sender_id/recipient_id.
-- Conversation-scoped messages (group threads) need participant coverage.

-- Drop existing SELECT policies on messages to replace with unified policy
DROP POLICY IF EXISTS "Users can read their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages they sent or received" ON public.messages;
DROP POLICY IF EXISTS "messages: conversation participants" ON public.messages;

-- Unified SELECT policy: direct messages OR conversation participant
CREATE POLICY "messages: select by participant"
ON public.messages FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid()
  OR recipient_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.left_at IS NULL
  )
);
