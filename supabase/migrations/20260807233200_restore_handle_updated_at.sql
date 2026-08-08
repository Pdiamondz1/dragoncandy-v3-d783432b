-- Restore public.handle_updated_at() from a no-op stub to the definition the repo already carries.
--
-- THIS IS DRIFT REPAIR, NOT A FEATURE CHANGE. On prod the function body is literally:
--     BEGIN
--         -- Function logic here
--         RETURN NEW;
--     END;
-- It never assigns NEW.updated_at, so every trigger wired to it fires and does nothing. Both repo
-- definitions (20250616011059_*.sql:287-293 and 20250617123640_*.sql:350-356) already say
-- `NEW.updated_at = now()`. Production diverged from the repo — the same "recorded ≠ actual" class
-- as the collaboration state machine repaired in PR #325.
--
-- Blast radius: 31 tables carry a trigger bound to this function, and NONE of them has a competing
-- working updated_at trigger, so this is the sole mechanism everywhere. Audited before writing:
--
--   SAFE — all 34 explicit `updated_at` writers. 32 are SQL `updated_at = now()` inside RPCs, and
--   now() is transaction_timestamp(): the trigger's now() runs in the SAME transaction, so it is
--   the identical value, not a clobber. 2 are edge-function `new Date().toISOString()` writes
--   (refund-campaign-escrow, sync-seat-count) that get upgraded from an edge clock to the DB clock
--   — meaning preserved, skew removed. Precedent: business_outstand_accounts already has a real
--   touch trigger and six edge functions already write updated_at into it harmlessly.
--
--   SAFE — the entire frontend. Zero sites treat updated_at as stable, compare it to created_at,
--   filter on it, or key a cache on it. Three `.order('updated_at')` call sites are plain top-N
--   with no cursor, so rows reorder (correctly) with no skip/duplicate hazard.
--
--   FIXED FIRST — the two real hazards, both landed BEFORE this migration:
--     * donny-analytics-alerts filtered `.gte("updated_at", since)` on campaigns and
--       campaign_collaborations (3 sites). With a frozen column that is a "created in 24h" filter;
--       restoring the trigger would silently turn it into "modified in 24h" and emit
--       "Payment released" / "Revision requested" alerts for rows whose status never changed.
--       Repointed to created_at.
--
--       NOT quite byte-identical, and the edge-function review corrected an earlier claim here
--       that it was: `campaign_collaborations.updated_at` has ZERO explicit writers (so those two
--       blocks are exactly equivalent), but `campaigns.updated_at` has exactly one —
--       `accept_application_with_collaboration` sets `status='active', updated_at=now()` without
--       touching escrow_status. So an OLDER campaign (created before the window, escrow already
--       'held') that gets a creator accepted today matched the old filter and no longer matches.
--       Because an UPDATE can never predate its own INSERT, `updated_at >= created_at` always
--       holds, making this a PURE NARROWING: no row newly appears, a few stop alerting. Those
--       were mistimed anyway — a "payment" alert fired by an acceptance touch. Accepted
--       deliberately, recorded rather than discovered later.
--     * DRE occurred_at derived from updated_at (migration 20260807233100) would have dated old
--       milestones as fresh, clearing dre-award-engine's forward-only go_live_at gate.
--       Repointed to coalesce(completed_at, created_at), with campaigns.completed_at added by
--       20260807233000.
--
--   ACCEPTED — one one-shot backfill (20260526200000) dedups notifications on an exact
--   `updated_at` equality. It is a re-apply-only path (db reset / staging rebuild), not a live
--   request path, and it is already a no-op on prod. Noted rather than silently inherited.
--
-- ORDERING IS LOAD-BEARING: 20260807233000 and 20260807233100 must be applied BEFORE this file,
-- and the donny-analytics-alerts deploy must be live first. Reversed, there is a window in which
-- alerts misfire and milestone notifications fire retroactively.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Verification — expect `restored` = true (i.e. the body assigns NEW.updated_at):
--   select pg_get_functiondef(p.oid) ilike '%NEW.updated_at = now()%' as restored
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'handle_updated_at';
--
-- And a live round-trip on a low-stakes row (rollback-wrapped):
--   begin;
--     update public.feature_flags set updated_at = updated_at where id = (select id from public.feature_flags limit 1)
--       returning updated_at;  -- should equal now(), not the old value
--   rollback;
