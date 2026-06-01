import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDeclineDragonSharePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('decline_dragonshare_post', { p_post_id: postId });
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      toast.success('Passed — no payment made. The creator keeps their post.');
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
      supabase.functions.invoke('dragonshare-notify', {
        body: { event: 'declined', post_id: postId },
      }).catch((e) => console.warn('dragonshare-notify (declined) failed:', e));
    },
    onError: () => toast.error('Could not pass on this post. Please try again.'),
  });
}
