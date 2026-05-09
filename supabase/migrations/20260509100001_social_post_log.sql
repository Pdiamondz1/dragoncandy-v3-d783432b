CREATE TABLE social_post_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID REFERENCES campaigns(id),
  outstand_post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('amplification', 'cross_post', 'standalone', 'campaign')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_post_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own post log"
  ON social_post_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own post log"
  ON social_post_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_social_post_log_user ON social_post_log(user_id);
CREATE INDEX idx_social_post_log_campaign ON social_post_log(campaign_id);
