-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260510144156 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.


CREATE OR REPLACE FUNCTION enforce_single_slot_campaign()
RETURNS TRIGGER AS $$
DECLARE
  max_creators INTEGER;
  current_count INTEGER;
BEGIN
  SELECT (ai_analysis->>'creator_count')::integer INTO max_creators
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
