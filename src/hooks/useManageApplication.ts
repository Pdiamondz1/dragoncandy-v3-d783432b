
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useManageApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      status,
    }: {
      applicationId: string;
      status: 'accepted' | 'rejected';
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      
      toast({
        title: `Application ${data.status}!`,
        description: data.status === 'accepted' 
          ? 'A new collaboration has been created.' 
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
