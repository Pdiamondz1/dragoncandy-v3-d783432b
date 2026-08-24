-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260810190455 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

CREATE OR REPLACE FUNCTION public.enforce_campaign_group_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.group_id IS NOT NULL
     AND NOT public.is_creator_group_owner(NEW.group_id, NEW.user_id) THEN
    RAISE EXCEPTION 'Campaign group_id must reference a crew owned by the campaign owner'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.group_id IS NOT NULL AND NEW.group_id IS NULL THEN
    RAISE EXCEPTION 'A crew campaign cannot be made public: campaigns.group_id may not be unset'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.enforce_campaign_group_ownership() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_campaign_group_ownership ON public.campaigns;
CREATE TRIGGER trg_enforce_campaign_group_ownership
  BEFORE INSERT OR UPDATE OF group_id ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_group_ownership();
