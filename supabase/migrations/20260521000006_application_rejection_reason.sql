-- S3-4: Add rejection reason for auto-declined applications
ALTER TABLE campaign_applications
  ADD COLUMN IF NOT EXISTS rejection_reason text DEFAULT NULL;
