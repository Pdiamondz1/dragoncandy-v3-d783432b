-- Auto-create organization + org_member when a business_profile is inserted
-- and the user doesn't already have an org membership.
CREATE OR REPLACE FUNCTION public.trg_auto_create_org_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_unit_id uuid;
  v_org_type text;
  v_unit_type text;
  v_email text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM org_members WHERE user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  v_org_type := CASE WHEN NEW.account_type = 'brand' THEN 'brand' ELSE 'restaurant' END;
  v_unit_type := CASE WHEN v_org_type = 'brand' THEN 'product' ELSE 'location' END;

  SELECT email INTO v_email FROM profiles WHERE id = NEW.user_id;

  INSERT INTO organizations (name, org_type, billing_email)
  VALUES (
    COALESCE(NULLIF(NEW.business_name, ''), 'My Business') || '''s Workspace',
    v_org_type,
    v_email
  )
  RETURNING id INTO v_org_id;

  INSERT INTO org_units (org_id, unit_type, name, is_primary)
  VALUES (v_org_id, v_unit_type, COALESCE(NULLIF(NEW.business_name, ''), 'Primary'), true)
  RETURNING id INTO v_unit_id;

  INSERT INTO org_members (org_id, user_id, role, invitation_status, joined_at)
  VALUES (v_org_id, NEW.user_id, 'owner', 'active', now());

  UPDATE profiles
  SET org_id = v_org_id, active_org_unit_id = v_unit_id
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_org
  AFTER INSERT ON business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_create_org_fn();
