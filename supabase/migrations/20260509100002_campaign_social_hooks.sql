-- 20260509100002_campaign_social_hooks.sql
CREATE TABLE campaign_social_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  stage INT NOT NULL CHECK (stage BETWEEN 1 AND 5),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  party_role TEXT NOT NULL CHECK (party_role IN ('restaurant','creator','brand')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','prompted','posted','skipped','expired')),
  content_template TEXT,
  prompted_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, stage, user_id)
);

ALTER TABLE campaign_social_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own hooks"
  ON campaign_social_hooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own hooks"
  ON campaign_social_hooks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_campaign_social_hooks_user ON campaign_social_hooks(user_id);
CREATE INDEX idx_campaign_social_hooks_campaign ON campaign_social_hooks(campaign_id, stage);
