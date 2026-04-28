import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from './useEmailNotifications';

export const useProjectComplete = () => {
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  const requestCompletion = useMutation({
    mutationFn: async ({ 
      collaborationId, 
      userRole 
    }: { 
      collaborationId: string; 
      userRole: 'business_client' | 'content_creator';
    }) => {
      const statusField = userRole === 'business_client' 
        ? 'business_completion_status' 
        : 'creator_completion_status';

      // Fetch collaboration with campaign details
      const { data: collaboration, error: fetchError } = await supabase
        .from('campaign_collaborations')
        .select(`
          *,
          campaigns (
            id,
            title,
            user_id
          )
        `)
        .eq('id', collaborationId)
        .single();

      if (fetchError) throw fetchError;

      // Fetch creator profile separately to avoid join issues
      const { data: creatorProfile, error: creatorError } = await supabase
        .from('creator_profiles')
        .select('user_id, creator_name')
        .eq('user_id', collaboration.creator_id)
        .maybeSingle();

      if (creatorError) throw creatorError;

      // Update completion status - also set content_status to 'submitted' when creator marks complete
      const { data, error } = await supabase
        .from('campaign_collaborations')
        .update({ 
          [statusField]: 'requested',
          updated_at: new Date().toISOString(),
          // If creator marks complete, also mark content as submitted
          ...(userRole === 'content_creator' && { content_status: 'submitted' })
        })
        .eq('id', collaborationId)
        .select()
        .single();

      if (error) throw error;

      // Check if both parties have now requested completion
      const bothRequested = 
        (userRole === 'business_client' && data.creator_completion_status === 'requested') ||
        (userRole === 'content_creator' && data.business_completion_status === 'requested');

      if (bothRequested) {
        // Both parties requested - mark as completed
        const { data: completedData, error: completeError } = await supabase
          .from('campaign_collaborations')
          .update({ 
            status: 'completed',
            review_status: 'pending',
            business_completion_status: 'approved',
            creator_completion_status: 'approved',
            content_status: 'approved',
            completed_at: new Date().toISOString()
          })
          .eq('id', collaborationId)
          .select()
          .single();

        if (completeError) throw completeError;

        // Trigger payout release
        let payoutSuccess = false;
        let payoutAmount = 0;
        let payoutMethod = '';

        try {
          const { data: payoutResult, error: payoutError } = await supabase.functions
            .invoke('release-creator-payout', {
              body: { collaborationId }
            });

          if (payoutError) {
            console.error('Payout release failed:', payoutError);
          } else if (payoutResult?.success) {
            payoutSuccess = true;
            payoutAmount = payoutResult.amount || 0;
            payoutMethod = payoutResult.method || 'pending_balance';
            // Payout released successfully
          }
        } catch (payoutErr) {
          console.error('Payout error:', payoutErr);
          // Don't throw - project completion is valid, payout can be retried
        }

        // Send completion confirmation emails to both parties with payment info
        const campaignData = collaboration.campaigns as any;

        // Email to business owner (payer)
        await sendNotification(
          'project_completion',
          '', // Will fetch from profile
          '', // Will fetch from profile
          {
            recipientUserId: campaignData.user_id,
            campaignTitle: campaignData.title,
            projectId: collaborationId,
            actionUrl: `${window.location.origin}/dashboard/business/projects?highlight=${collaborationId}`,
            amount: payoutSuccess ? payoutAmount : undefined,
            paymentMethod: payoutSuccess ? payoutMethod : undefined,
            isRecipient: false, // Business paid, not received
          }
        );

        // Email to creator (payment recipient)
        await sendNotification(
          'project_completion',
          '', // Will fetch from profile
          creatorProfile.creator_name,
          {
            recipientUserId: collaboration.creator_id,
            campaignTitle: campaignData.title,
            projectId: collaborationId,
            actionUrl: `${window.location.origin}/dashboard/creator/projects?highlight=${collaborationId}`,
            amount: payoutSuccess ? payoutAmount : undefined,
            paymentMethod: payoutSuccess ? payoutMethod : undefined,
            isRecipient: true, // Creator is the payment recipient
          }
        );

        // Return completed data with payout info for toast
        return { ...completedData, payoutSuccess, payoutAmount };
      }

      // Only one party requested - send notification to the other party
      if (userRole === 'content_creator') {
        // Notify business owner
        await sendNotification(
          'completion_request',
          '', // Will fetch from profile
          '', // Will fetch from profile
          {
            recipientUserId: (collaboration.campaigns as any).user_id,
            campaignTitle: (collaboration.campaigns as any).title,
            requesterName: creatorProfile.creator_name,
            actionUrl: `${window.location.origin}/dashboard/business/projects?highlight=${collaborationId}`
          }
        );
      } else {
        // Notify creator
        await sendNotification(
          'completion_request',
          '', // Will fetch from profile
          creatorProfile.creator_name,
          {
            recipientUserId: collaboration.creator_id,
            campaignTitle: (collaboration.campaigns as any).title,
            requesterName: 'Business Owner',
            actionUrl: `${window.location.origin}/dashboard/creator/projects?highlight=${collaborationId}`
          }
        );
      }

      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['creator-projects'] });
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-completion'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });

      if (data.status === 'completed') {
        toast({
          title: "Project completed! 🎉",
          description: data.payoutSuccess 
            ? `Payment of $${data.payoutAmount?.toFixed(2)} has been released to the creator. Please leave a review.`
            : "Both parties have approved completion. Please leave a review.",
        });
      } else {
        toast({
          title: "Completion requested",
          description: "Waiting for the other party to approve completion.",
        });
      }
    },
    onError: (error) => {
      console.error('Error requesting completion:', error);
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
      ? requestCompletion.variables?.collaborationId 
      : null,
  };
};
