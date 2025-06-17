
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { SendMessageParams } from '@/types/messages';

export const useSendMessage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      campaignId, 
      conversationId,
      recipientId, 
      content,
      attachmentUrl,
      attachmentName,
      attachmentSize,
      parentMessageId,
      threadId,
      category = 'general',
      forwardedFromMessageId
    }: SendMessageParams) => {
      console.log('Sending message:', { campaignId, conversationId, recipientId, content });
      
      const { data, error } = await supabase
        .from('messages')
        .insert({
          campaign_id: campaignId,
          conversation_id: conversationId,
          sender_id: user!.id,
          recipient_id: recipientId,
          content: content.trim(),
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          attachment_size: attachmentSize,
          parent_message_id: parentMessageId,
          thread_id: threadId,
          category,
          forwarded_from_message_id: forwardedFromMessageId,
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
      queryClient.invalidateQueries({ queryKey: ['messages', data.campaign_id, data.conversation_id] });
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

export const useStarMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, isStarred }: { messageId: string; isStarred: boolean }) => {
      console.log('Starring message:', messageId, isStarred);
      
      const { data, error } = await supabase
        .from('messages')
        .update({ is_starred: isStarred })
        .eq('id', messageId)
        .select()
        .single();

      if (error) {
        console.error('Error starring message:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages', data.campaign_id, data.conversation_id] });
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
        queryClient.invalidateQueries({ queryKey: ['messages', data.campaign_id, data.conversation_id] });
        queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
      }
    },
  });
};
