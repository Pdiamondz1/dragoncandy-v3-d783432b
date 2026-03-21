
-- Drop existing problematic RLS policies on file_uploads table
DROP POLICY IF EXISTS "Users can view files they uploaded or have access to" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can create their own file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can update their own file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can delete their own file uploads" ON public.file_uploads;

-- Create simple, non-recursive RLS policies for file_uploads
CREATE POLICY "Users can view their own file uploads"
  ON public.file_uploads FOR SELECT
  TO authenticated
  USING (uploaded_by = auth.uid());

CREATE POLICY "Users can insert their own file uploads"
  ON public.file_uploads FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can update their own file uploads"
  ON public.file_uploads FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their own file uploads"
  ON public.file_uploads FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Ensure uploaded_by column is NOT NULL to prevent policy issues
ALTER TABLE public.file_uploads 
ALTER COLUMN uploaded_by SET NOT NULL;

-- Add index for better performance on uploaded_by lookups
CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_by 
ON public.file_uploads(uploaded_by);
