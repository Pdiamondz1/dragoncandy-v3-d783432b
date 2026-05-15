
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export const useCreateFileComment = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentData: {
      file_upload_id: string;
      comment_text: string;
      annotation_data?: Record<string, unknown>;
      parent_comment_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('file_comments')
        .insert({
          ...commentData,
          user_id: user!.id
        })
        .select('id, file_upload_id, user_id, comment_text, created_at')
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
