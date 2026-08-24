-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260520112626 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.


-- Fix infinite recursion in campaign_applications INSERT policy.
-- The previous policy referenced campaign_applications.campaign_id inside
-- its own WITH CHECK subquery, causing Postgres error 42P17.
-- Solution: use a SECURITY DEFINER helper function to check for pending
-- invitations, avoiding the self-referencing subquery.

-- 1) Create helper function (SECURITY DEFINER bypasses RLS in the check)
CREATE OR REPLACE FUNCTION public.has_pending_invitation(p_campaign_id uuid, p_creator_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaign_invitations
    WHERE campaign_id = p_campaign_id
      AND creator_id = p_creator_id
      AND status = 'pending'
  );
$$;

-- 2) Replace the broken INSERT policy
DROP POLICY IF EXISTS "Content creators can create applications" ON public.campaign_applications;

CREATE POLICY "Content creators can create applications"
  ON public.campaign_applications
  FOR INSERT
  WITH CHECK (
    auth.uid() = creator_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'content_creator'
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE id = campaign_id AND status = 'published'
      )
      OR
      public.has_pending_invitation(campaign_id, auth.uid())
    )
  );
