import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

export type ApprovalAction = 'approved' | 'rejected';

export const useJointApproval = () => {
  useAuth();
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  const updateBrandApproval = useMutation({
    mutationFn: async ({
      applicationId,
      action,
    }: {
      applicationId: string;
      action: ApprovalAction;
    }) => {
      // Update brand approval status
      const { error: updateError } = await supabase
        .from('campaign_applications')
        .update({ brand_approval_status: action })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Check if both approvals are now set
      const { data: application } = await supabase
        .from('campaign_applications')
        .select('id, brand_approval_status, restaurant_approval_status, final_approval_status, campaign_id')
        .eq('id', applicationId)
        .single();

      // Update final status if both parties have approved
      if (application?.brand_approval_status === 'approved' &&
          application?.restaurant_approval_status === 'approved') {
        const { error: finalError } = await supabase
          .from('campaign_applications')
          .update({
            final_approval_status: 'approved',
            status: 'accepted' // Update the main status as well
          })
          .eq('id', applicationId);

        if (finalError) throw finalError;

        if (application.campaign_id) {
          supabase.functions.invoke('fire-campaign-social-hook', {
            body: { campaign_id: application.campaign_id, stage: 4 },
          }).catch((err) => console.error('Failed to fire Stage 4 hook:', err));
        }
      } else if (action === 'rejected') {
        // If either party rejects, final status is rejected
        const { error: finalError } = await supabase
          .from('campaign_applications')
          .update({
            final_approval_status: 'rejected',
            status: 'rejected'
          })
          .eq('id', applicationId);

        if (finalError) throw finalError;
      }
    },
    onSuccess: async (_, { applicationId, action }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });

      // Send email notifications
      try {
        const { data: application } = await supabase
          .from('campaign_applications')
          .select(`
            *,
            campaign:campaigns!campaign_applications_campaign_id_fkey(title, user_id)
          `)
          .eq('id', applicationId)
          .single();

        if (!application) return;

        const finalStatus = application.final_approval_status;

        // If final decision is made, notify creator
        if (finalStatus === 'approved' || finalStatus === 'rejected') {
          const { fetchRecipientEmail } = await import('@/lib/recipientEmail');
          const creatorProfile = await fetchRecipientEmail(application.creator_id);

          if (creatorProfile?.email && application.campaign?.title) {
            await sendNotification(
              'application_status',
              creatorProfile.email,
              creatorProfile.full_name,
              {
                campaignTitle: application.campaign.title,
                applicationStatus: finalStatus,
                campaignId: application.campaign_id,
              }
            );
          }
        } else if (action === 'approved') {
          const { fetchRecipientEmail } = await import('@/lib/recipientEmail');
          const restaurantProfile = await fetchRecipientEmail(application.campaign.user_id);

          if (restaurantProfile?.email && application.campaign?.title) {
            await sendNotification(
              'approval_pending',
              restaurantProfile.email,
              restaurantProfile.full_name,
              {
                campaignTitle: application.campaign.title,
                party: 'brand sponsor',
                campaignId: application.campaign_id,
              }
            );
          }
        }

      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }

      toast({
        title: action === 'approved' ? 'Application Approved' : 'Application Rejected',
        description: action === 'approved'
          ? 'Waiting for restaurant owner approval to finalize.'
          : 'The application has been rejected and the creator has been notified.',
      });
    },
    onError: (error) => {
      console.error('Error updating brand approval:', error);
      toast({
        title: 'Error',
        description: 'Failed to update approval status.',
        variant: 'destructive',
      });
    },
  });

  const updateRestaurantApproval = useMutation({
    mutationFn: async ({
      applicationId,
      action,
    }: {
      applicationId: string;
      action: ApprovalAction;
    }) => {
      // Update restaurant approval status
      const { error: updateError } = await supabase
        .from('campaign_applications')
        .update({ restaurant_approval_status: action })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Check if both approvals are now set
      const { data: application } = await supabase
        .from('campaign_applications')
        .select('id, brand_approval_status, restaurant_approval_status, final_approval_status, campaign_id')
        .eq('id', applicationId)
        .single();

      // Update final status if both parties have approved
      if (application?.brand_approval_status === 'approved' &&
          application?.restaurant_approval_status === 'approved') {
        const { error: finalError } = await supabase
          .from('campaign_applications')
          .update({
            final_approval_status: 'approved',
            status: 'accepted'
          })
          .eq('id', applicationId);

        if (finalError) throw finalError;

        if (application.campaign_id) {
          supabase.functions.invoke('fire-campaign-social-hook', {
            body: { campaign_id: application.campaign_id, stage: 4 },
          }).catch((err) => console.error('Failed to fire Stage 4 hook:', err));
        }
      } else if (action === 'rejected') {
        const { error: finalError } = await supabase
          .from('campaign_applications')
          .update({
            final_approval_status: 'rejected',
            status: 'rejected'
          })
          .eq('id', applicationId);

        if (finalError) throw finalError;
      }
    },
    onSuccess: async (_, { applicationId, action }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });

      // Send email notifications
      try {
        const { data: application } = await supabase
          .from('campaign_applications')
          .select(`
            *,
            campaign:campaigns!campaign_applications_campaign_id_fkey(title, user_id),
            sponsorship:campaign_sponsorships!campaign_sponsorships_campaign_id_fkey(brand_id)
          `)
          .eq('id', applicationId)
          .single();
        
        if (!application) return;
        
        const finalStatus = application.final_approval_status;
        
        // If final decision is made, notify creator
        if (finalStatus === 'approved' || finalStatus === 'rejected') {
          const { fetchRecipientEmail } = await import('@/lib/recipientEmail');
          const creatorProfile = await fetchRecipientEmail(application.creator_id);
          
          if (creatorProfile?.email && application.campaign?.title) {
            await sendNotification(
              'application_status',
              creatorProfile.email,
              creatorProfile.full_name,
              {
                campaignTitle: application.campaign.title,
                applicationStatus: finalStatus,
                campaignId: application.campaign_id,
              }
            );
          }
        } else if (action === 'approved') {
          // Restaurant approved, notify brand
          const sponsorshipArray = Array.isArray(application.sponsorship) 
            ? application.sponsorship 
            : application.sponsorship ? [application.sponsorship] : [];
          
          if (sponsorshipArray.length > 0 && sponsorshipArray[0].brand_id) {
            const { data: brandProfile } = await supabase
              .from('business_profiles')
              .select('user_id')
              .eq('id', sponsorshipArray[0].brand_id)
              .single();
            
            if (brandProfile?.user_id) {
              const { fetchRecipientEmail } = await import('@/lib/recipientEmail');
              const brandUser = await fetchRecipientEmail(brandProfile.user_id);
              
              if (brandUser?.email && application.campaign?.title) {
                await sendNotification(
                  'approval_pending',
                  brandUser.email,
                  brandUser.full_name,
                  {
                    campaignTitle: application.campaign.title,
                    party: 'restaurant owner',
                    campaignId: application.campaign_id,
                  }

                );
              }
            }
          }
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }
      
      toast({
        title: action === 'approved' ? 'Application Approved' : 'Application Rejected',
        description: action === 'approved'
          ? 'Waiting for brand sponsor approval to finalize.'
          : 'The application has been rejected and the creator has been notified.',
      });
    },
    onError: (error) => {
      console.error('Error updating restaurant approval:', error);
      toast({
        title: 'Error',
        description: 'Failed to update approval status.',
        variant: 'destructive',
      });
    },
  });

  return {
    updateBrandApproval,
    updateRestaurantApproval,
  };
};
