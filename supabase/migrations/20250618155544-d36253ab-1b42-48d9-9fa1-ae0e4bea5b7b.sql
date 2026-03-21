
-- Drop existing policies that might be causing issues
DROP POLICY IF EXISTS "Users can upload campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Users can view campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their campaign deliverables" ON storage.objects;

-- Create simplified storage policies for campaign deliverables
-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Authenticated users can upload campaign deliverables" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-deliverables' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow anyone to view campaign deliverables (for business clients to see)
CREATE POLICY "Anyone can view campaign deliverables" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'campaign-deliverables');

-- Allow users to update their own deliverables
CREATE POLICY "Users can update their own campaign deliverables" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (
  bucket_id = 'campaign-deliverables' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own deliverables
CREATE POLICY "Users can delete their own campaign deliverables" 
ON storage.objects FOR DELETE 
TO authenticated
USING (
  bucket_id = 'campaign-deliverables' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create a function to debug user authentication and profile data
CREATE OR REPLACE FUNCTION public.debug_user_upload_permissions()
RETURNS TABLE (
  user_id uuid,
  is_authenticated boolean,
  profile_exists boolean,
  profile_role text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    auth.uid() as user_id,
    (auth.uid() IS NOT NULL) as is_authenticated,
    (p.id IS NOT NULL) as profile_exists,
    p.role::text as profile_role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();
END;
$$;
