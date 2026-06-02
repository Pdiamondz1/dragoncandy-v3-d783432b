-- FIX: CGC customers could never submit content.
--
-- The only INSERT policy on the promotion-videos bucket
-- ("Users can upload their own promotion videos") required:
--   role = authenticated  AND  (storage.foldername(name))[1] = auth.uid()
-- But CGC submissions come from ANONYMOUS customers (public /promo/:id page) and the
-- app uploads to a `{promotion_id}/{file}` path. So the folder segment is the promotion
-- id (never the uploader's uid), and the role is anon — the policy could never match and
-- every upload was denied by RLS, failing the whole submission flow.
--
-- Replace it with a policy that lets anon + authenticated users upload ONLY into a folder
-- named after an ACTIVE promotion. Reads stay via the public bucket; deletes are unchanged
-- (still owner-only).

drop policy if exists "Users can upload their own promotion videos" on storage.objects;

create policy "Anyone can upload to active promotion folders"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'promotion-videos'
  and exists (
    select 1 from public.promotions p
    where p.id::text = (storage.foldername(name))[1]
      and p.status = 'active'
  )
);
