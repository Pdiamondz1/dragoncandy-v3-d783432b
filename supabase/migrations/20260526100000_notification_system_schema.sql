-- 1. Add new columns to push_notifications
ALTER TABLE push_notifications
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'default';

-- 2. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_push_notif_user_unread
  ON push_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_notif_user_category
  ON push_notifications(user_id, category, created_at DESC);

-- 3. Add preferences_matrix JSONB column to notification_preferences
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS preferences_matrix JSONB DEFAULT '{
    "campaigns":    { "in_app": true,  "email": true,  "sms": false },
    "messages":     { "in_app": true,  "email": false, "sms": false },
    "transactions": { "in_app": true,  "email": true,  "sms": false },
    "content":      { "in_app": true,  "email": false, "sms": false },
    "account":      { "in_app": true,  "email": true,  "sms": false }
  }'::jsonb;

-- 4. Enable Realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE push_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_collaborations;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_sponsorships;

-- 5. Ensure push_notifications RLS policies exist for new access patterns
-- SELECT policy already exists from original migration (user_id = auth.uid())
-- UPDATE policy already exists from original migration (user_id = auth.uid())
-- No INSERT policy for regular users — edge function uses service role
