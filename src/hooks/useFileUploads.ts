
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { FileUpload } from '@/types/files';

export const useFileUploads = (campaignId?: string, category?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['file-uploads', campaignId, category],
    queryFn: async () => {
      let query = supabase
        .from('file_uploads')
        .select('*')
        .order('created_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }
      if (category) {
        query = query.eq('file_category', category);
      }

      const { data: filesData, error } = await query;

      if (error) {
        console.error('Error fetching file uploads:', error);
        throw error;
      }

      if (!filesData || filesData.length === 0) {
        return [];
      }

      const fileIds = filesData.map(file => file.id);

      // Fetch uploader profiles
      const { data: uploaderProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', filesData.map(file => file.uploaded_by));

      // Fetch versions with creator profiles
      const { data: versionsData } = await supabase
        .from('file_versions')
        .select('*')
        .in('file_upload_id', fileIds);

      const versionCreatorIds = versionsData?.map(v => v.created_by).filter(Boolean) || [];
      const { data: versionCreatorProfiles } = versionCreatorIds.length > 0 
        ? await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', versionCreatorIds)
        : { data: [] };

      // Fetch comments with user profiles
      const { data: commentsData } = await supabase
        .from('file_comments')
        .select('*')
        .in('file_upload_id', fileIds);

      const commentUserIds = commentsData?.map(c => c.user_id).filter(Boolean) || [];
      const { data: commentUserProfiles } = commentUserIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', commentUserIds)
        : { data: [] };

      // Fetch permissions with user profiles
      const { data: permissionsData } = await supabase
        .from('file_permissions')
        .select('*')
        .in('file_upload_id', fileIds);

      const permissionUserIds = permissionsData?.map(p => p.user_id).filter(Boolean) || [];
      const { data: permissionUserProfiles } = permissionUserIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', permissionUserIds)
        : { data: [] };

      // Fetch tag assignments and tags
      const { data: tagAssignmentsData } = await supabase
        .from('file_tag_assignments')
        .select(`
          *,
          file_tags (*)
        `)
        .in('file_upload_id', fileIds);

      // Transform and combine the data
      return filesData.map(file => ({
        ...file,
        uploader_profile: uploaderProfiles?.find(p => p.id === file.uploaded_by),
        versions: versionsData?.filter(v => v.file_upload_id === file.id).map(version => ({
          ...version,
          creator_profile: versionCreatorProfiles?.find(p => p.id === version.created_by)
        })) || [],
        comments: commentsData?.filter(c => c.file_upload_id === file.id).map(comment => ({
          ...comment,
          user_profile: commentUserProfiles?.find(p => p.id === comment.user_id)
        })) || [],
        permissions: permissionsData?.filter(p => p.file_upload_id === file.id).map(permission => ({
          ...permission,
          user_profile: permissionUserProfiles?.find(p => p.id === permission.user_id)
        })) || [],
        tags: tagAssignmentsData?.filter(ta => ta.file_upload_id === file.id).map(ta => ta.file_tags).filter(Boolean) || []
      })) as FileUpload[];
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
