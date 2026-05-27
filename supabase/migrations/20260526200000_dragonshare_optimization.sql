-- DragonShare Optimization: simplify schema for upload-first flow + trust-then-flag model

-- 1. Make post_url nullable (links are now optional — creators can upload directly)
ALTER TABLE dragonshare_posts ALTER COLUMN post_url DROP NOT NULL;

-- 2. Make platform nullable (direct uploads have no platform)
ALTER TABLE dragonshare_posts ALTER COLUMN platform DROP NOT NULL;

-- 3. Add content_file_path for direct uploads to Supabase Storage
ALTER TABLE dragonshare_posts ADD COLUMN IF NOT EXISTS content_file_path text;

-- 4. Add flag columns for trust-then-flag model
ALTER TABLE dragonshare_posts ADD COLUMN IF NOT EXISTS flagged_at timestamptz;
ALTER TABLE dragonshare_posts ADD COLUMN IF NOT EXISTS flagged_by uuid REFERENCES auth.users(id);

-- 5. Change default status from pending_verification to verified (no admin gate)
ALTER TABLE dragonshare_posts ALTER COLUMN status SET DEFAULT 'verified';

-- 6. Create storage bucket for direct content uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('dragonshare-content', 'dragonshare-content', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage RLS: authenticated users can upload to their own path
CREATE POLICY "Users can upload dragonshare content"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'dragonshare-content' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 8. Storage RLS: public read access
CREATE POLICY "Public can read dragonshare content"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'dragonshare-content');

-- 9. Storage RLS: owners can delete their own uploads
CREATE POLICY "Users can delete own dragonshare content"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'dragonshare-content' AND (storage.foldername(name))[1] = auth.uid()::text);
