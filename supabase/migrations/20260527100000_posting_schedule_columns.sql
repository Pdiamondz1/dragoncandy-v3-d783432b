-- Auto Cross-Scheduling: add posting preferences and schedule tracking

-- 1. Campaign posting preferences and status
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS posting_preferences JSONB,
  ADD COLUMN IF NOT EXISTS posting_schedule_status TEXT DEFAULT 'not_configured'
    CHECK (posting_schedule_status IN (
      'not_configured', 'configured', 'pending_review',
      'scheduled', 'in_progress', 'completed'
    ));

-- 2. Link scheduled posts to specific deliverables
ALTER TABLE donny_scheduled_posts
  ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES campaign_deliverables(id);

-- 3. Enable date-specific stage 4 hooks (one per deliverable per user)
ALTER TABLE campaign_social_hooks
  ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES campaign_deliverables(id);

ALTER TABLE campaign_social_hooks
  DROP CONSTRAINT IF EXISTS campaign_social_hooks_campaign_id_stage_user_id_key;

ALTER TABLE campaign_social_hooks
  ADD CONSTRAINT campaign_social_hooks_campaign_stage_user_deliverable_key
    UNIQUE (campaign_id, stage, user_id, deliverable_id);

-- 4. Index for querying scheduled posts by deliverable
CREATE INDEX IF NOT EXISTS idx_donny_scheduled_posts_deliverable
  ON donny_scheduled_posts(deliverable_id) WHERE deliverable_id IS NOT NULL;
