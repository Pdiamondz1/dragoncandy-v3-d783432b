import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CreatorPlatformStat {
  platform: string;
  followers: number;
}

export interface CreatorSocialStats {
  platforms: CreatorPlatformStat[];
  totalFollowers: number;
  avgEngagementRate: number | null;
}

const MIN_DISPLAY_FOLLOWERS = 100;

export function useCreatorSocialStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-social-stats', userId],
    queryFn: async (): Promise<CreatorSocialStats> => {
      if (!userId) return { platforms: [], totalFollowers: 0, avgEngagementRate: null };

      const { data, error } = await supabase
        .from('social_analytics_cache')
        .select('platform, metric_type, metric_value, fetched_at')
        .eq('user_id', userId)
        .in('metric_type', ['followers', 'engagement_rate'])
        .order('fetched_at', { ascending: false });

      if (error || !data || data.length === 0) {
        return { platforms: [], totalFollowers: 0, avgEngagementRate: null };
      }

      const seenFollowers = new Set<string>();
      const seenEngagement = new Set<string>();
      const platforms: CreatorPlatformStat[] = [];
      let totalFollowers = 0;
      const engagementRates: number[] = [];

      for (const row of data) {
        if (row.metric_type === 'followers' && !seenFollowers.has(row.platform)) {
          seenFollowers.add(row.platform);
          const followers = Number(row.metric_value) || 0;
          if (followers >= MIN_DISPLAY_FOLLOWERS) {
            platforms.push({ platform: row.platform, followers });
            totalFollowers += followers;
          }
        } else if (row.metric_type === 'engagement_rate' && !seenEngagement.has(row.platform)) {
          seenEngagement.add(row.platform);
          const rate = Number(row.metric_value);
          if (!isNaN(rate) && rate > 0) engagementRates.push(rate);
        }
      }

      const avgEngagementRate =
        engagementRates.length > 0
          ? engagementRates.reduce((sum, r) => sum + r, 0) / engagementRates.length
          : null;

      return { platforms, totalFollowers, avgEngagementRate };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
