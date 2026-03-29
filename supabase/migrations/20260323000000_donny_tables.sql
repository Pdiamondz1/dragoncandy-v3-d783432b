-- Donny Conversations
CREATE TABLE donny_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  context_snapshot jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_donny_conversations_user_id ON donny_conversations(user_id);

ALTER TABLE donny_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conversations"
  ON donny_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON donny_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON donny_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Donny Messages
CREATE TABLE donny_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES donny_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text,
  tool_calls jsonb,
  tool_result jsonb,
  rich_card jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_donny_messages_conversation_id ON donny_messages(conversation_id);
CREATE INDEX idx_donny_messages_created_at ON donny_messages(created_at);

ALTER TABLE donny_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own messages"
  ON donny_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM donny_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own messages"
  ON donny_messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM donny_conversations WHERE user_id = auth.uid()
    )
  );

-- Donny Tool Executions
CREATE TABLE donny_tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES donny_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_donny_tool_executions_user_id ON donny_tool_executions(user_id);
CREATE INDEX idx_donny_tool_executions_message_id ON donny_tool_executions(message_id);

ALTER TABLE donny_tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tool executions"
  ON donny_tool_executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert tool executions"
  ON donny_tool_executions FOR INSERT
  WITH CHECK (true);

-- Creator Automation Preferences
CREATE TABLE creator_automation_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  automation_level text NOT NULL DEFAULT 'notify' CHECK (automation_level IN ('notify', 'suggest', 'auto_pilot')),
  auto_apply_criteria jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE creator_automation_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON creator_automation_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON creator_automation_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON creator_automation_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable Realtime on donny_messages for streaming
ALTER PUBLICATION supabase_realtime ADD TABLE donny_messages;
