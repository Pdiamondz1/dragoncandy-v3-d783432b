import { useQuery } from '@tanstack/react-query';
import { useOutstandApi, type SocialAccount } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';
import { getAnalyticsWindow, type TimeRange } from '@/lib/analyticsWindow';
import { mapOutstandAccountMetrics } from '@/lib/outstandMetricsMap';

const getDateRange = getAnalyticsWindow;

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

const CONCURRENCY = 5;

/**
 * Re-exported from the shared module so the scheduled `account-metrics-capture`
 * job and this hook compute BYTE-IDENTICAL `period_start`/`period_end` strings.
 * Those two strings are part of the `social_analytics_cache` conflict key and are
 * read back with an exact `.eq()` on each — so any disagreement, even a
 * millisecond, means the cache silently never hits.
 *
 * That was the live bug: the previous local implementation used `now` at full
 * millisecond precision, so `end` was literally the current instant. Two page
 * loads a second apart produced different keys, the lookup never matched, and
 * `social_analytics_cache` was WRITE-ONLY — its 1-hour freshness filter never got
 * a chance to apply and every visit re-hit the provider. Nothing ever errored.
 */
export { getAnalyticsWindow as getDateRange } from '@/lib/analyticsWindow';
export type { TimeRange, DateRange } from '@/lib/analyticsWindow';

export function computeDelta(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

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

      const { current: currentRange, prior: priorRange } = getDateRange(timeRange);
      const periodStartIso = currentRange.start.toISOString();
      const periodEndIso = currentRange.end.toISOString();

      const { data: cached } = await supabase
        .from('social_analytics_cache')
        .select('outstand_account_id, metric_type, metric_value, period_start, fetched_at')
        .eq('period_start', periodStartIso)
        .eq('period_end', periodEndIso)
        .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

      const cachedByKey = new Map(
        (cached ?? []).map((row) => [
          `${row.outstand_account_id}:${row.metric_type}`,
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
          const cacheKey = `${account.id}:followers`;
          const cachedRow = cachedByKey.get(cacheKey);

          if (cachedRow) {
            const followers = Number(cachedRow.metric_value) || 0;
            const engRow = cachedByKey.get(`${account.id}:engagement`);
            const reachRow = cachedByKey.get(`${account.id}:reach`);
            const postsRow = cachedByKey.get(`${account.id}:posts`);
            totalFollowers += followers;
            totalEngagement += Number(engRow?.metric_value) || 0;
            totalReach += Number(reachRow?.metric_value) || 0;
            postsPublished += Number(postsRow?.metric_value) || 0;
            platformMetrics.push({
              platform: account.network ?? 'unknown',
              accountId: account.id,
              followers,
              followersDelta: null,
              engagementRate: Number(engRow?.metric_value) || 0,
            });
            return;
          }

          try {
            const res = await api.get(`/social-accounts/${account.id}/metrics`);
            if (!res.success || !res.data) return;
            // Shared mapper — the response uses snake_case counts with `reach`
            // nested under an `engagement` OBJECT. The old reads
            // (followers/engagementRate/reach/postsCount) matched nothing, so
            // this tab rendered zeros for accounts that had real numbers.
            const mapped = mapOutstandAccountMetrics(res.data);
            if (!mapped) return;
            const followers = mapped.followers;
            const engagement = mapped.engagementRate;
            const reach = mapped.reach;

            totalFollowers += followers;
            totalReach += reach;
            totalEngagement += engagement;
            postsPublished += mapped.postsCount;

            platformMetrics.push({
              platform: account.network ?? 'unknown',
              accountId: account.id,
              followers,
              followersDelta: null,
              engagementRate: engagement,
            });

            if (userId) {
              const cacheBase = {
                user_id: userId,
                outstand_account_id: account.id,
                platform: account.network ?? 'unknown',
                period_start: periodStartIso,
                period_end: periodEndIso,
                fetched_at: new Date().toISOString(),
              };
              await supabase.from('social_analytics_cache').upsert(
                [
                  { ...cacheBase, metric_type: 'followers', metric_value: followers },
                  { ...cacheBase, metric_type: 'engagement', metric_value: engagement },
                  { ...cacheBase, metric_type: 'reach', metric_value: reach },
                  { ...cacheBase, metric_type: 'posts', metric_value: mapped.postsCount },
                ],
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

      let priorFollowers: number | null = null;
      let priorEngagement: number | null = null;
      let priorReach: number | null = null;
      let priorPosts: number | null = null;

      const priorStartIso = priorRange.start.toISOString();
      const priorEndIso = priorRange.end.toISOString();

      const { data: priorCached } = await supabase
        .from('social_analytics_cache')
        .select('outstand_account_id, metric_type, metric_value')
        .eq('period_start', priorStartIso)
        .eq('period_end', priorEndIso);

      const priorFollowersByAccount = new Map<string, number>();

      if (priorCached && priorCached.length > 0) {
        const sums: Record<string, { total: number; count: number }> = {};
        for (const row of priorCached) {
          const val = Number(row.metric_value) || 0;
          if (!sums[row.metric_type]) sums[row.metric_type] = { total: 0, count: 0 };
          sums[row.metric_type].total += val;
          sums[row.metric_type].count++;
          if (row.metric_type === 'followers') {
            priorFollowersByAccount.set(row.outstand_account_id, val);
          }
        }
        if (sums.followers) priorFollowers = sums.followers.total;
        if (sums.engagement && sums.engagement.count > 0) priorEngagement = sums.engagement.total / sums.engagement.count;
        if (sums.reach) priorReach = sums.reach.total;
        if (sums.posts) priorPosts = sums.posts.total;
      }

      for (const pm of platformMetrics) {
        const priorVal = priorFollowersByAccount.get(pm.accountId);
        if (priorVal !== undefined) {
          pm.followersDelta = computeDelta(pm.followers, priorVal);
        }
      }

      return {
        totalFollowers,
        engagementRate: Math.round(avgEngagement * 100) / 100,
        totalReach,
        postsPublished,
        followersDelta: computeDelta(totalFollowers, priorFollowers),
        engagementDelta: computeDelta(avgEngagement, priorEngagement),
        reachDelta: computeDelta(totalReach, priorReach),
        postsDelta: computeDelta(postsPublished, priorPosts),
        platformBreakdown: platformMetrics,
      };
    },
    enabled: accounts.length > 0,
    staleTime: 60 * 60 * 1000,
  });
}
