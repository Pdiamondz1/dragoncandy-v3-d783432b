
-- 1. Hide sensitive columns on profile tables
REVOKE SELECT (stripe_account_id, stripe_onboarding_complete, pending_balance)
  ON public.creator_profiles FROM anon, authenticated;
REVOKE SELECT (stripe_account_id, stripe_onboarding_complete, pending_balance)
  ON public.business_profiles FROM anon, authenticated;

CREATE OR REPLACE VIEW public.public_creator_profiles
WITH (security_invoker = true) AS
SELECT id, user_id, creator_name, avatar_url, bio, skills, portfolio_urls,
       location, availability, base_rate_per_hour, instagram_url, tiktok_url,
       youtube_url, facebook_url, linkedin_url, x_url, other_social_url,
       website_url, is_completed, created_at, updated_at, years_of_experience,
       languages_spoken, timezone, response_time, min_project_budget,
       max_projects_per_month, preferred_project_duration,
       collaboration_preferences, profile_visibility, profile_slug,
       average_rating, total_reviews, allow_portfolio_in_feed,
       city, country, postal_code
FROM public.creator_profiles;

CREATE OR REPLACE VIEW public.public_business_profiles
WITH (security_invoker = true) AS
SELECT id, user_id, business_name, logo_url, industry, website_url, location,
       description, instagram_url, tiktok_url, youtube_url, facebook_url,
       linkedin_url, x_url, other_social_url, sample_content_urls,
       is_completed, created_at, updated_at, company_size, founded_year,
       employee_count_range, budget_range, preferred_collaboration_style,
       timezone, profile_visibility, profile_slug, average_rating,
       total_reviews, account_type, sponsorship_budget, brand_category,
       marketing_objectives, postal_code, city, country
FROM public.business_profiles;

GRANT SELECT ON public.public_creator_profiles TO anon, authenticated;
GRANT SELECT ON public.public_business_profiles TO anon, authenticated;

-- 2. profiles.email leak
DROP POLICY IF EXISTS "Users can view profiles of public reviewers" ON public.profiles;

-- 3. donny_tool_executions
DROP POLICY IF EXISTS "Service role can insert tool executions" ON public.donny_tool_executions;
CREATE POLICY "Service role can insert tool executions"
  ON public.donny_tool_executions FOR INSERT
  TO service_role WITH CHECK (true);

-- 4. promotion_submissions PII
DROP POLICY IF EXISTS "Anyone can check their own promotion submissions" ON public.promotion_submissions;
-- "Business owners can view submissions for their promotions" already exists and is correct

-- 5. organizations billing exposure
DROP POLICY IF EXISTS "org_select_directory" ON public.organizations;

CREATE OR REPLACE VIEW public.public_organizations
WITH (security_invoker = true) AS
SELECT id, name, slug, org_type, logo_url, created_at
FROM public.organizations
WHERE deleted_at IS NULL;

GRANT SELECT ON public.public_organizations TO anon, authenticated;

-- 6. campaign-files storage hardening
DROP POLICY IF EXISTS "Users can upload campaign files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view campaign files" ON storage.objects;

CREATE POLICY "Authenticated users can upload to own campaign folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can view campaign files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-files');

-- 7. promotion-videos storage hardening
DROP POLICY IF EXISTS "Anyone can upload promotion videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view promotion videos" ON storage.objects;

CREATE POLICY "Authenticated users can view promotion videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'promotion-videos');

-- 8. analytics_events leftover policy
DROP POLICY IF EXISTS "Analytics events are insertable by anyone" ON public.analytics_events;

-- 9. search_path hardening on flagged functions
ALTER FUNCTION public.is_conversation_participant(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.user_in_conversation(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.cleanup_expired_verification_tokens() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.generate_profile_slug(text, text) SET search_path = public;
ALTER FUNCTION public.auto_generate_profile_slug() SET search_path = public;
ALTER FUNCTION public.get_unread_message_counts(uuid) SET search_path = public;
ALTER FUNCTION public.create_or_get_direct_conversation(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.update_conversation_last_message() SET search_path = public;
ALTER FUNCTION public.increment_pending_balance(uuid, numeric, text) SET search_path = public;
ALTER FUNCTION public.update_profile_ratings() SET search_path = public;
ALTER FUNCTION public.debug_user_upload_permissions() SET search_path = public;
ALTER FUNCTION public.get_user_display_name(uuid) SET search_path = public;
ALTER FUNCTION public.get_user_conversations(uuid) SET search_path = public;
ALTER FUNCTION public.handle_analytics_updated_at() SET search_path = public;
ALTER FUNCTION public.set_user_offline(uuid) SET search_path = public;
ALTER FUNCTION public.enforce_single_slot_campaign() SET search_path = public;
ALTER FUNCTION public.touch_business_outstand_accounts_updated_at() SET search_path = public;
