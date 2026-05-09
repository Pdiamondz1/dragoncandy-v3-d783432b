-- Auto-Pilot enable flag
ALTER TABLE profiles
  ADD COLUMN auto_pilot_enabled BOOLEAN DEFAULT false;

-- System conversation ID for Donny digests
ALTER TABLE profiles
  ADD COLUMN donny_system_conversation_id UUID REFERENCES donny_conversations(id);

-- Cache for Donny-generated insights (avoid re-calling AI on each tab switch)
-- user_id is denormalized here so insights can be queried directly without joining donny_conversations
ALTER TABLE donny_messages
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN insight_type TEXT CHECK (
    insight_type IN ('daily_digest', 'weekly_plan', 'performance_insight')
  ),
  ADD COLUMN expires_at TIMESTAMPTZ;
