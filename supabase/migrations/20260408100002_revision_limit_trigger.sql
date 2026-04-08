-- P1-2: Enforce revision limit server-side (max 2 revisions)
-- Prevents direct API calls from bypassing the client-side limit.
CREATE OR REPLACE FUNCTION enforce_revision_limit()
RETURNS trigger AS $$
BEGIN
  -- Only check when transitioning TO revision_requested
  IF NEW.content_status = 'revision_requested'
     AND (OLD.content_status IS DISTINCT FROM 'revision_requested')
  THEN
    IF COALESCE(OLD.revision_count, 0) >= 2 THEN
      RAISE EXCEPTION 'Maximum revision limit (2) reached. Content must be approved or rejected.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_revision_limit ON campaign_collaborations;
CREATE TRIGGER trg_enforce_revision_limit
  BEFORE UPDATE ON campaign_collaborations
  FOR EACH ROW
  EXECUTE FUNCTION enforce_revision_limit();
