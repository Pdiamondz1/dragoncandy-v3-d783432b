
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

export const useManageApplication = () => {
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  return useMutation({
    mutationFn: async ({
      applicationId,
      status,
      approvalRole,
    }: {
      applicationId: string;
      status: 'accepted' | 'rejected' | 'counter_offered';
      approvalRole?: 'brand' | 'restaurant';
    }) => {
      if (approvalRole) {
        // Joint approval: set role-specific column, trigger handles final_approval_status
        const column = approvalRole === 'brand'
          ? 'brand_approval_status'
          : 'restaurant_approval_status';
        const approvalStatus = status === 'accepted' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';

        const { error } = await supabase
          .from('campaign_applications')
          .update({ [column]: approvalStatus })
          .eq('id', applicationId);
        if (error) throw error;

        // Refetch to get the trigger-computed final_approval_status
        const { data: app, error: fetchError } = await supabase
          .from('campaign_applications')
          .select('*, campaigns(title)')
          .eq('id', applicationId)
          .single();
        if (fetchError) throw fetchError;

        // Sync legacy status column when final is resolved
        if (app.final_approval_status === 'approved') {
          await supabase.from('campaign_applications').update({ status: 'accepted' }).eq('id', applicationId);
        } else if (app.final_approval_status === 'rejected') {
          await supabase.from('campaign_applications').update({ status: 'rejected' }).eq('id', applicationId);
        }

        return app;
      } else {
        // Non-sponsored: direct status update + set restaurant_approval_status for consistency
        const { data, error } = await supabase
          .from('campaign_applications')
          .update({
            status,
            restaurant_approval_status: status === 'accepted' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'
          })
          .eq('id', applicationId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      
      // Send email notification to creator
      try {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', data.creator_id)
          .single();
        
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title')
          .eq('id', data.campaign_id)
          .single();
        
        if (creatorProfile?.email && campaign?.title) {
          await sendNotification(
            'application_status',
            creatorProfile.email,
            creatorProfile.full_name,
            {
              campaignTitle: campaign.title,
              applicationStatus: data.status,
              campaignId: data.campaign_id,
            }
          );
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }
      
      toast({
        title: `Application ${data.status}!`,
        description: data.status === 'accepted' 
          ? 'Please proceed with escrow payment to start the project.' 
          : 'The creator has been notified.',
      });
    },
    onError: (error) => {
      console.error('Application management failed:', error);
      toast({
        title: 'Failed to update application',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
