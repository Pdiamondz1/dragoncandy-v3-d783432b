
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
      console.log('Fetching invitations for campaign:', campaignId);
      const { data, error } = await supabase
        .from('campaign_invitations')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching campaign invitations:', error);
        throw error;
      }

      console.log('Fetched campaign invitations:', data);
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
      message 
    }: { 
      campaignId: string; 
      creatorId: string; 
      message?: string; 
    }) => {
      console.log('Inviting creator:', { campaignId, creatorId, message });
      
      const { data, error } = await supabase
        .from('campaign_invitations')
        .insert({
          campaign_id: campaignId,
          creator_id: creatorId,
          invited_by: user!.id,
          invitation_message: message,
        })
        .select()
        .single();

      if (error) {
        console.error('Error inviting creator:', error);
        throw error;
      }

      console.log('Creator invited:', data);
      return data as CampaignInvitation;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-invitations', variables.campaignId] });
      toast({
        title: 'Invitation sent successfully!',
        description: 'The creator will be notified about your campaign.',
      });
    },
    onError: (error: any) => {
      console.error('Creator invitation failed:', error);
      const errorMessage = error.message?.includes('duplicate key') 
        ? 'You have already invited this creator to this campaign.'
        : 'Failed to send invitation. Please try again later.';
      
      toast({
        title: 'Failed to send invitation',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });
};
