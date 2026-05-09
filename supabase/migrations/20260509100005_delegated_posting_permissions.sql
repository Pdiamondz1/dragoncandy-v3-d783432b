-- 20260509100005_delegated_posting_permissions.sql
CREATE TABLE delegated_posting_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_id UUID NOT NULL REFERENCES auth.users(id),
  grantee_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platforms TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grantor_id, grantee_id, campaign_id)
);

ALTER TABLE delegated_posting_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Grantor and grantee can read"
  ON delegated_posting_permissions FOR SELECT
  USING (auth.uid() = grantor_id OR auth.uid() = grantee_id);

CREATE POLICY "Only grantor can update"
  ON delegated_posting_permissions FOR UPDATE
  USING (auth.uid() = grantor_id);

CREATE POLICY "Campaign participants can insert"
  ON delegated_posting_permissions FOR INSERT
  WITH CHECK (
    auth.uid() = delegated_posting_permissions.grantor_id
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = delegated_posting_permissions.campaign_id
      AND (
        c.user_id = delegated_posting_permissions.grantor_id
        OR EXISTS (SELECT 1 FROM campaign_applications ca WHERE ca.campaign_id = c.id AND ca.creator_id = delegated_posting_permissions.grantor_id)
        OR EXISTS (SELECT 1 FROM campaign_sponsorships cs JOIN business_profiles bp ON bp.id = cs.brand_id WHERE cs.campaign_id = c.id AND bp.user_id = delegated_posting_permissions.grantor_id)
      )
    )
  );

CREATE INDEX idx_delegated_permissions_grantor ON delegated_posting_permissions(grantor_id);
CREATE INDEX idx_delegated_permissions_grantee ON delegated_posting_permissions(grantee_id);
CREATE INDEX idx_delegated_permissions_campaign ON delegated_posting_permissions(campaign_id);
