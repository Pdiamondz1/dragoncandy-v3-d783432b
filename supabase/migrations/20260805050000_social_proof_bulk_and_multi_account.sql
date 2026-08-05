-- Two corrections to get_public_social_proof, plus the bulk variant that Browse
-- Creators needs.
--
-- 1. MULTI-ACCOUNT UNDERSTATEMENT. The first version used
--    `distinct on (platform)`, which collapses a user with TWO Instagram accounts
--    to a single one — their follower total silently understated. The cache's key
--    includes outstand_account_id, so the correct shape is: take the newest window
--    PER ACCOUNT, then SUM across accounts within a platform.
--
-- 2. BULK READS. `src/pages/BrandCreators.tsx` bulk-queries social_analytics_cache
--    with `.in('user_id', …)` for OTHER creators, to drive follower filters and
--    sorting. Own-row RLS returns nothing, so minimum-follower filters exclude
--    everyone and follower sort treats all creators as zero. That is ALREADY the
--    behaviour on prod — the permissive policy was removed there long ago — so
--    this restores a capability rather than compensating for the drop. One row per
--    call per creator would be N round-trips on a browse grid, hence the array form.
--
-- Both keep the identical visibility gate: the TARGET must have published a public
-- profile. Nothing here widens what a caller can see about a private user.

create or replace function public.get_public_social_proof(p_user_id uuid)
returns table (connected_count integer, platform text, followers numeric)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select 1
    where exists (
      select 1 from public.creator_profiles cp
      where cp.user_id = p_user_id and cp.profile_visibility = 'public'
    ) or exists (
      select 1 from public.business_profiles bp
      where bp.user_id = p_user_id and bp.profile_visibility = 'public'
    )
  ),
  conns as (
    select count(*)::integer as c
    from public.business_outstand_accounts a
    where a.user_id = p_user_id and a.status = 'active'
  ),
  -- Newest window per ACCOUNT first...
  per_account as (
    select distinct on (s.outstand_account_id)
           s.outstand_account_id, s.platform, s.metric_value
    from public.social_analytics_cache s
    where s.user_id = p_user_id
      and s.metric_type = 'followers'
    order by s.outstand_account_id, s.period_end desc, s.fetched_at desc
  ),
  -- ...then sum across a platform's accounts.
  per_platform as (
    select platform, sum(metric_value) as followers
    from per_account
    group by platform
  )
  select (select c from conns), p.platform, p.followers
  from visible, per_platform p
  union all
  select (select c from conns), null::text, null::numeric
  from visible
  where not exists (select 1 from per_platform);
$$;

-- Bulk variant for browse grids. Same gate, applied per target.
create or replace function public.get_public_social_proof_bulk(p_user_ids uuid[])
returns table (user_id uuid, platform text, followers numeric)
language sql
stable
security definer
set search_path = public
as $$
  with targets as (
    -- Gate EVERY id independently. A private creator in the array simply drops
    -- out; the caller cannot tell a private profile from one with no metrics.
    select u.id
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u(id)
    where exists (
      select 1 from public.creator_profiles cp
      where cp.user_id = u.id and cp.profile_visibility = 'public'
    ) or exists (
      select 1 from public.business_profiles bp
      where bp.user_id = u.id and bp.profile_visibility = 'public'
    )
  ),
  per_account as (
    select distinct on (s.outstand_account_id)
           s.user_id, s.outstand_account_id, s.platform, s.metric_value
    from public.social_analytics_cache s
    join targets t on t.id = s.user_id
    where s.metric_type = 'followers'
    order by s.outstand_account_id, s.period_end desc, s.fetched_at desc
  )
  select pa.user_id, pa.platform, sum(pa.metric_value) as followers
  from per_account pa
  group by pa.user_id, pa.platform;
$$;

comment on function public.get_public_social_proof_bulk(uuid[]) is
  'Bulk public social proof for browse grids. Per-target visibility gate; returns only user_id, platform and summed follower counts.';

revoke all on function public.get_public_social_proof(uuid) from public, anon;
grant execute on function public.get_public_social_proof(uuid) to authenticated;
revoke all on function public.get_public_social_proof_bulk(uuid[]) from public, anon;
grant execute on function public.get_public_social_proof_bulk(uuid[]) to authenticated;
