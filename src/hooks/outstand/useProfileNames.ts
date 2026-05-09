import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useProfileNames(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  return useQuery({
    queryKey: ['profile-names', uniqueIds.sort().join(',')],
    queryFn: async (): Promise<Record<string, string>> => {
      if (uniqueIds.length === 0) return {};
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, username')
        .in('id', uniqueIds);
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        map[p.id] = name || p.username || p.id.slice(0, 8);
      }
      return map;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
