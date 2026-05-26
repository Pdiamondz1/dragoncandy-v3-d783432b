import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface SubmitSponsorshipProposalParams {
  campaignId: string;
  restaurantUserId: string;
  sponsorshipAmount: number;
  proposalMessage: string;
  terms?: Record<string, unknown>;
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
        .maybeSingle();

      if (brandError) throw brandError;
      
      if (!brandProfile) {
        throw new Error('Please complete your brand profile setup before submitting sponsorship proposals.');
      }

      // Get restaurant profile ID
      const { data: restaurantProfile, error: restaurantError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', params.restaurantUserId)
        .eq('account_type', 'restaurant')
        .maybeSingle();

      if (restaurantError) throw restaurantError;
      
      if (!restaurantProfile) {
        throw new Error('Restaurant profile not found. Please try again later.');
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
        .select('id, campaign_id, brand_id, restaurant_id, sponsorship_amount, proposal_message, terms, status, created_at')
        .single();

      if (error) throw error;

      return data;
    },
    onSuccess: async (data, variables) => {
      // Optimistic cache update for instant UI feedback
      if (user?.id) {
        queryClient.setQueryData([
          'brand-sponsorship-status',
          variables.campaignId,
          user.id,
        ], data);
      }

      // Invalidate and refetch all sponsorship status queries
      await queryClient.invalidateQueries({ 
        queryKey: ['brand-sponsorship-status'],
        refetchType: 'active' // Force active queries to refetch immediately
      });
      
      // Refetch campaigns list
      await queryClient.refetchQueries({ 
        queryKey: ['sponsorship-campaigns']
      });
      
      // Send notification to restaurant owner
      try {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('id, title, user_id')
          .eq('id', variables.campaignId)
          .single();

        const { data: brandProfile } = await supabase
          .from('business_profiles')
          .select('business_name')
          .eq('user_id', user?.id)
          .eq('account_type', 'brand')
          .maybeSingle();

        const brandName = brandProfile?.business_name || 'A brand';

        if (campaign) {
          supabase.functions.invoke('create-notification', {
            body: {
              recipientId: campaign.user_id,
              type: 'sponsorship_proposal',
              category: 'campaigns',
              title: 'New Sponsorship Proposal',
              body: `${brandName} proposed $${variables.sponsorshipAmount} sponsorship for "${campaign.title}"`,
              actionUrl: `/dashboard/business/campaigns/${campaign.id}`,
              actorId: user?.id,
              actorName: brandName,
              icon: 'sponsorship',
              data: { campaign_id: campaign.id, sponsorship_amount: variables.sponsorshipAmount },
              emailData: { campaignTitle: campaign.title, brandName, sponsorshipAmount: variables.sponsorshipAmount, message: variables.proposalMessage, campaignId: campaign.id },
            },
          }).catch((err: unknown) => console.error('Failed to send notification:', err));
        }
      } catch (error) {
        console.error('Failed to send notification:', error);
      }

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
