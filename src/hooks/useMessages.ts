
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface Message {
  id: string;
  campaign_id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  parent_message_id: string | null;
  thread_id: string | null;
  sender_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export const useMessages = (campaignId: string) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', campaignId],
    queryFn: async () => {
      console.log('Fetching messages for campaign:', campaignId);
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender_profile:profiles!sender_id (
            full_name,
            avatar_url
          )
        `)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      console.log('Fetched messages:', data);
      return data as Message[];
    },
    enabled: !!campaignId,
  });

  // Set up real-time subscription
  useEffect(() => {
    if (!campaignId) return;

    console.log('Setting up real-time subscription for campaign:', campaignId);

    const channel = supabase
      .channel(`messages-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `campaign_id=eq.${campaignId}`
        },
        (payload) => {
          console.log('New message received:', payload);
          queryClient.invalidateQueries({ queryKey: ['messages', campaignId] });
          queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `campaign_id=eq.${campaignId}`
        },
        (payload) => {
          console.log('Message updated:', payload);
          queryClient.invalidateQueries({ queryKey: ['messages', campaignId] });
          queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [campaignId, queryClient]);

  return query;
};

export const useSendMessage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      campaignId, 
      recipientId, 
      content,
      attachmentUrl,
      attachmentName,
      attachmentSize,
      parentMessageId,
      threadId
    }: { 
      campaignId: string; 
      recipientId: string; 
      content: string;
      attachmentUrl?: string;
      attachmentName?: string;
      attachmentSize?: number;
      parentMessageId?: string;
      threadId?: string;
    }) => {
      console.log('Sending message:', { campaignId, recipientId, content });
      
      const { data, error } = await supabase
        .from('messages')
        .insert({
          campaign_id: campaignId,
          sender_id: user!.id,
          recipient_id: recipientId,
          content: content.trim(),
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          attachment_size: attachmentSize,
          parent_message_id: parentMessageId,
          thread_id: threadId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        throw error;
      }

      console.log('Message sent:', data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages', data.campaign_id] });
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
    },
    onError: (error) => {
      console.error('Failed to send message:', error);
      toast({
        title: 'Failed to send message',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useMarkMessageAsRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      console.log('Marking message as read:', messageId);
      
      const { data, error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('recipient_id', user!.id)
        .eq('read_at', null)
        .select()
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows updated (already read)
        console.error('Error marking message as read:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['messages', data.campaign_id] });
        queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
      }
    },
  });
};

export const useUnreadMessageCounts = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['unread-counts'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase.rpc('get_unread_message_counts', {
        user_uuid: user.id
      });

      if (error) {
        console.error('Error fetching unread counts:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!user,
  });
};

export const useSearchMessages = (campaignId: string, searchQuery: string) => {
  return useQuery({
    queryKey: ['messages-search', campaignId, searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender_profile:profiles!sender_id (
            full_name,
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

      return data as Message[];
    },
    enabled: !!campaignId && !!searchQuery.trim(),
  });
};
