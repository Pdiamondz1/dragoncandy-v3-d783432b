import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** The summed roll-up of a multi-shard matrix load run — one row across all shards of the latest
 *  `matrix-*` run label. Produced by the `get_sim_load_matrix_summary` RPC (SECURITY DEFINER, gated
 *  in-body on is_internal_user); read here as the /internal dashboard's authenticated internal user. */
export interface SimLoadMatrixSummary {
  run_label: string;
  shards: number;
  /** Σ per-shard offered concurrency — the whole point of the matrix (a single runner caps ~312). */
  offered_concurrency: number;
  requests: number;
  ok: number;
  breakage: number;
  throttled: number;
  p95_ms: number;
  media_requests: number;
  media_bytes: number;
  storage_bytes: number | null;
  db_active_conn_peak: number;
  db_avg_query_ms_peak: number;
  max_connections: number;
}

/**
 * The latest matrix run's summed curve. Two steps under the internal RLS: find the newest `matrix-*`
 * run label, then summarize it via the RPC. Returns null when no matrix run has been captured yet
 * (single-runner `load` labels are excluded — they carry no `notes.shard`).
 */
export function useSimLoadMatrixSummary() {
  return useQuery({
    queryKey: ['aios', 'sim-load-matrix-summary'],
    queryFn: async (): Promise<SimLoadMatrixSummary | null> => {
      const { data: latest, error: labelErr } = await supabase
        .from('sim_load_snapshots')
        .select('run_label')
        .ilike('run_label', 'matrix%')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (labelErr) {
        console.error('sim matrix label lookup failed:', labelErr);
        throw labelErr;
      }
      if (!latest?.run_label) return null;

      // get_sim_load_matrix_summary is added to the generated types.ts once the migration is applied
      // and types are regenerated (Phase 7). Until then, call through a minimal typed view of rpc so
      // the typecheck gate stays green (the name isn't yet in the typed rpc union).
      const rpc = supabase.rpc as unknown as (
        fn: 'get_sim_load_matrix_summary',
        args: { p_run_label: string },
      ) => Promise<{ data: SimLoadMatrixSummary | null; error: { message: string } | null }>;
      const { data, error } = await rpc('get_sim_load_matrix_summary', {
        p_run_label: latest.run_label,
      });
      if (error) {
        console.error('get_sim_load_matrix_summary failed:', error);
        throw error;
      }
      return data ?? null;
    },
  });
}
