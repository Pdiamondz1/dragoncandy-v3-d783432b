import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  deriveBusinessActivity,
  type DSBusinessPostRow,
  type DSBoostMadeRow,
  type DSActivityItem,
} from '@/lib/dragonshareActivity';

export function useBusinessDragonShareActivity(orgId?: string | null) {
  return useQuery<DSActivityItem[]>({
    queryKey: ['dragonshare-activity', 'business', orgId],
    queryFn: async () => {
      const awaitingRes = await supabase
        .from('dragonshare_posts')
        .select('id, content_type, submitted_at, boost_status, declined_at')
        .eq('target_org_id', orgId!)
        .eq('status', 'verified')
        .is('flagged_at', null)
        .is('declined_at', null)
        .order('submitted_at', { ascending: false });

      const boostsRes = await supabase
        .from('dragonshare_boosts')
        .select('post_id, amount_cents, transferred_at, boosted_at')
        .eq('boosting_org_id', orgId!)
        .eq('status', 'transferred')
        .order('transferred_at', { ascending: false });

      if (awaitingRes.error) {
        console.error(
          'useBusinessDragonShareActivity awaiting query failed:',
          awaitingRes.error,
        );
      }
      if (boostsRes.error) {
        console.error(
          'useBusinessDragonShareActivity boosts query failed:',
          boostsRes.error,
        );
      }

      const awaiting = (awaitingRes.data ?? []) as unknown as DSBusinessPostRow[];
      const boostsMade = ((boostsRes.data ?? []) as unknown as {
        post_id: string;
        amount_cents: number;
        transferred_at: string | null;
        boosted_at: string;
      }[]).map<DSBoostMadeRow>((b) => ({
        post_id: b.post_id,
        amount_cents: b.amount_cents,
        transferred_at: b.transferred_at,
        created_at: b.boosted_at,
      }));
      return deriveBusinessActivity(awaiting, boostsMade).slice(0, 5);
    },
    enabled: !!orgId,
  });
}
