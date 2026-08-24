-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260807123121 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- 20260807060000_outstand_media_cache.sql
-- Cache the media record alongside its ownership binding so GET /media can be
-- served from Postgres instead of scanned out of the org-wide provider pool.
--
-- POST /media/{id}/confirm returns ConfirmUploadResponse -- { id, filename, url,
-- content_type, size, status, created_at, expires_at } -- which is every field
-- the SDK's MediaFile carries, and that call goes through outstand-proxy. So the
-- list can be served from our own rows: correct pagination by construction, an
-- exact total from one count, no provider round trip, and no org list read at
-- all, which makes the cross-tenant leak class unreachable rather than handled.

-- STRANDING GUARD — runs BEFORE the columns are added. GET /media is gated on
-- confirmed_at with NO provider fallback, so any pre-existing binding would be
-- invisible in its owner's gallery. Verified zero on prod before writing this,
-- but that is a fact about the author, not a property of the migration.
do $$
declare v_existing bigint;
begin
  select count(*) into v_existing from public.outstand_media_ownership;
  if v_existing > 0 then
    raise exception
      'outstand_media_ownership already holds % row(s). GET /media is served only from rows with confirmed_at set, so these would vanish from their owners'' galleries. Backfill the cached fields first, or remove this guard once the loss is a conscious decision.',
      v_existing;
  end if;
end $$;

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
  'Set when POST /media/{id}/confirm returned 2xx and the media record was cached. NULL means the upload was started but never confirmed -- a reservation, not a media file, and excluded from GET /media.';

comment on column public.outstand_media_ownership.media_created_at is
  'The provider''s own created_at for the media, not ours. Named apart from created_at (which records when WE minted the binding) so the two cannot be confused at a call site.';

create index if not exists idx_outstand_media_ownership_gallery
  on public.outstand_media_ownership (user_id, media_created_at desc, outstand_media_id desc)
  where confirmed_at is not null;

-- Re-asserted deliberately: adding columns must not quietly widen anything.
revoke all on public.outstand_media_ownership from public, anon, authenticated;
grant all on public.outstand_media_ownership to service_role;
