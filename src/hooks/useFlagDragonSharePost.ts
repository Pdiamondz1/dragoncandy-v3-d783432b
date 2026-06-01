import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useFlagDragonSharePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('flag_dragonshare_post', { p_post_id: postId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Post reported. Thank you for helping keep DragonShare safe.');
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
    },
    onError: () => {
      toast.error('Could not report this post. Please try again.');
    },
  });
}
