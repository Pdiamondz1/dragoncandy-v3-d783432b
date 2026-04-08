-- P0-2: Add 'rejected' to campaign_collaborations.content_status
-- The existing CHECK was defined inline on ADD COLUMN (migration 20260115150705).
-- We must drop + recreate it.
ALTER TABLE campaign_collaborations
  DROP CONSTRAINT IF EXISTS campaign_collaborations_content_status_check;

ALTER TABLE campaign_collaborations
  ADD CONSTRAINT campaign_collaborations_content_status_check
  CHECK (content_status IN ('pending', 'in_progress', 'submitted', 'revision_requested', 'approved', 'rejected'));
