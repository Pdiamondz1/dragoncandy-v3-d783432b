-- Donny prompt attachments (Phase 2).
--
-- APPLIED TO PROD 2026-08-09, recorded as version 20260810013012. Objects were
-- verified directly afterwards rather than trusting the migration ledger — a
-- schema_migrations row is not proof an object exists (see PR #325).
--   column:   exists, jsonb, nullable
--   bucket:   exists, public = false
--   policies: DELETE, INSERT, SELECT, UPDATE (all four)
--   impact:   0 existing rows touched

-- Images, documents, videos and links a user attaches to a Donny message.
-- Additive and nullable — existing rows are unchanged.
alter table public.donny_messages
  add column if not exists attachments jsonb;

comment on column public.donny_messages.attachments is
  'Array of {path, mime, size_bytes, name, kind}. kind in (image|video|document|link). '
  'path is a donny-attachments object key beginning with the owner uuid, or (kind=link) the URL. '
  'Never stores a signed or public URL — a signed URL expires and a public one leaks the bucket.';

-- Private bucket, modelled on message-attachments (20250617123640), which uses the
-- same ${auth.uid()}/ first-folder convention.
insert into storage.buckets (id, name, public)
values ('donny-attachments', 'donny-attachments', false)
on conflict (id) do nothing;

-- Owner-only, all four verbs. There is deliberately NO cross-user SELECT branch
-- (unlike message-attachments, which joins messages so a recipient can read one):
-- a Donny attachment has exactly one legitimate reader, its owner.
--
-- NOTE: donny-orchestrator reads these with the SERVICE-ROLE key, which bypasses
-- every policy below. The server-side check that each path's FIRST PATH SEGMENT
-- equals the caller's own uuid is therefore the real tenant boundary, not this RLS.
-- Verified on prod that the predicate rejects `${uuid}-evil/…` (a naive
-- startsWith would accept it) and yields NULL — i.e. fails closed — for a
-- folderless key.
drop policy if exists "Users can upload their own donny attachments" on storage.objects;
create policy "Users can upload their own donny attachments" on storage.objects
  for insert with check (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can view their own donny attachments" on storage.objects;
create policy "Users can view their own donny attachments" on storage.objects
  for select using (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own donny attachments" on storage.objects;
create policy "Users can update their own donny attachments" on storage.objects
  for update using (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own donny attachments" on storage.objects;
create policy "Users can delete their own donny attachments" on storage.objects
  for delete using (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
