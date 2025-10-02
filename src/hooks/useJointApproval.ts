import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export type ApprovalAction = 'approved' | 'rejected';

export const useJointApproval = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
        .select('brand_approval_status, restaurant_approval_status')
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
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      toast({
        title: action === 'approved' ? 'Application Approved' : 'Application Rejected',
        description: action === 'approved'
          ? 'Waiting for restaurant owner approval to finalize.'
          : 'The application has been rejected.',
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
        .select('brand_approval_status, restaurant_approval_status')
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
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      toast({
        title: action === 'approved' ? 'Application Approved' : 'Application Rejected',
        description: action === 'approved'
          ? 'Waiting for brand sponsor approval to finalize.'
          : 'The application has been rejected.',
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
