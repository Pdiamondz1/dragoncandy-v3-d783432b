-- Cache the media record alongside its ownership binding, so GET /media can be
-- served from Postgres instead of scanned out of the org-wide provider pool.
--
-- WHY. `GET /media?limit&offset` paginates the ORG pool and only then can
-- ownership be applied, so the page is chosen before ownership is known. Every
-- workaround for that has failed in a different way, and the failures were
-- structural rather than sloppy:
--   * filter one page          -> caller sees an EMPTY gallery while their media
--                                 sits further down the org ordering;
--   * scan pages until filled  -> a hard scan cap makes media beyond it
--                                 PERMANENTLY unreachable, and raising the cap
--                                 only moves the wall.
-- Both also had to reconcile a provider-derived list against a local total.
--
-- The provider hands us the whole record already. `POST /media/{id}/confirm`
-- returns ConfirmUploadResponse — { id, filename, url, content_type, size,
-- status, created_at, expires_at } — which is EVERY field the SDK's MediaFile
-- carries, and that call goes through outstand-proxy. So the list can be served
-- from our own rows: correct pagination by construction, an exact total from one
-- count, no provider round trip, and — the part that matters most — no org list
-- is ever read, so there is no filter left to get wrong. The whole class of
-- cross-tenant leak this path kept producing stops being reachable rather than
-- being handled.
--
-- Columns are ADDED and NULLABLE, never renamed or dropped: rows minted at
-- upload time (before confirm) already exist and stay valid, they simply have no
-- media record yet. That is also the correct semantic — an unconfirmed upload is
-- not a media file, and `confirmed_at IS NULL` is exactly what keeps it out of
-- the gallery.
alter table public.outstand_media_ownership
  add column if not exists filename text,
  add column if not exists url text,
  add column if not exists content_type text,
  add column if not exists size bigint,
  add column if not exists status text,
  add column if not exists media_created_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists confirmed_at timestamptz;

comment on column public.outstand_media_ownership.confirmed_at is
  'Set when POST /media/{id}/confirm returned 2xx and the media record was cached. NULL means the upload was started but never confirmed — such a row is a reservation, not a media file, and is excluded from GET /media.';

comment on column public.outstand_media_ownership.media_created_at is
  'The provider''s own created_at for the media, not ours. Named apart from created_at (which records when WE minted the binding) so the two can never be confused at a call site.';

-- The gallery's ordering and page window. Partial: unconfirmed reservations are
-- never listed, so they do not belong in the index either.
create index if not exists idx_outstand_media_ownership_gallery
  on public.outstand_media_ownership (user_id, media_created_at desc, outstand_media_id desc)
  where confirmed_at is not null;

-- Grants are unchanged and deliberately re-asserted: adding columns must not
-- quietly widen anything. Still service_role only, still no client policy —
-- verify with the query below rather than assuming the ALTER left it alone.
revoke all on public.outstand_media_ownership from public, anon, authenticated;
grant all on public.outstand_media_ownership to service_role;

-- Verification — EXPECTED: exactly one grantee (service_role), and one policy.
--
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema='public' and table_name='outstand_media_ownership'
--     and grantee <> 'postgres';
--
--   select policyname, cmd, roles::text
--   from pg_policies
--   where schemaname='public' and tablename='outstand_media_ownership';
