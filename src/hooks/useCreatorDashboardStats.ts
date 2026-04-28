import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorDashboardStats {
  totalRevenue: number;
  campaignsApplied: number;
  projectsCompleted: number;
  averageRating: number;
}

export const useCreatorDashboardStats = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-dashboard-stats', user?.id],
    queryFn: async (): Promise<CreatorDashboardStats> => {
      if (!user?.id) {
        return {
          totalRevenue: 0,
          campaignsApplied: 0,
          projectsCompleted: 0,
          averageRating: 0,
        };
      }

      try {
        const [applicationsResult, projectsResult, revenueResult, profileResult] = await Promise.all([
          supabase
            .from('campaign_applications')
            .select('*', { count: 'exact', head: true })
            .eq('creator_id', user.id),
          supabase
            .from('campaign_collaborations')
            .select('*', { count: 'exact', head: true })
            .eq('creator_id', user.id)
            .eq('status', 'completed'),
          supabase
            .from('campaign_applications')
            .select('proposed_rate')
            .eq('creator_id', user.id)
            .in('status', ['accepted']),
          supabase
            .from('creator_profiles')
            .select('average_rating')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (applicationsResult.error) console.error('Error fetching campaigns applied:', applicationsResult.error);
        if (projectsResult.error) console.error('Error fetching completed projects:', projectsResult.error);
        if (revenueResult.error) console.error('Error fetching revenue data:', revenueResult.error);
        if (profileResult.error) console.error('Error fetching profile rating:', profileResult.error);

        const totalRevenue = revenueResult.data?.reduce((sum, app) => {
          return sum + (app.proposed_rate || 0);
        }, 0) || 0;

        return {
          totalRevenue,
          campaignsApplied: applicationsResult.count || 0,
          projectsCompleted: projectsResult.count || 0,
          averageRating: Number(profileResult.data?.average_rating || 0),
        };
      } catch (error) {
        console.error('Error in useCreatorDashboardStats:', error);
        return {
          totalRevenue: 0,
          campaignsApplied: 0,
          projectsCompleted: 0,
          averageRating: 0,
        };
      }
    },
    enabled: !!user?.id,
  });
};