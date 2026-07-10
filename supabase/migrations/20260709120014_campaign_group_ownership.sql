-- P1 authorization fix (Codex): a campaign may only target a crew (group_id) that its
-- OWN owner (campaigns.user_id) owns. The campaigns INSERT/UPDATE RLS policies only
-- check user_id = auth.uid() and treat group_id as a plain FK, so without this a
-- business that knows another crew's UUID could set campaigns.group_id to that crew
-- and expose a private campaign to its active members. Enforce with a trigger so it
-- covers every write path (incl. service-role) and can't be bypassed by an added
-- permissive policy. No-op for public campaigns (group_id IS NULL).
CREATE OR REPLACE FUNCTION public.enforce_campaign_group_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.group_id IS NOT NULL
     AND NOT public.is_creator_group_owner(NEW.group_id, NEW.user_id) THEN
    RAISE EXCEPTION 'Campaign group_id must reference a crew owned by the campaign owner'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_campaign_group_ownership() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_campaign_group_ownership ON public.campaigns;
CREATE TRIGGER trg_enforce_campaign_group_ownership
  BEFORE INSERT OR UPDATE OF group_id ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_group_ownership();
