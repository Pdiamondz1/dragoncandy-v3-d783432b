-- Content Engine — honest "engagement not available" signal.
--
-- WHY: Outstand exposes NO reliable way to know a published post was deleted/archived on the platform
-- (the analytics endpoint has no status/deleted field; webhooks are post.published/post.error only).
-- The only observable correlate of "we cannot measure this post" is an EMPTY metrics_by_account[] in
-- the analytics payload — which the capture stores in content_performance.raw. That empty array is
-- ambiguous (deleted, archived, account disconnected, or analytics not yet populated are
-- indistinguishable), but it is reliably distinct from a *measured* zero (a live, measurable post
-- returns >=1 per-account entry, even when all its counts are 0).
--
-- This replaces get_creator_brief_performance to surface that distinction via measurable_post_count,
-- so the creator card can show "Engagement not available" instead of falsely implying a measured
-- "0 views". Additive change only (one new output column); the latest-milestone reduce-then-sum and
-- the cross-user RLS gating are unchanged.
--
-- Adding the measurable_post_count OUT column changes the function's return type, so Postgres
-- requires a DROP before re-create (create-or-replace cannot alter OUT params). The drop+create runs
-- in one migration transaction, so there is no window where the RPC is missing.
drop function if exists public.get_creator_brief_performance(int);

create function public.get_creator_brief_performance(result_limit int default 10)
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
    -- A post has up to 3 rows (24h/72h/7d; unique(outstand_post_id, milestone)). Keep the
    -- most-mature snapshot per post so cross-post sums don't multiply-count. The distinct on key
    -- (outstand_post_id) MUST lead the ORDER BY; milestone rank uses a CASE (the text milestone
    -- must not be sorted lexically).
    select distinct on (cp.outstand_post_id)
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
    avg(latest.engagement_rate)        as avg_engagement_rate,  -- simple mean of per-post rates
    max(latest.captured_at)            as last_captured_at
  from public.content_briefs b
  left join latest on latest.source_brief_id = b.id
  where b.creator_id = (select auth.uid())
  group by b.id
  order by b.created_at desc
  limit greatest(result_limit, 0);
$$;

-- A SECURITY DEFINER fn in public is a public RPC by default (advisors 0028/0029).
-- Revoke public/anon; grant authenticated (the frontend calls it; auth.uid() is the authorization).
revoke execute on function public.get_creator_brief_performance(int) from public, anon;
grant  execute on function public.get_creator_brief_performance(int) to authenticated;
