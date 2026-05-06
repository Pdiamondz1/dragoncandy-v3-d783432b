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
  terms?: Record<string, unknown>;
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
      
      // Send email notification to restaurant owner
      try {
        // Get campaign details
        const { data: campaign, error: campaignError } = await supabase
          .from('campaigns')
          .select('title, user_id')
          .eq('id', variables.campaignId)
          .single();

        if (campaignError) {
          throw campaignError;
        }

        // Get restaurant owner's profile
        const { data: restaurantProfile, error: restaurantProfileError } = await supabase
          .from('business_profiles')
          .select('business_name, user_id')
          .eq('user_id', campaign?.user_id)
          .eq('account_type', 'restaurant')
          .maybeSingle();

        if (restaurantProfileError) {
          console.error('Error fetching restaurant profile:', restaurantProfileError);
        }

        const { data: restaurantUser, error: restaurantUserError } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', restaurantProfile?.user_id)
          .maybeSingle();

        if (restaurantUserError) {
          console.error('Error fetching restaurant user:', restaurantUserError);
        }

        // Get brand name
        const { data: brandProfile, error: brandProfileError } = await supabase
          .from('business_profiles')
          .select('business_name')
          .eq('user_id', user?.id)
          .eq('account_type', 'brand')
          .maybeSingle();

        if (brandProfileError) {
          console.error('Error fetching brand profile:', brandProfileError);
        }

        // Always attempt to send the email; server will resolve recipient if email is missing
        const recipientEmail = restaurantUser?.email || undefined;
        const recipientName = restaurantUser?.full_name || restaurantProfile?.business_name || 'Restaurant Owner';
        
        await sendNotification(
          'sponsorship_proposal',
          recipientEmail,
          recipientName,
          {
            campaignTitle: campaign.title,
            brandName: brandProfile?.business_name || 'A brand',
            sponsorshipAmount: variables.sponsorshipAmount,
            message: variables.proposalMessage,
            recipientUserId: restaurantProfile?.user_id,
          }
        );
        
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
