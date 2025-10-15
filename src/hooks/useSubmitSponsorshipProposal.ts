import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

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
  const { sendNotification } = useEmailNotifications();

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
        .select()
        .single();

      if (error) throw error;

      return data;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status', variables.campaignId] });
      
      // Send email notification to restaurant owner
      try {
        // Get campaign details
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title, user_id')
          .eq('id', variables.campaignId)
          .single();

        // Get restaurant owner's profile
        const { data: restaurantProfile } = await supabase
          .from('business_profiles')
          .select('business_name, user_id')
          .eq('user_id', campaign?.user_id)
          .eq('account_type', 'restaurant')
          .maybeSingle();

        const { data: restaurantUser } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', restaurantProfile?.user_id)
          .maybeSingle();

        // Get brand name
        const { data: brandProfile } = await supabase
          .from('business_profiles')
          .select('business_name')
          .eq('user_id', user?.id)
          .eq('account_type', 'brand')
          .maybeSingle();

        if (restaurantUser?.email && campaign) {
          await sendNotification(
            'sponsorship_proposal',
            restaurantUser.email,
            restaurantUser.full_name || restaurantProfile?.business_name || 'Restaurant Owner',
            {
              campaignTitle: campaign.title,
              brandName: brandProfile?.business_name || 'A brand',
              sponsorshipAmount: variables.sponsorshipAmount,
              message: variables.proposalMessage,
            }
          );
        }
      } catch (error) {
        console.error('Failed to send email notification:', error);
        // Don't block the success flow if email fails
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
