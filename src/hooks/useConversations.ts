
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface Conversation {
  conversation_id: string;
  conversation_type: string;
  conversation_title: string | null;
  last_message_at: string | null;
  unread_count: number;
  other_participant_name: string | null;
  other_participant_avatar: string | null;
}

export const useConversations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase.rpc('get_user_conversations', {
        user_uuid: user.id
      });

      if (error) {
        console.error('Error fetching conversations:', error);
        throw error;
      }

      return data as Conversation[];
    },
    enabled: !!user,
  });

  return query;
};

export const useCreateDirectConversation = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase.rpc('create_or_get_direct_conversation', {
        user1_uuid: user.id,
        user2_uuid: otherUserId
      });

      if (error) {
        console.error('Error creating conversation:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Conversation created',
        description: 'Direct conversation started successfully.',
      });
    },
    onError: (error) => {
      console.error('Failed to create conversation:', error);
      toast({
        title: 'Failed to create conversation',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useArchiveConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .update({ is_archived: true })
        .eq('id', conversationId);

      if (error) {
        console.error('Error archiving conversation:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Conversation archived',
        description: 'The conversation has been moved to archive.',
      });
    },
  });
};
