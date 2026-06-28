-- Dragon Rewards Engine (DRE) v1 — config, ledger, balances, public tier view,
-- and the two service-role RPCs the award engine calls. All user FKs -> profiles(id).

-- 1. Config (admin-tunable, no code deploy) ----------------------------------
create table if not exists public.dre_config (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique,
  config_value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.dre_config enable row level security;

drop policy if exists "dre_config_auth_select" on public.dre_config;
create policy "dre_config_auth_select" on public.dre_config
  for select to authenticated using (true);

drop policy if exists "dre_config_admin_write" on public.dre_config;
create policy "dre_config_admin_write" on public.dre_config
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Ledger (append-only; (user_id,event_type,source_id) = idempotency key) ----
create table if not exists public.dragon_point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  points_awarded int not null,
  multiplier_applied numeric not null default 1.0,  -- reserved for Phase 3 boosts
  source_id uuid not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, source_id)
);
create index if not exists idx_dragon_point_events_user on public.dragon_point_events (user_id);
alter table public.dragon_point_events enable row level security;

drop policy if exists "dragon_point_events_own_select" on public.dragon_point_events;
create policy "dragon_point_events_own_select" on public.dragon_point_events
  for select to authenticated using (auth.uid() = user_id);

-- 3. Balances (materialized cache; recomputed from the ledger) -----------------
create table if not exists public.dragon_point_balances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_earned int not null default 0,
  total_redeemed int not null default 0,   -- reserved for Phase 5 redemption
  balance int not null default 0,
  tier text not null default 'egg',
  last_activity_at timestamptz,
  streak_days int not null default 0,       -- reserved for Phase 3 streaks
  streak_last_updated date
);
alter table public.dragon_point_balances enable row level security;

drop policy if exists "dragon_point_balances_own_select" on public.dragon_point_balances;
create policy "dragon_point_balances_own_select" on public.dragon_point_balances
  for select to authenticated using (auth.uid() = user_id);

-- 4. Public tier view — exposes ONLY tier, never balance. Mirrors the existing
--    public_* profile views (owner-rights view => underlying RLS not applied;
--    grant select to anon so public profiles can render the badge).
create or replace view public.public_dragon_tiers as
  select user_id, tier from public.dragon_point_balances;
grant select on public.public_dragon_tiers to anon, authenticated;

