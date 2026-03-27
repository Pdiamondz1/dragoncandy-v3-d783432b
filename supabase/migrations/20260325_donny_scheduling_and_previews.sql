-- Migration: Donny Scheduling & Campaign Previews
-- Date: 2026-03-25
-- Additive only — does NOT modify any existing tables

-- =========================================================================
-- Table: donny_scheduled_posts
-- =========================================================================
CREATE TABLE IF NOT EXISTS donny_scheduled_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id   uuid,
  platform      text NOT NULL CHECK (platform IN ('instagram','tiktok','youtube','twitter','facebook')),
  content_type  text NOT NULL CHECK (content_type IN ('photo','reel','story','video','carousel','tweet','thread')),
  caption       text,
  media_urls    text[],
  hashtags      text[],
  scheduled_at  timestamptz NOT NULL,
  published_at  timestamptz,
  status        text DEFAULT 'scheduled' CHECK (status IN ('draft','scheduled','publishing','published','failed','cancelled')),
  ai_suggested_time boolean DEFAULT false,
  ai_reasoning  text,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

COMMENT ON TABLE donny_scheduled_posts IS 'Donny content scheduling calendar — stores scheduled social media posts';

-- Indexes
CREATE INDEX idx_donny_scheduled_posts_user_time
  ON donny_scheduled_posts(user_id, scheduled_at);

CREATE INDEX idx_donny_scheduled_posts_campaign
  ON donny_scheduled_posts(campaign_id);

CREATE INDEX idx_donny_scheduled_posts_status
  ON donny_scheduled_posts(status);

-- RLS
ALTER TABLE donny_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scheduled posts"
  ON donny_scheduled_posts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own scheduled posts"
  ON donny_scheduled_posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own scheduled posts"
  ON donny_scheduled_posts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own scheduled posts"
  ON donny_scheduled_posts FOR DELETE
  USING (user_id = auth.uid());


-- =========================================================================
-- Table: donny_campaign_previews
-- =========================================================================
CREATE TABLE IF NOT EXISTS donny_campaign_previews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preview_type     text NOT NULL CHECK (preview_type IN ('mood_board','example_clip','content_template','storyboard','thumbnail')),
  title            text NOT NULL,
  description      text,
  preview_data     jsonb NOT NULL,
  media_url        text,
  thumbnail_url    text,
  ai_prompt_used   text,
  generation_model text DEFAULT 'claude-sonnet-4-20250514',
  is_approved      boolean DEFAULT false,
  sort_order       integer DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

COMMENT ON TABLE donny_campaign_previews IS 'Donny AI-generated campaign visual previews — mood boards, storyboards, templates, etc.';

-- Indexes
CREATE INDEX idx_donny_campaign_previews_campaign
  ON donny_campaign_previews(campaign_id);

CREATE INDEX idx_donny_campaign_previews_user
  ON donny_campaign_previews(user_id);

-- RLS
ALTER TABLE donny_campaign_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own campaign previews"
  ON donny_campaign_previews FOR SELECT
  USING (user_id = auth.uid());

-- INSERT and UPDATE restricted to service_role only (no user-facing policies)
-- Edge Functions use service_role key to write previews
