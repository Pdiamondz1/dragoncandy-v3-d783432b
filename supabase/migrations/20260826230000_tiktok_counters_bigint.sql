-- ---------------------------------------------------------------------------
-- TikTok counters must be bigint, not integer.
--
-- Found by the Codex second review on the stats fix, and it is not theoretical.
-- `likes_count` is a LIFETIME total of likes across every video on the account.
-- PostgreSQL's signed `integer` tops out at 2,147,483,647. Real TikTok accounts
-- are already past it by a wide margin -- the largest creators carry likes in
-- the billions, and even mid-tier accounts with a few viral videos climb faster
-- than follower counts do.
--
-- THE FAILURE MODE IS NOT A WRONG NUMBER. It is:
--
--   1. `store_tiktok_connection` raises 22003 numeric_value_out_of_range,
--   2. the callback's error branch treats that as `storage_failed`,
--   3. and that branch REVOKES the token before returning -- correctly, by the
--      rule that a live grant is never abandoned.
--
-- So the account cannot connect, and loses its grant on every attempt, with an
-- error naming storage rather than the counter that overflowed. The population
-- that breaks is exactly the one worth having: the big creators. A cap that
-- excludes your best users while working perfectly for everyone you tested with
-- is the kind of bug that ships.
--
-- `follower_count`, `following_count` and `video_count` are nowhere near the
-- limit today. They are widened anyway: leaving three columns one viral decade
-- from the same bug, to save nothing, is not a saving. Widening integer ->
-- bigint is a metadata-only change in PostgreSQL for these types and rewrites
-- nothing.
--
-- BOTH RPCs have to move, not just the one this review was about.
-- `cache_tiktok_insights` writes the same four columns from the insights read
-- and declares them `integer` too, so fixing only the connect path would leave
-- the identical crash one endpoint over -- and there it would mark a healthy
-- connection failed on every refresh instead of at connect.
--
-- DROP THEN CREATE for both, for the reason 20260826210000 records: a different
-- parameter list makes an OVERLOAD, not a replacement. `cache_tiktok_insights`
-- is the sharper case, because its four counters have `default null` -- a call
-- that omits them would still resolve to whichever overload matched, silently,
-- with no error to notice. Grants are re-issued because the drop takes them.
-- ---------------------------------------------------------------------------

alter table public.tiktok_account_connections
  alter column follower_count  type bigint,
  alter column following_count type bigint,
  alter column likes_count     type bigint,
  alter column video_count     type bigint;

-- ---------------------------------------------------------------------------
-- store_tiktok_connection -- unchanged from 20260826210000 except the four
-- counter types. See that migration's header for why the stats are set from
-- `excluded` rather than coalesced.
-- ---------------------------------------------------------------------------

drop function if exists public.store_tiktok_connection(
  uuid, text, text, text, text, text, text,
  integer, integer, integer, integer,
  text[], text, timestamptz, text, timestamptz
);

