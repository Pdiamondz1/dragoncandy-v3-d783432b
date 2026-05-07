-- Security fix #8: Make profile-assets bucket private
-- Public bucket exposes KYC-adjacent assets (profile images, logos).
-- After this migration, all access requires signed URLs or authenticated requests.

UPDATE storage.buckets SET public = false WHERE id = 'profile-assets';

-- Storage RLS: owner can upload/update their own files
CREATE POLICY "profile_assets_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "profile_assets_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Any authenticated user can read profile assets (avatars are semi-public)
CREATE POLICY "profile_assets_authenticated_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-assets');
