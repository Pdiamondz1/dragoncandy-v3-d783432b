-- ============================================================================
-- Migration: Clean stale test/dev data created BEFORE April 3, 2026
-- Purpose:   Remove leftover campaign data and user accounts from pre-launch
--            testing so the production environment starts clean.
-- Safety:    The entire cleanup is guarded so it only runs when legacy
--            (pre-2026-04-03) data actually exists. plpgsql defers planning of
--            the inner statements, so on a fresh/clean database (e.g. staging)
--            this is a safe no-op even if a column added out-of-band on prod is
--            absent from a clean migration replay.
-- NOTE:      auth.users rows require service-role / supabase_admin privileges.
--            Run that DELETE separately in the Supabase SQL Editor (see bottom).
-- ============================================================================

DO $clean_stale_data$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00') THEN
    RAISE NOTICE 'No pre-2026-04-03 data present; skipping stale-data cleanup.';
    RETURN;
  END IF;

  RAISE NOTICE 'Cleaning stale data created before 2026-04-03';

  -- ── 1. Delete campaigns and all CASCADE children ──────────────────────────
  DELETE FROM campaigns WHERE created_at < '2026-04-03T00:00:00+00:00';

  -- ── 2. Leaf tables referencing profiles / auth.users ──────────────────────
  DELETE FROM review_responses
  WHERE review_id IN (
    SELECT id FROM project_reviews WHERE created_at < '2026-04-03T00:00:00+00:00'
  );
  DELETE FROM project_reviews WHERE created_at < '2026-04-03T00:00:00+00:00';

  DELETE FROM application_counter_offers
  WHERE application_id IN (
    SELECT id FROM campaign_applications WHERE created_at < '2026-04-03T00:00:00+00:00'
  );

  DELETE FROM message_reactions
  WHERE message_id IN (
    SELECT id FROM messages WHERE created_at < '2026-04-03T00:00:00+00:00'
  );
  DELETE FROM messages WHERE created_at < '2026-04-03T00:00:00+00:00';

  DELETE FROM conversation_participants
  WHERE user_id IN (
    SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
  );
  DELETE FROM conversations
  WHERE id NOT IN (SELECT DISTINCT conversation_id FROM conversation_participants);

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

  -- File tags created by stale users
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

  -- ── 3. Delete user profile tables ─────────────────────────────────────────
  DELETE FROM business_profiles
  WHERE user_id IN (
    SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
  );
  DELETE FROM creator_profiles
  WHERE user_id IN (
    SELECT id FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00'
  );
  DELETE FROM profiles WHERE created_at < '2026-04-03T00:00:00+00:00';
END
$clean_stale_data$;

-- ============================================================================
-- POST-MIGRATION STEP (manual, prod only):
-- Run this in the Supabase Dashboard → SQL Editor with admin/service-role:
--
--   DELETE FROM auth.users WHERE created_at < '2026-04-03T00:00:00+00:00';
--
-- This removes the auth entries whose profile data was already cleaned above.
-- ============================================================================
