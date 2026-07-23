-- ============================================================
-- One-time backfill: align final_approval_status with the restored trigger
-- ============================================================
-- trg_recompute_final_approval (restored in 20260723120000) only fires on FUTURE updates
-- of brand_approval_status / restaurant_approval_status. Applications whose approval
-- columns changed while the trigger was missing kept a STALE final_approval_status.
--
-- In prod on 2026-07-23 this was 15 rows, all NON-sponsored and already status='accepted'
-- (0 active sponsorships) — so none were functionally stuck (the non-sponsored accept path
-- sets `status` directly and creates the collaboration off `status`, not final_approval_status).
-- But the secondary column was inconsistent, so this one-time backfill recomputes it with
-- the exact trigger logic.
--
-- Safe: updates final_approval_status ONLY. The recompute trigger is scoped to
-- `UPDATE OF brand_approval_status, restaurant_approval_status`, so it does NOT fire here;
-- forbid_application_campaign_change is untouched (no campaign_id change); the nudge/auto-org
-- triggers are INSERT-only. Verified in a rolled-back dry-run: 0 stale rows remain after.
-- ============================================================

UPDATE public.campaign_applications ca
SET final_approval_status = c.computed
FROM (
  SELECT a.id,
    CASE WHEN EXISTS (SELECT 1 FROM public.campaign_sponsorships cs
                      WHERE cs.campaign_id = a.campaign_id AND cs.status IN ('accepted','active'))
      THEN CASE
             WHEN a.brand_approval_status='approved' AND a.restaurant_approval_status='approved' THEN 'approved'
             WHEN a.brand_approval_status='rejected' OR a.restaurant_approval_status='rejected' THEN 'rejected'
             ELSE 'pending' END
      ELSE a.restaurant_approval_status
    END AS computed
  FROM public.campaign_applications a
) c
WHERE ca.id = c.id
  AND ca.final_approval_status IS DISTINCT FROM c.computed;
