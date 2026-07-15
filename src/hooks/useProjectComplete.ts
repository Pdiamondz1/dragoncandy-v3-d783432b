import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { recordCrewActivity } from '@/lib/crews/recordCrewActivity';
import type { Database } from '@/integrations/supabase/types';

type CollaborationRow = Database['public']['Tables']['campaign_collaborations']['Row'];
type CompletionResult = CollaborationRow & { payoutSuccess?: boolean; payoutAmount?: number };

export const useProjectComplete = () => {
  const queryClient = useQueryClient();

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
        .select('id, application_id, business_completion_status, campaign_id, completed_at, content_deadline, content_started_at, content_status, content_submitted_at, contract_details, created_at, creator_completion_status, creator_id, deliverables_status, dispute_outcome, dispute_reason, milestones, review_extended, review_status, revision_count, revision_feedback, status, submitted_at, updated_at')
        .single();

      if (error) throw error;

      // Check if both parties have now requested completion
      const bothRequested = 
        (userRole === 'business_client' && data.creator_completion_status === 'requested') ||
        (userRole === 'content_creator' && data.business_completion_status === 'requested');

      if (bothRequested) {
        // Race guard: only the first concurrent caller's update succeeds
        const { data: completedRows, error: completeError } = await supabase
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
          .neq('status', 'completed')
          .select('id, application_id, business_completion_status, campaign_id, completed_at, content_deadline, content_started_at, content_status, content_submitted_at, contract_details, created_at, creator_completion_status, creator_id, deliverables_status, dispute_outcome, dispute_reason, milestones, review_extended, review_status, revision_count, revision_feedback, status, submitted_at, updated_at');

        if (completeError) throw completeError;

        // If no rows returned, a concurrent caller already completed — re-read canonical state
        if (!completedRows || completedRows.length === 0) {
          const { data: canonical } = await supabase
            .from('campaign_collaborations')
            .select('id, application_id, business_completion_status, campaign_id, completed_at, content_deadline, content_started_at, content_status, content_submitted_at, contract_details, created_at, creator_completion_status, creator_id, deliverables_status, dispute_outcome, dispute_reason, milestones, review_extended, review_status, revision_count, revision_feedback, status, submitted_at, updated_at')
            .eq('id', collaborationId)
            .maybeSingle();
          return { ...(canonical as CollaborationRow), payoutSuccess: false, payoutAmount: 0 };
        }

        const completedData = completedRows[0];

        // Trigger payout release — guard on escrow still being held
        let payoutSuccess = false;
        let payoutAmount = 0;
        let payoutMethod = '';

        const { data: campaignEscrow } = await supabase
          .from('campaigns')
          .select('escrow_status, group_id')
          .eq('id', completedData.campaign_id)
          .single();

        // Free crew campaigns (group_id set) have no escrow/payout — skip the invoke for
        // those only. Every non-crew campaign keeps its exact prior behavior (attempt
        // payout unless already released; release-creator-payout itself no-ops on a
        // non-'held' escrow), so legacy/manual escrow_status='none' rows are unaffected.
        if (!campaignEscrow?.group_id && campaignEscrow?.escrow_status !== 'released') {
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
            }
          } catch (payoutErr) {
            console.error('Payout error:', payoutErr);
          }
        }

        // Send completion confirmation emails to both parties with payment info
        const campaignData = collaboration.campaigns as { id: string; title: string; user_id: string };

        // Email to business owner (payer)
        await supabase.functions.invoke('create-notification', {
          body: {
            recipientId: campaignData.user_id,
            type: 'project_completed',
            category: 'transactions',
            title: 'Project completed',
            body: `"${campaignData.title}" is complete`,
            actionUrl: `/dashboard/business/campaigns/${campaignData.id}`,
            icon: 'check',
            data: { campaign_id: campaignData.id, collaboration_id: collaborationId },
            emailData: {
              campaignTitle: campaignData.title,
              projectId: collaborationId,
              actionUrl: `${window.location.origin}/dashboard/business/campaigns/${campaignData.id}`,
              amount: payoutSuccess ? payoutAmount : undefined,
              paymentMethod: payoutSuccess ? payoutMethod : undefined,
              isRecipient: false,
            },
          },
        }).catch((err: unknown) => console.error('Failed to send completion notification:', err));

        // Email to creator (payment recipient)
        await supabase.functions.invoke('create-notification', {
          body: {
            recipientId: collaboration.creator_id,
            type: 'project_completed',
            category: 'transactions',
            title: 'Project completed',
            body: `"${campaignData.title}" is complete`,
            actionUrl: `/dashboard/creator/projects?highlight=${collaborationId}`,
            icon: 'check',
            data: { campaign_id: campaignData.id, collaboration_id: collaborationId },
            emailData: {
              campaignTitle: campaignData.title,
              projectId: collaborationId,
              actionUrl: `${window.location.origin}/dashboard/creator/projects?highlight=${collaborationId}`,
              amount: payoutSuccess ? payoutAmount : undefined,
              paymentMethod: payoutSuccess ? payoutMethod : undefined,
              isRecipient: true,
            },
          },
        }).catch((err: unknown) => console.error('Failed to send completion notification:', err));

        // Crew activity — this caller won the completion race. Crews are FREE, so
        // there is NO `paid` event. Inert for non-crew campaigns via the RPC no-op.
        void recordCrewActivity(completedData.campaign_id, 'completed', collaborationId);

        // Return completed data with payout info for toast
        return { ...completedData, payoutSuccess, payoutAmount };
      }

      // Only one party requested - send notification to the other party
      const collabCampaign = collaboration.campaigns as { id: string; title: string; user_id: string };
      if (userRole === 'content_creator') {
        // Notify business owner
        await supabase.functions.invoke('create-notification', {
          body: {
            recipientId: collabCampaign.user_id,
            type: 'completion_request',
            category: 'transactions',
            title: 'Completion approval needed',
            body: `Please approve completion of "${collabCampaign.title}"`,
            actionUrl: `/dashboard/business/campaigns/${collabCampaign.id}`,
            icon: 'check',
            emailType: 'completion_request',
            data: { campaign_id: collabCampaign.id, collaboration_id: collaborationId },
            emailData: {
              campaignTitle: collabCampaign.title,
              requesterName: creatorProfile?.creator_name ?? '',
              actionUrl: `${window.location.origin}/dashboard/business/campaigns/${collabCampaign.id}`,
            },
          },
        }).catch((err: unknown) => console.error('Failed to send completion-request notification:', err));
      } else {
        // Notify creator
        await supabase.functions.invoke('create-notification', {
          body: {
            recipientId: collaboration.creator_id,
            type: 'completion_request',
            category: 'transactions',
            title: 'Completion approval needed',
            body: `Please approve completion of "${collabCampaign.title}"`,
            actionUrl: `/dashboard/creator/projects?highlight=${collaborationId}`,
            icon: 'check',
            emailType: 'completion_request',
            data: { campaign_id: collabCampaign.id, collaboration_id: collaborationId },
            emailData: {
              campaignTitle: collabCampaign.title,
              requesterName: 'Business Owner',
              actionUrl: `${window.location.origin}/dashboard/creator/projects?highlight=${collaborationId}`,
            },
          },
        }).catch((err: unknown) => console.error('Failed to send completion-request notification:', err));
      }

      return data;
    },
    onSuccess: (data: CompletionResult) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['creator-projects'] });
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-completion'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-project'] });

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
