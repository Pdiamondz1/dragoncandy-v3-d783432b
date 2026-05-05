
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
      
      // Send email notification to recipient for direct messages
      if (variables.conversationId && variables.recipientId) {
        try {
          const { data: recipientProfile } = await supabase
            .from('profiles')
            .select('email, full_name, role')
            .eq('id', variables.recipientId)
            .single();

          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user!.id)
            .single();

          // Only send if recipient is a business_client or brand
          if (recipientProfile && (recipientProfile.role === 'business_client' || recipientProfile.role === 'brand')) {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: recipientProfile.email,
                recipientName: recipientProfile.full_name,
                type: 'new_message',
                data: {
                  senderName: senderProfile?.full_name || 'A user',
                  message: variables.content.substring(0, 100) + (variables.content.length > 100 ? '...' : ''),
                },
              },
            });
          }
        } catch (error) {
          console.error('Failed to send message notification email:', error);
        }
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

// Mark as read functionality completely removed to prevent console flooding and infinite loops
