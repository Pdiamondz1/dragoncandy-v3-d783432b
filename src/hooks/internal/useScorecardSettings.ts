import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_HEADLINE = 'Pre-revenue by design — building the marketplace';
const DEFAULT_BURN_CEILING_CENTS = 40000;

async function readSetting(key: string) {
  const { data, error } = await supabase
    .from('aios_dashboard_settings').select('value').eq('key', key).maybeSingle();
  if (error) { console.error('aios_dashboard_settings read failed:', error); throw error; }
  return data?.value;
}

export function useScorecardHeadline() {
  return useQuery({
    queryKey: ['aios', 'dashboard-settings', 'scorecard_headline'],
    queryFn: async (): Promise<string> => {
      const v = await readSetting('scorecard_headline');
      return typeof v === 'string' && v.trim() ? v : DEFAULT_HEADLINE;
    },
  });
}

export function useScorecardBurnCeilingCents() {
  return useQuery({
    queryKey: ['aios', 'dashboard-settings', 'scorecard_burn_ceiling_cents'],
    queryFn: async (): Promise<number> => {
      const n = Number(await readSetting('scorecard_burn_ceiling_cents') ?? DEFAULT_BURN_CEILING_CENTS);
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BURN_CEILING_CENTS;
    },
  });
}

/** Admin-only headline edit — relies on the existing aios_dashboard_settings_admin_update RLS.
 *  Direct client update leaves the audit `updated_by` null, which is acceptable for this KV string. */
export function useUpdateScorecardHeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (headline: string) => {
      const { error } = await supabase
        .from('aios_dashboard_settings')
        .update({ value: headline })
        .eq('key', 'scorecard_headline');
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['aios', 'dashboard-settings', 'scorecard_headline'] }),
  });
}
