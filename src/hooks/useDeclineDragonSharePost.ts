import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDeclineDragonSharePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('decline_dragonshare_post', { p_post_id: postId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Passed. The creator has been notified kindly.');
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
    },
    onError: () => toast.error('Could not pass on this post. Please try again.'),
  });
}
