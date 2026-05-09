import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export interface TriplePostSession {
  id: string;
  campaign_id: string;
  restaurant_id: string;
  creator_id: string;
  brand_id: string | null;
  restaurant_status: 'pending' | 'posted' | 'skipped';
  creator_status: 'pending' | 'posted' | 'skipped';
  brand_status: 'pending' | 'posted' | 'skipped' | 'n/a';
  created_at: string;
}

export function useTriplePostState(campaignId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['triple-post-session', campaignId],
    queryFn: async (): Promise<TriplePostSession | null> => {
      const { data, error } = await supabase
        .from('triple_post_sessions')
        .select('*')
        .eq('campaign_id', campaignId!)
        .maybeSingle();
      if (error) throw error;
      return data as TriplePostSession | null;
    },
    enabled: !!campaignId && !!user?.id,
    staleTime: 10 * 1000,
  });

  useEffect(() => {
    if (!campaignId) return;
    const channel = supabase
      .channel(`triple-post-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'triple_post_sessions', filter: `campaign_id=eq.${campaignId}` },
        () => qc.invalidateQueries({ queryKey: ['triple-post-session', campaignId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId, qc]);

  const updateMyStatus = useMutation({
    mutationFn: async (newStatus: 'posted' | 'skipped') => {
      if (!query.data || !user?.id) return;
      const session = query.data;
      const updates: Record<string, string> = {};

      if (session.restaurant_id === user.id) updates.restaurant_status = newStatus;
      else if (session.creator_id === user.id) updates.creator_status = newStatus;
      else if (session.brand_id === user.id) updates.brand_status = newStatus;

      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from('triple_post_sessions')
        .update(updates)
        .eq('id', session.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triple-post-session', campaignId] }),
  });

  return {
    session: query.data,
    isLoading: query.isLoading,
    updateMyStatus: updateMyStatus.mutate,
  };
}
