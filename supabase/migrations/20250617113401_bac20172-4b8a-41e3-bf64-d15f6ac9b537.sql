
-- Create conversations table for direct messaging
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct', -- 'direct' or 'campaign'
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_message_at TIMESTAMP WITH TIME ZONE,
  is_archived BOOLEAN DEFAULT false
);

-- Create conversation participants table
CREATE TABLE public.conversation_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  role TEXT DEFAULT 'participant', -- 'admin', 'participant'
  UNIQUE(conversation_id, user_id)
);

-- Create message reactions table
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Create user presence table
CREATE TABLE public.user_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'offline', -- 'online', 'offline', 'busy', 'away'
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create push notifications table
CREATE TABLE public.push_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  message_notifications BOOLEAN DEFAULT true,
  campaign_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add new columns to messages table
ALTER TABLE public.messages 
ADD COLUMN conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
ADD COLUMN category TEXT DEFAULT 'general', -- 'urgent', 'info', 'general'
ADD COLUMN is_starred BOOLEAN DEFAULT false,
ADD COLUMN is_archived BOOLEAN DEFAULT false,
ADD COLUMN delivery_status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read'
ADD COLUMN forwarded_from_message_id UUID REFERENCES public.messages(id),
ADD COLUMN edited_at TIMESTAMP WITH TIME ZONE;

-- Enable RLS on new tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations they participate in"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants 
      WHERE conversation_id = conversations.id 
      AND user_id = auth.uid()
      AND left_at IS NULL
    )
  );

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Participants can update conversations"
  ON public.conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants 
      WHERE conversation_id = conversations.id 
      AND user_id = auth.uid()
      AND left_at IS NULL
    )
  );

-- RLS Policies for conversation participants
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp 
      WHERE cp.conversation_id = conversation_participants.conversation_id 
      AND cp.user_id = auth.uid()
      AND cp.left_at IS NULL
    )
  );

CREATE POLICY "Users can add themselves to conversations"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own participation"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for message reactions
CREATE POLICY "Users can view reactions on messages they can see"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
      AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid())
    )
  );

CREATE POLICY "Users can create their own reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reactions"
  ON public.message_reactions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own reactions"
  ON public.message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policies for user presence (fixed duplicate policy names)
CREATE POLICY "Users can view all user presence"
  ON public.user_presence FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own presence"
  ON public.user_presence FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own presence"
  ON public.user_presence FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for push notifications
CREATE POLICY "Users can view their own notifications"
  ON public.push_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.push_notifications FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for notification preferences
CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_conversation_participants_user_id ON public.conversation_participants(user_id);
CREATE INDEX idx_conversation_participants_conversation_id ON public.conversation_participants(conversation_id);
CREATE INDEX idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE INDEX idx_user_presence_user_id ON public.user_presence(user_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_category ON public.messages(category);
CREATE INDEX idx_messages_is_starred ON public.messages(is_starred);

-- Create updated_at trigger for conversations
CREATE TRIGGER conversations_updated_at 
  BEFORE UPDATE ON public.conversations 
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create updated_at trigger for notification_preferences
CREATE TRIGGER notification_preferences_updated_at 
  BEFORE UPDATE ON public.notification_preferences 
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create updated_at trigger for user_presence
CREATE TRIGGER user_presence_updated_at 
  BEFORE UPDATE ON public.user_presence 
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create function to get direct conversations for a user
CREATE OR REPLACE FUNCTION public.get_user_conversations(user_uuid UUID)
RETURNS TABLE(
  conversation_id UUID,
  conversation_type TEXT,
  conversation_title TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count BIGINT,
  other_participant_name TEXT,
  other_participant_avatar TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    -- For direct conversations, get the other participant's name
    CASE WHEN c.type = 'direct' THEN
      (SELECT p.full_name 
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
$$;

-- Create function to create or get direct conversation between two users
CREATE OR REPLACE FUNCTION public.create_or_get_direct_conversation(user1_uuid UUID, user2_uuid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  conversation_uuid UUID;
BEGIN
  -- Check if conversation already exists
  SELECT c.id INTO conversation_uuid
  FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id
  WHERE c.type = 'direct'
  AND cp1.user_id = user1_uuid AND cp1.left_at IS NULL
  AND cp2.user_id = user2_uuid AND cp2.left_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp3 
    WHERE cp3.conversation_id = c.id 
    AND cp3.user_id NOT IN (user1_uuid, user2_uuid)
    AND cp3.left_at IS NULL
  );
  
  -- If conversation doesn't exist, create it
  IF conversation_uuid IS NULL THEN
    INSERT INTO public.conversations (type) 
    VALUES ('direct') 
    RETURNING id INTO conversation_uuid;
    
    -- Add both participants
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (conversation_uuid, user1_uuid), (conversation_uuid, user2_uuid);
  END IF;
  
  RETURN conversation_uuid;
END;
$$;

-- Create function to update conversation last message timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations 
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update conversation timestamp when message is sent
CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.conversation_id IS NOT NULL)
  EXECUTE FUNCTION public.update_conversation_last_message();
