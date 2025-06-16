
-- Add columns for message attachments and threading
ALTER TABLE public.messages 
ADD COLUMN attachment_url text,
ADD COLUMN attachment_name text,
ADD COLUMN attachment_size bigint,
ADD COLUMN parent_message_id uuid REFERENCES public.messages(id),
ADD COLUMN thread_id uuid;

-- Create index for better performance on thread queries
CREATE INDEX idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX idx_messages_parent_id ON public.messages(parent_message_id);
CREATE INDEX idx_messages_campaign_unread ON public.messages(campaign_id, recipient_id) WHERE read_at IS NULL;

-- Create a function to get unread message counts per campaign
CREATE OR REPLACE FUNCTION public.get_unread_message_counts(user_uuid uuid)
RETURNS TABLE(campaign_id uuid, unread_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.campaign_id,
    COUNT(*) as unread_count
  FROM public.messages m
  WHERE m.recipient_id = user_uuid 
    AND m.read_at IS NULL
  GROUP BY m.campaign_id;
END;
$$;

-- Enable realtime for messages table updates
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
