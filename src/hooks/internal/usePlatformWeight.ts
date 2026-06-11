import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WeightSnapshot } from '@/lib/internal/weightThresholds';

export interface PlatformWeightRow extends WeightSnapshot {
  id: string;
  row_counts: Record<string, number>;
}

export function usePlatformWeight() {
  return useQuery({
    queryKey: ['aios', 'platform-weight'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_weight')
        .select('id, captured_at, db_bytes, storage_bytes, users_total, row_counts')
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
