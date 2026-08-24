-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260531183548 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

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

REVOKE ALL ON FUNCTION public.get_unavailable_campaign_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unavailable_campaign_ids() TO authenticated;
