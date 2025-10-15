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
      // Optimistic cache update for instant UI feedback
      if (user?.id) {
        queryClient.setQueryData([
          'brand-sponsorship-status',
          variables.campaignId,
          user.id,
        ], data);
      }

      // Invalidate all sponsorship status queries so cards update in real-time
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status'] });
      // Also refresh the campaigns list with updated sponsorship counts
      queryClient.invalidateQueries({ queryKey: ['sponsorship-campaigns'] });
      
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
          console.log('📧 Sending sponsorship proposal notification:', {
            to: restaurantUser.email,
            campaign: campaign.title,
            brand: brandProfile?.business_name,
            amount: variables.sponsorshipAmount
          });
          
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
        } else {
          console.warn('⚠️ Email notification skipped - missing data:', {
            hasEmail: !!restaurantUser?.email,
            hasCampaign: !!campaign,
          });
        }
      } catch (error) {
        console.error('❌ Failed to send email notification:', error);
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
