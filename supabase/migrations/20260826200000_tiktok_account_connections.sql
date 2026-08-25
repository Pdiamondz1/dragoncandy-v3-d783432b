-- TikTok read-only analytics connector.
--
-- The fifth direct platform connector under the 2026-08-23 scope decision:
-- Outstand publishes, direct APIs measure. Scopes are user.info.basic,
-- user.info.profile, user.info.stats and video.list. Nothing here can post --
-- the Content Posting API is deliberately not requested.
--
-- ===========================================================================
-- WHAT THIS DELIBERATELY DOES *NOT* COPY FROM THE X CONNECTOR
-- ===========================================================================
--
-- X carries THREE claim pairs -- refresh, insights-read and disconnect. This
-- table carries TWO, and the missing one is the point.
--
-- X's insights claim exists because X BILLS PER READ (~$0.005 a post read,
-- ~$0.010 a user read), so two tabs arriving after the cache expired would both
-- miss, both call X, and both be invoiced. Serialising the cache FILL is a cost
-- control.
--
-- TikTok's Display API is FREE. There is no per-call fee anywhere on its
-- developer portal; the constraint is a 600 requests/minute sliding window per
-- endpoint, which our scale does not approach. A duplicate read therefore costs
-- nothing, so `insights` / `insights_cached_at` here are a PLAIN cache with no
-- lock around them. Carrying X's machinery would be complexity whose entire
-- justification is absent -- and unjustified locking is not free either: every
-- lock is a place a claim can be stranded and block a user for a TTL.
--
-- The two locks that DO survive are correctness, not cost:
--
--   refresh    -- TikTok's refresh token ROTATES ("the returned refresh_token
--                 may be different than the one passed in; you must use the
--                 newly-returned token"). Two concurrent refreshes can leave us
--                 holding a token TikTok has already superseded, which is
--                 unrecoverable without the user re-consenting.
--   disconnect -- a disconnect racing a reconnect can delete the row the
--                 reconnect just wrote, destroying a live grant's only stored
--                 token. Same hazard the Facebook connector had to fix under
--                 lock in 20260825160000.
--
-- Both take the SAME advisory key, hashtext('tiktok_grant:' || user_id). Three
-- different keys is exactly the defect Codex found in the X connector at round
-- 7: three operations on one grant serialising against nothing.
--
-- ===========================================================================
-- OTHER PLATFORM FACTS THAT SHAPED THESE COLUMNS (from docs.tiktok.com, not
-- inferred from a sibling -- the Facebook connector shipped a real defect by
-- pattern-matching Instagram)
-- ===========================================================================
--
--   * Access token lives 86,400s (24 hours). Not X's 2 hours, not Instagram's
--     60 days, not a Facebook Page token's forever.
--   * Refresh token lives 31,536,000s (365 days). So unlike Instagram -- where
--     a connection nobody reads DIES, because Meta only extends a token that is
--     still valid -- a dormant TikTok connection survives a year and
--     refresh-on-expiry is the correct strategy. No dormancy sweep is needed,
--     and none is created.
--   * There IS a revoke endpoint (/v2/oauth/revoke/), unlike Instagram and
--     Facebook, which have none.
--   * `username` (the @handle) requires the user.info.profile scope; only
--     `display_name` comes with user.info.basic. Display names are NOT unique,
--     and this card's job is answering "which account is linked", so the scope
--     is requested -- but the connector fetches ONLY `username` and
--     `profile_deep_link` from it. A scope is not the same as what you fetch.
--     Do not start requesting bio_description or is_verified without deciding
--     to.

