import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CampaignGateResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  loading: boolean;
}

export function useActiveCampaignGate(): CampaignGateResult {
  const { user, activeOrg } = useAuth();
  const limit = activeOrg?.active_campaign_limit ?? 1;

  const { data: currentCount = 0, isLoading } = useQuery({
    queryKey: ['active_campaign_count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['published', 'active']);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return {
    allowed: currentCount < limit,
    currentCount,
    limit,
    loading: isLoading,
  };
}
