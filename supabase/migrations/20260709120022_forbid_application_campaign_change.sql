-- P2 fix (independent review): the campaign_applications UPDATE policy has WITH CHECK = NULL,
-- and can_create_application only gates INSERT. So a creator holding any application row could
-- `UPDATE campaign_applications SET campaign_id = '<crew_campaign>'` and inject a non-member
-- application onto a private crew campaign (bypassing the members-only apply gate, which lives
-- on INSERT / the apply RPC). No legitimate flow ever moves an application between campaigns,
-- so forbid changing campaign_id on any update. Plain trigger (reads NEW/OLD only).
CREATE OR REPLACE FUNCTION public.forbid_application_campaign_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
    RAISE EXCEPTION 'An application''s campaign cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.forbid_application_campaign_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_forbid_application_campaign_change ON public.campaign_applications;
CREATE TRIGGER trg_forbid_application_campaign_change
  BEFORE UPDATE ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.forbid_application_campaign_change();
