
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WithdrawApplicationParams {
  applicationId: string;
  campaignTitle?: string;
}

export const useWithdrawApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId }: WithdrawApplicationParams) => {
      // First verify the application is still pending
      const { data: application, error: fetchError } = await supabase
        .from('campaign_applications')
        .select('id, status')
        .eq('id', applicationId)
        .single();

      if (fetchError) {
        throw new Error('Could not find application');
      }

      if (application.status !== 'pending') {
        throw new Error('Only pending applications can be withdrawn');
      }

      // Delete the application
      const { error: deleteError } = await supabase
        .from('campaign_applications')
        .delete()
        .eq('id', applicationId);

      if (deleteError) {
        throw deleteError;
      }

      return { success: true };
    },
    onSuccess: (_, { campaignTitle }) => {
      toast.success(
        campaignTitle 
          ? `Application for "${campaignTitle}" has been withdrawn`
          : 'Application withdrawn successfully'
      );
      
      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['creator-application-status'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to withdraw application');
    },
  });
};
