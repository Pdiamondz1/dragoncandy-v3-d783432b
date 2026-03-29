
-- Create file_uploads table to track all uploaded files with metadata
CREATE TABLE public.file_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filename text NOT NULL,
  original_filename text NOT NULL,
  file_path text NOT NULL,
  bucket_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  file_hash text,
  upload_status text NOT NULL DEFAULT 'pending',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  file_category text NOT NULL DEFAULT 'general',
  metadata jsonb DEFAULT '{}',
  is_public boolean DEFAULT false,
  is_compressed boolean DEFAULT false,
  compression_ratio numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create file_versions table for version tracking
CREATE TABLE public.file_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE CASCADE NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  changes_description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create file_permissions table for granular access control
CREATE TABLE public.file_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_type text NOT NULL CHECK (permission_type IN ('view', 'download', 'edit', 'delete', 'share')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(file_upload_id, user_id, permission_type)
);

-- Create file_comments table for collaboration features
CREATE TABLE public.file_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  comment_text text NOT NULL,
  annotation_data jsonb,
  parent_comment_id uuid REFERENCES public.file_comments(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create file_tags table for organization
CREATE TABLE public.file_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  color text DEFAULT '#6B7280',
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create file_tag_assignments table
CREATE TABLE public.file_tag_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.file_tags(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(file_upload_id, tag_id)
);

-- Create indexes for better performance
CREATE INDEX idx_file_uploads_uploaded_by ON public.file_uploads(uploaded_by);
CREATE INDEX idx_file_uploads_campaign_id ON public.file_uploads(campaign_id);
CREATE INDEX idx_file_uploads_category ON public.file_uploads(file_category);
CREATE INDEX idx_file_uploads_status ON public.file_uploads(upload_status);
CREATE INDEX idx_file_versions_file_id ON public.file_versions(file_upload_id);
CREATE INDEX idx_file_permissions_file_id ON public.file_permissions(file_upload_id);
CREATE INDEX idx_file_permissions_user_id ON public.file_permissions(user_id);
CREATE INDEX idx_file_comments_file_id ON public.file_comments(file_upload_id);
CREATE INDEX idx_file_tag_assignments_file_id ON public.file_tag_assignments(file_upload_id);

-- Enable Row Level Security
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tag_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for file_uploads
CREATE POLICY "Users can view files they uploaded" ON public.file_uploads
  FOR SELECT USING (uploaded_by = auth.uid());

CREATE POLICY "Users can view public files" ON public.file_uploads
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can view files with permissions" ON public.file_uploads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.file_permissions fp
      WHERE fp.file_upload_id = id 
      AND fp.user_id = auth.uid() 
      AND fp.permission_type = 'view'
      AND (fp.expires_at IS NULL OR fp.expires_at > now())
    )
  );

CREATE POLICY "Users can insert their own files" ON public.file_uploads
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can update their own files" ON public.file_uploads
  FOR UPDATE USING (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their own files" ON public.file_uploads
  FOR DELETE USING (uploaded_by = auth.uid());

-- RLS Policies for file_versions
CREATE POLICY "Users can view file versions for accessible files" ON public.file_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu
      WHERE fu.id = file_upload_id 
      AND (
        fu.uploaded_by = auth.uid() 
        OR fu.is_public = true
        OR EXISTS (
          SELECT 1 FROM public.file_permissions fp
          WHERE fp.file_upload_id = fu.id 
          AND fp.user_id = auth.uid() 
          AND fp.permission_type = 'view'
          AND (fp.expires_at IS NULL OR fp.expires_at > now())
        )
      )
    )
  );

CREATE POLICY "Users can create versions for files they can edit" ON public.file_versions
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.file_uploads fu
      WHERE fu.id = file_upload_id 
      AND (
        fu.uploaded_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.file_permissions fp
          WHERE fp.file_upload_id = fu.id 
          AND fp.user_id = auth.uid() 
          AND fp.permission_type = 'edit'
          AND (fp.expires_at IS NULL OR fp.expires_at > now())
        )
      )
    )
  );

-- RLS Policies for file_permissions
CREATE POLICY "File owners can manage permissions" ON public.file_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu
      WHERE fu.id = file_upload_id AND fu.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can view their own permissions" ON public.file_permissions
  FOR SELECT USING (user_id = auth.uid());

