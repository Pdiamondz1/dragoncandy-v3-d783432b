-- S2-3: Allow re-apply after rejection via partial unique index
-- Drop the absolute unique constraint and replace with a partial one
DO $$
BEGIN
  -- Drop existing unique constraint/index on (campaign_id, creator_id) if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'campaign_applications'::regclass
      AND conname = 'campaign_applications_campaign_id_creator_id_key'
  ) THEN
    ALTER TABLE campaign_applications
      DROP CONSTRAINT campaign_applications_campaign_id_creator_id_key;
  END IF;
END $$;

-- Drop any existing index with that name
DROP INDEX IF EXISTS idx_campaign_applications_unique_active;

-- Partial unique index: only block duplicates for non-rejected applications
CREATE UNIQUE INDEX idx_campaign_applications_unique_active
  ON campaign_applications (campaign_id, creator_id)
  WHERE status <> 'rejected';
