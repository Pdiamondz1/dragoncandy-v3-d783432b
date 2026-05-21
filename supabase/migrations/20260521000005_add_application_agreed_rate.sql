-- S3-3: Persist negotiated rate separately from initial ask
ALTER TABLE campaign_applications
  ADD COLUMN IF NOT EXISTS agreed_rate numeric DEFAULT NULL;
