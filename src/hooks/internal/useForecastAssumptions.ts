import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  FORECAST_KEYS, DEFAULT_ASSUMPTIONS, type ForecastAssumptions, type ForecastKey,
} from '@/lib/internal/forecastModel';

const QUERY_KEY = ['aios', 'forecast-assumptions'];

/** Reads the 9 forecast_* rows from aios_dashboard_settings; missing/invalid keys fall back to the
 *  coded default so the page works before the seed migration is applied. */
export function useForecastAssumptions() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ForecastAssumptions> => {
      const { data, error } = await supabase
        .from('aios_dashboard_settings')
        .select('key, value')
        .in('key', FORECAST_KEYS as unknown as string[]);
      if (error) {
        console.error('forecast assumptions query failed:', error);
        throw error;
      }
      const out: ForecastAssumptions = { ...DEFAULT_ASSUMPTIONS };
      for (const row of data ?? []) {
        const field = row.key.replace(/^forecast_/, '') as keyof ForecastAssumptions;
        const n = Number((row as { value: unknown }).value);
        if (field in out && Number.isFinite(n)) out[field] = n;
      }
      return out;
    },
  });
}

/** Admin update of one assumption (whole number). Writes to the existing admin-UPDATE RLS on
 *  aios_dashboard_settings — same path useCurrentTierIndex reads. */
export function useUpdateForecastAssumption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: ForecastKey; value: number }) => {
      const { error } = await supabase
        .from('aios_dashboard_settings')
        .update({ value })
        .eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
