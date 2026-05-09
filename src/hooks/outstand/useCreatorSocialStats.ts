import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CreatorPlatformStat {
  platform: string;
  followers: number;
}

export interface CreatorSocialStats {
  platforms: CreatorPlatformStat[];
  totalFollowers: number;
}

export function useCreatorSocialStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-social-stats', userId],
    queryFn: async (): Promise<CreatorSocialStats> => {
      if (!userId) return { platforms: [], totalFollowers: 0 };

      const { data, error } = await supabase
        .from('social_analytics_cache')
        .select('platform, metric_type, metric_value, fetched_at')
        .eq('user_id', userId)
        .eq('metric_type', 'followers')
        .order('fetched_at', { ascending: false });

      if (error || !data || data.length === 0) {
        return { platforms: [], totalFollowers: 0 };
      }

      const seen = new Set<string>();
      const platforms: CreatorPlatformStat[] = [];
      let totalFollowers = 0;

      for (const row of data) {
        if (seen.has(row.platform)) continue;
        seen.add(row.platform);
        const followers = Number(row.metric_value) || 0;
        platforms.push({ platform: row.platform, followers });
        totalFollowers += followers;
      }

      return { platforms, totalFollowers };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
