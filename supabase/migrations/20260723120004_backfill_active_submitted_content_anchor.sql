-- Belt-and-suspenders backfill: give any ACTIVE 'submitted' collaboration that predates the
-- content_submitted_at trigger (20260710120007) a review-window anchor, so the newly-revived
-- auto-approval cron — which keys off content_submitted_at (see 20260723120000 +
-- auto-approve-content) — can process it instead of stranding it forever.
--
-- In prod this touches 0 rows: no collaboration is currently in 'submitted', AND submitted_at was
-- never populated (the RPC that set it never existed in prod, so its column stayed NULL). That also
-- means a submitted_at-only fallback in the cron query would be ineffective here — the correct fix
-- for a genuinely-stuck legacy row is to backfill the anchor, which is what this does. It makes the
-- repair robust for any environment/future state that DOES have a legacy stuck 'submitted' row.
--
-- COALESCE order: content_submitted_at (already set) → submitted_at → updated_at → created_at —
-- the best available approximation of the submission time. Idempotent: once the anchor is set the
-- WHERE excludes the row.
UPDATE public.campaign_collaborations
SET content_submitted_at = COALESCE(content_submitted_at, submitted_at, updated_at, created_at)
WHERE content_status = 'submitted'
  AND content_submitted_at IS NULL;
