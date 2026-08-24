-- X (Twitter) analytics connector: per-user, read-only links to an X account.
--
-- Fourth direct platform connector, after YouTube, Instagram and Facebook, under
-- the same 2026-08-23 scope decision: Outstand publishes, direct APIs measure.
-- Scopes are `tweet.read` + `users.read` + `offline.access`. Nothing here can
-- post, and the X app's own permission level should be narrowed to Read to match
-- (it is currently Read and write — a console change, tracked separately).
--
-- ===========================================================================
-- WHY THIS TABLE LOOKS NOTHING LIKE THE OTHER THREE
--
-- Every previous connector in this project was built by asking where copying its
-- predecessor would be WRONG. X is the sharpest case yet, because its token
-- model is the opposite of Facebook's on the axis that matters most.
--
-- 1. THE ACCESS TOKEN LASTS TWO HOURS.
--
--    Not sixty days (Instagram), not forever (a Facebook Page token), not "an
--    implementation detail we refresh rarely" (YouTube). Two hours. So refresh
--    is not an edge case here, it is the HOT PATH — a user who opens Settings
--    twice in an afternoon has already crossed it. Everything below follows from
--    that one fact.
--
-- 2. THE REFRESH TOKEN ROTATES, AND X DOES NOT DOCUMENT WHETHER THE OLD ONE
--    DIES.
--
--    The refresh response returns a NEW refresh_token. X's own documentation is
--    silent on whether the previous one is invalidated, and community reports
--    say it is. **Unknown-and-destructive is designed for as if it were true**:
--    if the old token dies on use, then two concurrent refreshes mean one wins,
--    one gets `invalid_grant`, and a stale write can put the DEAD token back in
--    the row — which is unrecoverable without the user re-consenting.
--
--    With a 2-hour token and this card rendering on three settings surfaces,
--    concurrent refresh is not exotic; it is a second browser tab. Hence
--    `claim_x_token_refresh` / `commit_x_token_refresh` below, which are the
--    `pending_balance_flushes` claim-ledger pattern inlined onto this row.
--
--    A plain advisory lock is NOT sufficient and it is worth saying why, because
--    it is the obvious answer: `pg_advisory_xact_lock` lives for a transaction,
--    and the HTTP call to X happens outside it. The lock would be released
--    before the thing it is protecting has happened. The same reasoning produced
--    `pending_balance_flushes` for the Stripe flush.
--
-- 3. READING COSTS MONEY, WHICH IS TRUE OF NO OTHER CONNECTOR HERE.
--
--    X is pay-per-use: post reads ~$0.005 each, user reads ~$0.010 (docs.x.com,
--    2026-08-23). YouTube, Instagram and Facebook insights are free, so all three
--    of those connectors read on every card render without a second thought.
--    Doing that here bills us per render, per surface, per user.
--
--    So the snapshot is CACHED ON THE ROW and served from there. The cache is not
--    an optimisation, it is the cost control, which is why it lives in the schema
--    rather than in a React Query staleTime a client can ignore.
--
-- 4. PKCE IS MANDATORY, and the verifier is NOT stored here on purpose.
--
--    X supports only authorization-code-with-PKCE. The obvious place to keep the
--    `code_verifier` across the redirect would be a row in this table (or
--    sessionStorage), and neither is needed: the verifier is DERIVED from the
--    signed state's nonce by HMAC with a server-only secret, so only our backend
--    can compute it and there is nothing to store, expire or clean up. See
--    `_shared/x-api.ts`. A verifier put in the state itself would be visible to
--    the browser and would defeat PKCE entirely.
--
-- ===========================================================================
--
-- Lockdown mirrors the other three and is deliberately belt and braces: RLS
-- enabled with ZERO policies for any role, PLUS the ambient grants revoked at
-- TABLE level. A column-level REVOKE is a documented no-op against Supabase's
-- table-wide GRANT — this project has four recorded instances of that mistake.
-- Grants and RLS are independent gates, so a future migration that re-grants the
-- table still meets RLS-with-no-policy.

