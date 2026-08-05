-- Task 5 made social_post_log one row per published ACCOUNT. This key had no
-- platform, so the second and third platform of a fanned-out post computed
-- due=[] and fell into the `skipped` counter -- the same bucket as "nothing due
-- yet". Found independently by the whole-branch review and by Codex.
--
-- Adding a column to a unique key only ever permits more rows, so no existing
-- row can violate the new constraint. Verified 2026-08-05 via read-only query
-- against prod (zocahiffooqdybdhguqv): 9 total content_performance rows, 0
-- with a null platform, and zero (outstand_post_id, platform, milestone)
-- groups with more than one row -- the new index applies cleanly.
drop index if exists public.uniq_content_perf_post_milestone;

create unique index if not exists uniq_content_perf_post_platform_milestone
  on public.content_performance (outstand_post_id, platform, milestone);
