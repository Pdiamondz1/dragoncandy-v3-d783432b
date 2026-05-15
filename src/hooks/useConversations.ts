
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
  campaign_id: string | null;
  campaign_status: string | null;
}

export const useConversations = (orgUnitId?: string | null) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['conversations', user?.id, orgUnitId ?? 'all'],
    queryFn: async () => {
      if (!user) return [];

      const params: { user_uuid: string; p_org_unit_id?: string } = {
        user_uuid: user.id,
      };
      if (orgUnitId) {
        params.p_org_unit_id = orgUnitId;
      }

      const { data, error } = await supabase.rpc('get_user_conversations', params);

      if (error) {
        console.error('Error fetching conversations:', error);
        throw error;
      }

      return data as Conversation[];
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
  });

  return query;
};

export const useCreateDirectConversation = () => {
  const { user, activeOrgUnit } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user) throw new Error('User not authenticated');

      const params: { user1_uuid: string; user2_uuid: string; p_org_unit_id?: string } = {
        user1_uuid: user.id,
        user2_uuid: otherUserId,
      };
      if (activeOrgUnit?.id) {
        params.p_org_unit_id = activeOrgUnit.id;
      }

      const { data, error } = await supabase.rpc('create_or_get_direct_conversation', params);

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

export const useCreateCampaignConversation = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      participantIds,
      participantType = 'three_way',
    }: {
      campaignId: string;
      participantIds: string[];
      participantType?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      // Create conversation
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({
          type: 'group',
          campaign_id: campaignId,
          participant_type: participantType,
          title: 'Campaign Discussion',
        })
        .select('id')
        .single();

      if (conversationError) throw conversationError;

      // Add all participants (including current user)
      const allParticipants = [user.id, ...participantIds.filter(id => id !== user.id)];
      const participantInserts = allParticipants.map(userId => ({
        conversation_id: conversation.id,
        user_id: userId,
      }));

      const { error: participantsError } = await supabase
        .from('conversation_participants')
        .insert(participantInserts);

      if (participantsError) throw participantsError;

      return conversation.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Campaign conversation created',
        description: 'You can now chat with all campaign participants.',
      });
    },
    onError: (error) => {
      console.error('Failed to create campaign conversation:', error);
      toast({
        title: 'Failed to create conversation',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