create table if not exists public.x_account_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- X's numeric account id. Stable across handle changes, which is why the
  -- uniqueness constraint keys on it and not on `username`.
  x_user_id text not null,
  username text,
  display_name text,

  followers_count integer,
  following_count integer,
  tweet_count integer,

  -- What X actually granted, read back from the token response rather than
  -- assumed from what we asked for.
  scopes text[] not null default '{}',

  -- Two hours. Not a detail — see note 1 above.
  access_token text not null,
  access_token_expires_at timestamptz not null,

  -- Rotates on every refresh. Nullable because `offline.access` can be declined,
  -- and a connection without one is still usable for two hours; it simply cannot
  -- be renewed and must be reconnected. That is a real state, not an error.
  refresh_token text,

  -- ---------------------------------------------------------------------------
  -- Refresh claim. See note 2.
  --
  -- `refresh_claimed_at` non-null means some caller is mid-exchange with X right
  -- now. A claim older than the staleness window is assumed dead (the function
  -- timed out, the isolate was recycled) and may be re-claimed, because the
  -- alternative is a connection that can never refresh again.
  -- ---------------------------------------------------------------------------
  refresh_claimed_at timestamptz,

  -- ---------------------------------------------------------------------------
  -- Cached insights snapshot. See note 3 — this is a cost control, not a perf
  -- tweak, and it is on the row rather than in the client so that a caller
  -- cannot opt out of it.
  -- ---------------------------------------------------------------------------
  insights jsonb,
  insights_cached_at timestamptz,

  status text not null default 'active',
  last_error text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,

  constraint x_account_connections_status_check
    check (status in ('active', 'needs_reconnect', 'revoked')),
  -- One X account per user, and one user per X account. A second user connecting
  -- the same account would mint a second grant and each refresh would rotate the
  -- other's token out from under it.
  constraint x_account_connections_user_key unique (user_id),
  constraint x_account_connections_account_key unique (x_user_id)
);

create index if not exists idx_x_account_connections_user
  on public.x_account_connections (user_id);

alter table public.x_account_connections enable row level security;

-- No policies, for any role, on purpose. Every read and write goes through the
-- service role in an edge function, or through the status function below.
revoke all on public.x_account_connections from public, anon, authenticated;
grant all on public.x_account_connections to service_role;

-- ---------------------------------------------------------------------------
-- Status for the UI.
--
-- Takes NO ARGUMENTS, so identity can only come from auth.uid() and there is no
-- parameter anyone could point at another user (the dre_my_standing pattern).
-- Returns NO TOKEN COLUMN — tokens never leave the backend, and a status
-- function is exactly where that rule gets broken by accident.
--
-- A bare REVOKE ... FROM PUBLIC does not lock down a definer function against
-- Supabase's default privileges; anon must be named.
-- ---------------------------------------------------------------------------

