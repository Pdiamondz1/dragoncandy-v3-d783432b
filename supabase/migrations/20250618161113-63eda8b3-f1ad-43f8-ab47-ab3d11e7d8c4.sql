
-- Drop ALL existing problematic RLS policies on file_uploads table
DROP POLICY IF EXISTS "Users can view their own file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can insert their own file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can update their own file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can delete their own file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can view files they uploaded or have access to" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can create their own file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can view files with permissions" ON public.file_uploads;
DROP POLICY IF EXISTS "Authenticated users can view all file uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Public can view public files" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can view accessible files" ON public.file_uploads;

-- Create simple, non-recursive RLS policies for file_uploads
CREATE POLICY "file_uploads_select_own"
  ON public.file_uploads FOR SELECT
  TO authenticated
  USING (uploaded_by = auth.uid());

CREATE POLICY "file_uploads_insert_own"
  ON public.file_uploads FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "file_uploads_update_own"
  ON public.file_uploads FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "file_uploads_delete_own"
  ON public.file_uploads FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Ensure the campaign-deliverables storage bucket exists and is properly configured
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campaign-deliverables', 'campaign-deliverables', false)
ON CONFLICT (id) DO NOTHING;

-- Clean up storage policies and create simple ones
DROP POLICY IF EXISTS "Authenticated users can upload campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload campaign deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Users can view campaign deliverables" ON storage.objects;

-- Create simple storage policies for campaign-deliverables bucket
CREATE POLICY "campaign_deliverables_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-deliverables' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "campaign_deliverables_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'campaign-deliverables');

CREATE POLICY "campaign_deliverables_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'campaign-deliverables' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "campaign_deliverables_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'campaign-deliverables' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
