-- Facebook Page Insights connector: per-user, read-only links to Facebook Pages.
--
-- Third direct platform connector, after YouTube and Instagram, under the same
-- 2026-08-23 scope decision: Outstand publishes, direct APIs measure. Nothing
-- here can post.
--
-- ---------------------------------------------------------------------------
-- WHY THIS TABLE IS SHAPED DIFFERENTLY FROM instagram_account_connections
--
-- 1. TWO TOKENS, NOT ONE, and they have opposite lifetimes.
--
--    `page_access_token` is what reads insights. Minted from a long-lived user
--    token, it does NOT expire (Meta, long-lived access tokens reference) — so
--    unlike Instagram there is no expiry column driving refresh, no proactive
--    refresh, and no dormancy sweep. Copying Instagram's would be machinery
--    guarding a failure that cannot happen here.
--
--    `user_access_token` exists for exactly one purpose: REVOKING the grant on
--    disconnect. Facebook, unlike Instagram, HAS a revoke endpoint, so the
--    YouTube rule applies again — never abandon a live grant.
--
-- 2. THE REVOKE CREDENTIAL EXPIRES AND THE READ CREDENTIAL DOES NOT, which is a
--    genuinely awkward combination and is recorded rather than hidden. The user
--    token lasts ~60 days. After that, insights still work forever while
--    disconnect can no longer revoke. `user_token_expires_at` is stored so the
--    disconnect path can say which of those two things happened instead of
--    reporting a generic failure. It is NOT a health signal and nothing should
--    mark a connection stale from it.
--
-- 3. MANY ROWS PER USER. One consent returns every Page the user administers, and
--    a restaurant group legitimately has several. Unique on (user_id, page_id),
--    never on user_id alone.
-- ---------------------------------------------------------------------------
--
-- Lockdown mirrors the other two connectors and is deliberately BELT AND
-- BRACES: RLS enabled with ZERO policies for any role, PLUS the ambient grants
-- revoked at TABLE level. A column-level REVOKE is a documented no-op against
-- Supabase's table-wide GRANT — this project has four recorded instances of that
-- exact mistake. Grants and RLS are independent gates, so a future migration
-- that re-grants the table still meets RLS-with-no-policy.

create table if not exists public.facebook_page_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Meta's APP-SCOPED user id for the person who granted access.
  --
  -- Stored for exactly one reason: it is the only identifier Meta's deauthorize
  -- callback sends. When a user removes DragonCandy from their Facebook
  -- settings, the signed_request carries this id and nothing else we hold — not
  -- the page_id, not our user_id — so without this column a user-side removal
  -- would strand every row it should have deleted.
  --
  -- App-scoped means it identifies the person only within THIS app; it is not a
  -- Facebook profile id and cannot be used to look anyone up.
  fb_user_id text not null,

  page_id text not null,
  page_name text,
  category text,
  followers_count integer,

  -- Reads insights. Does not expire. Never leaves the backend.
  page_access_token text not null,
  -- Revokes the grant on disconnect. Expires in ~60 days; see note 2 above.
  user_access_token text not null,
  user_token_expires_at timestamptz,

  -- What Meta actually granted, read back from the token rather than assumed
  -- from what we requested. The two differ whenever a user unticks something.
  permissions text[] not null default '{}',
  -- Page tasks, e.g. ANALYZE. Insights require ANALYZE, and a user can hold a
  -- Page role without it; storing this lets the UI explain a failure that would
  -- otherwise name nothing useful.
  tasks text[] not null default '{}',

  status text not null default 'active',
  last_error text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,

  constraint facebook_page_connections_status_check
    check (status in ('active', 'needs_reconnect', 'revoked')),
  constraint facebook_page_connections_user_page_key
    unique (user_id, page_id)
);

create index if not exists idx_facebook_page_connections_user
  on public.facebook_page_connections (user_id);

-- The deauthorize callback's only lookup path. Without this it is a sequential
-- scan on an endpoint Meta retries.
create index if not exists idx_facebook_page_connections_fb_user
  on public.facebook_page_connections (fb_user_id);

alter table public.facebook_page_connections enable row level security;

-- No policies, for any role, on purpose. Every read and write goes through the
-- service role in an edge function, or through the status function below.
revoke all on public.facebook_page_connections from public, anon, authenticated;
grant all on public.facebook_page_connections to service_role;

-- ---------------------------------------------------------------------------
-- Status for the UI.
--
-- Takes NO ARGUMENTS, so identity can only come from auth.uid() and there is no
-- parameter anyone could point at another user (the dre_my_standing pattern).
-- Returns NO TOKEN COLUMN — the tokens never leave the backend, and a status
-- function is exactly where that rule gets broken by accident.
--
-- A bare REVOKE ... FROM PUBLIC does not lock down a definer function against
-- Supabase's default privileges; anon must be named.
-- ---------------------------------------------------------------------------

