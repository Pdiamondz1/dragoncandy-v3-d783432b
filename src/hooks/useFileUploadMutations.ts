
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

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
      if (!user) {
        throw new Error('User must be authenticated to upload files');
      }

      // Test auth connection first
      const { data: testAuth } = await supabase.auth.getUser();
      if (!testAuth.user) {
        throw new Error('Authentication session invalid');
      }

      const { data, error } = await supabase
        .from('file_uploads')
        .insert({
          ...fileData,
          uploaded_by: user.id,
          upload_status: 'completed'
        })
        .select('id, filename, original_filename, file_path, bucket_name, file_size, mime_type, file_hash, upload_status, uploaded_by, campaign_id, file_category, metadata, is_public, is_compressed, compression_ratio, created_at, updated_at')
        .single();

      if (error) {
        console.error('Database error creating file upload:', error);
        
        // Enhanced error reporting
        if (error.code === 'PGRST301') {
          throw new Error('Row Level Security policy violation - user not authorized');
        } else if (error.code === '23505') {
          throw new Error('Duplicate file name - please try again');
        } else if (error.message.includes('violates row-level security')) {
          throw new Error('Permission denied - insufficient access rights');
        } else {
          throw new Error(`Database error: ${error.message} (Code: ${error.code})`);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
    },
    onError: (error) => {
      console.error('Failed to create file upload record:', error);
      // Don't show toast here as the component handles it
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
