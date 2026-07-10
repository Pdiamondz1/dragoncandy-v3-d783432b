-- P2 fix (Codex): align the migration-file enforce_single_slot_campaign to PROD's actual
-- behavior. The original migration 20260506000001 reads the TABLE column
-- `campaigns.creator_count`, but prod was altered out-of-band to read
-- `(ai_analysis->>'creator_count')` and prod has NO creator_count column (schema drift).
-- Crew campaigns set the JSONB value (a top-level column write would 500 on prod), so on a
-- fresh migration replay the column-reading trigger would leave single-slot unenforced.
-- Redefine the trigger to read the JSONB value everywhere: a no-op on prod (already this),
-- correct on replay. `search_path=public` preserved (was pinned separately).
CREATE OR REPLACE FUNCTION public.enforce_single_slot_campaign()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
$$;
