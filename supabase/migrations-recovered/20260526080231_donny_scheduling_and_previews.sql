-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260526080231 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

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

CREATE INDEX IF NOT EXISTS idx_donny_scheduled_posts_user_time
  ON donny_scheduled_posts(user_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_donny_scheduled_posts_campaign
  ON donny_scheduled_posts(campaign_id);

CREATE INDEX IF NOT EXISTS idx_donny_scheduled_posts_status
  ON donny_scheduled_posts(status);

ALTER TABLE donny_scheduled_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donny_scheduled_posts' AND policyname = 'Users can view their own scheduled posts') THEN
    CREATE POLICY "Users can view their own scheduled posts"
      ON donny_scheduled_posts FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donny_scheduled_posts' AND policyname = 'Users can create their own scheduled posts') THEN
    CREATE POLICY "Users can create their own scheduled posts"
      ON donny_scheduled_posts FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donny_scheduled_posts' AND policyname = 'Users can update their own scheduled posts') THEN
    CREATE POLICY "Users can update their own scheduled posts"
      ON donny_scheduled_posts FOR UPDATE USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donny_scheduled_posts' AND policyname = 'Users can delete their own scheduled posts') THEN
    CREATE POLICY "Users can delete their own scheduled posts"
      ON donny_scheduled_posts FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_donny_campaign_previews_campaign
  ON donny_campaign_previews(campaign_id);

CREATE INDEX IF NOT EXISTS idx_donny_campaign_previews_user
  ON donny_campaign_previews(user_id);

ALTER TABLE donny_campaign_previews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donny_campaign_previews' AND policyname = 'Users can view their own campaign previews') THEN
    CREATE POLICY "Users can view their own campaign previews"
      ON donny_campaign_previews FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;
