-- P0-1: Fix overly permissive DELETE policy on promotion-videos bucket.
-- Old policy allowed ANY authenticated user to delete ANY file.
-- New policy checks that the file belongs to a promotion owned by the current user.

DROP POLICY IF EXISTS "Business owners can delete their promotion videos"
ON storage.objects;

CREATE POLICY "Business owners can delete their promotion videos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'promotion-videos' AND
  EXISTS (
    SELECT 1 FROM public.promotions p
    WHERE p.id::text = split_part(name, '/', 1)
    AND p.user_id = auth.uid()
  )
);
