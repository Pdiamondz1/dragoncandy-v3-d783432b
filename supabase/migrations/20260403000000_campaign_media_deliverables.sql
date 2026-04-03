-- supabase/migrations/20260403000000_campaign_media_deliverables.sql

-- ============================================
-- campaign_media table
-- ============================================
CREATE TABLE campaign_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('reference_image', 'reference_video', 'ai_preview', 'raw_footage')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  duration_seconds NUMERIC,
  thumbnail_url TEXT,
  sort_order INTEGER DEFAULT 0,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_media_campaign ON campaign_media(campaign_id);
CREATE INDEX idx_campaign_media_type ON campaign_media(campaign_id, media_type);

ALTER TABLE campaign_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owners can read their campaign media"
  ON campaign_media FOR SELECT
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_media.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Business owners can insert campaign media"
  ON campaign_media FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Business owners can update their campaign media"
  ON campaign_media FOR UPDATE
  USING (uploaded_by = auth.uid());

CREATE POLICY "Business owners can delete their campaign media"
  ON campaign_media FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_media.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can view media for published campaigns"
  ON campaign_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_media.campaign_id
      AND c.status IN ('published', 'active')
    )
  );

-- ============================================
-- campaign_deliverables table
-- ============================================
CREATE TABLE campaign_deliverables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short')),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform')),
  description TEXT,
  aspect_ratio TEXT DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '16:9', '1:1', '4:5')),
  max_duration_seconds INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted', 'revision_requested', 'approved')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_deliverables_campaign ON campaign_deliverables(campaign_id);

ALTER TABLE campaign_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owners manage deliverables"
  ON campaign_deliverables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_deliverables.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators view deliverables for visible campaigns"
  ON campaign_deliverables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_deliverables.campaign_id
      AND c.status IN ('published', 'active')
    )
  );

-- ============================================
-- New columns on campaigns
-- ============================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_source TEXT
  DEFAULT 'creator_shoots'
  CHECK (content_source IN ('creator_shoots', 'business_footage', 'hybrid'));

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_preview_status TEXT
  DEFAULT 'none'
  CHECK (ai_preview_status IN ('none', 'generating', 'ready', 'approved', 'rejected'));

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_preview_prompt TEXT;
