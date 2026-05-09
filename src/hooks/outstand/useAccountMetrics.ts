import { useQuery } from '@tanstack/react-query';
import { useOutstandApi, type SocialAccount } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';

export interface AccountMetrics {
  totalFollowers: number;
  engagementRate: number;
  totalReach: number;
  postsPublished: number;
  followersDelta: number | null;
  engagementDelta: number | null;
  reachDelta: number | null;
  postsDelta: number | null;
  platformBreakdown: PlatformMetrics[];
}

export interface PlatformMetrics {
  platform: string;
  accountId: string;
  followers: number;
  followersDelta: number | null;
  engagementRate: number;
}

type TimeRange = '7d' | '30d' | '90d';

export function useAccountMetrics(accounts: SocialAccount[], timeRange: TimeRange) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });

  return useQuery({
    queryKey: ['outstand', 'metrics', accounts.map((a) => a.id).join(','), timeRange],
    queryFn: async (): Promise<AccountMetrics> => {
      // Check Supabase cache for data fresher than 1 hour
      const { data: cached } = await supabase
        .from('social_analytics_cache')
        .select('*')
        .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

      const cachedByKey = new Map(
        (cached ?? []).map((row: Record<string, unknown>) => [
          `${row.outstand_account_id}:${row.metric_type}:${row.period_start}`,
          row,
        ]),
      );

      const platformMetrics: PlatformMetrics[] = [];
      let totalFollowers = 0;
      let totalReach = 0;
      let totalEngagement = 0;
      let postsPublished = 0;

      await Promise.all(
        accounts.map(async (account) => {
          const cacheKey = `${account.id}:followers:current`;
          const cachedRow = cachedByKey.get(cacheKey);

          if (cachedRow) {
            const followers = Number(cachedRow.metric_value) || 0;
            totalFollowers += followers;
            platformMetrics.push({
              platform: account.network ?? 'unknown',
              accountId: account.id,
              followers,
              followersDelta: null,
              engagementRate: 0,
            });
            return;
          }

          try {
            const res = await api.get(`/social-accounts/${account.id}/metrics`);
            if (!res.success || !res.data) return;
            const m = res.data as Record<string, number>;
            const followers = m.followers ?? m.followerCount ?? 0;
            const engagement = m.engagementRate ?? 0;
            const reach = m.reach ?? m.impressions ?? 0;

            totalFollowers += followers;
            totalReach += reach;
            totalEngagement += engagement;
            postsPublished += m.postsCount ?? 0;

            platformMetrics.push({
              platform: account.network ?? 'unknown',
              accountId: account.id,
              followers,
              followersDelta: null,
              engagementRate: engagement,
            });

            // Upsert fresh data into cache
            await supabase.from('social_analytics_cache').upsert(
              {
                outstand_account_id: account.id,
                platform: account.network ?? 'unknown',
                metric_type: 'followers',
                metric_value: followers,
                period_start: 'current',
                period_end: 'current',
                fetched_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,outstand_account_id,metric_type,period_start,period_end' },
            );
          } catch {
            // Skip accounts whose metrics can't be fetched
          }
        }),
      );

      const avgEngagement = accounts.length > 0 ? totalEngagement / accounts.length : 0;

      return {
        totalFollowers,
        engagementRate: Math.round(avgEngagement * 100) / 100,
        totalReach,
        postsPublished,
        followersDelta: null,
        engagementDelta: null,
        reachDelta: null,
        postsDelta: null,
        platformBreakdown: platformMetrics,
      };
    },
    enabled: accounts.length > 0,
    staleTime: 60 * 60 * 1000,
  });
}
