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
        // Get total campaigns applied
        const { count: campaignsApplied, error: applicationsError } = await supabase
          .from('campaign_applications')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', user.id);

        if (applicationsError) {
          console.error('Error fetching campaigns applied:', applicationsError);
        }

        // Get completed projects count
        const { count: projectsCompleted, error: projectsError } = await supabase
          .from('campaign_collaborations')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', user.id)
          .eq('status', 'completed');

        if (projectsError) {
          console.error('Error fetching completed projects:', projectsError);
        }

        // Get total revenue - simplified approach
        const { data: applications, error: revenueError } = await supabase
          .from('campaign_applications')
          .select('proposed_rate')
          .eq('creator_id', user.id)
          .in('status', ['accepted']);

        if (revenueError) {
          console.error('Error fetching revenue data:', revenueError);
        }

        const totalRevenue = applications?.reduce((sum, app) => {
          return sum + (app.proposed_rate || 0);
        }, 0) || 0;

        // Get average rating from creator profile
        const { data: profile, error: profileError } = await supabase
          .from('creator_profiles')
          .select('average_rating')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile rating:', profileError);
        }

        return {
          totalRevenue,
          campaignsApplied: campaignsApplied || 0,
          projectsCompleted: projectsCompleted || 0,
          averageRating: Number(profile?.average_rating || 0),
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