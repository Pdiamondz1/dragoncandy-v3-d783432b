
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
        .select('id, campaign_id, creator_id, invited_by, status, invitation_message, created_at, updated_at')
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

export const useCreatorPendingInvitations = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-pending-invitations', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('campaign_invitations')
        .select(`
          *,
          campaigns:campaign_id (
            id, title, emoji, budget_min, budget_max, deadline,
            deliverable_count, content_types, cover_image_url,
            profiles:user_id ( full_name, avatar_url, business_name )
          )
        `)
        .eq('creator_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: 'always',
  });
};

export const useDeclineInvitation = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: invitation, error: fetchError } = await supabase
        .from('campaign_invitations')
        .select('campaign_id, invited_by, campaigns:campaign_id ( title )')
        .eq('id', invitationId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('campaign_invitations')
        .update({ status: 'declined' })
        .eq('id', invitationId)
        .eq('creator_id', user.id);

      if (error) throw error;

      // Send decline notification email to the inviter
      try {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'campaign_invitation_declined',
            data: {
              recipientUserId: invitation.invited_by,
              senderName: creatorProfile?.full_name ?? 'A creator',
              campaignTitle: (invitation.campaigns as any)?.title ?? 'your campaign',
              campaignId: invitation.campaign_id,
            },
          },
        });
      } catch (emailErr) {
        console.error('Failed to send decline notification:', emailErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-pending-invitations'] });
      toast({ title: 'Invitation declined' });
    },
    onError: () => {
      toast({ title: 'Failed to decline invitation', variant: 'destructive' });
    },
  });
};