-- RLS Policies for file_comments
CREATE POLICY "Users can view comments on accessible files" ON public.file_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu
      WHERE fu.id = file_upload_id 
      AND (
        fu.uploaded_by = auth.uid() 
        OR fu.is_public = true
        OR EXISTS (
          SELECT 1 FROM public.file_permissions fp
          WHERE fp.file_upload_id = fu.id 
          AND fp.user_id = auth.uid() 
          AND fp.permission_type = 'view'
          AND (fp.expires_at IS NULL OR fp.expires_at > now())
        )
      )
    )
  );

CREATE POLICY "Users can create comments on accessible files" ON public.file_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.file_uploads fu
      WHERE fu.id = file_upload_id 
      AND (
        fu.uploaded_by = auth.uid() 
        OR fu.is_public = true
        OR EXISTS (
          SELECT 1 FROM public.file_permissions fp
          WHERE fp.file_upload_id = fu.id 
          AND fp.user_id = auth.uid() 
          AND fp.permission_type = 'view'
          AND (fp.expires_at IS NULL OR fp.expires_at > now())
        )
      )
    )
  );

CREATE POLICY "Users can update their own comments" ON public.file_comments
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments" ON public.file_comments
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for file_tags
CREATE POLICY "Anyone can view tags" ON public.file_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create tags" ON public.file_tags FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Tag creators can update their tags" ON public.file_tags FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "Tag creators can delete their tags" ON public.file_tags FOR DELETE USING (created_by = auth.uid());

-- RLS Policies for file_tag_assignments
CREATE POLICY "Users can view tag assignments for accessible files" ON public.file_tag_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.file_uploads fu
      WHERE fu.id = file_upload_id 
      AND (
        fu.uploaded_by = auth.uid() 
        OR fu.is_public = true
        OR EXISTS (
          SELECT 1 FROM public.file_permissions fp
          WHERE fp.file_upload_id = fu.id 
          AND fp.user_id = auth.uid() 
          AND fp.permission_type = 'view'
          AND (fp.expires_at IS NULL OR fp.expires_at > now())
        )
      )
    )
  );

CREATE POLICY "File owners can manage tag assignments" ON public.file_tag_assignments
  FOR ALL USING (
    assigned_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.file_uploads fu
      WHERE fu.id = file_upload_id AND fu.uploaded_by = auth.uid()
    )
  );

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('profile-media', 'profile-media', false),
  ('campaign-assets', 'campaign-assets', false),
  ('project-deliverables', 'project-deliverables', false),
  ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for profile-media bucket
CREATE POLICY "Users can upload their own profile media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-media' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own profile media" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'profile-media' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own profile media" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-media' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own profile media" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-media' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for campaign-assets bucket
CREATE POLICY "Campaign owners can manage assets" ON storage.objects
  FOR ALL USING (
    bucket_id = 'campaign-assets' AND 
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id::text = (storage.foldername(name))[1] 
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Campaign collaborators can view assets" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'campaign-assets' AND 
    EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc
      JOIN public.campaigns c ON c.id = cc.campaign_id
      WHERE c.id::text = (storage.foldername(name))[1] 
      AND cc.creator_id = auth.uid()
    )
  );

-- Storage policies for project-deliverables bucket
CREATE POLICY "Campaign participants can manage deliverables" ON storage.objects
  FOR ALL USING (
    bucket_id = 'project-deliverables' AND 
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id::text = (storage.foldername(name))[1] 
      AND (
        c.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.campaign_collaborations cc
          WHERE cc.campaign_id = c.id AND cc.creator_id = auth.uid()
        )
      )
    )
  );

-- Storage policies for message-attachments bucket
CREATE POLICY "Users can upload message attachments" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'message-attachments' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view message attachments" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'message-attachments' AND 
    (
      auth.uid()::text = (storage.foldername(name))[1] OR
      EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.attachment_url LIKE '%' || name || '%'
        AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid())
      )
    )
  );

-- Update triggers for updated_at columns
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_file_uploads_updated_at
  BEFORE UPDATE ON public.file_uploads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_file_comments_updated_at
  BEFORE UPDATE ON public.file_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
