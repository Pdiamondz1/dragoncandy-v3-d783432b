
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
    }: {
      applicationId: string;
      status: 'accepted' | 'rejected' | 'counter_offered';
    }) => {
      console.log('Updating application status:', { applicationId, status });
      
      const { data, error } = await supabase
        .from('campaign_applications')
        .update({ status })
        .eq('id', applicationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating application:', error);
        throw error;
      }

      // If accepted, create collaboration record
      if (status === 'accepted') {
        const { error: collaborationError } = await supabase
          .from('campaign_collaborations')
          .insert({
            campaign_id: data.campaign_id,
            creator_id: data.creator_id,
            application_id: data.id,
            status: 'active',
          });

        if (collaborationError) {
          console.error('Error creating collaboration:', collaborationError);
          throw collaborationError;
        }
      }

      console.log('Updated application:', data);
      return data;
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
          ? 'A new collaboration has been created and the creator has been notified.' 
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
