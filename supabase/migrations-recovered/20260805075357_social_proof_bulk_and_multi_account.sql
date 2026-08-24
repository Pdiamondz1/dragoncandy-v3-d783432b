-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260805075357 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

create or replace function public.get_public_social_proof(p_user_id uuid)
returns table (connected_count integer, platform text, followers numeric)
language sql stable security definer set search_path = public
as $$
  with visible as (
    select 1
    where exists (select 1 from public.creator_profiles cp where cp.user_id = p_user_id and cp.profile_visibility = 'public')
       or exists (select 1 from public.business_profiles bp where bp.user_id = p_user_id and bp.profile_visibility = 'public')
  ),
  conns as (
    select count(*)::integer as c from public.business_outstand_accounts a
    where a.user_id = p_user_id and a.status = 'active'
  ),
  per_account as (
    select distinct on (s.outstand_account_id) s.outstand_account_id, s.platform, s.metric_value
    from public.social_analytics_cache s
    where s.user_id = p_user_id and s.metric_type = 'followers'
    order by s.outstand_account_id, s.period_end desc, s.fetched_at desc
  ),
  per_platform as (
    select platform, sum(metric_value) as followers from per_account group by platform
  )
  select (select c from conns), p.platform, p.followers
  from visible, per_platform p
  union all
  select (select c from conns), null::text, null::numeric
  from visible where not exists (select 1 from per_platform);
$$;

create or replace function public.get_public_social_proof_bulk(p_user_ids uuid[])
returns table (user_id uuid, platform text, followers numeric)
language sql stable security definer set search_path = public
as $$
  with targets as (
    select u.id from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u(id)
    where exists (select 1 from public.creator_profiles cp where cp.user_id = u.id and cp.profile_visibility = 'public')
       or exists (select 1 from public.business_profiles bp where bp.user_id = u.id and bp.profile_visibility = 'public')
  ),
  per_account as (
    select distinct on (s.outstand_account_id) s.user_id, s.outstand_account_id, s.platform, s.metric_value
    from public.social_analytics_cache s
    join targets t on t.id = s.user_id
    where s.metric_type = 'followers'
    order by s.outstand_account_id, s.period_end desc, s.fetched_at desc
  )
  select pa.user_id, pa.platform, sum(pa.metric_value) as followers
  from per_account pa group by pa.user_id, pa.platform;
$$;

comment on function public.get_public_social_proof_bulk(uuid[]) is
  'Bulk public social proof for browse grids. Per-target visibility gate; returns only user_id, platform and summed follower counts.';

revoke all on function public.get_public_social_proof(uuid) from public, anon;
grant execute on function public.get_public_social_proof(uuid) to authenticated;
revoke all on function public.get_public_social_proof_bulk(uuid[]) from public, anon;
grant execute on function public.get_public_social_proof_bulk(uuid[]) to authenticated;
