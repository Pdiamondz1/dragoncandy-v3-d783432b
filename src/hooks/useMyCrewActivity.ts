import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  CREW_ACTIVITY_SELECT,
  normalizeCrewActivityRow,
  type CrewActivityRow,
} from '@/hooks/useCrewActivity';

/**
 * The current creator's cross-crew activity feed — every crew-visible row
 * across all crews they belong to, newest first.
 *
 * There is deliberately NO `group_id` filter: RLS on `crew_activity` returns
 * only the rows this creator may see (crew-wide events + their own
 * participation), so filtering client-side would be both redundant and wrong.
 * `refetchOnWindowFocus` is on because rows are written from other pages.
 */
export function useMyCrewActivity() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['my-crew-activity', user?.id],
    queryFn: async (): Promise<CrewActivityRow[]> => {
      const { data, error } = await supabase
        .from('crew_activity')
        .select(CREW_ACTIVITY_SELECT)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.error('Error fetching my crew activity:', error);
        throw error;
      }
      return (data ?? []).map(normalizeCrewActivityRow);
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  return {
    activity: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
