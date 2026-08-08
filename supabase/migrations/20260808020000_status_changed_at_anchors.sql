-- `status_changed_at` — a real change-anchor for the analytics alert windows.
--
-- WHY: `donny-analytics-alerts` has to answer "did this row's STATUS change recently?" and has
-- never had a column that says so. It used `updated_at`, which was a no-op stub on prod (so the
-- filter silently meant "created in the window"), and 20260807233200 restored the trigger — at
-- which point `updated_at` becomes a *modification* stamp that moves on ANY write, so "alert on
-- modification" would fire "Payment released" off a title edit. Neither is the question being
-- asked. #385 chose the conservative option (`created_at`) and recorded the gap; this is the fix
-- it pointed at.
--
-- Codex was right, and MORE right than it was credited at the time. Post-merge measurement
-- falsified #385's own audit claim that `campaign_collaborations.updated_at` has no explicit
-- writer — `src/hooks/useProjectComplete.ts:52` writes it on the completion path, and 10 of 16
-- pre-restore rows had a moved `updated_at`. Against the live 24h window, 1 of 16 moved more than
-- 24h after creation, i.e. the `created_at` repoint really does cost ~1-in-16 historical status
-- alerts. Small, but not the zero that was reported.
--
-- Same narrow-anchor pattern as `content_submitted_at` (20260710120007),
-- `payout_executed_at` (20260723160000) and `campaigns.completed_at` (20260807233000):
-- stamp ONLY on a transition, never on any update that leaves the row in the same state.

-- ---------------------------------------------------------------------------
-- NO BACKFILL — deliberate. Read this before "fixing" it.
-- ---------------------------------------------------------------------------
-- The obvious move is `UPDATE ... SET status_changed_at = created_at` for existing rows. Rejected,
-- because on THESE two tables an UPDATE is not free — it fires every BEFORE UPDATE trigger:
--
--   1. `handle_updated_at` is LIVE again as of 20260807233200. A backfill would stamp
--      `updated_at = now()` on every row in both tables, destroying what legacy signal remains and
--      flattening the three `.order('updated_at')` call sites to a single timestamp.
--   2. `enforce_single_slot_campaign` (BEFORE INSERT OR UPDATE on campaign_collaborations) counts
--      OTHER active/pending collaborations and RAISEs past the limit. It re-evaluates on a no-op
--      UPDATE, so any pre-existing single-slot violation would abort the whole migration.
--      (`enforce_revision_limit` is safe — it only raises on a transition INTO
--      'revision_requested', and a no-op update leaves OLD = NEW.)
--
-- Cost of not backfilling: rows that existed before this migration have `status_changed_at IS
-- NULL`, and `.gte(...)` excludes NULL, so they don't alert until their status next changes. The
-- only real loss is a **one-time window of at most 24h** — rows created just before this ran that
-- would have matched the outgoing `created_at` filter. It self-heals on the next status change,
-- and prod is pre-revenue with negligible alert traffic. A silent one-day gap is a better trade
-- than clobbering `updated_at` across two core tables.

-- ===========================================================================
-- campaigns — watches `escrow_status` ONLY. Deliberately NOT `status`.
-- ===========================================================================
-- The ONLY consumer of this column is the payment_events alert, which reports escrow state
-- ("Funds held in escrow" / "Payment released"). An anchor that also moved on a `status`
-- transition would re-create the exact false positive this whole change exists to remove: a
-- campaign going active → completed while escrow sat unchanged at 'held' would stamp the anchor,
-- and the alert would announce an escrow event that never happened. (Codex caught this in review —
-- the first draft watched both columns.)
--
-- A general campaign status anchor is NOT added, because nothing reads one. When something needs
-- it, give it its own column and its own trigger rather than widening this one — the narrowness IS
-- the feature. `campaigns.completed_at` (20260807233000) already covers the one status transition
-- that has a consumer.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS escrow_status_changed_at timestamptz;

