-- Add plan grouping columns to donny_scheduled_posts
-- plan_group_id: freeform UUID linking posts in the same posting plan
-- plan_order: sequence within the plan (sort by scheduled_at if NULL)

ALTER TABLE donny_scheduled_posts
  ADD COLUMN IF NOT EXISTS plan_group_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_order int DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_plan_group
  ON donny_scheduled_posts (plan_group_id)
  WHERE plan_group_id IS NOT NULL;
