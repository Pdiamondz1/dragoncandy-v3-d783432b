-- Brand shortlists: allows brands to save creators for later invite
CREATE TABLE IF NOT EXISTS brand_shortlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, creator_id)
);

ALTER TABLE brand_shortlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_shortlists_select" ON brand_shortlists
  FOR SELECT USING (brand_id = auth.uid());

CREATE POLICY "brand_shortlists_insert" ON brand_shortlists
  FOR INSERT WITH CHECK (brand_id = auth.uid());

CREATE POLICY "brand_shortlists_delete" ON brand_shortlists
  FOR DELETE USING (brand_id = auth.uid());
