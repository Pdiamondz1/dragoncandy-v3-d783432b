
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  sender_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export const useMessages = (campaignId: string) => {
  return useQuery({
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
};

export const useSendMessage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      campaignId, 
      recipientId, 
      content 
    }: { 
      campaignId: string; 
      recipientId: string; 
      content: string; 
    }) => {
      console.log('Sending message:', { campaignId, recipientId, content });
      
      const { data, error } = await supabase
        .from('messages')
        .insert({
          campaign_id: campaignId,
          sender_id: user!.id,
          recipient_id: recipientId,
          content: content.trim(),
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
      }
    },
  });
};
