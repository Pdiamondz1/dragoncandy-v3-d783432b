import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ScheduledPost {
  id: string;
  user_id: string;
  campaign_id: string | null;
  platform: string;
  content_type: string;
  caption: string | null;
  media_urls: string[] | null;
  hashtags: string[] | null;
  scheduled_at: string;
  published_at: string | null;
  status: string;
  ai_suggested_time: boolean;
  ai_reasoning: string | null;
  metadata: Record<string, unknown> | null;
  plan_group_id: string | null;
  plan_order: number | null;
  deliverable_id: string | null;
  created_at: string;
}

export function useScheduledPosts(campaignId: string | undefined, planGroupId?: string) {
  return useQuery({
    queryKey: ['scheduled-posts', campaignId, planGroupId],
    queryFn: async () => {
      let query = supabase
        .from('donny_scheduled_posts')
        .select('id, user_id, campaign_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, published_at, status, ai_suggested_time, ai_reasoning, metadata, plan_group_id, plan_order, deliverable_id, created_at')
        .eq('campaign_id', campaignId!)
        .order('plan_order', { ascending: true });

      if (planGroupId) {
        query = query.eq('plan_group_id', planGroupId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ScheduledPost[];
    },
    enabled: !!campaignId,
    staleTime: 30_000,
  });
}
