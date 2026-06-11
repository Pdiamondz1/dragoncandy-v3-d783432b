import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContentBrief {
  recommended_format: string;
  platform: string;
  hook: string;
  angles: string[];
  sample_caption: string;
  hashtags: string[];
  best_time: string;
  rationale: string;
}

export interface ContentBriefResponse {
  brief: ContentBrief;
  brief_id: string | null;
  used_performance_data: boolean;
}

export function useContentBrief() {
  return useMutation({
    mutationFn: async (organizationId: string): Promise<ContentBriefResponse> => {
      const { data, error } = await supabase.functions.invoke('content-strategy-recommend', {
        body: { organization_id: organizationId },
      });
      if (error) throw error;
      if (!data?.brief) throw new Error(data?.error ?? 'No brief returned');
      return data as ContentBriefResponse;
    },
  });
}
