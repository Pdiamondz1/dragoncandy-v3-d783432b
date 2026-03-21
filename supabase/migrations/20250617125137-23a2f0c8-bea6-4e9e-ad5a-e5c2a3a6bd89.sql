
-- First, we need to update the file_uploads table to reference profiles instead of auth.users
-- This will allow us to properly join with the profiles table in our queries

-- Update file_uploads table to reference profiles
ALTER TABLE public.file_uploads 
DROP CONSTRAINT IF EXISTS file_uploads_uploaded_by_fkey,
ADD CONSTRAINT file_uploads_uploaded_by_fkey 
FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update file_versions table to reference profiles
ALTER TABLE public.file_versions 
DROP CONSTRAINT IF EXISTS file_versions_created_by_fkey,
ADD CONSTRAINT file_versions_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update file_comments table to reference profiles
ALTER TABLE public.file_comments 
DROP CONSTRAINT IF EXISTS file_comments_user_id_fkey,
ADD CONSTRAINT file_comments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update file_permissions table to reference profiles
ALTER TABLE public.file_permissions 
DROP CONSTRAINT IF EXISTS file_permissions_user_id_fkey,
ADD CONSTRAINT file_permissions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.file_permissions 
DROP CONSTRAINT IF EXISTS file_permissions_granted_by_fkey,
ADD CONSTRAINT file_permissions_granted_by_fkey 
FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update file_tags table to reference profiles
ALTER TABLE public.file_tags 
DROP CONSTRAINT IF EXISTS file_tags_created_by_fkey,
ADD CONSTRAINT file_tags_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update file_tag_assignments table to reference profiles
ALTER TABLE public.file_tag_assignments 
DROP CONSTRAINT IF EXISTS file_tag_assignments_assigned_by_fkey,
ADD CONSTRAINT file_tag_assignments_assigned_by_fkey 
FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add RLS policies for file_uploads table
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view files they uploaded or have access to"
  ON public.file_uploads FOR SELECT
  USING (
    uploaded_by = auth.uid() OR 
    is_public = true OR
    EXISTS (
      SELECT 1 FROM public.file_permissions fp 
      WHERE fp.file_upload_id = id 
      AND fp.user_id = auth.uid() 
      AND fp.permission_type IN ('view', 'download', 'edit', 'delete', 'share')
      AND (fp.expires_at IS NULL OR fp.expires_at > now())
    )
  );

CREATE POLICY "Users can create their own file uploads"
  ON public.file_uploads FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can update their own file uploads"
  ON public.file_uploads FOR UPDATE
  USING (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their own file uploads"
  ON public.file_uploads FOR DELETE
  USING (uploaded_by = auth.uid());

-- Add RLS policies for other file tables
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tag_assignments ENABLE ROW LEVEL SECURITY;

-- File versions policies
CREATE POLICY "Users can view file versions they have access to"
  ON public.file_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND (fu.uploaded_by = auth.uid() OR fu.is_public = true)
    )
  );

CREATE POLICY "Users can create file versions for files they own"
  ON public.file_versions FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND fu.uploaded_by = auth.uid()
    )
  );

-- File comments policies
CREATE POLICY "Users can view comments on files they have access to"
  ON public.file_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND (fu.uploaded_by = auth.uid() OR fu.is_public = true)
    )
  );

CREATE POLICY "Users can create comments on files they have access to"
  ON public.file_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND (fu.uploaded_by = auth.uid() OR fu.is_public = true)
    )
  );

-- File permissions policies
CREATE POLICY "Users can view permissions for files they own"
  ON public.file_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND fu.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can grant permissions for files they own"
  ON public.file_permissions FOR INSERT
  WITH CHECK (
    granted_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND fu.uploaded_by = auth.uid()
    )
  );

-- File tags policies
CREATE POLICY "Users can view all file tags"
  ON public.file_tags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create their own file tags"
  ON public.file_tags FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- File tag assignments policies
CREATE POLICY "Users can view tag assignments for files they have access to"
  ON public.file_tag_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND (fu.uploaded_by = auth.uid() OR fu.is_public = true)
    )
  );

CREATE POLICY "Users can assign tags to files they own"
  ON public.file_tag_assignments FOR INSERT
  WITH CHECK (
    assigned_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.file_uploads fu 
      WHERE fu.id = file_upload_id 
      AND fu.uploaded_by = auth.uid()
    )
  );
