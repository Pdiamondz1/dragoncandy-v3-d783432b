ALTER TABLE file_uploads
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_file_uploads_org_unit_id
  ON file_uploads(org_unit_id);

-- Auto-populate trigger: inherit from campaign or caller's active unit
CREATE OR REPLACE FUNCTION trg_file_uploads_auto_org_unit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_caller  uuid;
BEGIN
  IF NEW.org_unit_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.campaign_id IS NOT NULL THEN
    SELECT org_unit_id INTO v_unit_id
      FROM campaigns
     WHERE id = NEW.campaign_id;
    IF v_unit_id IS NOT NULL THEN
      NEW.org_unit_id := v_unit_id;
      RETURN NEW;
    END IF;
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NOT NULL THEN
    SELECT active_org_unit_id INTO v_unit_id
      FROM profiles
     WHERE id = v_caller;
    NEW.org_unit_id := v_unit_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_file_uploads_auto_org_unit
  BEFORE INSERT ON file_uploads
  FOR EACH ROW
  EXECUTE FUNCTION trg_file_uploads_auto_org_unit_fn();
