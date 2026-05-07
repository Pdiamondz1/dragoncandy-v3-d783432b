-- Enforce active campaign limit per organization tier.
-- Prevents status from being set to 'published' when the user's org is at capacity.

CREATE OR REPLACE FUNCTION enforce_active_campaign_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_limit integer;
  v_current integer;
BEGIN
  -- Only check when status transitions TO published
  IF NEW.status = 'published' AND (OLD.status IS DISTINCT FROM 'published') THEN
    -- Look up the user's org
    SELECT org_id INTO v_org_id
    FROM profiles
    WHERE id = NEW.user_id;

    -- Get the org's active campaign limit (default 1 for no-org users)
    IF v_org_id IS NOT NULL THEN
      SELECT active_campaign_limit INTO v_limit
      FROM organizations
      WHERE id = v_org_id;
    END IF;

    v_limit := COALESCE(v_limit, 1);

    -- Count current published/active campaigns for this user (excluding this one)
    SELECT count(*) INTO v_current
    FROM campaigns
    WHERE user_id = NEW.user_id
      AND status IN ('published', 'active')
      AND id IS DISTINCT FROM NEW.id;

    IF v_current >= v_limit THEN
      RAISE EXCEPTION 'Active campaign limit reached (% of %)', v_current, v_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_active_campaign_limit
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION enforce_active_campaign_limit();
