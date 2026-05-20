-- Fix infinite recursion in campaign_applications INSERT policy.
-- The previous policy referenced campaign_applications.campaign_id inside
-- its own WITH CHECK subquery, causing Postgres error 42P17.
-- Solution: move ALL checks into a SECURITY DEFINER function to completely
-- eliminate self-referencing subqueries in the policy.

-- Combined check function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.can_create_application(p_campaign_id uuid, p_creator_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_creator_id AND role = 'content_creator'
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE id = p_campaign_id AND status = 'published'
      )
      OR EXISTS (
        SELECT 1 FROM public.campaign_invitations
        WHERE campaign_id = p_campaign_id
          AND creator_id = p_creator_id
          AND status = 'pending'
      )
    )
  );
$$;

-- Replace INSERT policy — no subqueries, just function call
DROP POLICY IF EXISTS "Content creators can create applications" ON public.campaign_applications;

CREATE POLICY "Content creators can create applications"
  ON public.campaign_applications
  FOR INSERT
  WITH CHECK (
    auth.uid() = creator_id
    AND public.can_create_application(campaign_id, auth.uid())
  );
