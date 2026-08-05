-- Converge migrations with prod, and restore the capability prod lost.
--
-- THE DRIFT
-- ---------
-- `20260509000001_public_read_verified_stats.sql` created two `USING (true)`
-- SELECT policies — `authenticated_read_outstand_accounts` and
-- `authenticated_read_analytics_cache` — so any authenticated user could read
-- every user's rows. No later migration drops them, yet **neither exists on
-- prod**: they were removed by hand, outside migration history.
--
-- Recorded ≠ actual, in the more dangerous direction. Prod is safe; a FRESH
-- environment replaying migrations (staging, local, a restored branch) gets the
-- permissive policies and therefore a real cross-tenant read of every business's
-- follower/reach/engagement figures and provider account ids. That exposure got
-- materially worse when `account-metrics-capture` began filling
-- `social_analytics_cache` nightly for every connected account, where it had
-- previously held only rows a user's own browser wrote.
--
-- The stale file is also an active trap for readers: THREE separate automated
-- reviewers in one session flagged `USING (true)` as a live high-severity finding,
-- each reading this migration and reasonably assuming it reflected reality.
--
-- THE CAPABILITY THAT WENT WITH IT
-- --------------------------------
-- Those policies existed for a reason: VerifiedBadge (does this creator have any
-- active connection?) and VerifiedSocialStats (follower counts on a public
-- profile) read ANOTHER user's rows. `useVerifiedStatus` / `useCreatorSocialStats`
-- query `.eq('user_id', <the viewed user>)`, so under own-row RLS they match
-- nothing and both fail SILENTLY — the hooks treat an error as "not verified /
-- no stats". On prod today the badge never appears on anyone else's profile and
-- creator social stats render blank, on browse cards and public profiles alike.
--
-- So dropping the policies without a replacement would codify a silent feature
-- regression. Restoring them is not an option either: that is the leak. The fix
-- is a narrow, purpose-built read.

DROP POLICY IF EXISTS "authenticated_read_outstand_accounts" ON public.business_outstand_accounts;
DROP POLICY IF EXISTS "authenticated_read_analytics_cache" ON public.social_analytics_cache;

-- Exposes ONLY what the two UI surfaces need — a connection count and per-platform
-- follower totals — and only for a profile its owner has made public. Never
-- returns provider account ids, handles, reach, or engagement, all of which the
-- blanket policies did expose.
--
-- SECURITY DEFINER because the caller legitimately cannot read the target's rows;
-- the gate is the TARGET's own published visibility, not the caller's identity.
-- Mirrors the codebase's established cross-user read pattern.
create or replace function public.get_public_social_proof(p_user_id uuid)
returns table (connected_count integer, platform text, followers numeric)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    -- The target must have published a public profile, as either role. A user
    -- with no profile row, or a private one, yields no rows at all.
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
  -- Latest follower figure per platform. The cache holds one row per window, so
  -- without this a profile would sum 7d + 30d + 90d and treble its follower count.
  latest as (
    select distinct on (s.platform) s.platform, s.metric_value
    from public.social_analytics_cache s
    where s.user_id = p_user_id
      and s.metric_type = 'followers'   -- NOT 'engagement_rate'; the live
                                        -- vocabulary is followers|engagement|reach|posts
    order by s.platform, s.period_end desc, s.fetched_at desc
  )
  select (select c from conns), l.platform, l.metric_value
  from visible, latest l
  union all
  -- Still report the connection count when there are no cached metrics yet, so a
  -- freshly connected account is "verified" before the nightly capture runs.
  select (select c from conns), null::text, null::numeric
  from visible
  where not exists (select 1 from latest);
$$;

comment on function public.get_public_social_proof(uuid) is
  'Public social proof for a profile its owner made public: active-connection count and latest per-platform follower counts. Replaces the withdrawn USING(true) read policies; deliberately excludes account ids, handles, reach and engagement.';

revoke all on function public.get_public_social_proof(uuid) from public, anon;
grant execute on function public.get_public_social_proof(uuid) to authenticated;
