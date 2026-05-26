import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useRealtimeRefresh = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const suffix = Math.random().toString(36).substring(2, 8);
    const channel = supabase
      .channel(`dashboard-refresh-${user.id}-${suffix}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_applications',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
        queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_collaborations',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['campaign-collaborations'] });
        queryClient.invalidateQueries({ queryKey: ['collaboration'] });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_sponsorships',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['campaign-sponsorships'] });
        queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
};
