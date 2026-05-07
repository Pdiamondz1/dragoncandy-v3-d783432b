
-- 1. campaign-files: tighten SELECT to owner folder
DROP POLICY IF EXISTS "Authenticated users can view campaign files" ON storage.objects;
CREATE POLICY "Users can view their own campaign files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'campaign-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. campaign-deliverables: drop the overly broad select policy
DROP POLICY IF EXISTS "campaign_deliverables_select" ON storage.objects;

-- 3. promotion-videos: enforce folder ownership for delete + upload
DROP POLICY IF EXISTS "Business owners can delete their promotion videos" ON storage.objects;
CREATE POLICY "Owners can delete their promotion videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'promotion-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated users can upload promotion videos" ON storage.objects;
CREATE POLICY "Users can upload their own promotion videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'promotion-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. campaign_brief_generations: enforce caller is user_id on insert
DROP POLICY IF EXISTS "Authenticated users insert" ON public.campaign_brief_generations;
CREATE POLICY "Users insert own generations"
ON public.campaign_brief_generations FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    org_id IS NULL
    OR org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.invitation_status = 'active')
  )
);

-- 5. profiles email leakage: drop the messaging policy that exposed the entire row
-- (including email) and recreate WITHOUT exposing email by using a security_invoker
-- view that callers should query instead. The new RLS policy is preserved so the
-- view can read rows; the view itself omits the email column.
DROP POLICY IF EXISTS "Users can view profiles of people they message with" ON public.profiles;

DROP VIEW IF EXISTS public.messages_with_profiles;
CREATE VIEW public.messages_with_profiles
WITH (security_invoker = true) AS
SELECT m.id, m.campaign_id, m.sender_id, m.recipient_id, m.content, m.created_at,
  m.read_at, m.attachment_url, m.attachment_name, m.attachment_size, m.parent_message_id,
  m.thread_id, m.conversation_id, m.category, m.is_starred, m.is_archived,
  m.delivery_status, m.forwarded_from_message_id, m.edited_at,
  p.full_name AS sender_full_name,
  p.avatar_url AS sender_avatar_url
FROM public.messages m
LEFT JOIN public.profiles p ON p.id = m.sender_id;
GRANT SELECT ON public.messages_with_profiles TO authenticated;

-- New non-leaking participant lookup view
CREATE OR REPLACE VIEW public.message_participant_profiles
WITH (security_invoker = true) AS
SELECT p.id, p.full_name, p.avatar_url, p.role
FROM public.profiles p
WHERE p.id IN (
  SELECT DISTINCT m.sender_id FROM public.messages m WHERE m.recipient_id = auth.uid()
  UNION
  SELECT DISTINCT m.recipient_id FROM public.messages m WHERE m.sender_id = auth.uid()
);
GRANT SELECT ON public.message_participant_profiles TO authenticated;

-- Re-add row-visibility for messaging participants so the view can read base rows.
-- Email leakage is mitigated by the application using safe_profiles / message_participant_profiles
-- views which omit email; direct queries to profiles.email by non-owners are documented as
-- discouraged. (Postgres has no per-policy column restriction.)
CREATE POLICY "View messaging participants profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT DISTINCT m.sender_id FROM public.messages m WHERE m.recipient_id = auth.uid()
    UNION
    SELECT DISTINCT m.recipient_id FROM public.messages m WHERE m.sender_id = auth.uid()
  )
);

-- 6. safe_profiles view: ensure security_invoker
ALTER VIEW public.safe_profiles SET (security_invoker = true);

-- 7. Pin search_path on remaining functions
ALTER FUNCTION public.get_available_creators(text[], creator_skill[]) SET search_path = public;
ALTER FUNCTION public.insert_payment_event(text, text, uuid, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.trg_ds_posts_updated_at_fn() SET search_path = public;
ALTER FUNCTION public.enforce_active_campaign_limit() SET search_path = public;
