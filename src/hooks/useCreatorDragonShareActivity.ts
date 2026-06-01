import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  deriveCreatorActivity,
  type DSPostRow,
  type DSActivityItem,
} from '@/lib/dragonshareActivity';

export function useCreatorDragonShareActivity() {
  const { user } = useAuth();
  return useQuery<DSActivityItem[]>({
    queryKey: ['dragonshare-activity', 'creator', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .select(
          'id, content_type, submitted_at, boost_status, declined_at, boosts:dragonshare_boosts(status, creator_payout_cents, transferred_at)',
        )
        .eq('creator_id', user!.id)
        .order('submitted_at', { ascending: false });
      if (error) {
        console.error('useCreatorDragonShareActivity query failed:', error);
        return [];
      }
      const rows = (data ?? []) as unknown as DSPostRow[];
      return deriveCreatorActivity(rows).slice(0, 5);
    },
    enabled: !!user,
  });
}
