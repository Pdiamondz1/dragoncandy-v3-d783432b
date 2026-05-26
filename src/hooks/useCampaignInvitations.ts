
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface CampaignInvitation {
  id: string;
  campaign_id: string;
  creator_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined' | 'counter_offered';
  invitation_message: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export const useCampaignInvitations = (campaignId: string) => {
  return useQuery({
    queryKey: ['campaign-invitations', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_invitations')
        .select('id, campaign_id, creator_id, invited_by, status, invitation_message, expires_at, created_at, updated_at')
        .eq('campaign_id', campaignId)
        .or(`status.neq.pending,expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
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
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-invitations', variables.campaignId] });

      // Send notification to the creator (only for new invitations)
      if (!data.already_invited) {
        try {
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('title')
            .eq('id', variables.campaignId)
            .single();

          const campaignTitle = campaign?.title || 'a campaign';

          supabase.functions.invoke('create-notification', {
            body: {
              recipientId: variables.creatorId,
              type: 'campaign_invitation',
              category: 'campaigns',
              title: 'Campaign Invitation',
              body: `You've been invited to "${campaignTitle}"`,
              actionUrl: `/dashboard/creator/campaigns/${variables.campaignId}?invited=true`,
              actorId: user!.id,
              icon: 'invitation',
              data: { campaign_id: variables.campaignId },
              emailData: { campaignTitle, campaignId: variables.campaignId },
            },
          }).catch((err: unknown) => console.error('Failed to send notification:', err));
        } catch (error) {
          console.error('Failed to prepare invitation notification:', error);
        }
      }

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
            id, title, description, fixed_price, pricing_type,
            budget_min, budget_max, deadline, platforms, user_id
          )
        `)
        .eq('creator_id', user.id)
        .eq('status', 'pending')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const ownerIds = [...new Set(
        data.map(d => (d.campaigns as { user_id?: string } | null)?.user_id).filter(Boolean)
      )] as string[];

      let businessMap = new Map<string, string>();
      let profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      if (ownerIds.length > 0) {
        const [bpResult, profileResult] = await Promise.all([
          supabase.from('business_profiles').select('user_id, business_name').in('user_id', ownerIds),
          supabase.from('profiles').select('id, full_name, avatar_url').in('id', ownerIds),
        ]);
        if (bpResult.data) {
          businessMap = new Map(bpResult.data.map(b => [b.user_id, b.business_name]));
        }
        if (profileResult.data) {
          profileMap = new Map(profileResult.data.map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]));
        }
      }

      return data.map(inv => {
        const ownerId = (inv.campaigns as { user_id?: string } | null)?.user_id ?? '';
        return {
          ...inv,
          _business_name: businessMap.get(ownerId) ?? null,
          _owner_profile: profileMap.get(ownerId) ?? null,
        };
      });
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

      return { invitation, invitationId };
    },
    onSuccess: async ({ invitation, invitationId }) => {
      queryClient.invalidateQueries({ queryKey: ['creator-pending-invitations'] });
      toast({ title: 'Invitation declined' });

      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user!.id)
        .single();

      const campaignTitle = (invitation.campaigns as { title?: string } | null)?.title ?? 'your campaign';
      const creatorName = creatorProfile?.full_name ?? 'A creator';

      supabase.functions.invoke('create-notification', {
        body: {
          recipientId: invitation.invited_by,
          type: 'invitation_declined',
          category: 'campaigns',
          title: 'Invitation Declined',
          body: `${creatorName} declined your invitation to "${campaignTitle}"`,
          actionUrl: `/dashboard/business/campaigns/${invitation.campaign_id}`,
          actorId: user!.id,
          actorName: creatorName,
          icon: 'invitation',
          data: { campaign_id: invitation.campaign_id, invitation_id: invitationId },
          emailData: { campaignTitle, senderName: creatorName, campaignId: invitation.campaign_id },
        },
      }).catch((err: unknown) => console.error('Failed to send decline notification:', err));
    },
    onError: () => {
      toast({ title: 'Failed to decline invitation', variant: 'destructive' });
    },
  });
};
