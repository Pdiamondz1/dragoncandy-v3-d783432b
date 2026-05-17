-- Reset all transactional data for production launch.
-- Preserves: profiles, creator_profiles, business_profiles, organizations,
-- org_units, org_members, business_outstand_accounts, toast_connections,
-- notification_preferences, creator_automation_preferences, feature_flags,
-- onboarding_steps, user_onboarding_progress, email_verification_tokens,
-- donny_knowledge, donny_oauth_clients/codes/tokens, help_articles, file_tags.
--
-- NOTE: profiles.donny_system_conversation_id FK caused CASCADE from
-- donny_conversations to wipe profiles. Profiles were reconstructed from
-- auth.users + org_members data in a follow-up query.
--
-- Storage bucket cleanup (campaign-assets, campaign-deliverables, campaign-files,
-- campaign-previews, message-attachments, promotion-videos) done manually via
-- Supabase dashboard — direct DELETE FROM storage.objects is blocked by the
-- protect_delete() trigger.

-- Campaign domain
TRUNCATE TABLE campaigns CASCADE;
TRUNCATE TABLE campaign_templates CASCADE;
TRUNCATE TABLE campaign_brief_generations CASCADE;
TRUNCATE TABLE promotions CASCADE;

-- DragonShare domain
TRUNCATE TABLE dragonshare_posts CASCADE;
TRUNCATE TABLE dragonshare_payouts CASCADE;

-- Messaging domain
TRUNCATE TABLE conversations CASCADE;

-- Donny AI domain (CASCADE here also wiped profiles via donny_system_conversation_id FK)
TRUNCATE TABLE donny_conversations CASCADE;
TRUNCATE TABLE donny_nudges;
TRUNCATE TABLE donny_help_logs;

-- Files domain
TRUNCATE TABLE file_uploads CASCADE;

-- Reviews domain
TRUNCATE TABLE project_reviews CASCADE;

-- Payments domain
TRUNCATE TABLE payment_events;

-- Analytics & tracking
TRUNCATE TABLE analytics_events;
TRUNCATE TABLE beta_feedback;
TRUNCATE TABLE profile_views;
TRUNCATE TABLE pricing_funnel_events;
TRUNCATE TABLE help_article_feedback;

-- Notifications & presence
TRUNCATE TABLE push_notifications;
TRUNCATE TABLE user_presence;

-- Other transactional
TRUNCATE TABLE brand_shortlists;
TRUNCATE TABLE business_contexts;
TRUNCATE TABLE stripe_webhook_events;
TRUNCATE TABLE account_deletion_requests;

-- Reset stale balance fields on preserved tables
UPDATE org_units SET pending_balance = 0 WHERE pending_balance IS DISTINCT FROM 0;
UPDATE business_profiles SET pending_balance = 0 WHERE pending_balance IS DISTINCT FROM 0;
UPDATE creator_profiles SET pending_balance = 0 WHERE pending_balance IS DISTINCT FROM 0;

-- Reconstruct profiles from auth.users (wiped by CASCADE above)
INSERT INTO profiles (id, role, email, full_name, avatar_url, created_at, updated_at, email_verified, dismissed_coachmarks, auto_pilot_enabled, first_run_missions)
SELECT
  au.id,
  (au.raw_user_meta_data->>'role')::user_role,
  au.email,
  au.raw_user_meta_data->>'full_name',
  au.raw_user_meta_data->>'avatar_url',
  au.created_at,
  now(),
  COALESCE((au.raw_user_meta_data->>'email_verified')::boolean, false),
  '{}'::text[],
  false,
  '{}'::jsonb
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.id);

-- Restore org assignments from org_members
UPDATE profiles p SET org_id = om.org_id FROM org_members om WHERE p.id = om.user_id;

-- Restore active_org_unit_id (first unit per user's org)
UPDATE profiles p
SET active_org_unit_id = sub.org_unit_id
FROM (
  SELECT DISTINCT ON (om.user_id) om.user_id, ou.id AS org_unit_id
  FROM org_members om
  JOIN org_units ou ON ou.org_id = om.org_id
  ORDER BY om.user_id, ou.id
) sub
WHERE p.id = sub.user_id;
