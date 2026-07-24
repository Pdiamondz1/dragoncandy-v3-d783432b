import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** One captured performance sample from a synthetic load ramp step.
 *  Written only by the service-role `capture_sim_load_snapshot` RPC; read here
 *  under the `sim_load_snapshots_internal_select` RLS policy (is_internal_user). */
export interface SimLoadSnapshot {
  id: string;
  captured_at: string;
  run_label: string | null;
  active_connections: number | null;
  max_connections: number | null;
  avg_query_ms: number | null;
  error_rate: number | null;
}

/** Latest N load snapshots, newest first — the performance-per-concurrency curve. */
export function useSimLoadSnapshots(limit = 50) {
  return useQuery({
    queryKey: ['aios', 'sim-load-snapshots', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sim_load_snapshots')
        // reserved_headroom is deliberately omitted — it stores the static
        // superuser_reserved_connections config (constant per tier), not a
        // per-step signal, so it adds no value to the concurrency curve.
        .select(
          'id, captured_at, run_label, active_connections, max_connections, avg_query_ms, error_rate',
        )
        .order('captured_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.error('sim_load_snapshots query failed:', error);
        throw error;
      }
      return (data ?? []) as SimLoadSnapshot[];
    },
  });
}
