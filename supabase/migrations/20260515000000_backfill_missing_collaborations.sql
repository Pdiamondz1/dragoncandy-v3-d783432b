-- Backfill missing collaboration records for accepted applications
-- Root cause: useManageApplication previously only created collaborations when escrow was held
INSERT INTO campaign_collaborations (campaign_id, creator_id, application_id, status)
SELECT ca.campaign_id, ca.creator_id, ca.id, 'active'
FROM campaign_applications ca
WHERE ca.status = 'accepted'
AND NOT EXISTS (
  SELECT 1 FROM campaign_collaborations cc
  WHERE cc.campaign_id = ca.campaign_id AND cc.creator_id = ca.creator_id
);
