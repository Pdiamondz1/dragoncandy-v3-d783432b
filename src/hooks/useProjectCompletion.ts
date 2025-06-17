
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useProjectCompletion = (userId?: string) => {
  return useQuery({
    queryKey: ['project-completion', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          status,
          review_status,
          creator_id,
          campaign_id,
          campaigns!inner(user_id, title),
          creator:profiles!campaign_collaborations_creator_id_fkey(full_name),
          business:campaigns!inner(profiles!campaigns_user_id_fkey(full_name))
        `)
        .eq('status', 'completed')
        .or(`creator_id.eq.${userId},campaigns.user_id.eq.${userId}`)
        .in('review_status', ['pending', 'completed']);

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
};
