import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useSkippedCampaignIds = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-skips', user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();

      const { data, error } = await supabase
        .from('campaign_skips')
        .select('campaign_id')
        .eq('user_id', user.id)
        .eq('restored', false);

      if (error) throw error;
      return new Set((data ?? []).map((r: { campaign_id: string }) => r.campaign_id));
    },
    enabled: !!user,
    staleTime: 300_000,
  });
};

export const useSkipCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('campaign_skips')
        .upsert(
          { user_id: user.id, campaign_id: campaignId, restored: false, skipped_at: new Date().toISOString() },
          { onConflict: 'user_id,campaign_id' }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-skips'] });
    },
  });
};

export const useRestoreCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('campaign_skips')
        .update({ restored: true })
        .eq('user_id', user.id)
        .eq('campaign_id', campaignId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-skips'] });
    },
  });
};
