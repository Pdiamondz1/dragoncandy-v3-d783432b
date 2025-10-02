import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface SubmitSponsorshipProposalParams {
  campaignId: string;
  restaurantUserId: string;
  sponsorshipAmount: number;
  proposalMessage: string;
  terms?: any;
}

export const useSubmitSponsorshipProposal = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SubmitSponsorshipProposalParams) => {
      if (!user) throw new Error('User not authenticated');

      // Get brand profile ID
      const { data: brandProfile, error: brandError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('account_type', 'brand')
        .single();

      if (brandError || !brandProfile) {
        throw new Error('Brand profile not found');
      }

      // Get restaurant profile ID
      const { data: restaurantProfile, error: restaurantError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', params.restaurantUserId)
        .eq('account_type', 'restaurant')
        .single();

      if (restaurantError || !restaurantProfile) {
        throw new Error('Restaurant profile not found');
      }

      // Insert sponsorship proposal
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .insert({
          campaign_id: params.campaignId,
          brand_id: brandProfile.id,
          restaurant_id: restaurantProfile.id,
          sponsorship_amount: params.sponsorshipAmount,
          proposal_message: params.proposalMessage,
          terms: params.terms || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status', variables.campaignId] });
      toast({
        title: 'Proposal submitted',
        description: 'Your sponsorship proposal has been sent to the restaurant.',
      });
    },
    onError: (error) => {
      console.error('Failed to submit proposal:', error);
      toast({
        title: 'Failed to submit proposal',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
