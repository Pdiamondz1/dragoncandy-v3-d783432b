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

      try {
        // Get active collaborations with campaign deadlines
        const { data: collaborations, error } = await supabase
          .from('campaign_collaborations')
          .select(`
            id,
            status,
            campaign_id,
            campaigns(
              id,
              title,
              deadline
            )
          `)
          .eq('creator_id', user.id)
          .eq('status', 'active');

        if (error) {
          console.error('Error fetching upcoming deadlines:', error);
          return [];
        }

        if (!collaborations) return [];

        const now = new Date();
        
        return collaborations
          .filter(collab => collab.campaigns?.deadline) // Filter out null deadlines
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
          .sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline) // Sort by urgency
          .slice(0, 5); // Limit to 5 most urgent
      } catch (error) {
        console.error('Error in useCreatorUpcomingDeadlines:', error);
        return [];
      }
    },
    enabled: !!user?.id,
  });
};