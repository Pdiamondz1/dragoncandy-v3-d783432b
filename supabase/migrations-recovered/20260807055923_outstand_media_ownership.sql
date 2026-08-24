-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260807055923 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- 20260807030000_outstand_media_ownership.sql
-- Server-established ownership for Outstand MEDIA, mirroring outstand_post_ownership.
--
-- outstand-proxy allowed /media, /media/upload, /media/{id} and /media/{id}/confirm
-- for EVERY method to ANY authenticated caller. The Outstand key is ORG-WIDE, so
-- every tenant's uploads share one pool: any user could list every tenant's media
-- (filenames + URLs) and DELETE any of it. The SDK calls all four including DELETE.
--
-- Ownership cannot come from the row: MediaFile carries no account/user/org field
-- and the provider has no per-tenant scope. It is recorded here at the only moment
-- both facts exist: the proxy authenticates the caller (auth.getUser()) and proxies
-- POST /media/upload, so it sees the provider's own response id.
--
-- Applied while GET /media returns count:0, so there is NO legacy population to
-- strand — which is what lets enforcement be STRICT from day one.
create table if not exists public.outstand_media_ownership (
  outstand_media_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_outstand_media_ownership_user_id
  on public.outstand_media_ownership (user_id);

comment on table public.outstand_media_ownership is
  'Server-established binding: Outstand media id -> the authenticated user who uploaded it. Written ONLY by outstand-proxy / social-proxy (service role) on a 2xx media upload, from ctx.userId and the provider''s own response id. Read by outstand-proxy to scope GET /media and GET/POST/DELETE /media/{id}. NO client write path exists.';

-- TABLE-level revoke (a column-level one is a documented no-op against
-- Supabase's ambient grant), then a service_role grant. Nothing in src/ touches
-- this table, so the client grant set is EMPTY rather than reduced.
revoke all on public.outstand_media_ownership from public, anon, authenticated;
grant all on public.outstand_media_ownership to service_role;

alter table public.outstand_media_ownership enable row level security;

-- Deliberately NO policy for anon/authenticated: denied by grants AND by
-- RLS-with-no-policy, so a future accidental re-grant still cannot open a path.
drop policy if exists "service role manages media ownership" on public.outstand_media_ownership;
create policy "service role manages media ownership"
  on public.outstand_media_ownership
  for all
  to service_role
  using (true)
  with check (true);
