-- Returns campaign IDs that are NOT available for creators to browse because a
-- creator is already working on them: an accepted application, or an active /
-- completed collaboration.
--
-- This MUST run as SECURITY DEFINER. The browse hooks previously computed this
-- exclusion list client-side, but RLS on campaign_collaborations and
-- campaign_applications only exposes the current user's own rows — so a creator
-- could never see that a campaign was taken by *another* creator, and those
-- taken campaigns leaked into the public browse list. Evaluating with definer
-- privileges lets the function see all creators' rows while exposing only the
-- campaign IDs (no sensitive data).
CREATE OR REPLACE FUNCTION public.get_unavailable_campaign_ids()
RETURNS TABLE (campaign_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.campaign_id
    FROM campaign_collaborations cc
   WHERE cc.status IN ('active', 'completed')
  UNION
  SELECT ca.campaign_id
    FROM campaign_applications ca
   WHERE ca.status = 'accepted';
$$;

-- Only authenticated creators/brands browse campaigns; logged-out (anon) users
-- have no reason to pull the taken-campaign list. Supabase default privileges
-- grant anon EXECUTE on new functions directly, so revoke it explicitly (a bare
-- REVOKE ... FROM PUBLIC does not cover the direct anon grant).
REVOKE ALL ON FUNCTION public.get_unavailable_campaign_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unavailable_campaign_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unavailable_campaign_ids() TO authenticated;
