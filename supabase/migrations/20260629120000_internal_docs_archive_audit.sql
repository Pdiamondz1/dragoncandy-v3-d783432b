-- Strategy Library Management — core-file protection, reversible archive, and a
-- routine dedup/conflict/bloat audit.
-- Spec: docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md
-- Join key (verified in Task 0, all 84 internal rows joinable): donny_knowledge.metadata->>'path' = internal_docs.path

-- 1. Protection flag + archive triple on internal_docs.
alter table public.internal_docs
  add column if not exists is_core boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id),
  add column if not exists archive_reason text;

-- 2. Seed existing rows: everything NOT under docs/wiki/ is canon (Core).
update public.internal_docs set is_core = true where path not like 'docs/wiki/%';

-- 3. BEFORE INSERT trigger so a FUTURE top-level docs/*.md is born Core.
--    On an upsert that resolves to UPDATE the trigger still fires on the proposed
--    tuple, but its is_core write is discarded because the sync's DO UPDATE SET
--    never includes is_core (see donny-knowledge-sync) — so a manual wiki-page
--    promotion survives re-sync.
create or replace function public.internal_docs_set_is_core()
returns trigger
language plpgsql
as $$
begin
  new.is_core := (new.path not like 'docs/wiki/%');
  return new;
end;
$$;

drop trigger if exists trg_internal_docs_set_is_core on public.internal_docs;
create trigger trg_internal_docs_set_is_core
  before insert on public.internal_docs
  for each row execute function public.internal_docs_set_is_core();

-- 4. Detection RPCs — SERVICE-ROLE ONLY (consumed only by the monthly audit
--    routine via AIOS_INGEST_SECRET; mirrors dre_pending_events). No in-body
--    admin gate: service_role has a null auth.uid(); the grant IS the gate.
--    search_path includes extensions so the pgvector `<=>` operator resolves.
create or replace function public.dedup_candidate_pairs(p_threshold double precision default 0.9)
returns table (path_a text, title_a text, path_b text, title_b text, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select da.path, da.title, db.path, db.title,
         (1 - (a.embedding <=> b.embedding))::double precision as similarity
  from public.donny_knowledge a
  join public.donny_knowledge b
    on a.id < b.id
   and a.scope = 'internal'
   and b.scope = 'internal'
  join public.internal_docs da on da.path = a.metadata->>'path' and da.archived_at is null
  join public.internal_docs db on db.path = b.metadata->>'path' and db.archived_at is null
  where (1 - (a.embedding <=> b.embedding)) >= p_threshold
  order by similarity desc;
$$;

create or replace function public.internal_doc_exact_dupes()
returns table (source_hash text, paths text[], n integer)
language sql
stable
security definer
set search_path = public
as $$
  select source_hash, array_agg(path order by path), count(*)::int
  from public.internal_docs
  where source_hash is not null and archived_at is null
  group by source_hash
  having count(*) > 1;
$$;

-- 5. Archive RPCs — ADMIN-gated (browser-called from /internal/strategy).
create or replace function public.internal_doc_archive(p_path text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.internal_docs;
  uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin'::public.app_role) then
    raise exception 'forbidden: admin only';
  end if;
  select * into d from public.internal_docs where path = p_path for update;
  if not found then
    raise exception 'no internal doc at path %', p_path;
  end if;
  if d.is_core then
    raise exception 'cannot archive a core document';
  end if;
  if d.archived_at is not null then
    return jsonb_build_object('status', 'already_archived', 'path', p_path);
  end if;
  update public.internal_docs
    set archived_at = now(), archived_by = uid, archive_reason = p_reason
    where path = p_path;
  -- Pull it out of Donny's RAG now; the archive-aware sync keeps it out.
  delete from public.donny_knowledge
    where scope = 'internal' and metadata->>'path' = p_path;
  return jsonb_build_object('status', 'archived', 'path', p_path);
end;
$$;

create or replace function public.internal_doc_unarchive(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin'::public.app_role) then
    raise exception 'forbidden: admin only';
  end if;
  update public.internal_docs
    set archived_at = null, archived_by = null, archive_reason = null
    where path = p_path;
  if not found then
    raise exception 'no internal doc at path %', p_path;
  end if;
  return jsonb_build_object('status', 'unarchived', 'path', p_path, 'note', 're-embedded on next sync');
end;
$$;

-- 6. Grants — Supabase grants EXECUTE to anon/authenticated by DEFAULT PRIVILEGES,
--    so `from public` alone is NOT enough. Detection = service_role only;
--    archive = authenticated (admin enforced in body).
revoke all on function public.dedup_candidate_pairs(double precision) from public, anon, authenticated;
revoke all on function public.internal_doc_exact_dupes() from public, anon, authenticated;
grant execute on function public.dedup_candidate_pairs(double precision) to service_role;
grant execute on function public.internal_doc_exact_dupes() to service_role;

revoke all on function public.internal_doc_archive(text, text) from public, anon;
revoke all on function public.internal_doc_unarchive(text) from public, anon;
grant execute on function public.internal_doc_archive(text, text) to authenticated;
grant execute on function public.internal_doc_unarchive(text) to authenticated;
