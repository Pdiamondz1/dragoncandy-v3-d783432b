
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
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
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
        .update({ status: 'counter_offered' })
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
        .select('id, application_id, sender_id, sender_role, proposed_rate, proposed_timeline, message, status, created_at')
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
      currentUserRole,
      agreedRate,
    }: {
      counterOfferId: string;
      applicationId: string;
      response: 'accepted' | 'declined';
      currentUserRole: 'business' | 'creator';
      agreedRate?: number;
    }) => {
      // Update counter-offer status with race guard
      const { data: offerRows, error: offerError } = await supabase
        .from('application_counter_offers')
        .update({ status: response })
        .eq('id', counterOfferId)
        .eq('status', 'pending')
        .select('id');

      if (offerError) throw offerError;
      if (!offerRows || offerRows.length === 0) {
        throw new Error('This counter offer is no longer pending — it may have already been responded to.');
      }

      // If accepted, update application status with race guard
      if (response === 'accepted') {
        const newAppStatus = currentUserRole === 'business' ? 'accepted' : 'pending';

        const { data: appRows, error: appError } = await supabase
          .from('campaign_applications')
          .update({
            status: newAppStatus,
            ...(agreedRate ? { proposed_rate: agreedRate } : {}),
          })
          .eq('id', applicationId)
          .eq('status', 'counter_offered')
          .select('id');

        if (appError) throw appError;
        if (!appRows || appRows.length === 0) {
          throw new Error('This application status has already changed.');
        }
      }

      if (response === 'declined') {
        await supabase
          .from('campaign_applications')
          .update({ status: 'rejected' })
          .eq('id', applicationId)
          .eq('status', 'counter_offered');
      }

      return { response, applicationId, currentUserRole };
    },
    onSuccess: async ({ response, applicationId, currentUserRole }) => {
      queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      toast({
        title: response === 'accepted'
          ? currentUserRole === 'business'
            ? 'Creator hired!'
            : 'Price agreed!'
          : 'Offer declined',
        description: response === 'accepted'
          ? currentUserRole === 'business'
            ? 'Proceed to payment to start the project.'
            : 'The business will review your application.'
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

        if (response === 'accepted' && currentUserRole === 'business') {
          const { error: nudgeError } = await supabase.from('donny_nudges').insert({
            user_id: application.creator_id,
            type: 'campaign_hired',
            summary: `🎉 You've been selected for "${campaign.title}"! The restaurant will proceed with payment to start the project.`,
            priority: 'high',
            actions: [
              { label: 'View Project', route: `/dashboard/creator/my-campaigns` },
              { label: 'Send Message', route: `/messages/${application.campaign_id}` },
            ],
            raw_data: { campaign_id: application.campaign_id, application_id: applicationId },
          });
          if (nudgeError) console.error('Failed to create hired nudge:', nudgeError);
        }
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
