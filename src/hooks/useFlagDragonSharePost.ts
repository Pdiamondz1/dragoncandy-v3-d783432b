import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useFlagDragonSharePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dragonshare_posts')
        .update({ flagged_at: new Date().toISOString(), flagged_by: user.id })
        .eq('id', postId);

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
