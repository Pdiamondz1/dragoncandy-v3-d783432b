-- Trigger to enforce single-slot campaign limit.
-- Prevents two creators from being simultaneously active/pending on a campaign
-- where creator_count = 1.

CREATE OR REPLACE FUNCTION public.enforce_single_slot_campaign()
RETURNS TRIGGER AS $$
DECLARE
  max_creators INTEGER;
  current_count INTEGER;
BEGIN
  SELECT creator_count INTO max_creators
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF max_creators IS NOT NULL AND max_creators <= 1 THEN
    SELECT COUNT(*) INTO current_count
    FROM public.campaign_collaborations
    WHERE campaign_id = NEW.campaign_id
      AND status IN ('active', 'pending')
      AND id != NEW.id;

    IF current_count >= 1 THEN
      RAISE EXCEPTION 'Campaign has reached its creator limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_single_slot_campaign ON public.campaign_collaborations;

CREATE TRIGGER trg_enforce_single_slot_campaign
  BEFORE INSERT OR UPDATE ON public.campaign_collaborations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_slot_campaign();
