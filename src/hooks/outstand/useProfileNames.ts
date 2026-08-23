import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Maps user ids to a display name.
 *
 * This hook used to select `id, first_name, last_name, username` from `profiles`. Those
 * three columns DO NOT EXIST and never have — no migration creates them, they are absent
 * from the generated types, and they are absent from the profiles column inventory the
 * read lockdown (20260824140000) enumerated. PostgREST rejected the whole query with 42703
 * every time it ran, and because the hook discarded `error` and fell back to `data ?? []`,
 * the failure was invisible: every caller silently received an empty map and rendered
 * truncated user ids instead of names.
 *
 * Found by the Codex second review, which read it as the profiles SELECT lockdown breaking
 * a working query. It was already broken; the lockdown neither caused nor worsened it. The
 * fix is `full_name`, which is the column that actually exists and is SELECT-granted.
 *
 * The error is now surfaced rather than swallowed — a query that cannot answer must not be
 * indistinguishable from one that answered "nobody has a name".
 */
export function useProfileNames(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  return useQuery({
    queryKey: ['profile-names', uniqueIds.sort().join(',')],
    queryFn: async (): Promise<Record<string, string>> => {
      if (uniqueIds.length === 0) return {};
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', uniqueIds);
      if (error) {
        console.error('useProfileNames: failed to load profile names', error);
        throw error;
      }
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        map[p.id] = p.full_name?.trim() || p.id.slice(0, 8);
      }
      return map;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
