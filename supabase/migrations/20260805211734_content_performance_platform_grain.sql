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

-- Fix round 1 (coordinator review, CRITICAL). get_creator_brief_performance
-- (20260612010000_content_engine_unmeasured_brief_performance.sql) picks the
-- most-mature snapshot per post via `distinct on (cp.outstand_post_id)` --
-- verified as the LIVE prod definition before this edit. That was correct
-- only under the OLD grain, where a post had at most one row per milestone
-- regardless of platform. Under the new grain a fanned-out post now has up
-- to 3 x platforms rows; `distinct on (outstand_post_id)` alone keeps
-- exactly ONE platform's row per post (whichever wins the milestone/
-- captured_at tiebreak) and silently discards the rest -- e.g. an
-- Instagram+YouTube post: capture writes 6 rows, this RPC returns only
-- Instagram's 1,200 views and drops YouTube's 1,388, non-deterministically,
-- with nothing indicating a drop. Before the grain change this query
-- returned the cross-account aggregate (the correct total); left
-- unfixed here, this is a regression from a right number to a silently
-- wrong one, in exactly the fan-out case this migration exists to enable.
-- Ships in the SAME migration as the grain change -- they are one atomic
-- correctness step, and applying them separately would leave a live window
-- where briefs undercount. Same signature/return type as the live
-- definition, so CREATE OR REPLACE is sufficient (no DROP needed) and
-- existing grants are preserved untouched.
create or replace function public.get_creator_brief_performance(result_limit int default 10)
returns table (
  brief_id              uuid,
  organization_id       uuid,
  created_at            timestamptz,
  used_performance_data boolean,
  brief                 jsonb,
  is_posted             boolean,
  post_count            bigint,
  measurable_post_count bigint,
  total_views           numeric,
  total_likes           numeric,
  total_comments        numeric,
  total_shares          numeric,
  avg_engagement_rate   numeric,
  last_captured_at      timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with latest as (
    -- A post now has up to 3 x platforms rows (24h/72h/7d per platform;
    -- unique(outstand_post_id, platform, milestone)). Keep the most-mature
    -- snapshot per (post, platform) so cross-post sums don't multiply-count
    -- WITHIN a platform, while still summing ACROSS platforms below. The
    -- distinct on key (outstand_post_id, platform) MUST lead the ORDER BY;
    -- milestone rank uses a CASE (the text milestone must not be sorted
    -- lexically).
    select distinct on (cp.outstand_post_id, cp.platform)
      cp.source_brief_id,
      cp.outstand_post_id,
      cp.views, cp.likes, cp.comments, cp.shares, cp.engagement_rate, cp.captured_at,
      -- "measurable" = Outstand returned at least one per-account metrics entry for this post.
      -- Guard the jsonb access: raw may be null or metrics_by_account may be absent/non-array.
      (coalesce(
         jsonb_array_length(
           case when jsonb_typeof(cp.raw->'metrics_by_account') = 'array'
                then cp.raw->'metrics_by_account'
                else '[]'::jsonb
           end
         ), 0
       ) > 0) as measurable
    from public.content_performance cp
    where cp.source_brief_id is not null
    order by
      cp.outstand_post_id,
      cp.platform,
      case cp.milestone when '7d' then 3 when '72h' then 2 when '24h' then 1 else 0 end desc,
      cp.captured_at desc
  )
  select
    b.id                               as brief_id,
    b.organization_id,
    b.created_at,
    b.used_performance_data,
    b.brief,
    (b.social_post_log_id is not null) as is_posted,
    count(latest.outstand_post_id)     as post_count,   -- counts non-null only -> 0 when no perf
    count(latest.outstand_post_id) filter (where latest.measurable)
                                       as measurable_post_count,  -- 0 when posts exist but none measurable
    sum(latest.views)                  as total_views,
    sum(latest.likes)                  as total_likes,
    sum(latest.comments)               as total_comments,
    sum(latest.shares)                 as total_shares,
    avg(latest.engagement_rate)        as avg_engagement_rate,  -- simple mean of per-(post,platform) rates
    max(latest.captured_at)            as last_captured_at
  from public.content_briefs b
  left join latest on latest.source_brief_id = b.id
  where b.creator_id = (select auth.uid())
  group by b.id
  order by b.created_at desc
  limit greatest(result_limit, 0);
$$;
