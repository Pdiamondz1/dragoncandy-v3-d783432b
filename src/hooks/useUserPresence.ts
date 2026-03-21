
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
      console.log('Fetching user presence data');
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

    console.log('Setting up presence subscription');
    const channel = supabase
      .channel('user-presence-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence'
        },
        (payload) => {
          console.log('Presence update received:', payload);
          queryClient.invalidateQueries({ queryKey: ['user-presence'] });
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up presence subscription');
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
};

export const useUpdatePresence = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: 'online' | 'offline' | 'busy' | 'away') => {
      if (!user) throw new Error('User not authenticated');
      
      console.log('Updating presence status to:', status);
      const { data, error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: user.id,
          status,
          updated_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        })
        .select()
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
