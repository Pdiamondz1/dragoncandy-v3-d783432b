import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SimulationStats {
  bots_total: number;
  bots_by_persona: Record<string, number>;
  synthetic_campaigns: number;
  synthetic_messages: number;
  synthetic_ai_spend_mtd_usd: number;
  kill_switch_enabled: boolean;
  generated_at: string;
}

export function useSimulationStats() {
  return useQuery({
    queryKey: ['aios', 'simulation-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_simulation_stats');
      if (error) {
        console.error('get_simulation_stats failed:', error);
        throw error;
      }
      return data as unknown as SimulationStats;
    },
  });
}
