import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface CampaignSocialHook {
  id: string;
  campaign_id: string;
  stage: number;
  party_role: string;
  status: string;
  content_template: string | null;
  prompted_at: string | null;
  created_at: string;
}

export function useCampaignSocialHooks(campaignId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['campaign-social-hooks', campaignId, user?.id],
    queryFn: async (): Promise<CampaignSocialHook[]> => {
      const { data, error } = await supabase
        .from('campaign_social_hooks')
        .select('*')
        .eq('campaign_id', campaignId!)
        .eq('user_id', user!.id)
        .eq('status', 'pending')
        .order('stage', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CampaignSocialHook[];
    },
    enabled: !!campaignId && !!user?.id,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!campaignId || !user?.id) return;
    const channel = supabase
      .channel(`hooks-${campaignId}-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_social_hooks', filter: `campaign_id=eq.${campaignId}` },
        () => qc.invalidateQueries({ queryKey: ['campaign-social-hooks', campaignId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId, user?.id, qc]);

  const dismiss = useMutation({
    mutationFn: async (hookId: string) => {
      const { error } = await supabase
        .from('campaign_social_hooks')
        .update({ status: 'skipped', acted_at: new Date().toISOString() })
        .eq('id', hookId)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-social-hooks', campaignId] }),
    onError: () => { toast.error('Failed to dismiss social hook'); },
  });

  const markPosted = useMutation({
    mutationFn: async (hookId: string) => {
      const { error } = await supabase
        .from('campaign_social_hooks')
        .update({ status: 'posted', acted_at: new Date().toISOString() })
        .eq('id', hookId)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-social-hooks', campaignId] }),
    onError: () => { toast.error('Failed to mark hook as posted'); },
  });

  return {
    hooks: query.data ?? [],
    isLoading: query.isLoading,
    dismissHook: dismiss.mutate,
    markPosted: markPosted.mutate,
  };
}
