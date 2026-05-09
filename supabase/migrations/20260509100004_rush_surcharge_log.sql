-- 20260509100004_rush_surcharge_log.sql
CREATE TABLE rush_surcharge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID REFERENCES campaigns(id),
  platform_count INT NOT NULL,
  surcharge_cents INT NOT NULL DEFAULT 2500,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rush_surcharge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own surcharges"
  ON rush_surcharge_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own surcharges"
  ON rush_surcharge_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_rush_surcharge_log_user ON rush_surcharge_log(user_id);
CREATE INDEX idx_rush_surcharge_log_campaign ON rush_surcharge_log(campaign_id);
