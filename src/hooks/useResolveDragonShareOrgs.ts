import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ResolvedOrg } from '@/lib/dragonshareOrgs';

export function useResolveDragonShareOrgs(orgIds: string[]) {
  const sorted = [...new Set(orgIds)].sort();
  return useQuery({
    queryKey: ['dragonshare-resolved-orgs', sorted],
    queryFn: async (): Promise<ResolvedOrg[]> => {
      if (sorted.length === 0) return [];
      const { data, error } = await supabase.rpc('resolve_dragonshare_orgs', { p_org_ids: sorted });
      if (error) throw error;
      return (data ?? []) as ResolvedOrg[];
    },
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
