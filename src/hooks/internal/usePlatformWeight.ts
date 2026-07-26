import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WeightSnapshot } from '@/lib/internal/weightThresholds';

export interface PlatformWeightRow extends WeightSnapshot {
  id: string;
  row_counts: Record<string, number>;
  // Synthetic-excluded parallel counts (null on pre-2026-07-23 snapshots). Physical totals
  // above stay synthetic-inclusive by design (real disk/rows drive scaling decisions); these
  // are the real-growth view. See docs/wiki concept "synthetic-weight-engine".
  row_counts_real?: Record<string, number> | null;
  users_total_real?: number | null;
}

export function usePlatformWeight() {
  return useQuery({
    queryKey: ['aios', 'platform-weight'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_weight')
        .select('id, captured_at, db_bytes, storage_bytes, users_total, row_counts, users_total_real, row_counts_real')
        .order('captured_at', { ascending: true })
        .limit(365);
      if (error) {
        console.error('platform_weight query failed:', error);
        throw error;
      }
      return (data ?? []) as unknown as PlatformWeightRow[];
    },
  });
}