-- Set the DEFAULT only AFTER the column exists and is all-NULL. Doing it in ADD COLUMN would
-- evaluate the volatile default for EVERY EXISTING ROW, making the entire table look like escrow
-- just changed — precisely the false-alert storm this column exists to prevent.
ALTER TABLE public.campaigns
  ALTER COLUMN escrow_status_changed_at SET DEFAULT now();

COMMENT ON COLUMN public.campaigns.escrow_status_changed_at IS
  'Server-stamped when escrow_status transitions (trg_set_campaign_escrow_status_changed_at). '
  'The anchor the payment_events alert window reads. Deliberately does NOT move on a `status` '
  'change — that would announce an escrow event that did not happen. '
  'NULL = predates 20260808020000, escrow never changed since. Never use updated_at for this.';

CREATE OR REPLACE FUNCTION public.set_campaign_escrow_status_changed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.escrow_status IS DISTINCT FROM OLD.escrow_status THEN
    NEW.escrow_status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_campaign_escrow_status_changed_at ON public.campaigns;
CREATE TRIGGER trg_set_campaign_escrow_status_changed_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_escrow_status_changed_at();

-- ===========================================================================
-- campaign_collaborations — watches `status` AND `content_status`
-- ===========================================================================
-- Watching two columns is correct HERE, unlike on `campaigns` above, and the difference is the
-- consumer, not the schema. The status_changes alert resolves its label as
-- `content_status || status` (index.ts) — so a transition in EITHER column is a status change the
-- alert genuinely reports, and stamping on both is exactly right. On `campaigns` the consumer only
-- reports escrow, so a `status` transition there would have announced an event that didn't happen.
-- The test is never "how many columns", it is "does every column this stamps on produce an event
-- the reader actually reports".
ALTER TABLE public.campaign_collaborations
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

ALTER TABLE public.campaign_collaborations
  ALTER COLUMN status_changed_at SET DEFAULT now();

COMMENT ON COLUMN public.campaign_collaborations.status_changed_at IS
  'Server-stamped when status OR content_status transitions (trg_set_collab_status_changed_at). '
  'The anchor the analytics alert windows read. NULL = predates 20260808020000, never changed since. '
  'Distinct from content_submitted_at, which stamps ONLY the transition into content_status=submitted.';

CREATE OR REPLACE FUNCTION public.set_collab_status_changed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status         IS DISTINCT FROM OLD.status
  OR NEW.content_status IS DISTINCT FROM OLD.content_status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_collab_status_changed_at ON public.campaign_collaborations;
CREATE TRIGGER trg_set_collab_status_changed_at
  BEFORE UPDATE ON public.campaign_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.set_collab_status_changed_at();

-- ===========================================================================
-- Verification (run after applying)
-- ===========================================================================
-- 1. Both columns exist, both all-NULL, DEFAULT now() present for future inserts:
--      select table_name, column_name, column_default
--        from information_schema.columns
--       where table_schema='public'
--         and column_name in ('escrow_status_changed_at','status_changed_at');
--
--      select count(*) filter (where escrow_status_changed_at is not null) as should_be_zero
--        from public.campaigns;
--      select count(*) filter (where status_changed_at is not null) as should_be_zero
--        from public.campaign_collaborations;
--
-- 2. The campaigns trigger stamps on an ESCROW transition, and NOT on a status-only change —
--    this is the Codex finding above, so verify it explicitly (rollback-wrapped, touches nothing):
--      begin;
--        -- no-op edit -> must stay NULL
--        update public.campaigns set title = title
--         where id = (select id from public.campaigns limit 1)
--         returning escrow_status_changed_at as expect_null;
--        -- status-only change -> must STILL be NULL (the regression Codex caught)
--        update public.campaigns set status = status
--         where id = (select id from public.campaigns limit 1)
--         returning escrow_status_changed_at as expect_null_too;
--        -- escrow transition -> must stamp now()
--        update public.campaigns set escrow_status = 'held'
--         where id = (select id from public.campaigns where escrow_status is distinct from 'held' limit 1)
--         returning escrow_status_changed_at as expect_now;
--      rollback;
