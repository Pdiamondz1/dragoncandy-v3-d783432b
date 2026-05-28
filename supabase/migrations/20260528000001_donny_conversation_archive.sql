-- Archive Donny conversations on logout to prevent stale chat history
-- and clickable campaign-invite actions from persisting across sessions.
-- Old conversations are preserved for analytics / data-flywheel training.

ALTER TABLE donny_conversations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_donny_conversations_active
  ON donny_conversations (user_id, last_message_at DESC)
  WHERE archived_at IS NULL;
