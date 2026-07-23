-- Allow 'failed' as a campaigns.posting_schedule_status value.
--
-- confirm-posting-schedule ALREADY writes posting_schedule_status='failed' when every post fails to
-- schedule (`failedCount > 0 && scheduledCount === 0`), and the frontend ALREADY renders a complete
-- "Schedule Failed" card for it (src/components/schedule/CampaignScheduleSection.tsx). But the CHECK
-- from 20260527100000 never included 'failed', so the UPDATE silently errored (the edge function only
-- console.errors an update failure) — leaving the status stuck at 'pending_review' and the built
-- 'failed' UI branch unreachable dead code. Same recorded-vs-intended gap as the content_status drift.
--
-- Pure expansion: no existing row uses 'failed' (it was never writable), so the ADD cannot fail.
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_posting_schedule_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_posting_schedule_status_check
  CHECK (posting_schedule_status IN (
    'not_configured', 'configured', 'pending_review',
    'scheduled', 'in_progress', 'completed', 'failed'
  ));
