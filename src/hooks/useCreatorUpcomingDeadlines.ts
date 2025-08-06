import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UpcomingDeadline {
  id: string;
  title: string;
  deadline: string;
  daysUntilDeadline: number;
  status: string;
}

export const useCreatorUpcomingDeadlines = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-upcoming-deadlines', user?.id],
    queryFn: async (): Promise<UpcomingDeadline[]> => {
      if (!user?.id) return [];

      // Get active collaborations with campaign deadlines
      const { data: collaborations } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          status,
          campaigns!inner(
            id,
            title,
            deadline
          )
        `)
        .eq('creator_id', user.id)
        .eq('status', 'active')
        .not('campaigns.deadline', 'is', null)
        .order('campaigns(deadline)', { ascending: true });

      if (!collaborations) return [];

      const now = new Date();
      
      return collaborations
        .map(collab => {
          const deadline = new Date(collab.campaigns?.deadline!);
          const diffTime = deadline.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          return {
            id: collab.id,
            title: collab.campaigns?.title || 'Untitled Campaign',
            deadline: collab.campaigns?.deadline!,
            daysUntilDeadline: diffDays,
            status: collab.status,
          };
        })
        .filter(deadline => deadline.daysUntilDeadline > 0) // Only future deadlines
        .slice(0, 5); // Limit to 5 most urgent
    },
    enabled: !!user?.id,
  });
};