-- 5. RPC: pending awards (anti-join — source rows lacking a ledger row) --------
create or replace function public.dre_pending_events()
returns table (user_id uuid, role text, event_type text, source_id uuid, occurred_at timestamptz)
language sql
security definer
set search_path = public
as $$
  -- CREATOR ------------------------------------------------------------------
  select cp.user_id, 'content_creator', 'creator.profile_completed', cp.user_id, cp.updated_at
  from creator_profiles cp
  where cp.is_completed = true
    and not exists (select 1 from dragon_point_events e
      where e.user_id = cp.user_id and e.event_type = 'creator.profile_completed' and e.source_id = cp.user_id)
  union all
  select cp.user_id, 'content_creator', 'creator.first_social', cp.user_id, cp.updated_at
  from creator_profiles cp
  where coalesce(cp.instagram_url, cp.tiktok_url, cp.youtube_url, cp.facebook_url,
                 cp.linkedin_url, cp.x_url, cp.other_social_url) is not null
    and not exists (select 1 from dragon_point_events e
      where e.user_id = cp.user_id and e.event_type = 'creator.first_social' and e.source_id = cp.user_id)
  union all
  select p.creator_id, 'content_creator', 'creator.post_submitted', p.id, p.submitted_at
  from dragonshare_posts p
  where not exists (select 1 from dragon_point_events e
      where e.user_id = p.creator_id and e.event_type = 'creator.post_submitted' and e.source_id = p.id)
  union all
  select p.creator_id, 'content_creator', 'creator.first_post_bonus', p.creator_id, min(p.submitted_at)
  from dragonshare_posts p
  group by p.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = p.creator_id and e.event_type = 'creator.first_post_bonus' and e.source_id = p.creator_id)
  union all
  select a.creator_id, 'content_creator', 'creator.first_application', a.creator_id, min(a.created_at)
  from campaign_applications a
  group by a.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = a.creator_id and e.event_type = 'creator.first_application' and e.source_id = a.creator_id)
  union all
  select c.creator_id, 'content_creator', 'creator.first_campaign', c.creator_id,
         min(coalesce(c.completed_at, c.updated_at))
  from campaign_collaborations c
  where c.status = 'completed'
  group by c.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = c.creator_id and e.event_type = 'creator.first_campaign' and e.source_id = c.creator_id)
  union all
  select pay.creator_id, 'content_creator', 'creator.first_boost', pay.creator_id, min(pay.processed_at)
  from dragonshare_payouts pay
  where pay.status = 'succeeded'
  group by pay.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = pay.creator_id and e.event_type = 'creator.first_boost' and e.source_id = pay.creator_id)
  union all
  select rv.reviewee_id, 'content_creator', 'creator.five_star', rv.id, rv.created_at
  from project_reviews rv
  where rv.review_type = 'business_to_creator' and rv.rating = 5
    and not exists (select 1 from dragon_point_events e
      where e.user_id = rv.reviewee_id and e.event_type = 'creator.five_star' and e.source_id = rv.id)
  union all
  -- creator campaign milestones (3/10/25/50) — occurred_at = the Nth completion
  select m.creator_id, 'content_creator', 'creator.milestone_campaigns_' || m.threshold::text,
         m.creator_id, m.occurred_at
  from (
    select c.creator_id, t.threshold,
           (array_agg(coalesce(c.completed_at, c.updated_at)
                      order by coalesce(c.completed_at, c.updated_at)))[t.threshold] as occurred_at,
           count(*) as cnt
    from campaign_collaborations c
    cross join (values (3),(10),(25),(50)) as t(threshold)
    where c.status = 'completed'
    group by c.creator_id, t.threshold
  ) m
  where m.cnt >= m.threshold
    and not exists (select 1 from dragon_point_events e
      where e.user_id = m.creator_id
        and e.event_type = 'creator.milestone_campaigns_' || m.threshold::text
        and e.source_id = m.creator_id)
  union all
  -- BUSINESS -----------------------------------------------------------------
  select bp.user_id, 'business_client', 'business.profile_completed', bp.user_id, bp.updated_at
  from business_profiles bp
  where bp.is_completed = true
    and not exists (select 1 from dragon_point_events e
      where e.user_id = bp.user_id and e.event_type = 'business.profile_completed' and e.source_id = bp.user_id)
  union all
  select oa.user_id, 'business_client', 'business.first_social', oa.user_id, min(oa.connected_at)
  from business_outstand_accounts oa
  where oa.status = 'active'
  group by oa.user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = oa.user_id and e.event_type = 'business.first_social' and e.source_id = oa.user_id)
  union all
  select ca.user_id, 'business_client', 'business.first_campaign_created', ca.user_id, min(ca.created_at)
  from campaigns ca
  group by ca.user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = ca.user_id and e.event_type = 'business.first_campaign_created' and e.source_id = ca.user_id)
  union all
  -- each campaign that ever left draft (progression-safe; NOT status='published')
  select ca.user_id, 'business_client', 'business.campaign_launched', ca.id, ca.created_at
  from campaigns ca
  where ca.status <> 'draft'
    and not exists (select 1 from dragon_point_events e
      where e.user_id = ca.user_id and e.event_type = 'business.campaign_launched' and e.source_id = ca.id)
  union all
  select ca.user_id, 'business_client', 'business.first_campaign', ca.user_id, min(ca.updated_at)
  from campaigns ca
  where ca.status = 'completed'
  group by ca.user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = ca.user_id and e.event_type = 'business.first_campaign' and e.source_id = ca.user_id)
  union all
  select b.boosting_user_id, 'business_client', 'business.boost_given', b.id, b.boosted_at
  from dragonshare_boosts b
  where b.status in ('captured', 'transferred')
    and not exists (select 1 from dragon_point_events e
      where e.user_id = b.boosting_user_id and e.event_type = 'business.boost_given' and e.source_id = b.id)
  union all
  select b.boosting_user_id, 'business_client', 'business.first_boost_bonus', b.boosting_user_id, min(b.boosted_at)
  from dragonshare_boosts b
  where b.status in ('captured', 'transferred')
  group by b.boosting_user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = b.boosting_user_id and e.event_type = 'business.first_boost_bonus' and e.source_id = b.boosting_user_id)
  union all
  select rv.reviewer_id, 'business_client', 'business.rate_creator', rv.id, rv.created_at
  from project_reviews rv
  where rv.review_type = 'business_to_creator'
    and not exists (select 1 from dragon_point_events e
      where e.user_id = rv.reviewer_id and e.event_type = 'business.rate_creator' and e.source_id = rv.id)
  union all
  select rv.reviewer_id, 'business_client', 'business.five_star_bonus', rv.id, rv.created_at
  from project_reviews rv
  where rv.review_type = 'business_to_creator' and rv.rating = 5
    and not exists (select 1 from dragon_point_events e
      where e.user_id = rv.reviewer_id and e.event_type = 'business.five_star_bonus' and e.source_id = rv.id)
  union all
  -- business campaign milestones (5/10/25/50) — campaigns has no completed_at
  select m.user_id, 'business_client', 'business.milestone_campaigns_' || m.threshold::text,
         m.user_id, m.occurred_at
  from (
    select ca.user_id, t.threshold,
           (array_agg(ca.updated_at order by ca.updated_at))[t.threshold] as occurred_at,
           count(*) as cnt
    from campaigns ca
    cross join (values (5),(10),(25),(50)) as t(threshold)
    where ca.status = 'completed'
    group by ca.user_id, t.threshold
  ) m
  where m.cnt >= m.threshold
    and not exists (select 1 from dragon_point_events e
      where e.user_id = m.user_id
        and e.event_type = 'business.milestone_campaigns_' || m.threshold::text
        and e.source_id = m.user_id);
