import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StakeholderBurn {
  monthly_opex_cents: number;
  mtd_ai_spend_usd: number;
  mtd_revenue_cents: number;
  net_burn_cents: number;
}

export function useScorecardBurn() {
  return useQuery({
    queryKey: ['aios', 'stakeholder-burn'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aios_stakeholder_burn');
      if (error) { console.error('aios_stakeholder_burn failed:', error); throw error; }
      return data as unknown as StakeholderBurn;
    },
  });
}
