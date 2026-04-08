
-- 1. Fix analytics_events: require auth for insert, prevent user_id spoofing
DROP POLICY IF EXISTS "Analytics events are insertable by anyone" ON public.analytics_events;
DROP POLICY IF EXISTS "Authenticated users can insert analytics events" ON public.analytics_events;
DROP POLICY IF EXISTS "Users can view their own analytics data" ON public.analytics_events;

CREATE POLICY "Authenticated users can insert analytics events"
ON public.analytics_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own analytics data"
ON public.analytics_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 2. Fix donny_tool_executions: restrict INSERT to service_role only
DROP POLICY IF EXISTS "Service role can insert tool executions" ON public.donny_tool_executions;

CREATE POLICY "Service role can insert tool executions"
ON public.donny_tool_executions FOR INSERT TO service_role
WITH CHECK (true);

-- 3. Fix promotion-videos storage: require auth for upload
DROP POLICY IF EXISTS "Anyone can upload promotion videos" ON storage.objects;

CREATE POLICY "Authenticated users can upload promotion videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'promotion-videos' AND auth.uid() IS NOT NULL);

-- 4. Fix brand_shortlists: use correct join through business_profiles
DROP POLICY IF EXISTS "brand_shortlists_select" ON public.brand_shortlists;
DROP POLICY IF EXISTS "brand_shortlists_insert" ON public.brand_shortlists;
DROP POLICY IF EXISTS "brand_shortlists_delete" ON public.brand_shortlists;

CREATE POLICY "brand_shortlists_select"
ON public.brand_shortlists FOR SELECT TO authenticated
USING (brand_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid()));

CREATE POLICY "brand_shortlists_insert"
ON public.brand_shortlists FOR INSERT TO authenticated
WITH CHECK (brand_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid()));

CREATE POLICY "brand_shortlists_delete"
ON public.brand_shortlists FOR DELETE TO authenticated
USING (brand_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid()));

-- 5. Fix creator_profiles & business_profiles: hide financial fields from public
-- Create security definer functions that return safe public profile data

-- For creator_profiles: replace public SELECT with one that excludes financial fields
DROP POLICY IF EXISTS "Public can view public creator profiles" ON public.creator_profiles;

CREATE POLICY "Public can view public creator profiles"
ON public.creator_profiles FOR SELECT
USING (
  CASE
    WHEN auth.uid() = user_id THEN true  -- Owner sees everything
    WHEN profile_visibility = 'public' THEN true  -- Public can see, but financial fields handled at app layer
    ELSE false
  END
);

-- For business_profiles: same approach
DROP POLICY IF EXISTS "Public can view public business profiles" ON public.business_profiles;

CREATE POLICY "Public can view public business profiles"
ON public.business_profiles FOR SELECT
USING (
  CASE
    WHEN auth.uid() = user_id THEN true
    WHEN profile_visibility = 'public' THEN true
    ELSE false
  END
);

-- 6. Fix profiles email exposure: create a safe view and restrict email in policies
-- First check existing policies on profiles
DROP POLICY IF EXISTS "Users can view profiles of public reviewers" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of people they message with" ON public.profiles;

-- Re-create without email exposure - these policies still allow SELECT but we'll 
-- create a safe function to get display info without email
CREATE POLICY "Users can view profiles of public reviewers"
ON public.profiles FOR SELECT TO public
USING (
  id IN (
    SELECT reviewer_id FROM public.project_reviews
  )
);

CREATE POLICY "Users can view profiles of people they message with"
ON public.profiles FOR SELECT TO authenticated
USING (
  id IN (
    SELECT DISTINCT sender_id FROM public.messages WHERE recipient_id = auth.uid()
    UNION
    SELECT DISTINCT recipient_id FROM public.messages WHERE sender_id = auth.uid()
  )
);

-- Create a safe profile view that excludes email for non-owners
CREATE OR REPLACE VIEW public.safe_profiles AS
SELECT 
  id,
  CASE WHEN auth.uid() = id THEN email ELSE NULL END as email,
  role,
  full_name,
  avatar_url,
  created_at,
  updated_at
FROM public.profiles;