create table if not exists public.tiktok_account_connections (
  id uuid primary key default gen_random_uuid(),

  -- One TikTok account per user, like X and Instagram. Facebook is the odd one
  -- out with many Pages per grant.
  user_id uuid not null unique references auth.users (id) on delete cascade,

  -- TikTok's stable per-app identifier for the user. `union_id` is stable
  -- across apps in the same developer org and is stored because it is the only
  -- thing that would survive us ever registering a second TikTok app.
  open_id text not null,
  union_id text,

  display_name text,
  username text,
  avatar_url text,
  profile_deep_link text,

  -- user.info.stats. Nullable with no default: absent and zero are different
  -- facts, and only one of them is ours to assert. See [[Honest Analytics]].
  follower_count integer,
  following_count integer,
  likes_count integer,
  video_count integer,

  -- What TikTok actually granted, read back off the token response rather than
  -- assumed from what we asked for. The consent screen is not the record of
  -- what was granted -- a flow can legitimately grant less.
  scopes text[] not null default '{}',

  access_token text not null,
  access_token_expires_at timestamptz not null,

  -- NOT NULL. TikTok always issues a refresh token for this flow, unlike X
  -- where `offline.access` is declinable and a connection can legitimately
  -- exist that dies in two hours.
  refresh_token text not null,
  refresh_token_expires_at timestamptz,

  status text not null default 'active'
    check (status in ('active', 'needs_reconnect', 'revoked')),
  last_error text,

  connected_at timestamptz not null default now(),

  -- The acceptance signal for every connector in this family: a row can be
  -- written without the API ever being called, but this stamp cannot.
  last_synced_at timestamptz,

  -- Plain cache, no claim. See the header.
  insights jsonb,
  insights_cached_at timestamptz,

  refresh_claimed_at timestamptz,
  refresh_claim_id uuid,

  disconnect_claimed_at timestamptz,
  disconnect_claim_id uuid
);

-- LOCKDOWN. RLS enabled with ZERO policies for any role, PLUS the ambient
-- grants revoked at TABLE level. Both are needed and they are independent
-- gates: a column-level REVOKE is a documented no-op against Supabase's
-- table-wide GRANT (this project has four recorded instances), and a future
-- migration that re-grants the table still hits RLS-with-no-policy.
alter table public.tiktok_account_connections enable row level security;

revoke all on public.tiktok_account_connections from public, anon, authenticated;
grant all on public.tiktok_account_connections to service_role;

comment on table public.tiktok_account_connections is
  'Per-user read-only TikTok analytics link. Service-role only: RLS is enabled '
  'with no policies and client grants are revoked. The UI reads '
  'tiktok_connection_status(), never this table.';

