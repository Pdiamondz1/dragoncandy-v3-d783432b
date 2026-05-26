
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
        .select('id, campaign_id, conversation_id, sender_id, recipient_id, content, created_at')
        .single();

      if (error) {
        console.error('Error sending message:', error);
        throw error;
      }

      return data;
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
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
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old) return [optimisticMessage];
        if (!Array.isArray(old)) return [optimisticMessage];
        return [...old, optimisticMessage];
      });

      return { previousMessages, queryKey };
    },
    onError: (_error, _variables, context) => {
      // Rollback optimistic update
      if (context?.previousMessages) {
        queryClient.setQueryData(context.queryKey, context.previousMessages);
      }
      
      toast({
        title: 'Failed to send message',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSuccess: async (_data, variables) => {
      const queryKey = variables.campaignId
        ? ['messages', variables.campaignId, undefined]
        : ['messages', undefined, variables.conversationId];

      queryClient.invalidateQueries({ queryKey });

      // Send notification to recipient(s) via create-notification
      try {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user!.id)
          .single();

        const senderName = senderProfile?.full_name || 'A user';
        const messagePreview = variables.content.substring(0, 100) + (variables.content.length > 100 ? '...' : '');

        if (variables.conversationId && variables.recipientId) {
          supabase.functions.invoke('create-notification', {
            body: {
              recipientId: variables.recipientId,
              type: 'message_received',
              category: 'messages',
              title: 'New Message',
              body: `${senderName}: ${messagePreview}`,
              actionUrl: `/dashboard/messages/${_data.conversation_id}`,
              actorId: user!.id,
              actorName: senderName,
              icon: 'message',
              data: { conversation_id: _data.conversation_id, campaign_id: variables.campaignId },
              emailData: { senderName, message: messagePreview },
            },
          }).catch((err: unknown) => console.error('Failed to send notification:', err));
        } else if (variables.campaignId) {
          const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', _data.conversation_id);

          const recipientIds = (participants || [])
            .map(p => p.user_id)
            .filter(id => id !== user!.id);

          for (const rid of recipientIds) {
            supabase.functions.invoke('create-notification', {
              body: {
                recipientId: rid,
                type: 'message_received',
                category: 'messages',
                title: 'New Message',
                body: `${senderName}: ${messagePreview}`,
                actionUrl: `/dashboard/messages/${_data.conversation_id}`,
                actorId: user!.id,
                actorName: senderName,
                icon: 'message',
                data: { conversation_id: _data.conversation_id, campaign_id: variables.campaignId },
                emailData: { senderName, message: messagePreview },
              },
            }).catch((err: unknown) => console.error('Failed to send notification:', err));
          }
        }

      } catch (error) {
        console.warn('Failed to send message notification:', error);
      }
    },
  });
};

export const useStarMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, isStarred }: { messageId: string; isStarred: boolean }) => {
      const { data, error } = await supabase
        .from('messages')
        .update({ is_starred: isStarred })
        .eq('id', messageId)
        .select('id, campaign_id, conversation_id, is_starred')
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

export const useMarkMessagesAsRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      campaignId,
    }: {
      conversationId?: string;
      campaignId?: string;
    }) => {
      if (!user) return;

      let query = supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .is('read_at', null);

      if (conversationId) {
        query = query.eq('conversation_id', conversationId);
      } else if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      } else {
        return;
      }

      const { data, error } = await query.select('id');
      if (error) {
        console.error('Error marking messages as read:', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['conversations'] });
      queryClient.refetchQueries({ queryKey: ['unread-counts'] });
    },
  });
};
