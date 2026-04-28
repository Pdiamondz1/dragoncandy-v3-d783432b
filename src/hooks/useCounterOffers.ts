
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

export interface CounterOffer {
  id: string;
  application_id: string;
  sender_id: string;
  sender_role: 'business' | 'creator';
  proposed_rate: number | null;
  proposed_timeline: string | null;
  message: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export const useCounterOffers = (applicationId: string | undefined) => {
  return useQuery({
    queryKey: ['counter-offers', applicationId],
    queryFn: async () => {
      if (!applicationId) return [];
      const { data, error } = await supabase
        .from('application_counter_offers')
        .select('id, application_id, sender_id, sender_role, proposed_rate, proposed_timeline, message, status, created_at')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as CounterOffer[];
    },
    enabled: !!applicationId,
  });
};

export const useCreateCounterOffer = () => {
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  return useMutation({
    mutationFn: async ({
      applicationId,
      senderRole,
      proposedRate,
      proposedTimeline,
      message,
    }: {
      applicationId: string;
      senderRole: 'business' | 'creator';
      proposedRate?: number;
      proposedTimeline?: string;
      message: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update application status to counter_offered
      const { error: statusError } = await supabase
        .from('campaign_applications')
        .update({ status: 'counter_offered' as any })
        .eq('id', applicationId);

      if (statusError) throw statusError;

      // Insert the counter-offer
      const { data, error } = await supabase
        .from('application_counter_offers')
        .insert({
          application_id: applicationId,
          sender_id: user.id,
          sender_role: senderRole,
          proposed_rate: proposedRate || null,
          proposed_timeline: proposedTimeline || null,
          message,
        })
        .select()
        .single();

      if (error) throw error;
      return { data, senderRole, applicationId };
    },
    onSuccess: async ({ data, senderRole, applicationId }) => {
      queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      toast({ title: 'Counter offer sent!', description: 'The other party will be notified.' });

      // Send email notification to the other party
      try {
        const { data: application } = await supabase
          .from('campaign_applications')
          .select('creator_id, campaign_id')
          .eq('id', applicationId)
          .single();

        if (!application) return;

        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title, user_id')
          .eq('id', application.campaign_id)
          .single();

        // Determine recipient: if sender is business, notify creator; vice versa
        const recipientUserId = senderRole === 'business' 
          ? application.creator_id 
          : campaign?.user_id;

        if (recipientUserId && campaign) {
          await sendNotification('counter_offer', undefined, undefined, {
            campaignTitle: campaign.title,
            campaignId: application.campaign_id,
            recipientUserId,
            message: data.message,
            amount: data.proposed_rate || undefined,
          });
        }
      } catch (e) {
        console.error('Failed to send counter-offer notification:', e);
      }
    },
    onError: (error) => {
      console.error('Counter offer failed:', error);
      toast({ title: 'Failed to send counter offer', description: 'Please try again.', variant: 'destructive' });
    },
  });
};

export const useRespondToCounterOffer = () => {
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  return useMutation({
    mutationFn: async ({
      counterOfferId,
      applicationId,
      response,
    }: {
      counterOfferId: string;
      applicationId: string;
      response: 'accepted' | 'declined';
    }) => {
      // Update counter-offer status
      const { error: offerError } = await supabase
        .from('application_counter_offers')
        .update({ status: response })
        .eq('id', counterOfferId);

      if (offerError) throw offerError;

      // If accepted, update application status to accepted (NO collaboration creation here)
      if (response === 'accepted') {
        const { error: appError } = await supabase
          .from('campaign_applications')
          .update({ status: 'accepted' as any })
          .eq('id', applicationId);

        if (appError) throw appError;
      }

      return { response, applicationId };
    },
    onSuccess: async ({ response, applicationId }) => {
      queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      toast({
        title: response === 'accepted' ? 'Offer accepted!' : 'Offer declined',
        description: response === 'accepted'
          ? 'The restaurant will now proceed with escrow payment to start the project.'
          : 'The other party will be notified.',
      });

      // Send email notification
      try {
        const { data: application } = await supabase
          .from('campaign_applications')
          .select('creator_id, campaign_id')
          .eq('id', applicationId)
          .single();

        if (!application) return;

        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title, user_id')
          .eq('id', application.campaign_id)
          .single();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !campaign) return;

        // Notify the counter-offer sender (the other party)
        const recipientUserId = user.id === application.creator_id
          ? campaign.user_id
          : application.creator_id;

        await sendNotification('counter_offer_response', undefined, undefined, {
          campaignTitle: campaign.title,
          campaignId: application.campaign_id,
          recipientUserId,
          applicationStatus: response,
        });
      } catch (e) {
        console.error('Failed to send response notification:', e);
      }
    },
    onError: (error) => {
      console.error('Response failed:', error);
      toast({ title: 'Failed to respond', description: 'Please try again.', variant: 'destructive' });
    },
  });
};
