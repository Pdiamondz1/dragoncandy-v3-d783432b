import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';

export interface CostStats {
  mtd_spend_usd: number;
  mtd_by_function: Record<string, number>;
  mtd_by_model: Record<string, number>;
  daily_last_30: Array<{ day: string; usd: number }>;
  latest_alert: {
    alert_level: string;
    mtd_spend_usd: number;
    cap_usd: number;
    ratio: number;
    monthly_revenue: number;
  } | null;
  generated_at: string;
}

/** Admin-only: the RPC raises for non-admins, so the query stays disabled for them. */
export function useCostStats() {
  const { isAdmin } = useInternalAccess();

  return useQuery({
    queryKey: ['aios', 'cost-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aios_cost_stats');
      if (error) {
        console.error('aios_cost_stats failed:', error);
        throw error;
      }
      return data as unknown as CostStats;
    },
    enabled: isAdmin,
  });
}
