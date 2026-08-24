-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260517191941 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.


-- Reset all transactional data for production launch.

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

-- Donny AI domain
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
UPDATE profiles SET first_run_missions = '{}'::jsonb WHERE first_run_missions IS DISTINCT FROM '{}'::jsonb;
