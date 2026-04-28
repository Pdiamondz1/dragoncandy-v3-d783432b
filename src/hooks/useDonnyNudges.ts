import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { DonnyNudge, NudgeAction } from '@/types/donnyNudge';

export function useDonnyNudges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch active nudges (not acted on or dismissed)
  const { data: nudges = [], isLoading } = useQuery({
    queryKey: ['donny-nudges', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('donny_nudges')
        .select('id, type, raw_data, summary, priority, actions, created_at, read_at, acted_at, dismissed_at')
        .eq('user_id', user.id)
        .is('acted_at', null)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data ?? []).map((row): DonnyNudge => ({
        id: row.id,
        type: row.type as DonnyNudge['type'],
        rawData: row.raw_data as Record<string, unknown>,
        summary: row.summary,
        priority: row.priority as DonnyNudge['priority'],
        actions: row.actions as unknown as NudgeAction[],
        createdAt: row.created_at,
        readAt: row.read_at,
        actedAt: row.acted_at,
        dismissedAt: row.dismissed_at,
      }));
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Real-time subscription for new nudges
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`donny-nudges-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'donny_nudges',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['donny-nudges', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Mark nudge as acted
  const actOnNudge = useMutation({
    mutationFn: async (nudgeId: string) => {
      const { error } = await supabase
        .from('donny_nudges')
        .update({ acted_at: new Date().toISOString() })
        .eq('id', nudgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donny-nudges', user?.id] });
    },
  });

  // Dismiss nudge
  const dismissNudge = useMutation({
    mutationFn: async (nudgeId: string) => {
      const { error } = await supabase
        .from('donny_nudges')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', nudgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donny-nudges', user?.id] });
    },
  });

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    const unread = nudges.filter((n) => !n.readAt);
    if (unread.length === 0) return;

    await supabase
      .from('donny_nudges')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
  }, [user?.id, nudges]);

  const unreadCount = nudges.filter((n) => !n.readAt).length;

  return {
    nudges,
    unreadCount,
    isLoading,
    actOnNudge: actOnNudge.mutate,
    dismissNudge: dismissNudge.mutate,
    markAllRead,
  };
}
