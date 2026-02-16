
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
        .select('*')
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
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      toast({ title: 'Counter offer sent!', description: 'The other party will be notified.' });
    },
    onError: (error) => {
      console.error('Counter offer failed:', error);
      toast({ title: 'Failed to send counter offer', description: 'Please try again.', variant: 'destructive' });
    },
  });
};

export const useRespondToCounterOffer = () => {
  const queryClient = useQueryClient();

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

      // If accepted, update application status to accepted and create collaboration
      if (response === 'accepted') {
        const { data: appData, error: appError } = await supabase
          .from('campaign_applications')
          .update({ status: 'accepted' as any })
          .eq('id', applicationId)
          .select()
          .single();

        if (appError) throw appError;

        // Create collaboration
        const { error: collabError } = await supabase
          .from('campaign_collaborations')
          .insert({
            campaign_id: appData.campaign_id,
            creator_id: appData.creator_id,
            application_id: appData.id,
            status: 'active',
          });

        if (collabError) throw collabError;
      }

      return { response };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      toast({
        title: data.response === 'accepted' ? 'Offer accepted!' : 'Offer declined',
        description: data.response === 'accepted'
          ? 'A collaboration has been created.'
          : 'The other party will be notified.',
      });
    },
    onError: (error) => {
      console.error('Response failed:', error);
      toast({ title: 'Failed to respond', description: 'Please try again.', variant: 'destructive' });
    },
  });
};
