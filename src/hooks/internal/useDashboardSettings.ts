import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TIER_INDEX } from '@/lib/internal/weightThresholds';

/**
 * The current Supabase compute-tier index, read from
 * `aios_dashboard_settings.current_compute_tier_index`. This used to be a
 * hardcoded constant; sourcing it from the DB lets a founder-approved correction
 * (the /internal/corrections flow) change the tier the dashboard shows without a
 * code change. Falls back to DEFAULT_TIER_INDEX while loading or if unset.
 */
export function useCurrentTierIndex() {
  return useQuery({
    queryKey: ['aios', 'dashboard-settings', 'current_compute_tier_index'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('aios_dashboard_settings')
        .select('value')
        .eq('key', 'current_compute_tier_index')
        .maybeSingle();
      if (error) {
        console.error('aios_dashboard_settings query failed:', error);
        throw error;
      }
      // `value` is jsonb — a stored `0` comes back as the number 0.
      const n = Number(data?.value ?? DEFAULT_TIER_INDEX);
      return Number.isInteger(n) && n >= 0 ? n : DEFAULT_TIER_INDEX;
    },
  });
}
