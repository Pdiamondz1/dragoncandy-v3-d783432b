import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const BRIEF_LIMIT = 10;

export interface CreatorBriefPerformanceRow {
  brief_id: string;
  organization_id: string;
  created_at: string;
  used_performance_data: boolean;
  brief: { recommended_format?: string; platform?: string; [key: string]: unknown };
  is_posted: boolean;
  post_count: number;
  measurable_post_count: number;
  total_views: number | null;
  total_likes: number | null;
  total_comments: number | null;
  total_shares: number | null;
  avg_engagement_rate: number | null;
  last_captured_at: string | null;
}

export function useCreatorBriefPerformance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['creator-brief-performance', user?.id],
    queryFn: async (): Promise<CreatorBriefPerformanceRow[]> => {
      const { data, error } = await supabase.rpc('get_creator_brief_performance', {
        result_limit: BRIEF_LIMIT,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CreatorBriefPerformanceRow[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
