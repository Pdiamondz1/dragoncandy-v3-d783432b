import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReconnectNeededPlatform {
  platform: string;
  platformHandle: string | null;
}

interface AccountStatusRow {
  platform: string;
  status: string;
  platform_handle: string | null;
}

/**
 * Pure selector: a platform needs reconnection when the user has at least one
 * row flagged `status='error'` AND no `status='active'` row for that platform.
 * Order/recency is irrelevant — any active row clears the platform, and a
 * user-initiated disconnect (`status='revoked'`) never triggers it.
 *
 * WHO SETS `status='error'` (corrected 2026-08-04): the `account-metrics-capture`
 * cron. It flags an account only when a metrics call returns 401/403 AND
 * Outstand's `/health` endpoint — which retries the token refresh before
 * answering — confirms `healthy:false`. It also CLEARS the flag once metrics
 * resolve again, so a recovered account stops nagging.
 *
 * This docstring previously credited "the outstand-reconcile sweep", which was
 * deleted and had no cron behind it anyway. Nothing set this flag for a while,
 * which is why a genuinely dead YouTube token sat as `status='active'` — the UI
 * faithfully rendered a selector whose input nobody was maintaining.
 */
export function platformsNeedingReconnect(
  rows: AccountStatusRow[],
): ReconnectNeededPlatform[] {
  const activePlatforms = new Set<string>();
  for (const r of rows) {
    if (r.status === 'active') activePlatforms.add(r.platform);
  }

  const result = new Map<string, ReconnectNeededPlatform>();
  for (const r of rows) {
    if (r.status === 'error' && !activePlatforms.has(r.platform) && !result.has(r.platform)) {
      result.set(r.platform, { platform: r.platform, platformHandle: r.platform_handle });
    }
  }
  return [...result.values()];
}

export function useReconnectNeeded(userId: string | undefined) {
  return useQuery({
    queryKey: ['reconnect-needed', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('business_outstand_accounts')
        .select('platform, status, platform_handle')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching reconnect-needed accounts:', error);
        throw error;
      }

      return platformsNeedingReconnect((data ?? []) as AccountStatusRow[]);
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}
