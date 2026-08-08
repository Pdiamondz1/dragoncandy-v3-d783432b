-- Give `campaigns` a real completion anchor, so nothing has to infer one from `updated_at`.
--
-- WHY NOW: `public.handle_updated_at()` on prod is a STUB — its body is literally
-- `-- Function logic here / RETURN NEW;`, so it never assigns NEW.updated_at. That is PROD DRIFT,
-- not repo state: both repo definitions (20250616011059, 20250617123640) already say
-- `NEW.updated_at = now()`. Migration 20260807233200 restores it. Before that lands, every
-- consumer that used `updated_at` as a stand-in for "when did this finish" has to be moved onto a
-- stable anchor — otherwise a routine edit to an old row would look like a fresh completion.
--
-- `campaigns` has NO completed_at (verified on prod), which is exactly why
-- 20260627000000_dre_engine_schema.sql reaches for `ca.updated_at` and says so in a comment:
-- "business campaign milestones (5/10/25/50) — campaigns has no completed_at".
--
-- The blunt alternative — swapping that to `created_at` — was rejected. It suppresses retroactive
-- firing, but it ALSO suppresses legitimate FUTURE milestones: a business completing its 5th
-- campaign next week, on campaigns created months ago, would get an occurred_at from months ago,
-- land before dre_config.go_live_at, and never be told. A real completion anchor fixes both.
--
-- Pattern copied deliberately from 20260710120007 (`content_submitted_at`), which exists for this
-- same reason and whose header already records handle_updated_at as "a verified no-op".

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.campaigns.completed_at IS
  'Server-stamped when status transitions INTO ''completed'' (trg_set_campaign_completed_at). '
  'Stable completion anchor — use this, never updated_at, to date a completion.';

CREATE OR REPLACE FUNCTION public.set_campaign_completed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Stamp only on the TRANSITION into 'completed'. A no-op update that leaves status='completed'
  -- must not re-stamp, or the anchor becomes as mutable as the column it replaces.
  IF NEW.status = 'completed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_campaign_completed_at ON public.campaigns;
CREATE TRIGGER trg_set_campaign_completed_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_completed_at();

-- Backfill existing completions from `updated_at` while it is STILL the better proxy.
-- Ordering is load-bearing: this must run BEFORE 20260807233200 restores the trigger, after which
-- any edit would move updated_at and destroy its value as a completion estimate.
-- On prod this touches 0 rows (`select count(*) from campaigns where status='completed'` = 0),
-- so it is future-proofing here and a genuine backfill in any environment that has completions.
UPDATE public.campaigns
   SET completed_at = updated_at
 WHERE status = 'completed'
   AND completed_at IS NULL;

-- Verification (expect completed_at non-null for every completed campaign):
--   select count(*) filter (where completed_at is null) as unanchored
--     from public.campaigns where status = 'completed';
