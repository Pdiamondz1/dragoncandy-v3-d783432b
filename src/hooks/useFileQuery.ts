
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { FileUpload } from '@/types/files';

export const useFileUploads = (campaignId?: string, category?: string, uploadedBy?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['file-uploads', campaignId, category, uploadedBy],
    queryFn: async () => {
      let query = supabase
        .from('file_uploads')
        .select('id, filename, original_filename, file_path, bucket_name, file_size, mime_type, file_hash, upload_status, uploaded_by, campaign_id, file_category, metadata, is_public, is_compressed, compression_ratio, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }
      if (category) {
        query = query.eq('file_category', category);
      }
      if (uploadedBy) {
        query = query.eq('uploaded_by', uploadedBy);
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
        .select('id, file_upload_id, version_number, file_path, file_size, changes_description, created_by, created_at')
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
        .select('id, file_upload_id, user_id, comment_text, annotation_data, parent_comment_id, created_at, updated_at')
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
        .select('id, file_upload_id, user_id, permission_type, granted_by, expires_at, created_at')
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
          id, file_upload_id, file_tag_id,
          file_tags (id, name, color, created_by, created_at)
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
      })) as unknown as FileUpload[];
    },
    enabled: !!user,
  });
};
