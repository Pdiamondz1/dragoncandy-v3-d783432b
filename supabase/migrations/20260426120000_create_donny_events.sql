-- supabase/migrations/20260426120000_create_donny_events.sql

CREATE TABLE IF NOT EXISTS donny_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  campaign_id uuid REFERENCES campaigns(id),
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE donny_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own events"
  ON donny_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON donny_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_donny_events_user ON donny_events(user_id);
CREATE INDEX idx_donny_events_campaign ON donny_events(campaign_id);
