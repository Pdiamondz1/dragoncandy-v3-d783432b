import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Live database-health snapshot from aios_db_health(). Latency fields are null when
 *  pg_stat_statements isn't present; xact_* are cumulative counters (since stats reset). */
export interface DbHealth {
  connections: {
    total: number; active: number; idle: number; idle_in_transaction: number;
    max: number; reserved: number;
  };
  latency: { mean_query_ms: number | null; slowest_statement_ms: number | null };
  cache_hit_ratio: number | null;
  xact_commit: number;
  xact_rollback: number;
  db_bytes: number;
  generated_at: string;
}

/** Polls aios_db_health() every 20s while the page is open (React Query stops when there are no
 *  observers). aios_db_health isn't in the generated rpc union until types are regenerated post-migration,
 *  so we call through a minimal typed view of rpc (mirrors useSimLoadMatrixSummary). */
export function useDbHealth() {
  return useQuery({
    queryKey: ['aios', 'db-health'],
    queryFn: async (): Promise<DbHealth> => {
      const rpc = supabase.rpc as unknown as (
        fn: 'aios_db_health',
      ) => Promise<{ data: DbHealth | null; error: { message: string } | null }>;
      const { data, error } = await rpc('aios_db_health');
      if (error) {
        console.error('aios_db_health failed:', error);
        throw error;
      }
      if (!data) throw new Error('aios_db_health returned no data');
      return data;
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}
