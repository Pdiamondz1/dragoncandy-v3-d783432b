
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
