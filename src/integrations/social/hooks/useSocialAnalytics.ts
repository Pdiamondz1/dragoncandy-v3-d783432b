import { useQuery } from '@tanstack/react-query';
import { useSocialProxy } from '@/integrations/social/client';
import { supabase } from '@/integrations/supabase/client';
import type { AccountAnalytics, SocialAccount } from '@/integrations/social/contract';
import { accountAnalyticsToCacheRows } from './cache-map';

/**
 * Rolling 7-day window for the analytics cache period. Mirrors the period logic
 * of the legacy `useAccountMetrics` hook so cached rows share a key shape.
 */
function currentPeriod(now = new Date()): { start: string; end: string } {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Headless account-analytics query over the `social-proxy` gateway. Fetches a
 * contract `AccountAnalytics` payload and, on success, upserts the four metric
 * rows into `social_analytics_cache` via `accountAnalyticsToCacheRows` (same
 * `metric_type` names + upsert key as the legacy Outstand hook).
 *
 * Dormant until Phase 3 swaps it in.
 */
export function useSocialAnalytics(account: SocialAccount | null | undefined) {
  const { call, session } = useSocialProxy();
  const userId = session?.user?.id ?? null;
  const accountId = account?.id ?? null;

  return useQuery({
    queryKey: ['social-analytics', accountId],
    queryFn: async (): Promise<AccountAnalytics> => {
      const analytics = await call<AccountAnalytics>('getAccountAnalytics', {
        accountId,
      });

      if (userId && account) {
        const rows = accountAnalyticsToCacheRows(
          userId,
          { id: account.id, platform: account.platform },
          analytics,
          currentPeriod(),
        );
        const { error } = await supabase
          .from('social_analytics_cache')
          .upsert(rows, {
            onConflict: 'user_id,outstand_account_id,metric_type,period_start,period_end',
          });
        if (error) {
          // Caching is best-effort — the fetched analytics are still returned.
          console.warn('[useSocialAnalytics] cache upsert failed:', error.message);
        }
      }

      return analytics;
    },
    enabled: !!session && !!accountId,
    staleTime: 60 * 60 * 1000,
  });
}
