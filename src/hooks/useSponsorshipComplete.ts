import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from './useEmailNotifications';
import { useAuth } from './useAuth';

export const useSponsorshipComplete = () => {
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();
  const { user } = useAuth();

  const requestCompletion = useMutation({
    mutationFn: async ({ 
      sponsorshipId, 
      userRole 
    }: { 
      sponsorshipId: string; 
      userRole: 'brand' | 'business';
    }) => {
      const statusField = userRole === 'brand' 
        ? 'brand_completion_status' 
        : 'business_completion_status';

      // Fetch sponsorship with campaign and business profile details
      const { data: sponsorship, error: fetchError } = await supabase
        .from('campaign_sponsorships')
        .select(`
          *,
          campaigns (
            id,
            title,
            user_id
          )
        `)
        .eq('id', sponsorshipId)
        .single();

      if (fetchError) throw fetchError;

      // Fetch brand profile
      const { data: brandProfile, error: brandError } = await supabase
        .from('business_profiles')
        .select('id, user_id, business_name')
        .eq('id', sponsorship.brand_id)
        .single();

      if (brandError) throw brandError;

      // Fetch restaurant/business profile
      const { data: restaurantProfile, error: restaurantError } = await supabase
        .from('business_profiles')
        .select('id, user_id, business_name')
        .eq('id', sponsorship.restaurant_id)
        .single();

      if (restaurantError) throw restaurantError;

      // Update completion status
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .update({ 
          [statusField]: 'requested',
          updated_at: new Date().toISOString()
        })
        .eq('id', sponsorshipId)
        .select()
        .single();

      if (error) throw error;

      // Check if both parties have now requested completion
      const bothRequested = 
        (userRole === 'brand' && data.business_completion_status === 'requested') ||
        (userRole === 'business' && data.brand_completion_status === 'requested');

      if (bothRequested) {
        // Both parties requested - mark as completed
        const { data: completedData, error: completeError } = await supabase
          .from('campaign_sponsorships')
          .update({ 
            status: 'completed',
            review_status: 'pending',
            brand_completion_status: 'approved',
            business_completion_status: 'approved',
            completed_at: new Date().toISOString()
          })
          .eq('id', sponsorshipId)
          .select()
          .single();

        if (completeError) throw completeError;

        const campaignData = sponsorship.campaigns as any;

        // Send completion confirmation email to brand
        await sendNotification(
          'sponsorship_completed',
          '',
          brandProfile.business_name,
          {
            recipientUserId: brandProfile.user_id,
            campaignTitle: campaignData.title,
            brandName: brandProfile.business_name,
            businessName: restaurantProfile.business_name,
            sponsorshipId: sponsorshipId,
            actionUrl: `${window.location.origin}/dashboard/brand/sponsorships?highlight=${sponsorshipId}`
          }
        );

        // Send completion confirmation email to business
        await sendNotification(
          'sponsorship_completed',
          '',
          restaurantProfile.business_name,
          {
            recipientUserId: restaurantProfile.user_id,
            campaignTitle: campaignData.title,
            brandName: brandProfile.business_name,
            businessName: restaurantProfile.business_name,
            sponsorshipId: sponsorshipId,
            actionUrl: `${window.location.origin}/dashboard/business/sponsorships?highlight=${sponsorshipId}`
          }
        );

        return completedData;
      }

      // Only one party requested - send notification to the other party
      const campaignData = sponsorship.campaigns as any;

      if (userRole === 'brand') {
        // Notify business owner
        await sendNotification(
          'sponsorship_completion_request',
          '',
          restaurantProfile.business_name,
          {
            recipientUserId: restaurantProfile.user_id,
            campaignTitle: campaignData.title,
            brandName: brandProfile.business_name,
            businessName: restaurantProfile.business_name,
            requesterName: brandProfile.business_name,
            sponsorshipId: sponsorshipId,
            actionUrl: `${window.location.origin}/dashboard/business/sponsorships?highlight=${sponsorshipId}`
          }
        );
      } else {
        // Notify brand
        await sendNotification(
          'sponsorship_completion_request',
          '',
          brandProfile.business_name,
          {
            recipientUserId: brandProfile.user_id,
            campaignTitle: campaignData.title,
            brandName: brandProfile.business_name,
            businessName: restaurantProfile.business_name,
            requesterName: restaurantProfile.business_name,
            sponsorshipId: sponsorshipId,
            actionUrl: `${window.location.origin}/dashboard/brand/sponsorships?highlight=${sponsorshipId}`
          }
        );
      }

      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorships'] });
      queryClient.invalidateQueries({ queryKey: ['business-sponsorships'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-completion'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });

      if (data.status === 'completed') {
        // Trigger payout to restaurant
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            const response = await supabase.functions.invoke('release-sponsorship-payout', {
              body: { sponsorshipId: data.id },
            });
            if (response.error) {
              console.error('Payout error:', response.error);
            } else {
              // Sponsorship payout triggered successfully
            }
          }
        } catch (payoutError) {
          console.error('Failed to trigger sponsorship payout:', payoutError);
        }

        toast({
          title: "Sponsorship completed!",
          description: "Both parties have approved completion. Payment is being processed. Please leave a review.",
        });
      } else {
        toast({
          title: "Completion requested",
          description: "Waiting for the other party to approve completion.",
        });
      }
    },
    onError: (error) => {
      console.error('Error requesting sponsorship completion:', error);
      toast({
        title: "Error requesting completion",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  return {
    requestCompletion: requestCompletion.mutate,
    requestingId: requestCompletion.isPending 
      ? requestCompletion.variables?.sponsorshipId 
      : null,
  };
};
