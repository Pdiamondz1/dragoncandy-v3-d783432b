
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { FileUpload, FileVersion, FileComment, FilePermission, FileTag } from '@/types/files';

export const useFileUploads = (campaignId?: string, category?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['file-uploads', campaignId, category],
    queryFn: async () => {
      let query = supabase
        .from('file_uploads')
        .select(`
          *,
          uploader_profile:profiles!uploaded_by (
            full_name,
            avatar_url
          ),
          versions:file_versions (
            *,
            creator_profile:profiles!created_by (
              full_name,
              avatar_url
            )
          ),
          comments:file_comments (
            *,
            user_profile:profiles!user_id (
              full_name,
              avatar_url
            )
          ),
          tags:file_tag_assignments (
            file_tags (*)
          ),
          permissions:file_permissions (
            *,
            user_profile:profiles!user_id (
              full_name,
              avatar_url
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }
      if (category) {
        query = query.eq('file_category', category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching file uploads:', error);
        throw error;
      }

      return data as FileUpload[];
    },
    enabled: !!user,
  });
};

export const useCreateFileUpload = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileData: {
      filename: string;
      original_filename: string;
      file_path: string;
      bucket_name: string;
      file_size: number;
      mime_type: string;
      file_hash?: string;
      campaign_id?: string;
      file_category?: string;
      metadata?: Record<string, any>;
      is_public?: boolean;
      is_compressed?: boolean;
      compression_ratio?: number;
    }) => {
      const { data, error } = await supabase
        .from('file_uploads')
        .insert({
          ...fileData,
          uploaded_by: user!.id,
          upload_status: 'completed'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating file upload:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      toast({
        title: 'File uploaded successfully',
        description: 'Your file has been uploaded and is ready to use.',
      });
    },
    onError: (error) => {
      console.error('Failed to create file upload:', error);
      toast({
        title: 'Upload failed',
        description: 'There was an error uploading your file. Please try again.',
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteFileUpload = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase
        .from('file_uploads')
        .delete()
        .eq('id', fileId);

      if (error) {
        console.error('Error deleting file upload:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      toast({
        title: 'File deleted',
        description: 'The file has been successfully deleted.',
      });
    },
    onError: (error) => {
      console.error('Failed to delete file:', error);
      toast({
        title: 'Delete failed',
        description: 'There was an error deleting the file. Please try again.',
        variant: 'destructive',
      });
    },
  });
};

export const useCreateFileComment = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentData: {
      file_upload_id: string;
      comment_text: string;
      annotation_data?: Record<string, any>;
      parent_comment_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('file_comments')
        .insert({
          ...commentData,
          user_id: user!.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating file comment:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      toast({
        title: 'Comment added',
        description: 'Your comment has been added to the file.',
      });
    },
    onError: (error) => {
      console.error('Failed to create comment:', error);
      toast({
        title: 'Comment failed',
        description: 'There was an error adding your comment. Please try again.',
        variant: 'destructive',
      });
    },
  });
};

export const useFilePermissions = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const grantPermission = useMutation({
    mutationFn: async (permissionData: {
      file_upload_id: string;
      user_id: string;
      permission_type: 'view' | 'download' | 'edit' | 'delete' | 'share';
      expires_at?: string;
    }) => {
      const { data, error } = await supabase
        .from('file_permissions')
        .insert({
          ...permissionData,
          granted_by: user!.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error granting permission:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      toast({
        title: 'Permission granted',
        description: 'File access has been granted successfully.',
      });
    },
  });

  const revokePermission = useMutation({
    mutationFn: async (permissionId: string) => {
      const { error } = await supabase
        .from('file_permissions')
        .delete()
        .eq('id', permissionId);

      if (error) {
        console.error('Error revoking permission:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      toast({
        title: 'Permission revoked',
        description: 'File access has been revoked successfully.',
      });
    },
  });

  return { grantPermission, revokePermission };
};

export const useFileTags = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['file-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('file_tags')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching file tags:', error);
        throw error;
      }

      return data as FileTag[];
    },
    enabled: !!user,
  });
};

export const useCreateFileTag = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tagData: { name: string; color?: string }) => {
      const { data, error } = await supabase
        .from('file_tags')
        .insert({
          ...tagData,
          created_by: user!.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating file tag:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-tags'] });
    },
  });
};