create function public.store_tiktok_connection(
  p_user_id uuid,
  p_open_id text,
  p_union_id text,
  p_display_name text,
  p_username text,
  p_avatar_url text,
  p_profile_deep_link text,
  p_follower_count bigint,
  p_following_count bigint,
  p_likes_count bigint,
  p_video_count bigint,
  p_scopes text[],
  p_access_token text,
  p_access_token_expires_at timestamptz,
  p_refresh_token text,
  p_refresh_token_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_id text;
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    raise exception 'forbidden: service role required';
  end if;

  perform pg_advisory_xact_lock(hashtext('tiktok_grant:' || p_user_id::text));

  insert into public.tiktok_account_connections as t (
    user_id, open_id, union_id, display_name, username, avatar_url,
    profile_deep_link,
    follower_count, following_count, likes_count, video_count,
    scopes, access_token, access_token_expires_at,
    refresh_token, refresh_token_expires_at, status, last_error,
    connected_at, last_synced_at,
    insights, insights_cached_at,
    refresh_claimed_at, refresh_claim_id,
    disconnect_claimed_at, disconnect_claim_id
  )
  values (
    p_user_id, p_open_id, p_union_id, p_display_name, p_username, p_avatar_url,
    p_profile_deep_link,
    p_follower_count, p_following_count, p_likes_count, p_video_count,
    coalesce(p_scopes, '{}'), p_access_token,
    p_access_token_expires_at, p_refresh_token, p_refresh_token_expires_at,
    'active', null,
    now(), null,
    null, null,
    null, null,
    null, null
  )
  on conflict (user_id) do update set
    open_id                 = excluded.open_id,
    union_id                = excluded.union_id,
    display_name            = excluded.display_name,
    username                = excluded.username,
    avatar_url              = excluded.avatar_url,
    profile_deep_link       = excluded.profile_deep_link,
    -- Set, never coalesced. A reconnect can be to a different account, so a
    -- null from the new one MUST overwrite a number from the old one.
    follower_count          = excluded.follower_count,
    following_count         = excluded.following_count,
    likes_count             = excluded.likes_count,
    video_count             = excluded.video_count,
    scopes                  = excluded.scopes,
    access_token            = excluded.access_token,
    access_token_expires_at = excluded.access_token_expires_at,
    refresh_token           = excluded.refresh_token,
    refresh_token_expires_at = excluded.refresh_token_expires_at,
    status                  = 'active',
    last_error              = null,
    connected_at            = now(),
    last_synced_at          = null,
    insights                = null,
    insights_cached_at      = null,
    refresh_claimed_at      = null,
    refresh_claim_id        = null,
    disconnect_claimed_at   = null,
    disconnect_claim_id     = null
  returning t.open_id into v_open_id;

  return jsonb_build_object('stored', true, 'open_id', v_open_id);
end;
$$;

revoke execute on function public.store_tiktok_connection(
  uuid, text, text, text, text, text, text,
  bigint, bigint, bigint, bigint,
  text[], text, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.store_tiktok_connection(
  uuid, text, text, text, text, text, text,
  bigint, bigint, bigint, bigint,
  text[], text, timestamptz, text, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- cache_tiktok_insights -- unchanged from 20260826200000 except the four
-- counter types. Coalesce is correct HERE and wrong in the function above: this
-- one refreshes the SAME account (it returns `account_changed` if open_id moved),
-- so an absent stat should leave the last known value rather than erase it.
-- ---------------------------------------------------------------------------

drop function if exists public.cache_tiktok_insights(
  uuid, text, jsonb, integer, integer, integer, integer, text, text, text
);

create function public.cache_tiktok_insights(
  p_user_id uuid,
  p_open_id text,
  p_insights jsonb,
  p_follower_count bigint default null,
  p_following_count bigint default null,
  p_likes_count bigint default null,
  p_video_count bigint default null,
  p_display_name text default null,
  p_username text default null,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.tiktok_account_connections%rowtype;
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    raise exception 'forbidden: service role required';
  end if;

  select * into v_conn
  from public.tiktok_account_connections
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('cached', false, 'reason', 'no_connection');
  end if;

  if v_conn.open_id is distinct from p_open_id then
    return jsonb_build_object('cached', false, 'reason', 'account_changed');
  end if;

  update public.tiktok_account_connections
  set insights = p_insights,
      insights_cached_at = now(),
      -- The stamp that cannot be faked by writing a row: it moves only when a
      -- call to TikTok actually returned.
      last_synced_at = now(),
      follower_count = coalesce(p_follower_count, follower_count),
      following_count = coalesce(p_following_count, following_count),
      likes_count = coalesce(p_likes_count, likes_count),
      video_count = coalesce(p_video_count, video_count),
      display_name = coalesce(p_display_name, display_name),
      username = coalesce(p_username, username),
      avatar_url = coalesce(p_avatar_url, avatar_url)
  where user_id = p_user_id;

  return jsonb_build_object('cached', true);
end;
$$;

revoke execute on function public.cache_tiktok_insights(
  uuid, text, jsonb, bigint, bigint, bigint, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cache_tiktok_insights(
  uuid, text, jsonb, bigint, bigint, bigint, bigint, text, text, text
) to service_role;
