import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DragonshareRevenue {
  gross_cents: number;
  platform_fee_cents: number;
  creator_payout_cents: number;
}

export interface RevenueStats {
  payments: { by_event_type: Record<string, number>; events_total: number };
  dragonshare: DragonshareRevenue;
  dragonshare_mtd: Pick<DragonshareRevenue, 'gross_cents' | 'platform_fee_cents'>;
  generated_at: string;
}

export function useRevenueStats() {
  return useQuery({
    queryKey: ['aios', 'revenue-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aios_revenue_stats');
      if (error) {
        console.error('aios_revenue_stats failed:', error);
        throw error;
      }
      return data as unknown as RevenueStats;
    },
  });
}
