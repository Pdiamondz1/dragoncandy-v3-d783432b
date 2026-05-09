import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

function calculateSurcharge(platformCount: number, tier?: string): number {
  let base: number;
  if (platformCount >= 5) base = 5000;
  else if (platformCount >= 4) base = 3000;
  else base = 2500;
  if (tier === 'pro') return Math.round(base * 0.8);
  return base;
}

export function useRushSurchargeLog(campaignId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['rush-surcharge-log', user?.id, campaignId],
    queryFn: async () => {
      let q = supabase
        .from('rush_surcharge_log')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (campaignId) q = q.eq('campaign_id', campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const logRush = useMutation({
    mutationFn: async ({ platformCount, campaignId: cId, tier }: { platformCount: number; campaignId?: string; tier?: string }) => {
      const { error } = await supabase.from('rush_surcharge_log').insert({
        user_id: user!.id,
        campaign_id: cId ?? null,
        platform_count: platformCount,
        surcharge_cents: calculateSurcharge(platformCount, tier),
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rush-surcharge-log'] });
      toast.success('Rush surcharge logged');
      supabase.functions.invoke('invoice-rush-surcharges', {
        body: { userId: user!.id },
      }).catch((err) => {
        console.error('[useRushSurchargeLog] invoice call failed:', err);
      });
    },
    onError: (err: Error) => toast.error(`Failed to log surcharge: ${err.message}`),
  });

  return {
    history: query.data ?? [],
    isLoading: query.isLoading,
    logRush: logRush.mutate,
    isLogging: logRush.isPending,
    calculateSurcharge,
  };
}
