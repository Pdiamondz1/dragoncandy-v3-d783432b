import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useConfirmSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ planGroupId, campaignId }: { planGroupId: string; campaignId: string }) => {
      const { data, error } = await supabase.functions.invoke('confirm-posting-schedule', {
        body: { plan_group_id: planGroupId, campaign_id: campaignId },
      });
      if (error) throw error;
      return data as { success: boolean; scheduled_count: number; failed_count: number; campaign_status: string };
    },
    onSuccess: (data, variables) => {
      if (data.failed_count > 0) {
        toast.warning(
          `${data.scheduled_count} post${data.scheduled_count !== 1 ? 's' : ''} scheduled, ${data.failed_count} failed`
        );
      } else {
        toast.success(
          `${data.scheduled_count} post${data.scheduled_count !== 1 ? 's' : ''} scheduled successfully`
        );
      }
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts', variables.campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to confirm schedule: ${error.message}`);
    },
  });
}
