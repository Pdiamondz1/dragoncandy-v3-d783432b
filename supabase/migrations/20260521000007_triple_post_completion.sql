-- S5-2: Auto-complete triple-post session when all parties have posted
ALTER TABLE triple_post_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT NULL;

-- Trigger: auto-flip to 'completed' when all non-null parties have posted
CREATE OR REPLACE FUNCTION triple_post_check_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if every non-null party has a status of 'posted', 'skipped', or 'n/a'
  IF (
    (NEW.restaurant_status IS NULL OR NEW.restaurant_status IN ('posted', 'skipped', 'n/a')) AND
    (NEW.creator_status IS NULL OR NEW.creator_status IN ('posted', 'skipped', 'n/a')) AND
    (NEW.brand_status IS NULL OR NEW.brand_status IN ('posted', 'skipped', 'n/a'))
  ) AND (
    NEW.restaurant_status = 'posted' OR
    NEW.creator_status = 'posted' OR
    NEW.brand_status = 'posted'
  ) THEN
    NEW.status := 'completed';
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triple_post_check_completion_trigger ON triple_post_sessions;
CREATE TRIGGER triple_post_check_completion_trigger
  BEFORE INSERT OR UPDATE ON triple_post_sessions
  FOR EACH ROW
  EXECUTE FUNCTION triple_post_check_completion();
