import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RescheduleInput {
  postId: string;
  campaignId: string;
  scheduledAt?: string;
  caption?: string;
  hashtags?: string[];
}

export function useReschedulePost() {
  const queryClient = useQueryClient();

  const reschedule = useMutation({
    mutationFn: async (input: RescheduleInput) => {
      const updates: Record<string, unknown> = {};
      if (input.scheduledAt) updates.scheduled_at = input.scheduledAt;
      if (input.caption !== undefined) updates.caption = input.caption;
      if (input.hashtags) updates.hashtags = input.hashtags;
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update(updates)
        .eq('id', input.postId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success('Post updated');
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts', variables.campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update post: ${error.message}`);
    },
  });

  const cancel = useMutation({
    mutationFn: async ({ postId, campaignId: _campaignId }: { postId: string; campaignId: string }) => {
      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success('Post cancelled');
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts', variables.campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel post: ${error.message}`);
    },
  });

  return { reschedule, cancel };
}
