-- Phase 2 — Group-scoped private campaigns: read + apply-eligibility gates.
-- (a) campaigns SELECT policy: a published campaign is only public when it has no
--     group; a group campaign is visible to its own creator (user_id) and to active
--     group members. (b) can_create_application: the public branch now requires
--     group_id IS NULL, plus a new active-member branch. Both are no-ops for existing
--     rows (all group_id IS NULL).

-- (a) Replace the campaigns SELECT policy (current body from 20260511100000).
DROP POLICY IF EXISTS "Users can view accessible campaigns" ON public.campaigns;
CREATE POLICY "Users can view accessible campaigns" ON public.campaigns FOR SELECT USING (
  user_id = auth.uid()
  OR (status = 'published' AND group_id IS NULL)
  OR (group_id IS NOT NULL AND public.is_active_group_member(group_id, auth.uid()))
  OR public.has_collaboration_on_campaign(id, auth.uid())
);

-- (b) Replace can_create_application (current body from 20260520010000).
-- Adds SET search_path = public; the published branch now requires group_id IS NULL;
-- new active-group-member branch.
CREATE OR REPLACE FUNCTION public.can_create_application(p_campaign_id uuid, p_creator_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = p_creator_id AND role = 'content_creator')
    AND (
      EXISTS (SELECT 1 FROM public.campaigns
              WHERE id = p_campaign_id AND status = 'published' AND group_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.campaigns c
              WHERE c.id = p_campaign_id AND c.group_id IS NOT NULL
                AND public.is_active_group_member(c.group_id, p_creator_id))
      OR EXISTS (SELECT 1 FROM public.campaign_invitations
              WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id AND status = 'pending')
    )
  );
$$;
