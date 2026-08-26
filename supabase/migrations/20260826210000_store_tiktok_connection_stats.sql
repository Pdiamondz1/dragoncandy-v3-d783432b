-- ---------------------------------------------------------------------------
-- store_tiktok_connection -- carry the profile stats we already fetched.
--
-- TWO defects, found by reading the first real connection's row rather than by
-- a test. `tumericturtle` connected successfully with `follower_count`,
-- `following_count`, `likes_count` and `video_count` all null.
--
-- 1. A COMMENT THAT ASSERTED A PROPERTY THE CODE DID NOT HAVE. The callback
--    reads the profile before storing, under a comment saying it does so "so
--    the row is written with a display name, handle AND STATS already in it. A
--    row that appears with everything null and fills in a second later reads
--    like a broken connect." `fetchAccount` does return the stats -- the
--    `user.info.stats` scope is granted and requested -- and then
--    `store_tiktok_connection` was never given them. The code did the exact
--    thing its own comment warned against. Third time on this branch that a
--    comment claimed something the code did not do; Codex caught the other two.
--    A comment is a claim, and nothing tests it.
--
-- 2. THE WORSE ONE: A RECONNECT KEPT THE PREVIOUS ACCOUNT'S NUMBERS. The
--    `on conflict` branch did not list the four stats columns, so it left them
--    untouched -- while correctly resetting `last_synced_at`, `insights` and
--    `insights_cached_at`. A reconnect can be to a DIFFERENT TikTok account,
--    and the old RPC's own comment says so in as many words: "those numbers may
--    describe someone else." It then left four columns doing precisely that.
--    A stale follower count attributed to a new account is a fabrication, not a
--    staleness bug -- see [[Honest Analytics]]. That is why the update below
--    sets all four from `excluded` unconditionally rather than coalescing:
--    null from the new account must overwrite a number from the old one.
--
-- DROP THEN CREATE, NOT `create or replace`. A different parameter list makes a
-- new OVERLOAD, not a replacement -- both would exist, and PostgREST would
-- happily keep resolving a 12-argument call to the old body. Dropping also
-- takes the grants with it, so they are re-issued below; the drop is scoped to
-- the exact old signature so it cannot take anything else.
--
-- Nothing else calls this function (checked: one call site, the callback).
-- ---------------------------------------------------------------------------

drop function if exists public.store_tiktok_connection(
  uuid, text, text, text, text, text, text, text[], text, timestamptz, text, timestamptz
);

create function public.store_tiktok_connection(
  p_user_id uuid,
  p_open_id text,
  p_union_id text,
  p_display_name text,
  p_username text,
  p_avatar_url text,
  p_profile_deep_link text,
  p_follower_count integer,
  p_following_count integer,
  p_likes_count integer,
  p_video_count integer,
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

  -- One key for every operation on this grant. Three different keys is exactly
  -- the defect Codex found on the X connector at round 7.
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
    -- null from the new one MUST overwrite a number from the old one. See the
    -- header, defect 2.
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
    -- Reset, never carried over. `last_synced_at` is this family's acceptance
    -- signal: it must describe a read against THIS grant or nothing at all.
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
  integer, integer, integer, integer,
  text[], text, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.store_tiktok_connection(
  uuid, text, text, text, text, text, text,
  integer, integer, integer, integer,
  text[], text, timestamptz, text, timestamptz
) to service_role;
