
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
    }: {
      campaignId: string;
      introMessage: string;
      proposedTimeline?: string;
      proposedRate?: number;
      portfolioUrl?: string;
      isCounterOffer?: boolean;
    }) => {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

      if (campaign?.status !== 'published') {
        throw new Error('This campaign is no longer accepting applications.');
      }

      const { data, error } = await supabase
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

      // Update invitation status to 'accepted' if creator was invited
      try {
        await supabase
          .from('campaign_invitations')
          .update({ status: 'accepted' })
          .eq('campaign_id', data.campaign_id)
          .eq('creator_id', user!.id)
          .eq('status', 'pending');
      } catch (invErr) {
        console.error('Failed to update invitation status:', invErr);
      }
    },
    onError: (error) => {
      console.error('Application submission failed:', error);
      toast({
        title: 'Failed to submit application',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
