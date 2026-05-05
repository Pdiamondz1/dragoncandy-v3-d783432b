import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { SyncStatus } from '../components/SyncStatusBadge';

/**
 * Returns the Toast sync status for a given promotion by checking
 * the most recent toast_sync_events row for the business's connection.
 *
 * Status derivation:
 *   - No connection at all → 'not_connected'
 *   - Latest event is discount_push_skipped_tier → 'tier_unavailable'
 *   - Latest event is discount_push + success → 'synced'
 *   - Latest event is discount_push + pending → 'pending'
 *   - Latest event is discount_push + failed → 'failed'
 *   - No sync events for this promotion → 'not_connected'
 */
export const useToastSyncStatus = (promotionId: string | undefined) => {
  const { user } = useAuth();

  return useQuery<SyncStatus>({
    queryKey: ['toast-sync-status', promotionId],
    queryFn: async (): Promise<SyncStatus> => {
      if (!promotionId || !user?.id) return 'not_connected';

      // toast_sync_events is not in generated types yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: events, error } = await (supabase as any)
        .from('toast_sync_events')
        .select('event_type, status')
        .or(
          `request_payload->promotion_id.eq.${promotionId},` +
          `request_payload->>promotion_id.eq.${promotionId}`
        )
        .in('event_type', ['discount_push', 'discount_push_skipped_tier', 'discount_update', 'discount_delete'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('useToastSyncStatus query error:', error);
        return 'not_connected';
      }

      if (!events || events.length === 0) return 'not_connected';

      const latest = events[0];

      if (latest.event_type === 'discount_push_skipped_tier') return 'tier_unavailable';
      if (latest.status === 'success') return 'synced';
      if (latest.status === 'pending') return 'pending';
      if (latest.status === 'failed') return 'failed';
      if (latest.status === 'skipped') return 'tier_unavailable';

      return 'not_connected';
    },
    enabled: !!promotionId && !!user?.id,
    staleTime: 30_000, // Cache for 30s — sync status doesn't change rapidly
  });
};
