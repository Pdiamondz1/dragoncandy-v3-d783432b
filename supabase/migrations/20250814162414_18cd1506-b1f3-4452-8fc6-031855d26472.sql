-- Add policy to allow viewing profiles of people they message with
CREATE POLICY "Users can view profiles of people they message with" 
ON public.profiles 
FOR SELECT 
USING (
  -- Users can see their own profile
  auth.uid() = id 
  OR 
  -- Users can see profiles of people they have messaged or received messages from
  EXISTS (
    SELECT 1 FROM public.messages 
    WHERE (
      (sender_id = auth.uid() AND recipient_id = profiles.id) OR
      (recipient_id = auth.uid() AND sender_id = profiles.id)
    )
  )
);