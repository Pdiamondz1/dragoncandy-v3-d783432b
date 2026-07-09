-- Phase 2 — Group-scoped private campaigns: lifecycle activation.
-- (a) accept_application_with_collaboration: a group campaign with no escrow (free /
--     fixed_price = 0) still transitions to 'active' on accept. Only the escrow guard
--     line changes vs the current body (from 20260527000001).
-- (b) enforce_active_campaign_limit: group campaigns are exempt from the per-org
--     active-campaign limit (guard + count both add group_id IS NULL). CREATE OR REPLACE
--     resets the search_path pinned later in 20260507102621, so re-add
--     SET search_path = public, and re-assert the anon/authenticated REVOKE from
--     20260507170005. No-ops for existing rows (all group_id IS NULL).

-- (a) accept_application_with_collaboration — current body from 20260527000001,
--     changing ONLY the escrow guard.
CREATE OR REPLACE FUNCTION accept_application_with_collaboration(p_application_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app record; v_campaign record; v_collab record;
BEGIN
  SELECT * INTO v_app FROM campaign_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status NOT IN ('pending', 'counter_offered', 'accepted') THEN
    RAISE EXCEPTION 'Application is no longer pending (status: %)', v_app.status;
  END IF;
  UPDATE campaign_applications
    SET status = 'accepted', restaurant_approval_status = 'approved', updated_at = now()
    WHERE id = p_application_id;
  SELECT * INTO v_campaign FROM campaigns WHERE id = v_app.campaign_id FOR UPDATE;
  INSERT INTO campaign_collaborations (campaign_id, creator_id, application_id, status)
  VALUES (v_app.campaign_id, v_app.creator_id, p_application_id, 'active')
  ON CONFLICT (campaign_id, creator_id) DO NOTHING
  RETURNING * INTO v_collab;
  IF v_campaign.escrow_status = 'held'
     OR (v_campaign.group_id IS NOT NULL AND COALESCE(v_campaign.fixed_price, 0) = 0) THEN
    UPDATE campaigns SET status = 'active', updated_at = now() WHERE id = v_app.campaign_id;
  END IF;
  UPDATE campaign_applications
    SET status = 'rejected',
        rejection_reason = 'Auto-declined: another applicant was selected for this campaign.',
        updated_at = now()
    WHERE campaign_id = v_app.campaign_id AND id <> p_application_id
      AND status IN ('pending', 'counter_offered');
  RETURN json_build_object('application_id', p_application_id, 'campaign_id', v_app.campaign_id,
    'creator_id', v_app.creator_id, 'status', 'accepted');
END;
$$;

-- (b) enforce_active_campaign_limit — current body from 20260507000002, with:
--     (1) SET search_path = public re-added to the header (CREATE OR REPLACE resets the
--         pin from 20260507102621),
--     (2) NEW.group_id IS NULL added to the transition guard,
--     (3) AND group_id IS NULL added to the COUNT.
-- The trigger is already bound and is preserved by CREATE OR REPLACE FUNCTION.
CREATE OR REPLACE FUNCTION enforce_active_campaign_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id uuid; v_limit integer; v_current integer;
BEGIN
  IF NEW.status = 'published' AND NEW.group_id IS NULL AND (OLD.status IS DISTINCT FROM 'published') THEN
    SELECT org_id INTO v_org_id FROM profiles WHERE id = NEW.user_id;
    IF v_org_id IS NOT NULL THEN
      SELECT active_campaign_limit INTO v_limit FROM organizations WHERE id = v_org_id;
    END IF;
    v_limit := COALESCE(v_limit, 1);
    SELECT count(*) INTO v_current FROM campaigns
    WHERE user_id = NEW.user_id AND status IN ('published', 'active') AND group_id IS NULL AND id IS DISTINCT FROM NEW.id;
    IF v_current >= v_limit THEN
      RAISE EXCEPTION 'Active campaign limit reached (% of %)', v_current, v_limit USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-assert the grant discipline pinned in 20260507170005 (CREATE OR REPLACE preserves
-- grants, but re-asserting is harmless and keeps the invariant explicit).
REVOKE EXECUTE ON FUNCTION public.enforce_active_campaign_limit() FROM anon, authenticated;
