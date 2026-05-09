import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

function calculateSurcharge(platformCount: number): number {
  if (platformCount >= 5) return 5000;
  if (platformCount >= 4) return 3000;
  return 2500;
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
    mutationFn: async ({ platformCount, campaignId: cId }: { platformCount: number; campaignId?: string }) => {
      const { error } = await supabase.from('rush_surcharge_log').insert({
        user_id: user!.id,
        campaign_id: cId ?? null,
        platform_count: platformCount,
        surcharge_cents: calculateSurcharge(platformCount),
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rush-surcharge-log'] });
      toast.success('Rush surcharge logged');
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
