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

      // Get total campaigns applied
      const { count: campaignsApplied } = await supabase
        .from('campaign_applications')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id);

      // Get completed projects count
      const { count: projectsCompleted } = await supabase
        .from('campaign_collaborations')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .eq('status', 'completed');

      // Get total revenue from completed collaborations
      const { data: completedCollaborations } = await supabase
        .from('campaign_collaborations')
        .select(`
          campaign_applications!inner(proposed_rate)
        `)
        .eq('creator_id', user.id)
        .eq('status', 'completed');

      const totalRevenue = completedCollaborations?.reduce((sum, collab) => {
        return sum + (collab.campaign_applications?.proposed_rate || 0);
      }, 0) || 0;

      // Get average rating from creator profile
      const { data: profile } = await supabase
        .from('creator_profiles')
        .select('average_rating')
        .eq('user_id', user.id)
        .single();

      return {
        totalRevenue,
        campaignsApplied: campaignsApplied || 0,
        projectsCompleted: projectsCompleted || 0,
        averageRating: Number(profile?.average_rating || 0),
      };
    },
    enabled: !!user?.id,
  });
};