-- Backfill push_notifications for historical events that occurred before the
-- notification system was deployed (May 26, 2026 ~07:30 ET / 11:30 UTC).
-- Each block is idempotent via WHERE NOT EXISTS on (user_id, type, created_at).

-- ============================================================================
-- Block 1: application_received  (→ campaign owner when creator applied)
-- ============================================================================
INSERT INTO push_notifications (user_id, type, category, title, body, action_url, actor_id, actor_name, icon, data, sent_at, created_at)
SELECT
  c.user_id,
  'application_received',
  'campaigns',
  'New Application',
  COALESCE(cp.creator_name, p.full_name, 'A creator') || ' applied to your "' || c.title || '" campaign',
  '/dashboard/business/campaigns/' || c.id,
  ca.creator_id,
  COALESCE(cp.creator_name, p.full_name, 'A creator'),
  'application',
  jsonb_build_object('campaign_id', c.id, 'application_id', ca.id),
  ca.created_at,
  ca.created_at
FROM campaign_applications ca
JOIN campaigns c ON ca.campaign_id = c.id
LEFT JOIN profiles p ON ca.creator_id = p.id
LEFT JOIN creator_profiles cp ON ca.creator_id = cp.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM push_notifications pn
  WHERE pn.user_id = c.user_id
    AND pn.type = 'application_received'
    AND pn.created_at = ca.created_at
);

-- ============================================================================
-- Block 2: application_accepted  (→ creator when their application was accepted)
-- ============================================================================
INSERT INTO push_notifications (user_id, type, category, title, body, action_url, actor_id, actor_name, icon, data, sent_at, created_at)
SELECT
  ca.creator_id,
  'application_accepted',
  'campaigns',
  'Application Accepted!',
  'Your application for "' || c.title || '" was accepted',
  '/dashboard/creator/my-campaigns?tab=applied',
  c.user_id,
  COALESCE(p.full_name, 'The business'),
  'application',
  jsonb_build_object('campaign_id', c.id, 'application_id', ca.id),
  COALESCE(ca.updated_at, ca.created_at),
  COALESCE(ca.updated_at, ca.created_at)
FROM campaign_applications ca
JOIN campaigns c ON ca.campaign_id = c.id
LEFT JOIN profiles p ON c.user_id = p.id
WHERE ca.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM push_notifications pn
    WHERE pn.user_id = ca.creator_id
      AND pn.type = 'application_accepted'
      AND pn.created_at = COALESCE(ca.updated_at, ca.created_at)
  );

-- ============================================================================
-- Block 3: campaign_invitation  (→ creator when invited to a campaign)
-- ============================================================================
INSERT INTO push_notifications (user_id, type, category, title, body, action_url, actor_id, actor_name, icon, data, sent_at, created_at)
SELECT
  ci.creator_id,
  'campaign_invitation',
  'campaigns',
  'Campaign Invitation',
  'You''ve been invited to "' || c.title || '"',
  '/dashboard/creator/campaigns/' || c.id || '?invited=true',
  ci.invited_by,
  COALESCE(p.full_name, 'A business'),
  'invitation',
  jsonb_build_object('campaign_id', c.id),
  ci.created_at,
  ci.created_at
FROM campaign_invitations ci
JOIN campaigns c ON ci.campaign_id = c.id
LEFT JOIN profiles p ON ci.invited_by = p.id
WHERE NOT EXISTS (
  SELECT 1 FROM push_notifications pn
  WHERE pn.user_id = ci.creator_id
    AND pn.type = 'campaign_invitation'
    AND pn.created_at = ci.created_at
);

