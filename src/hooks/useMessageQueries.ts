
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from '@/types/messages';

export const useMessages = (campaignId?: string, conversationId?: string) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', campaignId, conversationId],
    queryFn: async () => {
      // Single optimized query with JOIN to fetch messages and profiles together
      let query = supabase
        .from('messages')
        .select(`
          *,
          sender_profile:profiles!messages_sender_id_fkey(
            full_name,
            email,
            avatar_url
          )
        `)
        .order('created_at', { ascending: true });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }
      if (conversationId) {
        query = query.eq('conversation_id', conversationId);
      }

      const { data: messagesData, error } = await query;

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      return (messagesData || []) as Message[];
    },
    enabled: !!(campaignId || conversationId),
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
  });

  // Set up real-time subscription with debounced invalidation
  useEffect(() => {
    if (!campaignId && !conversationId) return;

    let timeoutId: NodeJS.Timeout;
    const debouncedInvalidate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['messages', campaignId, conversationId] });
        queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }, 100);
    };
    
    const channelName = `messages-${campaignId || conversationId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: campaignId 
            ? `campaign_id=eq.${campaignId}` 
            : `conversation_id=eq.${conversationId}`
        },
        debouncedInvalidate
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: campaignId 
            ? `campaign_id=eq.${campaignId}` 
            : `conversation_id=eq.${conversationId}`
        },
        debouncedInvalidate
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [campaignId, conversationId, queryClient]);

  return query;
};

export const useSearchMessages = (campaignId: string, searchQuery: string) => {
  return useQuery({
    queryKey: ['messages-search', campaignId, searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender_profile:profiles!messages_sender_id_fkey(
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('campaign_id', campaignId)
        .textSearch('content', searchQuery)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error searching messages:', error);
        throw error;
      }

      return (messagesData || []) as Message[];
    },
    enabled: !!campaignId && !!searchQuery.trim(),
    staleTime: 1000 * 30, // 30 seconds
  });
};
