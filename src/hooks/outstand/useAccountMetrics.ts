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

const CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function next(): Promise<void> {
    const idx = i++;
    if (idx >= items.length) return;
    results[idx] = await fn(items[idx]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

export function useAccountMetrics(accounts: SocialAccount[], timeRange: TimeRange) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });

  return useQuery({
    queryKey: ['outstand', 'metrics', accounts.map((a) => a.id).join(','), timeRange],
    queryFn: async (): Promise<AccountMetrics> => {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      const { data: cached } = await supabase
        .from('social_analytics_cache')
        .select('outstand_account_id, metric_type, metric_value, period_start, fetched_at')
        .eq('period_start', timeRange)
        .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

      const cachedByKey = new Map(
        (cached ?? []).map((row) => [
          `${row.outstand_account_id}:${row.metric_type}:${row.period_start}`,
          row,
        ]),
      );

      const platformMetrics: PlatformMetrics[] = [];
      let totalFollowers = 0;
      let totalReach = 0;
      let totalEngagement = 0;
      let postsPublished = 0;

      await mapWithConcurrency(
        accounts,
        async (account) => {
          const cacheKey = `${account.id}:followers:${timeRange}`;
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

            if (userId) {
              await supabase.from('social_analytics_cache').upsert(
                {
                  user_id: userId,
                  outstand_account_id: account.id,
                  platform: account.network ?? 'unknown',
                  metric_type: 'followers',
                  metric_value: followers,
                  period_start: timeRange,
                  period_end: timeRange,
                  fetched_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,outstand_account_id,metric_type,period_start,period_end' },
              );
            }
          } catch {
            // Skip accounts whose metrics can't be fetched
          }
        },
        CONCURRENCY,
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
