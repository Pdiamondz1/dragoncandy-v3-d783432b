import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignDeliverable } from '@/types/campaignMedia';

export const useCampaignDeliverables = (campaignId: string | undefined) => {
  return useQuery({
    queryKey: ['campaign_deliverables', campaignId],
    queryFn: async (): Promise<CampaignDeliverable[]> => {
      const { data, error } = await supabase
        .from('campaign_deliverables')
        .select('id, campaign_id, content_type, platform, description, aspect_ratio, max_duration_seconds, status, sort_order, created_at, updated_at')
        .eq('campaign_id', campaignId!)
        .order('sort_order');
      if (error) throw error;
      return data as CampaignDeliverable[];
    },
    enabled: !!campaignId,
  });
};