-- ---------------------------------------------------------------------------
-- Status: the ONLY thing the UI may read.
--
-- Takes NO ARGUMENTS, so identity can only come from auth.uid() -- there is no
-- parameter an id could ever be pointed at. Returns NO TOKEN COLUMN. Same shape
-- as dre_my_standing, youtube_connection_status, instagram_connection_status
-- and x_connection_status.
-- ---------------------------------------------------------------------------
create or replace function public.tiktok_connection_status()
returns table (
  open_id text,
  display_name text,
  username text,
  avatar_url text,
  profile_deep_link text,
  follower_count integer,
  following_count integer,
  likes_count integer,
  video_count integer,
  scopes text[],
  status text,
  last_error text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.open_id,
    c.display_name,
    c.username,
    c.avatar_url,
    c.profile_deep_link,
    c.follower_count,
    c.following_count,
    c.likes_count,
    c.video_count,
    c.scopes,
    c.status,
    c.last_error,
    c.connected_at,
    c.last_synced_at,
    c.access_token_expires_at,
    c.refresh_token_expires_at
  from public.tiktok_account_connections c
  where c.user_id = auth.uid();
$$;

-- A bare REVOKE FROM PUBLIC does not lock down a definer function against
-- Supabase's default privileges: anon must be named.
revoke execute on function public.tiktok_connection_status() from public, anon;
grant execute on function public.tiktok_connection_status() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- store_tiktok_connection -- the whole connect write, atomically.
--
-- ONE RPC RATHER THAN CLAIM-THEN-UPSERT, and that is a scar. Codex round 6 on
-- the X connector found a claim that released its advisory lock BEFORE the
-- write it was protecting: pg_advisory_xact_lock ends with its transaction, so
-- claim-in-one-transaction then write-in-another protects nothing at all. A
-- lock only helps while it is held. Here the lock and the write are the same
-- transaction by construction.
--
-- Clearing both claim pairs is deliberate: a refresh or disconnect in flight
-- against the OLD grant must not be allowed to commit against the new one. Its
-- commit will find its claim id gone and discard, which is the correct outcome
-- -- see the commit functions below.
-- ---------------------------------------------------------------------------
create or replace function public.store_tiktok_connection(
  p_user_id uuid,
  p_open_id text,
  p_union_id text,
  p_display_name text,
  p_username text,
  p_avatar_url text,
  p_profile_deep_link text,
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
    profile_deep_link, scopes, access_token, access_token_expires_at,
    refresh_token, refresh_token_expires_at, status, last_error,
    connected_at, last_synced_at,
    insights, insights_cached_at,
    refresh_claimed_at, refresh_claim_id,
    disconnect_claimed_at, disconnect_claim_id
  )
  values (
    p_user_id, p_open_id, p_union_id, p_display_name, p_username, p_avatar_url,
    p_profile_deep_link, coalesce(p_scopes, '{}'), p_access_token,
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
    scopes                  = excluded.scopes,
    access_token            = excluded.access_token,
    access_token_expires_at = excluded.access_token_expires_at,
    refresh_token           = excluded.refresh_token,
    refresh_token_expires_at = excluded.refresh_token_expires_at,
    status                  = 'active',
    last_error              = null,
    connected_at            = now(),
    -- Reset, never carried over. A reconnect can be to a DIFFERENT TikTok
    -- account, and a stale last_synced_at would vouch for a read that never
    -- happened against this grant. The cached snapshot goes for the same
    -- reason: those numbers may describe someone else.
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
  uuid, text, text, text, text, text, text, text[], text, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.store_tiktok_connection(
  uuid, text, text, text, text, text, text, text[], text, timestamptz, text, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- Token refresh: claim -> call TikTok -> commit.
--
-- Split in two because pg_advisory_xact_lock cannot span an outbound HTTP call
-- -- it is released when its transaction ends. The claim records WHO is
-- refreshing and when; the commit verifies the claim is still the current one
-- before writing. Same lineage as pending_balance_flushes.
--
-- p_rejected_access_token makes a forced refresh idempotent under concurrency.
-- A caller that got a 401 passes the token it was rejected on; if the row
-- already holds a DIFFERENT token, someone else refreshed while we were being
-- rejected, and the right answer is to use theirs rather than burn our rotating
-- refresh token on a second exchange.
-- ---------------------------------------------------------------------------
create or replace function public.claim_tiktok_token_refresh(
  p_user_id uuid,
  p_skew_seconds integer default 300,
  p_claim_ttl_seconds integer default 60,
  p_rejected_access_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.tiktok_account_connections%rowtype;
  v_claim_id uuid;
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    raise exception 'forbidden: service role required';
  end if;

  perform pg_advisory_xact_lock(hashtext('tiktok_grant:' || p_user_id::text));

  select * into v_conn
  from public.tiktok_account_connections
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'no_connection');
  end if;

  -- Someone else already refreshed past the token we were rejected on.
  if p_rejected_access_token is not null
     and v_conn.access_token is distinct from p_rejected_access_token then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'already_refreshed',
      'access_token', v_conn.access_token,
      'access_token_expires_at', v_conn.access_token_expires_at
    );
  end if;

  -- Still comfortably valid and this is not a forced refresh: nothing to do.
  if p_rejected_access_token is null
     and v_conn.access_token_expires_at > now() + make_interval(secs => p_skew_seconds) then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'fresh',
      'access_token', v_conn.access_token,
      'access_token_expires_at', v_conn.access_token_expires_at
    );
  end if;

  -- A live claim from another caller. Do NOT start a second exchange: the
  -- refresh token rotates, so two exchanges can leave us holding a superseded
  -- token that only a re-consent can fix.
  if v_conn.refresh_claimed_at is not null
     and v_conn.refresh_claimed_at > now() - make_interval(secs => p_claim_ttl_seconds) then
    return jsonb_build_object('claimed', false, 'reason', 'in_progress');
  end if;

  v_claim_id := gen_random_uuid();

  update public.tiktok_account_connections
  set refresh_claimed_at = now(),
      refresh_claim_id = v_claim_id
  where user_id = p_user_id;

  return jsonb_build_object(
    'claimed', true,
    'claim_id', v_claim_id,
    'refresh_token', v_conn.refresh_token
  );
end;
$$;

revoke execute on function public.claim_tiktok_token_refresh(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_tiktok_token_refresh(uuid, integer, integer, text)
  to service_role;

create or replace function public.commit_tiktok_token_refresh(
  p_user_id uuid,
  p_claim_id uuid,
  p_access_token text default null,
  p_access_token_expires_at timestamptz default null,
  p_refresh_token text default null,
  p_refresh_token_expires_at timestamptz default null,
  p_scopes text[] default null,
  p_grant_invalid boolean default false,
  p_error text default null
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

  perform pg_advisory_xact_lock(hashtext('tiktok_grant:' || p_user_id::text));

  select * into v_conn
  from public.tiktok_account_connections
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('committed', false, 'reason', 'no_connection');
  end if;

  -- THE GUARD ENUMERATES THE GOOD CASE, NOT THE BAD ONES.
  --
  -- Codex round 12 on the X connector: a guard that lists the ways a commit can
  -- be invalid treats every case it has not met as valid, so a reason added
  -- later falls through to success by default. The only safe commit is one
  -- whose claim id is still exactly the one on the row -- anything else means
  -- the grant was replaced or the claim expired and was taken by someone else.
  if v_conn.refresh_claim_id is distinct from p_claim_id then
    return jsonb_build_object('committed', false, 'reason', 'stale_claim');
  end if;

  if p_grant_invalid then
    update public.tiktok_account_connections
    set status = 'needs_reconnect',
        last_error = coalesce(p_error, 'TikTok ended this connection.'),
        refresh_claimed_at = null,
        refresh_claim_id = null
    where user_id = p_user_id;

    return jsonb_build_object('committed', true, 'reason', 'grant_invalid');
  end if;

  if p_access_token is null then
    -- Release the claim without writing. A transient failure must not block the
    -- next caller for the whole TTL.
    update public.tiktok_account_connections
    set refresh_claimed_at = null,
        refresh_claim_id = null,
        last_error = p_error
    where user_id = p_user_id;

    return jsonb_build_object('committed', true, 'reason', 'released');
  end if;

  update public.tiktok_account_connections
  set access_token = p_access_token,
      access_token_expires_at = coalesce(p_access_token_expires_at, access_token_expires_at),
      -- TikTok's refresh token MAY rotate. Keep the old one when the response
      -- omits it; overwriting with null would destroy the only thing that can
      -- renew this grant.
      refresh_token = coalesce(p_refresh_token, refresh_token),
      refresh_token_expires_at = coalesce(p_refresh_token_expires_at, refresh_token_expires_at),
      scopes = coalesce(p_scopes, scopes),
      status = 'active',
      last_error = null,
      refresh_claimed_at = null,
      refresh_claim_id = null
  where user_id = p_user_id;

  return jsonb_build_object('committed', true, 'reason', 'refreshed');
end;
$$;

revoke execute on function public.commit_tiktok_token_refresh(
  uuid, uuid, text, timestamptz, text, timestamptz, text[], boolean, text
) from public, anon, authenticated;
grant execute on function public.commit_tiktok_token_refresh(
  uuid, uuid, text, timestamptz, text, timestamptz, text[], boolean, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Disconnect: claim -> revoke at TikTok -> commit (delete).
--
-- Ordering matters and differs per platform. TikTok HAS a revoke endpoint, so
-- unlike Instagram and Facebook -- where disconnect must delete the row anyway
-- because no revoke exists -- this one can and does revoke first. The row (and
-- therefore our only copy of the token) is deleted only after TikTok confirms,
-- so the failure mode is a row that still works rather than a live grant we can
-- no longer reach.
-- ---------------------------------------------------------------------------
create or replace function public.claim_tiktok_disconnect(
  p_user_id uuid,
  p_claim_ttl_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.tiktok_account_connections%rowtype;
  v_claim_id uuid;
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    raise exception 'forbidden: service role required';
  end if;

  perform pg_advisory_xact_lock(hashtext('tiktok_grant:' || p_user_id::text));

  select * into v_conn
  from public.tiktok_account_connections
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'no_connection');
  end if;

  if v_conn.disconnect_claimed_at is not null
     and v_conn.disconnect_claimed_at > now() - make_interval(secs => p_claim_ttl_seconds) then
    return jsonb_build_object('claimed', false, 'reason', 'in_progress');
  end if;

  v_claim_id := gen_random_uuid();

  update public.tiktok_account_connections
  set disconnect_claimed_at = now(),
      disconnect_claim_id = v_claim_id
  where user_id = p_user_id;

  return jsonb_build_object(
    'claimed', true,
    'claim_id', v_claim_id,
    'access_token', v_conn.access_token,
    'refresh_token', v_conn.refresh_token
  );
end;
$$;

revoke execute on function public.claim_tiktok_disconnect(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_tiktok_disconnect(uuid, integer)
  to service_role;

create or replace function public.commit_tiktok_disconnect(
  p_user_id uuid,
  p_claim_id uuid,
  p_delete boolean default true,
  p_error text default null
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

  perform pg_advisory_xact_lock(hashtext('tiktok_grant:' || p_user_id::text));

  select * into v_conn
  from public.tiktok_account_connections
  where user_id = p_user_id;

  if not found then
    -- Already gone. Idempotent by design: a retried disconnect must not fail.
    return jsonb_build_object('committed', true, 'reason', 'already_gone');
  end if;

  -- Same good-case-only guard as the refresh commit. A reconnect that landed
  -- mid-disconnect cleared this claim, and deleting now would destroy a grant
  -- the user just created.
  if v_conn.disconnect_claim_id is distinct from p_claim_id then
    return jsonb_build_object('committed', false, 'reason', 'stale_claim');
  end if;

  if not p_delete then
    update public.tiktok_account_connections
    set disconnect_claimed_at = null,
        disconnect_claim_id = null,
        last_error = p_error
    where user_id = p_user_id;

    return jsonb_build_object('committed', true, 'reason', 'released');
  end if;

  delete from public.tiktok_account_connections where user_id = p_user_id;

  return jsonb_build_object('committed', true, 'reason', 'deleted');
end;
$$;

revoke execute on function public.commit_tiktok_disconnect(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.commit_tiktok_disconnect(uuid, uuid, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- cache_tiktok_insights -- NO CLAIM, and that is the design.
--
-- See the header: TikTok reads are free, so a duplicate read costs nothing and
-- serialising the cache fill would be complexity with no justification behind
-- it. This is a last-write-wins cache.
--
-- It still refuses to write against a connection that has MOVED. p_open_id is
-- checked against the row, so a read that was in flight while the user
-- reconnected to a different TikTok account cannot file one account's figures
-- under another account's name. That is not a cost concern -- it is
-- [[Honest Analytics]]: a real measurement attributed to the wrong subject is a
-- fabrication even though every figure in it is true.
-- ---------------------------------------------------------------------------
create or replace function public.cache_tiktok_insights(
  p_user_id uuid,
  p_open_id text,
  p_insights jsonb,
  p_follower_count integer default null,
  p_following_count integer default null,
  p_likes_count integer default null,
  p_video_count integer default null,
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
  uuid, text, jsonb, integer, integer, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.cache_tiktok_insights(
  uuid, text, jsonb, integer, integer, integer, integer, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- mark_tiktok_needs_reconnect -- set from a read path that discovers a dead
-- grant, so the card can show the one button that fixes it instead of a generic
-- error. Deliberately never called for a 429: rate limiting is not a broken
-- connection, and telling a user to reauthorize over one is the mistake the
-- YouTube connector made with quota 403s.
-- ---------------------------------------------------------------------------
create or replace function public.mark_tiktok_needs_reconnect(
  p_user_id uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    raise exception 'forbidden: service role required';
  end if;

  update public.tiktok_account_connections
  set status = 'needs_reconnect',
      last_error = p_error
  where user_id = p_user_id;

  return jsonb_build_object('marked', found);
end;
$$;

revoke execute on function public.mark_tiktok_needs_reconnect(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_tiktok_needs_reconnect(uuid, text)
  to service_role;
