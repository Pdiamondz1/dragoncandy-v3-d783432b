-- ============================================================================
-- Migration: Clean stale test/dev data created BEFORE April 3, 2026
-- Purpose:   Remove leftover campaign data and user accounts from pre-launch
--            testing so the production environment starts clean.
-- Safety:    Wrapped in a transaction. Most child tables use ON DELETE CASCADE
--            from their parent, but we delete explicitly leaf-first for clarity.
-- NOTE:      auth.users rows require service-role / supabase_admin privileges.
--            If running as a normal migration the auth.users DELETE will be
--            skipped — run it separately in the Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ── 0. Cutoff constant ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'Cleaning stale data created before 2026-04-03'; END $$;

-- ── 1. Delete campaigns and all CASCADE children ────────────────────────────
-- campaign_applications, campaign_collaborations, campaign_sponsorships,
-- campaign_media, campaign_deliverables, campaign_invitations,
-- campaign_matches, file_uploads (→ file_versions, file_permissions,
-- file_comments, file_tag_assignments) all CASCADE from campaigns.
DELETE FROM campaigns WHERE created_at < '2026-04-03T00:00:00+00:00';

-- ── 2. Delete remaining leaf tables that reference profiles / auth.users ────
-- These may have rows not tied to a campaign (e.g. direct messages).

-- Reviews & responses (collaboration may already be gone via CASCADE)
DELETE FROM review_responses
WHERE review_id IN (
  SELECT id FROM project_reviews WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM project_reviews WHERE created_at < '2026-04-03T00:00:00+00:00';

-- Application counter-offers (application may already be gone via CASCADE)
DELETE FROM application_counter_offers
WHERE application_id IN (
  SELECT id FROM campaign_applications WHERE created_at < '2026-04-03T00:00:00+00:00'
);

-- Messages & conversations
DELETE FROM message_reactions
WHERE message_id IN (
  SELECT id FROM messages WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM messages WHERE created_at < '2026-04-03T00:00:00+00:00';

-- Remove conversation participants for stale users, then orphaned conversations
DELETE FROM conversation_participants
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM conversations
WHERE id NOT IN (SELECT DISTINCT conversation_id FROM conversation_participants);

-- Notifications & presence
DELETE FROM push_notifications
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM notification_preferences
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM user_presence
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);

-- Profile views & brand shortlists
DELETE FROM profile_views
WHERE created_at < '2026-04-03T00:00:00+00:00';
DELETE FROM brand_shortlists
WHERE created_at < '2026-04-03T00:00:00+00:00';

-- Promotions chain
DELETE FROM discount_codes
WHERE promotion_id IN (
  SELECT id FROM promotions WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM promotion_submissions
WHERE promotion_id IN (
  SELECT id FROM promotions WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM promotions WHERE created_at < '2026-04-03T00:00:00+00:00';

-- Onboarding & beta feedback
DELETE FROM user_onboarding_progress
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM beta_feedback
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);

-- Analytics events
DELETE FROM analytics_events WHERE created_at < '2026-04-03T00:00:00+00:00';

-- File tags created by stale users (tag_assignments already gone via file CASCADE)
DELETE FROM file_tags
WHERE created_by IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);

-- Email verification tokens
DELETE FROM email_verification_tokens
WHERE created_at < '2026-04-03T00:00:00+00:00';

-- Donny AI tables
DELETE FROM donny_conversations
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM donny_messages
WHERE conversation_id NOT IN (SELECT id FROM donny_conversations);

-- ── 3. Delete user profile tables ──────────────────────────────────────────
DELETE FROM business_profiles
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM creator_profiles
WHERE user_id IN (
  SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
);
DELETE FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00';

-- ── 4. Delete auth.users (requires service-role privileges) ────────────────
-- Uncomment the line below when running in the Supabase SQL Editor as admin.
-- If this migration runs via CLI without admin rights, this will be skipped.
-- DELETE FROM auth.users WHERE created_at < '2026-04-03T00:00:00+00:00';

COMMIT;

-- ============================================================================
-- POST-MIGRATION STEP (manual):
-- Run this in the Supabase Dashboard → SQL Editor with admin/service-role:
--
--   DELETE FROM auth.users WHERE created_at < '2026-04-03T00:00:00+00:00';
--
-- This removes the auth entries whose profile data was already cleaned above.
-- ============================================================================