create or replace function public.x_connection_status()
returns table (
  x_user_id text,
  username text,
  display_name text,
  followers_count integer,
  following_count integer,
  tweet_count integer,
  scopes text[],
  status text,
  last_error text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  -- Derived, never a stored boolean: a stored flag can be set optimistically,
  -- while this is recomputed from the grant every read.
  can_refresh boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.x_user_id,
    c.username,
    c.display_name,
    c.followers_count,
    c.following_count,
    c.tweet_count,
    c.scopes,
    c.status,
    c.last_error,
    c.connected_at,
    c.last_synced_at,
    c.refresh_token is not null as can_refresh
  from public.x_account_connections c
  where c.user_id = auth.uid();
$$;

revoke execute on function public.x_connection_status() from public, anon;
grant execute on function public.x_connection_status() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- claim_x_token_refresh — decide, atomically, who refreshes.
--
-- Returns one of three outcomes, and the middle one is the reason this exists:
--
--   {claimed: false, reason: 'no_connection'}  nothing to refresh
--   {claimed: false, reason: 'fresh', ...}     someone ELSE already refreshed
--                                              while we waited; use the token
--                                              they wrote, do not call X
--   {claimed: false, reason: 'in_progress'}    another caller holds a live claim
--   {claimed: false, reason: 'no_refresh_token'} offline.access was declined
--   {claimed: true,  refresh_token: ...}       go and exchange it
--
-- The row is re-read INSIDE the lock, which is the lesson from
-- `claim_facebook_page_disconnect` (`20260825160000`): a lock taken after the
-- read serialises the decision but not the data it was made from.
-- ---------------------------------------------------------------------------

create or replace function public.claim_x_token_refresh(
  p_user_id uuid,
  -- How much life left still counts as "fresh". A caller that would otherwise
  -- start a request with 20 seconds of validity should refresh first.
  p_skew_seconds integer default 120,
  -- How long a claim may be held before it is assumed dead. Generous relative to
  -- an edge function's own timeout: expiring a LIVE claim is worse than waiting,
  -- because it re-introduces exactly the concurrent refresh this prevents.
  p_claim_ttl_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.x_account_connections%rowtype;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'claim_x_token_refresh is service-role only';
  end if;

  -- Serialises every refresh for this user. Taken BEFORE the row is read, so the
  -- row cannot change between the read and the decision.
  perform pg_advisory_xact_lock(hashtext('x_token_refresh:' || p_user_id::text));

  select * into v_conn
  from public.x_account_connections
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'no_connection');
  end if;

  -- Someone else refreshed while we were queued on the lock. This is the common
  -- case under concurrency and it must NOT result in a second call to X: the
  -- refresh token they used may already be dead.
  if v_conn.access_token_expires_at > now() + make_interval(secs => p_skew_seconds) then
    return jsonb_build_object('claimed', false, 'reason', 'fresh');
  end if;

  if v_conn.refresh_token is null then
    return jsonb_build_object('claimed', false, 'reason', 'no_refresh_token');
  end if;

  if v_conn.refresh_claimed_at is not null
     and v_conn.refresh_claimed_at > now() - make_interval(secs => p_claim_ttl_seconds) then
    return jsonb_build_object('claimed', false, 'reason', 'in_progress');
  end if;

  update public.x_account_connections
  set refresh_claimed_at = now()
  where id = v_conn.id;

  return jsonb_build_object(
    'claimed', true,
    'id', v_conn.id,
    'refresh_token', v_conn.refresh_token
  );
end;
$$;

revoke execute on function public.claim_x_token_refresh(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_x_token_refresh(uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- commit_x_token_refresh — store the rotated pair, or record that it failed.
--
-- ALWAYS persists `p_refresh_token` when one is supplied, because X returns a
-- NEW one on every refresh and keeping the old is how a connection dies.
--
-- On failure the claim is released and the row is marked `needs_reconnect` only
-- when the caller says the grant itself is gone (`p_grant_invalid`). A network
-- blip must NOT burn the connection down: releasing the claim is enough, and the
-- next caller retries.
-- ---------------------------------------------------------------------------

create or replace function public.commit_x_token_refresh(
  p_user_id uuid,
  p_access_token text default null,
  p_access_token_expires_at timestamptz default null,
  p_refresh_token text default null,
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
  v_id uuid;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'commit_x_token_refresh is service-role only';
  end if;

  perform pg_advisory_xact_lock(hashtext('x_token_refresh:' || p_user_id::text));

  select id into v_id from public.x_account_connections where user_id = p_user_id;
  if not found then
    return jsonb_build_object('committed', false, 'reason', 'no_connection');
  end if;

  if p_access_token is not null then
    update public.x_account_connections
    set access_token = p_access_token,
        access_token_expires_at = coalesce(p_access_token_expires_at, now() + interval '2 hours'),
        -- coalesce, not overwrite: if X ever omits it, the existing one is the
        -- only credential left and discarding it would end the connection.
        refresh_token = coalesce(p_refresh_token, refresh_token),
        scopes = coalesce(p_scopes, scopes),
        status = 'active',
        last_error = null,
        refresh_claimed_at = null
    where id = v_id;

    return jsonb_build_object('committed', true);
  end if;

  update public.x_account_connections
  set refresh_claimed_at = null,
      status = case when p_grant_invalid then 'needs_reconnect' else status end,
      last_error = coalesce(p_error, last_error)
  where id = v_id;

  return jsonb_build_object('committed', false, 'reason',
    case when p_grant_invalid then 'grant_invalid' else 'released' end);
end;
$$;

revoke execute on function public.commit_x_token_refresh(uuid, text, timestamptz, text, text[], boolean, text)
  from public, anon, authenticated;
grant execute on function public.commit_x_token_refresh(uuid, text, timestamptz, text, text[], boolean, text)
  to service_role;
