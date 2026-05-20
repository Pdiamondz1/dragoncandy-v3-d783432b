
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';

export const useCreateApplication = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();
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

      // Check for existing application (unique constraint: campaign_id + creator_id)
      const { data: existingApp } = await supabase
        .from('campaign_applications')
        .select('id, status')
        .eq('campaign_id', campaignId)
        .eq('creator_id', user!.id)
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
        const { data: inserted, error } = await supabase
          .from('campaign_applications')
          .insert({
            campaign_id: campaignId,
            creator_id: user!.id,
            intro_message: introMessage,
            proposed_timeline: proposedTimeline,
            proposed_rate: proposedRate,
            portfolio_url: portfolioUrl,
            status: isCounterOffer ? 'counter_offered' : 'pending',
          })
          .select('id, campaign_id, creator_id, status')
          .single();

        if (error) {
          console.error('Error creating application:', error);
          throw error;
        }
        data = inserted;
      }

      if (isCounterOffer && data) {
        await supabase.from('application_counter_offers').insert({
          application_id: data.id,
          sender_id: user!.id,
          sender_role: 'creator',
          proposed_rate: proposedRate,
          message: introMessage || 'I would like to propose a different rate for this campaign.',
          status: 'pending',
        });
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

      // Send email notification to campaign owner
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
          await sendNotification(
            'new_application',
            undefined,
            undefined,
            {
              recipientUserId: campaign.user_id,
              campaignTitle: campaign.title,
              campaignId: campaign.id,
              applicantName: creatorProfile.creator_name
            }
          );
        }
      } catch (error) {
        console.error('Failed to send notification email:', error);
      }

      // Update invitation status if creator was invited
      try {
        const invitationStatus = data.status === 'counter_offered' ? 'counter_offered' : 'accepted';
        await supabase
          .from('campaign_invitations')
          .update({ status: invitationStatus })
          .eq('campaign_id', data.campaign_id)
          .eq('creator_id', user!.id)
          .eq('status', 'pending');
      } catch (invErr) {
        console.error('Failed to update invitation status:', invErr);
      }
    },
    onError: (error: Error) => {
      console.error('Application submission failed:', error);
      const description =
        error.message?.includes('already applied') || error.message?.includes('no longer accepting')
          ? error.message
          : 'Please try again later.';
      toast({
        title: 'Failed to submit application',
        description,
        variant: 'destructive',
      });
    },
  });
};
