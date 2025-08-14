import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ApplicationCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export const useCampaignApplicationsCount = (campaignId: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-applications-count', campaignId],
    queryFn: async (): Promise<ApplicationCounts> => {
      if (!campaignId) {
        return { total: 0, pending: 0, accepted: 0, rejected: 0 };
      }

      // Get total count
      const { count: totalCount, error: totalError } = await supabase
        .from('campaign_applications')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);

      if (totalError) {
        console.error('Error fetching total applications count:', totalError);
        throw totalError;
      }

      // Get count by status
      const { count: pendingCount } = await supabase
        .from('campaign_applications')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'pending');

      const { count: acceptedCount } = await supabase
        .from('campaign_applications')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'accepted');

      const { count: rejectedCount } = await supabase
        .from('campaign_applications')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'rejected');

      return {
        total: totalCount || 0,
        pending: pendingCount || 0,
        accepted: acceptedCount || 0,
        rejected: rejectedCount || 0,
      };
    },
    enabled: !!campaignId && !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};