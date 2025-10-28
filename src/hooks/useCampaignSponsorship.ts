import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useCampaignSponsorship = (campaignId: string) => {
  return useQuery({
    queryKey: ['campaign-sponsorship', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select('id, brand_id, restaurant_id, status')
        .eq('campaign_id', campaignId)
        .eq('status', 'accepted')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    },
    enabled: !!campaignId,
    staleTime: 30000, // Cache for 30 seconds
  });
};
