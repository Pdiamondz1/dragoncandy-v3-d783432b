-- Fix P0-1: Make campaign-deliverables bucket private
-- The bucket was created as public in 20250618155000. The RLS SELECT policy
-- was tightened in 20260408000000 but the public flag still allows direct URL
-- access bypassing RLS. All file access already uses signed URLs, so this
-- is a safe change.
UPDATE storage.buckets SET public = false WHERE id = 'campaign-deliverables';
