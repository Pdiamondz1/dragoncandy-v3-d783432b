import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GroupMemberCounts {
  active: number;
  invited: number;
}

/**
 * Roster sizes for the crews shown on the business Crews index.
 *
 * One grouped fetch rather than a `count: 'exact'` head query per crew —
 * `cgm_owner_select` permits selecting across every crew the caller owns, so
 * N round trips buy nothing. `declined` and `removed` are filtered out both
 * because they aren't part of the roster and because it bounds the row count.
 */
export function useCreatorGroupMemberCounts(groupIds: string[]) {
  // Sorted key so a re-ordered array doesn't miss the cache.
  const cacheKey = [...groupIds].sort().join(',');

  const query = useQuery({
    queryKey: ['creator-group-member-counts', cacheKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_group_members')
        .select('group_id, status')
        .in('group_id', groupIds)
        .in('status', ['active', 'invited']);

      if (error) throw error;

      const counts = new Map<string, GroupMemberCounts>();
      for (const row of data ?? []) {
        const entry = counts.get(row.group_id) ?? { active: 0, invited: 0 };
        if (row.status === 'active') entry.active += 1;
        else if (row.status === 'invited') entry.invited += 1;
        counts.set(row.group_id, entry);
      }
      return counts;
    },
    enabled: groupIds.length > 0,
    staleTime: 60_000,
  });

  return {
    counts: query.data ?? new Map<string, GroupMemberCounts>(),
    isLoading: query.isLoading,
  };
}
