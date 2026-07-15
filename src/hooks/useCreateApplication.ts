
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { recordCrewActivity } from '@/lib/crews/recordCrewActivity';

export const useCreateApplication = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { completeMission } = useFirstRunMissions();

  return useMutation({
    mutationFn: async ({
      campaignId,
      introMessage,
      proposedTimeline,
      proposedRate,
      portfolioUrl,
      isCounterOffer,
      isInvited,
    }: {
      campaignId: string;
      introMessage: string;
      proposedTimeline?: string;
      proposedRate?: number;
      portfolioUrl?: string;
      isCounterOffer?: boolean;
      isInvited?: boolean;
    }) => {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

      if (campaign?.status !== 'published') {
        if (!isInvited) {
          throw new Error('This campaign is no longer accepting applications.');
        }
        const { data: invitation } = await supabase
          .from('campaign_invitations')
          .select('id')
          .eq('campaign_id', campaignId)
          .eq('creator_id', user!.id)
          .eq('status', 'pending')
          .maybeSingle();
        if (!invitation) {
          throw new Error('This campaign is no longer accepting applications.');
        }
      }

      // Check for existing non-rejected application (partial unique index excludes rejected)
      const { data: existingApp } = await supabase
        .from('campaign_applications')
        .select('id, status')
        .eq('campaign_id', campaignId)
        .eq('creator_id', user!.id)
        .neq('status', 'rejected')
        .maybeSingle();

      let data;

      if (existingApp) {
        if (isCounterOffer) {
          const { data: updated, error } = await supabase
            .from('campaign_applications')
            .update({
              status: 'counter_offered',
              proposed_rate: proposedRate,
              intro_message: introMessage,
              proposed_timeline: proposedTimeline,
            })
            .eq('id', existingApp.id)
            .select('id, campaign_id, creator_id, status')
            .single();
          if (error) {
            console.error('Error updating application:', error);
            throw error;
          }
          data = updated;
        } else {
          throw new Error('You have already applied to this campaign.');
        }
      } else {
        // Atomic RPC: inserts application + syncs pending invitation in one transaction
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('apply_to_campaign', {
            p_campaign_id: campaignId,
            p_creator_id: user!.id,
            p_proposed_rate: proposedRate ?? 0,
            p_intro_message: introMessage,
            p_proposed_timeline: proposedTimeline ?? null,
            p_is_counter_offer: isCounterOffer ?? false,
            p_portfolio_url: portfolioUrl ?? null,
          });

        if (rpcError) {
          console.error('Error creating application:', rpcError);
          throw rpcError;
        }
        data = rpcResult as { id: string; campaign_id: string; creator_id: string; status: string };
      }

      if (isCounterOffer && data) {
        const { error: counterOfferError } = await supabase.from('application_counter_offers').insert({
          application_id: data.id,
          sender_id: user!.id,
          sender_role: 'creator',
          proposed_rate: proposedRate,
          message: introMessage || 'I would like to propose a different rate for this campaign.',
          status: 'pending',
        });
        if (counterOfferError) {
          console.error('Error creating counter offer record:', counterOfferError);
        }
      }

      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-application-status'] });
      completeMission('apply_campaign');

      const isOffer = data.status === 'counter_offered';
      toast({
        title: isOffer ? 'Offer submitted!' : 'Application submitted successfully!',
        description: isOffer
          ? 'The business will review your offer and respond.'
          : 'The business owner will review your application.',
      });

      // Fire-and-forget notification to campaign owner
      try {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title, user_id, id')
          .eq('id', data.campaign_id)
          .single();

        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('creator_name')
          .eq('user_id', user!.id)
          .single();

        if (campaign && creatorProfile) {
          supabase.functions.invoke('create-notification', {
            body: {
              recipientId: campaign.user_id,
              type: 'application_received',
              category: 'campaigns',
              title: 'New Application',
              body: `${creatorProfile.creator_name} applied to your "${campaign.title}" campaign`,
              actionUrl: `/dashboard/business/campaigns/${campaign.id}`,
              actorId: user!.id,
              actorName: creatorProfile.creator_name,
              icon: 'application',
              data: { campaign_id: campaign.id, application_id: data.id },
              emailData: { campaignTitle: campaign.title, applicantName: creatorProfile.creator_name, campaignId: campaign.id },
            },
          }).catch((err: unknown) => console.error('Failed to send notification:', err));
        }
      } catch (error) {
        console.error('Failed to prepare notification:', error);
      }

      // Crew activity (inert for non-crew campaigns via the RPC's group_id no-op).
      void recordCrewActivity(data.campaign_id, 'application_received');

      // Invitation sync is handled atomically by the apply_to_campaign RPC
    },
    onError: (error: Error) => {
      console.error('Application submission failed:', error);
      let description = 'Please try again later.';
      if (error.message?.includes('already applied') || error.message?.includes('no longer accepting')) {
        description = error.message;
      } else if (error.message?.includes('row-level security') || error.message?.includes('violates row')) {
        description = 'A permissions issue occurred. Please refresh and try again.';
      }
      toast({
        title: 'Failed to submit application',
        description,
        variant: 'destructive',
      });
    },
  });
};
