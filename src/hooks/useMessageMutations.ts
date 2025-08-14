
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
    onMutate: async (variables) => {
      // Create optimistic message
      const optimisticMessage = {
        id: crypto.randomUUID(),
        campaign_id: variables.campaignId,
        conversation_id: variables.conversationId,
        sender_id: user!.id,
        recipient_id: variables.recipientId,
        content: variables.content.trim(),
        attachment_url: variables.attachmentUrl,
        attachment_name: variables.attachmentName,
        attachment_size: variables.attachmentSize,
        parent_message_id: variables.parentMessageId,
        thread_id: variables.threadId,
        category: variables.category || 'general',
        forwarded_from_message_id: variables.forwardedFromMessageId,
        created_at: new Date().toISOString(),
        read_at: null,
        is_starred: false,
        profiles: {
          id: user!.id,
          email: user!.email || 'Unknown',
          full_name: null,
          avatar_url: null
        }
      };

      // Get the query key
      const queryKey = variables.campaignId 
        ? ['messages', variables.campaignId, undefined]
        : ['messages', undefined, variables.conversationId];

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData(queryKey);

      // Optimistically update cache
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return [optimisticMessage];
        return [...old, optimisticMessage];
      });

      return { previousMessages, queryKey };
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousMessages) {
        queryClient.setQueryData(context.queryKey, context.previousMessages);
      }
      
      console.error('Failed to send message:', error);
      toast({
        title: 'Failed to send message',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch with proper query keys
      const queryKey = variables.campaignId 
        ? ['messages', variables.campaignId, undefined]
        : ['messages', undefined, variables.conversationId];
      
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
      
      // First, check if the message exists and is unread
      const { data: existingMessage } = await supabase
        .from('messages')
        .select('id, read_at')
        .eq('id', messageId)
        .eq('recipient_id', user!.id)
        .is('read_at', null)
        .maybeSingle();
      
      if (!existingMessage) {
        console.log('Message already read or not found');
        return null;
      }
      
      const { data, error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('recipient_id', user!.id)
        .select()
        .maybeSingle();

      if (error) {
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