create or replace function public.facebook_connection_status()
returns table (
  page_id text,
  page_name text,
  category text,
  followers_count integer,
  permissions text[],
  tasks text[],
  status text,
  last_error text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  can_read_insights boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.page_id,
    c.page_name,
    c.category,
    c.followers_count,
    c.permissions,
    c.tasks,
    c.status,
    c.last_error,
    c.connected_at,
    c.last_synced_at,
    -- Derived here rather than in the client so one definition serves every
    -- caller — and it takes BOTH gates, not just the Page task.
    --
    -- Meta requires a token from someone who can ANALYZE the Page, AND the two
    -- permissions the insights endpoint needs. A user can untick a permission on
    -- the consent screen while still holding ANALYZE, and an earlier version
    -- checked only the task: the Page stored as active, the card said
    -- "Connected", and the first read failed. Reading the granted permissions
    -- and then not using them was worse than not reading them, because the row
    -- looked checked.
    (
      'ANALYZE' = any (c.tasks)
      and 'read_insights' = any (c.permissions)
      and 'pages_read_engagement' = any (c.permissions)
    ) as can_read_insights
  from public.facebook_page_connections c
  where c.user_id = auth.uid()
  order by c.connected_at asc;
$$;

revoke execute on function public.facebook_connection_status() from public, anon;
grant execute on function public.facebook_connection_status() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Disconnect decision, made atomically.
--
-- THE RACE THIS CLOSES. Disconnect must revoke the shared grant only when the
-- LAST Page on it goes, so the caller has to count first. Counting and then
-- acting is check-then-act: two Pages disconnected at once both read "2
-- remaining", both take the not-last branch, both delete their row, and nobody
-- revokes — leaving a live Facebook authorization with no stored token left to
-- revoke it. That is exactly the "never abandon a live grant" invariant the
-- revoke-before-delete ordering exists to hold, defeated one level up.
-- (Codex second review, round 4.)
--
-- Same shape as `reserve_phone_verification_send` and `record_crew_activity`:
-- the decision moves out of TypeScript and into SQL, under a
-- `pg_advisory_xact_lock` keyed on the thing being contended — here the shared
-- grant, `fb_user_id` — so concurrent callers queue instead of racing.
--
-- WHY IT DOES NOT DELETE THE LAST ROW. For the last Page the row must survive
-- until Meta has accepted the revoke, because it holds the only copy of the
-- token; deleting first is the failure this whole ordering prevents. So this
-- function deletes only in the not-last case and otherwise just reports
-- `is_last`, leaving the caller to revoke and then delete. A revoke that fails
-- therefore leaves the row intact and retryable.
--
-- Scoped by `fb_user_id` ACROSS DragonCandy accounts, not within one: the grant
-- belongs to a (Facebook user, app) pair, so a second DragonCandy user who
-- linked the same Facebook account holds rows a revoke would break.
-- ---------------------------------------------------------------------------

create or replace function public.claim_facebook_page_disconnect(
  p_user_id uuid,
  p_page_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.facebook_page_connections%rowtype;
  v_remaining integer;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'claim_facebook_page_disconnect is service-role only';
  end if;

  select * into v_conn
  from public.facebook_page_connections
  where user_id = p_user_id and page_id = p_page_id;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  -- Serialises every disconnect touching this grant. hashtext is stable within a
  -- database, which is all this needs — the lock is advisory, not a key.
  perform pg_advisory_xact_lock(hashtext('facebook_disconnect:' || v_conn.fb_user_id));

  select count(*) into v_remaining
  from public.facebook_page_connections
  where fb_user_id = v_conn.fb_user_id;

  if v_remaining <= 1 then
    -- Last Page on the grant. Leave the row alone: the caller revokes first,
    -- then deletes, so a failed revoke keeps the token that can retry it.
    return jsonb_build_object(
      'found', true,
      'is_last', true,
      'id', v_conn.id,
      'user_access_token', v_conn.user_access_token,
      'user_token_expires_at', v_conn.user_token_expires_at
    );
  end if;

  -- Other Pages still use this grant, so nothing is revoked and the row can go
  -- now — inside the lock, so a concurrent caller sees the reduced count.
  delete from public.facebook_page_connections where id = v_conn.id;

  return jsonb_build_object('found', true, 'is_last', false, 'id', v_conn.id);
end;
$$;

revoke execute on function public.claim_facebook_page_disconnect(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_facebook_page_disconnect(uuid, text) to service_role;
