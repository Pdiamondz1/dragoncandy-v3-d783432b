import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ApplicationCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export const useCampaignApplicationsCount = (campaignId: string) => {
  return useQuery({
    queryKey: ['campaign-applications-count', campaignId],
    queryFn: async (): Promise<ApplicationCounts> => {
      const { data, error } = await supabase
        .from('campaign_applications')
        .select('status')
        .eq('campaign_id', campaignId);

      if (error) {
        console.error('Error fetching application counts:', error);
        throw error;
      }

      const counts = {
        total: data.length,
        pending: data.filter(app => app.status === 'pending').length,
        accepted: data.filter(app => app.status === 'accepted').length,
        rejected: data.filter(app => app.status === 'rejected').length,
      };

      return counts;
    },
    enabled: !!campaignId,
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
};