import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActivityItem {
  id: string;
  type: 'application' | 'collaboration' | 'completion';
  status: string;
  description: string;
  created_at: string;
  campaign_id?: string;
}

export const useCreatorRecentActivity = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-recent-activity', user?.id],
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!user?.id) return [];

      try {
        const activities: ActivityItem[] = [];

        // Get recent applications
        const { data: applications, error: applicationsError } = await supabase
          .from('campaign_applications')
          .select(`
            id,
            status,
            created_at,
            campaign_id,
            campaigns(title)
          `)
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (applicationsError) {
          console.error('Error fetching applications:', applicationsError);
        } else {
          (applications as any[])?.forEach((app: any) => {
            activities.push({
              id: app.id,
              type: 'application',
              status: app.status,
              description: `Applied to "${app.campaigns?.title || 'Unknown Campaign'}" campaign`,
              created_at: app.created_at,
              campaign_id: app.campaign_id,
            });
          });
        }

        // Get recent collaborations
        const { data: collaborations, error: collaborationsError } = await supabase
          .from('campaign_collaborations')
          .select(`
            id,
            status,
            created_at,
            updated_at,
            campaign_id,
            campaigns(title)
          `)
          .eq('creator_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(5);

        if (collaborationsError) {
          console.error('Error fetching collaborations:', collaborationsError);
        } else {
          (collaborations as any[])?.forEach((collab: any) => {
            let description = '';
            switch (collab.status) {
              case 'active':
                description = `Started working on "${collab.campaigns?.title || 'Unknown Campaign'}"`;
                break;
              case 'completed':
                description = `Completed project "${collab.campaigns?.title || 'Unknown Campaign'}"`;
                break;
              default:
                description = `Project "${collab.campaigns?.title || 'Unknown Campaign'}" status updated`;
            }

            activities.push({
              id: collab.id,
              type: 'collaboration',
              status: collab.status,
              description,
              created_at: collab.updated_at,
              campaign_id: collab.campaign_id,
            });
          });
        }

        // Sort by date and return latest 6
        return activities
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 6);
      } catch (error) {
        console.error('Error in useCreatorRecentActivity:', error);
        return [];
      }
    },
    enabled: !!user?.id,
  });
};