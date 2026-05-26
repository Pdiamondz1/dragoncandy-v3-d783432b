import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface LocationCampaignCount {
  org_unit_id: string;
  count: number;
}

export function useLocationCampaignCounts(orgId?: string | null) {
  return useQuery({
    queryKey: ['location-campaign-counts', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('org_unit_id')
        .eq('org_id', orgId!)
        .in('status', ['active', 'published']);

      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.org_unit_id) {
          counts.set(row.org_unit_id, (counts.get(row.org_unit_id) ?? 0) + 1);
        }
      }

      return Array.from(counts.entries()).map(([org_unit_id, count]) => ({
        org_unit_id,
        count,
      })) as LocationCampaignCount[];
    },
    enabled: !!orgId,
    staleTime: 120_000,
  });
}
