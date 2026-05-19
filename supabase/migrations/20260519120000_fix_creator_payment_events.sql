-- Fix existing payment_released events: actor_id should be the creator, not the business
UPDATE payment_events pe
SET actor_id = cc.creator_id,
    actor_role = 'creator'
FROM campaign_collaborations cc
WHERE pe.entity_id = cc.id
  AND pe.entity_type = 'collaboration'
  AND pe.event_type = 'payment_released'
  AND (pe.actor_id IS NULL OR pe.actor_id != cc.creator_id);

-- Fix existing payout_pending_wallet events: set actor_id to creator
UPDATE payment_events pe
SET actor_id = cc.creator_id,
    actor_role = 'creator'
FROM campaign_collaborations cc
WHERE pe.entity_id = cc.id
  AND pe.entity_type = 'collaboration'
  AND pe.event_type = 'payout_pending_wallet'
  AND (pe.actor_id IS NULL OR pe.actor_id != cc.creator_id);

-- Add UNIQUE constraint for sponsorship reviews (matches existing collaboration review constraint)
ALTER TABLE project_reviews
ADD CONSTRAINT project_reviews_sponsorship_reviewer_reviewee_unique
UNIQUE (sponsorship_id, reviewer_id, reviewee_id);
