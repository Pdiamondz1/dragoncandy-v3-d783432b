import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useReportUser() {
  return useMutation({
    mutationFn: async (args: { reportedId: string; conversationId?: string; reason?: string }) => {
      const { error } = await supabase.rpc('report_user', {
        p_reported_id: args.reportedId,
        p_conversation_id: args.conversationId,
        p_reason: args.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Report submitted. Thank you for helping keep DragonCandy safe.'),
    onError: () => toast.error('Could not submit your report. Please try again.'),
  });
}
