
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SUPABASE_URL = "https://zocahiffooqdybdhguqv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvY2FoaWZmb29xZHliZGhndXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NzgzMzQsImV4cCI6MjA2NTU1NDMzNH0.bGhT6ft_zTbw-9v2Typi0wxzlfStg3sGiuPOor8Wfz8";

export interface UserPresence {
  id: string;
  user_id: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  last_seen: string;
  updated_at: string;
}

export const useUserPresence = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-presence'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_presence')
        .select('id, user_id, status, last_seen, updated_at')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching user presence:', error);
        throw error;
      }

      return data as UserPresence[];
    },
    enabled: !!user,
  });

  // Set up real-time subscription for presence updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-presence-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence'
        },
        (_payload) => {
          queryClient.invalidateQueries({ queryKey: ['user-presence'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Mark user offline on tab close/navigate away
  useEffect(() => {
    if (!user) return;

    const goOffline = () => {
      fetch(`${SUPABASE_URL}/rest/v1/rpc/set_user_offline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ p_user_id: user.id }),
        keepalive: true,
      });
    };

    window.addEventListener('pagehide', goOffline);
    window.addEventListener('beforeunload', goOffline);
    return () => {
      window.removeEventListener('pagehide', goOffline);
      window.removeEventListener('beforeunload', goOffline);
    };
  }, [user]);

  return query;
};

export const useUpdatePresence = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastWriteRef = useRef(0);

  return useMutation({
    mutationFn: async (status: 'online' | 'offline' | 'busy' | 'away') => {
      if (!user) throw new Error('User not authenticated');

      // Debounce: skip if last write was within 30 seconds (unless going offline)
      const now = Date.now();
      if (status !== 'offline' && now - lastWriteRef.current < 30_000) return null;
      lastWriteRef.current = now;

      const { data, error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: user.id,
          status,
          updated_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        })
        .select('id, user_id, status, last_seen, updated_at')
        .single();

      if (error) {
        console.error('Error updating presence:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-presence'] });
    },
  });
};

export const useCurrentUserPresence = (userId: string) => {
  const { data: allPresence } = useUserPresence();
  
  return allPresence?.find(p => p.user_id === userId);
};
