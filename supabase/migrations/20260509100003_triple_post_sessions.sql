-- 20260509100003_triple_post_sessions.sql
CREATE TABLE triple_post_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES auth.users(id),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES auth.users(id),
  restaurant_status TEXT NOT NULL DEFAULT 'pending' CHECK (restaurant_status IN ('pending','posted','skipped')),
  creator_status TEXT NOT NULL DEFAULT 'pending' CHECK (creator_status IN ('pending','posted','skipped')),
  brand_status TEXT NOT NULL DEFAULT 'n/a' CHECK (brand_status IN ('pending','posted','skipped','n/a')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, creator_id)
);

ALTER TABLE triple_post_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read their sessions"
  ON triple_post_sessions FOR SELECT
  USING (
    auth.uid() = restaurant_id OR
    auth.uid() = creator_id OR
    auth.uid() = brand_id
  );

CREATE POLICY "Participants can update their status"
  ON triple_post_sessions FOR UPDATE
  USING (
    auth.uid() = restaurant_id OR
    auth.uid() = creator_id OR
    auth.uid() = brand_id
  );

CREATE INDEX idx_triple_post_sessions_campaign ON triple_post_sessions(campaign_id);
