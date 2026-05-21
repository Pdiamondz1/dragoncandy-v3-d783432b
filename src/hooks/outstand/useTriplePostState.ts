import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface TriplePostSession {
  id: string;
  campaign_id: string;
  restaurant_id: string;
  creator_id: string;
  brand_id: string | null;
  restaurant_status: 'pending' | 'posted' | 'skipped';
  creator_status: 'pending' | 'posted' | 'skipped';
  brand_status: 'pending' | 'posted' | 'skipped' | 'n/a';
  status: 'in_progress' | 'completed';
  completed_at: string | null;
  created_at: string;
}

function isTriplePostComplete(session: TriplePostSession): boolean {
  const done = (s: string | null) => s === null || ['posted', 'skipped', 'n/a'].includes(s);
  const anyPosted = session.restaurant_status === 'posted' ||
    session.creator_status === 'posted' ||
    session.brand_status === 'posted';
  return anyPosted && done(session.restaurant_status) && done(session.creator_status) && done(session.brand_status);
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
    onError: () => { toast.error('Failed to update post status'); },
  });

  const session = query.data;
  return {
    session,
    isLoading: query.isLoading,
    isTriplePostComplete: session ? isTriplePostComplete(session) : false,
    updateMyStatus: updateMyStatus.mutate,
  };
}
