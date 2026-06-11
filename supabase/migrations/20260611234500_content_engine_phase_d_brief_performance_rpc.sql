-- Content Engine Phase D — creator-scoped read of their own briefs + the engagement their
-- brief-originated content earned. Bridges the cross-user RLS gap Phase C left: content_performance
-- rows are owned by the PUBLISHER (often the restaurant who clicked "Post Now"), but a brief's author
-- is the CREATOR. This SECURITY DEFINER body is gated on content_briefs.creator_id = auth.uid(), so
-- it can only ever surface briefs the caller authored and the performance linked to them via
-- source_brief_id. The content_performance table RLS stays owner-only (writes remain unforgeable).
create or replace function public.get_creator_brief_performance(result_limit int default 10)
returns table (
  brief_id              uuid,
  organization_id       uuid,
  created_at            timestamptz,
  used_performance_data boolean,
  brief                 jsonb,
  is_posted             boolean,
  post_count            bigint,
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
      cp.views, cp.likes, cp.comments, cp.shares, cp.engagement_rate, cp.captured_at
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

-- A fresh SECURITY DEFINER fn in public is a public RPC by default (advisors 0028/0029).
-- Revoke public/anon; grant authenticated (the frontend calls it; auth.uid() is the authorization).
revoke execute on function public.get_creator_brief_performance(int) from public, anon;
grant  execute on function public.get_creator_brief_performance(int) to authenticated;