$$;

-- 6. RPC: post-insert aggregates for balance + tier --------------------------
create or replace function public.dre_user_aggregates(p_user_ids uuid[])
returns table (user_id uuid, role text, balance int, last_activity_at timestamptz,
               campaigns_completed int, avg_rating numeric)
language sql
security definer
set search_path = public
as $$
  select
    pr.id,
    pr.role::text,
    coalesce((select sum(e.points_awarded) from dragon_point_events e where e.user_id = pr.id), 0)::int,
    (select max(e.occurred_at) from dragon_point_events e where e.user_id = pr.id),
    case when pr.role = 'content_creator'
         then (select count(*) from campaign_collaborations c where c.creator_id = pr.id and c.status = 'completed')
         else (select count(*) from campaigns ca where ca.user_id = pr.id and ca.status = 'completed')
    end::int,
    (select avg(rv.rating) from project_reviews rv
       where rv.reviewee_id = pr.id and rv.review_type = 'business_to_creator')
  from profiles pr
  where pr.id = any(p_user_ids);
$$;

-- Service-role only (the engine). Supabase grants EXECUTE to anon/authenticated via
-- DEFAULT PRIVILEGES, so `from public` alone is NOT enough — revoke from anon and
-- authenticated explicitly (these SECURITY DEFINER RPCs return cross-user data).
revoke execute on function public.dre_pending_events() from public, anon, authenticated;
revoke execute on function public.dre_user_aggregates(uuid[]) from public, anon, authenticated;
grant execute on function public.dre_pending_events() to service_role;
grant execute on function public.dre_user_aggregates(uuid[]) to service_role;

-- 7. Seed config (point values + tier thresholds + go-live cutover). go_live_at
--    seeds to a FAR-FUTURE sentinel so EVERY event is treated as backfill (silent)
--    until the founder sets it to the real cutover at go-live (Task 11 Step 4),
--    which then enables forward bells. Removes the "bells fire during backfill" footgun.
insert into public.dre_config (config_key, config_value) values
  ('point_values', '{
    "creator.profile_completed":250,"creator.first_social":150,"creator.post_submitted":75,
    "creator.first_post_bonus":225,"creator.first_application":200,"creator.first_campaign":1000,
    "creator.first_boost":400,"creator.five_star":250,
    "creator.milestone_campaigns_3":1000,"creator.milestone_campaigns_10":3000,
    "creator.milestone_campaigns_25":5000,"creator.milestone_campaigns_50":10000,
    "business.profile_completed":200,"business.first_social":200,"business.first_campaign_created":500,
    "business.first_campaign":1000,"business.campaign_launched":150,"business.boost_given":300,
    "business.first_boost_bonus":50,"business.rate_creator":100,"business.five_star_bonus":100,
    "business.milestone_campaigns_5":1500,"business.milestone_campaigns_10":3000,
    "business.milestone_campaigns_25":5000,"business.milestone_campaigns_50":10000
  }'::jsonb),
  ('tier_thresholds', '{
    "creator":[
      {"key":"egg","min_dp":0},
      {"key":"scout","min_dp":500,"min_campaigns":3},
      {"key":"knight","min_dp":2500,"min_campaigns":10,"min_avg_rating":4.5},
      {"key":"master","min_dp":10000,"min_campaigns":50,"min_avg_rating":4.8},
      {"key":"legend","min_dp":50000}
    ],
    "business":[
      {"key":"egg","min_dp":0},
      {"key":"scout","min_dp":500,"min_campaigns":3},
      {"key":"knight","min_dp":2500,"min_campaigns":10},
      {"key":"master","min_dp":10000,"min_campaigns":50},
      {"key":"legend","min_dp":50000}
    ]
  }'::jsonb),
  ('go_live_at', '"2099-01-01T00:00:00Z"'::jsonb)   -- sentinel; founder sets real cutover at go-live
on conflict (config_key) do nothing;