-- ============================================================================
-- Block 4: counter_offer_received  (→ other party when counter offer sent)
-- ============================================================================
INSERT INTO push_notifications (user_id, type, category, title, body, action_url, actor_id, actor_name, icon, data, sent_at, created_at)
SELECT
  CASE co.sender_role
    WHEN 'business' THEN ca.creator_id
    ELSE c.user_id
  END,
  'counter_offer_received',
  'campaigns',
  'Counter Offer Received',
  'New counter offer of $' || co.proposed_rate || ' on "' || c.title || '"',
  CASE co.sender_role
    WHEN 'business' THEN '/dashboard/creator/my-campaigns/' || c.id
    ELSE '/dashboard/business/campaigns/' || c.id
  END,
  co.sender_id,
  COALESCE(p.full_name, 'Someone'),
  'counter_offer',
  jsonb_build_object('campaign_id', c.id, 'application_id', ca.id, 'sender_role', co.sender_role),
  co.created_at,
  co.created_at
FROM application_counter_offers co
JOIN campaign_applications ca ON co.application_id = ca.id
JOIN campaigns c ON ca.campaign_id = c.id
LEFT JOIN profiles p ON co.sender_id = p.id
WHERE NOT EXISTS (
  SELECT 1 FROM push_notifications pn
  WHERE pn.user_id = CASE co.sender_role
                       WHEN 'business' THEN ca.creator_id
                       ELSE c.user_id
                     END
    AND pn.type = 'counter_offer_received'
    AND pn.created_at = co.created_at
);

-- ============================================================================
-- Block 5: counter_offer_responded  (→ sender when their offer was accepted/declined)
-- ============================================================================
INSERT INTO push_notifications (user_id, type, category, title, body, action_url, actor_id, actor_name, icon, data, sent_at, created_at)
SELECT
  co.sender_id,
  'counter_offer_responded',
  'campaigns',
  CASE co.status
    WHEN 'accepted' THEN 'Counter Offer Accepted!'
    ELSE 'Counter Offer Declined'
  END,
  'Your counter offer on "' || c.title || '" was ' || co.status,
  CASE co.sender_role
    WHEN 'creator' THEN '/dashboard/creator/my-campaigns/' || c.id
    ELSE '/dashboard/business/campaigns/' || c.id
  END,
  CASE co.sender_role
    WHEN 'business' THEN ca.creator_id
    ELSE c.user_id
  END,
  COALESCE(responder.full_name, 'The other party'),
  'counter_offer',
  jsonb_build_object(
    'campaign_id', c.id,
    'application_id', ca.id,
    'sender_role', CASE co.sender_role WHEN 'business' THEN 'creator' ELSE 'business' END
  ),
  COALESCE(co.updated_at, co.created_at),
  COALESCE(co.updated_at, co.created_at)
FROM application_counter_offers co
JOIN campaign_applications ca ON co.application_id = ca.id
JOIN campaigns c ON ca.campaign_id = c.id
LEFT JOIN profiles responder ON (
  CASE co.sender_role
    WHEN 'business' THEN ca.creator_id
    ELSE c.user_id
  END
) = responder.id
WHERE co.status IN ('accepted', 'declined')
  AND NOT EXISTS (
    SELECT 1 FROM push_notifications pn
    WHERE pn.user_id = co.sender_id
      AND pn.type = 'counter_offer_responded'
      AND pn.created_at = COALESCE(co.updated_at, co.created_at)
  );

-- ============================================================================
-- Block 6: message_received  (→ conversation participants for real messages)
-- ============================================================================
INSERT INTO push_notifications (user_id, type, category, title, body, action_url, actor_id, actor_name, icon, data, sent_at, created_at)
SELECT
  cp.user_id,
  'message_received',
  'messages',
  'New Message',
  COALESCE(p.full_name, 'Someone') || ': ' || LEFT(m.content, 100),
  '/dashboard/messages/' || m.conversation_id,
  m.sender_id,
  COALESCE(p.full_name, 'Someone'),
  'message',
  jsonb_build_object('conversation_id', m.conversation_id),
  m.created_at,
  m.created_at
FROM messages m
JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
  AND cp.user_id != m.sender_id
LEFT JOIN profiles p ON m.sender_id = p.id
WHERE m.conversation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM push_notifications pn
    WHERE pn.user_id = cp.user_id
      AND pn.type = 'message_received'
      AND pn.created_at = m.created_at
  );
