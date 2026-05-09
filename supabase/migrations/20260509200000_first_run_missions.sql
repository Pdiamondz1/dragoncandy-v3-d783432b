-- Add first_run_missions JSONB column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_run_missions JSONB DEFAULT NULL;

-- Backfill all existing users so they never see the first-run experience
UPDATE profiles
SET first_run_missions = '{"completed_at": "migrated"}'::jsonb
WHERE created_at < NOW();

-- Index for querying users in first-run state
CREATE INDEX IF NOT EXISTS idx_profiles_first_run_active
ON profiles ((first_run_missions IS NULL OR first_run_missions->>'completed_at' IS NULL))
WHERE first_run_missions IS NULL OR first_run_missions->>'completed_at' IS NULL;
