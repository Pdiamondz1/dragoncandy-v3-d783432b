-- Server-established ownership for Outstand MEDIA, mirroring
-- 20260806184500_outstand_post_ownership.sql.
--
-- THE HOLE. outstand-proxy's enforceScope allows `/media`, `/media/upload`,
-- `/media/{id}` and `/media/{id}/confirm` for EVERY METHOD to ANY authenticated
-- caller, with the comment "Media is org-level in Outstand — allow read/write
-- for authenticated users". The comment is accurate about the provider and
-- wrong about the consequence: the Outstand API key is ORG-WIDE, so "org-level"
-- means every DragonCandy tenant's media sits in one pool. Any authenticated
-- user could therefore list every tenant's uploads (filenames + URLs) and
-- **DELETE any of them**. The vendor SDK calls all four endpoints, including
-- `DELETE /media/{id}`, so this is a live UI path and not a theoretical one.
--
-- WHY A BINDING RATHER THAN A FILTER. There is nothing on the row to filter by.
-- The SDK's own MediaFile type is
--   { id, url, filename, contentType, size, status, created_at, expires_at }
-- with no account, user or org field, and the provider offers no per-tenant
-- scope. So ownership has to be recorded on OUR side at the only moment both
-- facts exist at once: outstand-proxy authenticates the caller (ctx.userId from
-- auth.getUser(), never a body or header) and proxies POST /media/upload, so it
-- sees the provider's own response id. Neither half is client-assertable —
-- exactly the argument that produced outstand_post_ownership.
--
-- TIMING. Applied while `GET /media` returns count:0 on prod, i.e. there is NO
-- legacy media population to strand. That is what lets this be STRICT from day
-- one (no binding => refuse), unlike outstand-webhook, which had to stay
-- permissive because a real population of pre-binding posts already existed.
-- Doing it now is cheaper than doing it after the first upload.
create table if not exists public.outstand_media_ownership (
  -- text, not uuid: provider media ids are opaque strings, same as post ids.
  outstand_media_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- For the reverse direction only (forgery investigation: "what did this user
-- upload"). Neither consumer's hot path needs it — they look up by primary key.
create index if not exists idx_outstand_media_ownership_user_id
  on public.outstand_media_ownership (user_id);

comment on table public.outstand_media_ownership is
  'Server-established binding: Outstand media id -> the authenticated user who uploaded it. Written ONLY by outstand-proxy (service role) on a 2xx POST /media/upload, from ctx.userId (auth.getUser()) and the provider''s own response id. Read by outstand-proxy to scope GET /media, GET/POST /media/{id} and DELETE /media/{id}. NO client write path exists -- see the REVOKE below. The provider has no per-tenant media scope and MediaFile carries no owner field, so this table is the only thing that can answer "whose media is this".';

-- LOCKDOWN — table-level revoke, then a service_role grant.
--
-- A COLUMN-level revoke here would be a documented NO-OP against Supabase's
-- ambient table-wide grant; 20260804174934, 20260806184500 and 20260806210000
-- all record that lesson. Nothing in src/ reads or writes this table, so the
-- client grant set is EMPTY rather than merely reduced.
revoke all on public.outstand_media_ownership from public, anon, authenticated;
grant all on public.outstand_media_ownership to service_role;

alter table public.outstand_media_ownership enable row level security;

-- Deliberately NO policy for anon/authenticated. Client statements are denied by
-- grants AND by RLS-with-no-policy, so a future migration that re-grants by
-- accident still cannot open a write path.
drop policy if exists "service role manages media ownership" on public.outstand_media_ownership;
create policy "service role manages media ownership"
  on public.outstand_media_ownership
  for all
  to service_role
  using (true)
  with check (true);

-- Verification — RUN IT. Do not trust "the migration succeeded."
--
-- (1) EXPECTED: exactly one row, service_role. Any anon/authenticated row means
--     the REVOKE did not take.
--
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name = 'outstand_media_ownership'
--     and grantee not in ('postgres');
--
-- (2) EXPECTED: exactly one policy, for service_role, and NO policy naming
--     anon or authenticated.
--
--   select policyname, cmd, roles::text
--   from pg_policies
--   where schemaname = 'public' and tablename = 'outstand_media_ownership';
