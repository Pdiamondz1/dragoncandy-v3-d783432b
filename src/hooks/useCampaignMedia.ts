import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignMediaItem } from '@/types/campaignMedia';

export const useCampaignMedia = (campaignId: string | undefined) => {
  return useQuery({
    queryKey: ['campaign_media', campaignId],
    queryFn: async (): Promise<CampaignMediaItem[]> => {
      const { data, error } = await supabase
        .from('campaign_media')
        .select('id, campaign_id, uploaded_by, media_type, file_url, file_name, file_size_bytes, mime_type, duration_seconds, thumbnail_url, sort_order, ai_analysis, created_at, updated_at')
        .eq('campaign_id', campaignId!)
        .order('sort_order');
      if (error) throw error;
      return data as CampaignMediaItem[];
    },
    enabled: !!campaignId,
  });
};
