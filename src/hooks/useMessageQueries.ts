
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from '@/types/messages';

export const useMessages = (campaignId?: string, conversationId?: string) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', campaignId, conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, campaign_id, conversation_id, sender_id, recipient_id, content, created_at, read_at, attachment_url, attachment_name, attachment_size, parent_message_id, thread_id, category, is_starred, is_archived, delivery_status, forwarded_from_message_id, edited_at')
        .eq(campaignId ? 'campaign_id' : 'conversation_id', campaignId || conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      // Fetch profiles separately and merge
      const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', senderIds);

      // Fetch parent messages for replies
      const parentMessageIds = [...new Set(data?.filter(m => m.parent_message_id).map(m => m.parent_message_id) || [])];
      let parentMessages: { id: string; content: string; sender_id: string }[] = [];
      let parentProfiles: { id: string; full_name: string; email: string }[] = [];
      
      if (parentMessageIds.length > 0) {
        const { data: parentMessagesData } = await supabase
          .from('messages')
          .select('id, content, sender_id')
          .in('id', parentMessageIds);
        
        parentMessages = parentMessagesData || [];
        
        // Fetch profiles for parent message senders
        const parentSenderIds = [...new Set(parentMessages.map(m => m.sender_id))];
        const { data: parentProfilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', parentSenderIds);
        
        parentProfiles = parentProfilesData || [];
      }

      // Merge profile data with messages
      const messagesWithProfiles = data?.map(message => ({
        ...message,
        sender_profile: profiles?.find(p => p.id === message.sender_id),
        parent_message: message.parent_message_id ? {
          content: parentMessages.find(pm => pm.id === message.parent_message_id)?.content || '',
          sender_profile: parentProfiles.find(p => p.id === parentMessages.find(pm => pm.id === message.parent_message_id)?.sender_id)
        } : undefined
      })) || [];

      return messagesWithProfiles as Message[];
    },
    enabled: !!(campaignId || conversationId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Set up real-time subscription with stable channel name
  useEffect(() => {
    if (!campaignId && !conversationId) return;

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
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', campaignId, conversationId] });
        }
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
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', campaignId, conversationId] });
        }
      )
      .subscribe();

    return () => {
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
      
      const { data, error } = await supabase
        .from('messages')
        .select('id, campaign_id, conversation_id, sender_id, recipient_id, content, created_at, read_at, attachment_url, attachment_name, attachment_size, parent_message_id, thread_id, category, is_starred, is_archived, delivery_status, forwarded_from_message_id, edited_at')
        .eq('campaign_id', campaignId)
        .textSearch('content', searchQuery)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error searching messages:', error);
        throw error;
      }

      // Fetch profiles separately and merge
      const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', senderIds);

      // Merge profile data with messages
      const messagesWithProfiles = data?.map(message => ({
        ...message,
        sender_profile: profiles?.find(p => p.id === message.sender_id)
      })) || [];

      return messagesWithProfiles as Message[];
    },
    enabled: !!campaignId && !!searchQuery.trim(),
  });
};
