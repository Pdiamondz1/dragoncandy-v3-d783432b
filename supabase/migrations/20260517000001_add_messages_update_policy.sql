-- Fix: mark-as-read was silently blocked because no UPDATE policy existed.
-- Recipients need to update read_at (and is_starred, is_archived) on messages
-- addressed to them. Senders can update is_starred/is_archived on messages they sent.

CREATE POLICY "Recipients can update their own messages"
ON public.messages FOR UPDATE
TO authenticated
USING (
  recipient_id = auth.uid()
  OR sender_id = auth.uid()
)
WITH CHECK (
  recipient_id = auth.uid()
  OR sender_id = auth.uid()
);
