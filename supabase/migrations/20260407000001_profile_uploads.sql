-- Ensure profile-assets bucket exists with correct configuration.
-- This is the single bucket for all profile media: avatars, logos, portfolio content.
-- Using 50MB limit to support video portfolio uploads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-assets',
  'profile-assets',
  true,
  52428800, -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS policies (idempotent: drop-if-exists then create)

-- SELECT: anyone can read profile assets (public display)
DROP POLICY IF EXISTS "profile_assets_select" ON storage.objects;
CREATE POLICY "profile_assets_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-assets');

-- INSERT: authenticated users write to their own uid folder
DROP POLICY IF EXISTS "profile_assets_insert" ON storage.objects;
CREATE POLICY "profile_assets_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: same as INSERT
DROP POLICY IF EXISTS "profile_assets_update" ON storage.objects;
CREATE POLICY "profile_assets_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: same as INSERT
DROP POLICY IF EXISTS "profile_assets_delete" ON storage.objects;
CREATE POLICY "profile_assets_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
