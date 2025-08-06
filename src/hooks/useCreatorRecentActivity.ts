import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActivityItem {
  id: string;
  type: 'application' | 'collaboration' | 'completion';
  status: string;
  description: string;
  created_at: string;
}

export const useCreatorRecentActivity = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-recent-activity', user?.id],
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!user?.id) return [];

      const activities: ActivityItem[] = [];

      // Get recent applications
      const { data: applications } = await supabase
        .from('campaign_applications')
        .select(`
          id,
          status,
          created_at,
          campaigns!inner(title)
        `)
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      applications?.forEach(app => {
        activities.push({
          id: app.id,
          type: 'application',
          status: app.status,
          description: `Applied to "${app.campaigns?.title}" campaign`,
          created_at: app.created_at,
        });
      });

      // Get recent collaborations
      const { data: collaborations } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          status,
          created_at,
          updated_at,
          campaigns!inner(title)
        `)
        .eq('creator_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5);

      collaborations?.forEach(collab => {
        let description = '';
        switch (collab.status) {
          case 'active':
            description = `Started working on "${collab.campaigns?.title}"`;
            break;
          case 'completed':
            description = `Completed project "${collab.campaigns?.title}"`;
            break;
          default:
            description = `Project "${collab.campaigns?.title}" status updated`;
        }

        activities.push({
          id: collab.id,
          type: 'collaboration',
          status: collab.status,
          description,
          created_at: collab.updated_at,
        });
      });

      // Sort by date and return latest 6
      return activities
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6);
    },
    enabled: !!user?.id,
  });
};