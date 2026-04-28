
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export const useMessageReactions = (messageId: string) => {
  return useQuery({
    queryKey: ['message-reactions', messageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('id, message_id, user_id, emoji, created_at')
        .eq('message_id', messageId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching message reactions:', error);
        throw error;
      }

      return data as MessageReaction[];
    },
    enabled: !!messageId,
  });
};

export const useAddReaction = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding reaction:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['message-reactions', data.message_id] });
    },
    onError: (error) => {
      console.error('Failed to add reaction:', error);
      toast({
        title: 'Failed to add reaction',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useRemoveReaction = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);

      if (error) {
        console.error('Error removing reaction:', error);
        throw error;
      }

      return { messageId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['message-reactions', data.messageId] });
    },
  });
};
