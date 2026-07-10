-- P2 fix (Codex): private crew campaigns are members-only, so a regular campaign-invite
-- must never be created against one. Round 13 stopped an invited non-member from APPLYING
-- to a crew campaign, but the campaign_invitations ROW could still be inserted (via the
-- normal invite surfaces / send-campaign-invitation edge fn), leaving a non-member with a
-- pending invite + notification for a campaign they can't see (RLS) and can't apply to —
-- a broken, leaky flow. Reject the insert at the DB with a BEFORE INSERT trigger (fires for
-- every write path incl. service-role). The intended group flow creates no invitations, and
-- public campaigns (group_id IS NULL) are unaffected.
CREATE OR REPLACE FUNCTION public.reject_group_campaign_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE id = NEW.campaign_id AND group_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Campaign invitations are not allowed for private crew campaigns';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_group_campaign_invitation() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_reject_group_campaign_invitation ON public.campaign_invitations;
CREATE TRIGGER trg_reject_group_campaign_invitation
  BEFORE INSERT ON public.campaign_invitations
  FOR EACH ROW EXECUTE FUNCTION public.reject_group_campaign_invitation();
