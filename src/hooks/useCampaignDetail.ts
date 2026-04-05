// src/hooks/useCampaignDetail.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignMediaItem, CampaignDeliverable } from '@/types/campaignMedia';

export interface CampaignDetail {
  media: CampaignMediaItem[];
  deliverables: CampaignDeliverable[];
  hasRawFootage: boolean;
  referenceMedia: CampaignMediaItem[];
}

export const useCampaignDetail = (campaignId: string | null) => {
  return useQuery({
    queryKey: ['campaign-detail', campaignId],
    queryFn: async (): Promise<CampaignDetail> => {
      if (!campaignId) throw new Error('No campaign ID');

      const [mediaResult, deliverablesResult] = await Promise.all([
        supabase
          .from('campaign_media')
          .select('id, campaign_id, uploaded_by, media_type, file_url, file_name, file_size_bytes, mime_type, duration_seconds, thumbnail_url, sort_order, ai_analysis, created_at, updated_at')
          .eq('campaign_id', campaignId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('campaign_deliverables')
          .select('id, campaign_id, content_type, platform, description, aspect_ratio, max_duration_seconds, status, sort_order, created_at, updated_at')
          .eq('campaign_id', campaignId)
          .order('sort_order', { ascending: true }),
      ]);

      if (mediaResult.error) throw mediaResult.error;
      if (deliverablesResult.error) throw deliverablesResult.error;

      const media = (mediaResult.data || []) as CampaignMediaItem[];
      const deliverables = (deliverablesResult.data || []) as CampaignDeliverable[];

      return {
        media,
        deliverables,
        hasRawFootage: media.some(m => m.media_type === 'raw_footage'),
        referenceMedia: media.filter(m =>
          m.media_type === 'reference_image' || m.media_type === 'reference_video'
        ),
      };
    },
    enabled: !!campaignId,
  });
};
