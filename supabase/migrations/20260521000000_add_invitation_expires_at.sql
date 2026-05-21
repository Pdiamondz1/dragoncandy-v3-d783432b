-- S2-2: Add expires_at TTL to campaign_invitations
ALTER TABLE campaign_invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '7 days');

-- Backfill existing rows
UPDATE campaign_invitations
  SET expires_at = created_at + interval '7 days'
  WHERE expires_at IS NULL;

-- Index for filtering expired invitations
CREATE INDEX IF NOT EXISTS idx_campaign_invitations_expires_at
  ON campaign_invitations (expires_at)
  WHERE status = 'pending';
