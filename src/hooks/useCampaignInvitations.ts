
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface CampaignInvitation {
  id: string;
  campaign_id: string;
  creator_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined';
  invitation_message: string | null;
  created_at: string;
  updated_at: string;
}

export const useCampaignInvitations = (campaignId: string) => {
  return useQuery({
    queryKey: ['campaign-invitations', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_invitations')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching campaign invitations:', error);
        throw error;
      }

      return data as CampaignInvitation[];
    },
    enabled: !!campaignId,
  });
};

export const useInviteCreator = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      creatorId,
      message,
    }: {
      campaignId: string;
      creatorId: string;
      message?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-campaign-invitation', {
        body: {
          campaign_id: campaignId,
          creator_id: creatorId,
          invited_by: user!.id,
          invitation_message: message,
        },
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result.error) throw new Error(result.error);

      return result as { invitation: CampaignInvitation; already_invited: boolean };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-invitations', variables.campaignId] });
      toast({
        title: data.already_invited ? 'Already invited' : 'Invitation sent!',
        description: data.already_invited
          ? 'This creator has already been invited to this campaign.'
          : 'The creator will be notified via email and in-app message.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send invitation',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
