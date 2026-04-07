import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface BulkInviteParams {
  campaignId: string;
  creatorIds: string[];
  message?: string;
}

interface BulkInviteResult {
  sent: number;
  duplicates: number;
  errors: number;
}

export function useBulkInvite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, creatorIds, message }: BulkInviteParams): Promise<BulkInviteResult> => {
      let sent = 0;
      let duplicates = 0;
      let errors = 0;

      // Insert one at a time to gracefully handle duplicates
      for (const creatorId of creatorIds) {
        const { error } = await supabase
          .from('campaign_invitations')
          .insert({
            campaign_id: campaignId,
            creator_id: creatorId,
            invited_by: user!.id,
            invitation_message: message ?? null,
          });

        if (error) {
          if (error.message?.includes('duplicate key')) {
            duplicates++;
          } else {
            errors++;
          }
        } else {
          sent++;
        }
      }

      return { sent, duplicates, errors };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-invitations', variables.campaignId] });

      const parts: string[] = [];
      if (result.sent > 0) parts.push(`${result.sent} invitation${result.sent !== 1 ? 's' : ''} sent`);
      if (result.duplicates > 0) parts.push(`${result.duplicates} already invited`);
      if (result.errors > 0) parts.push(`${result.errors} failed`);

      toast({
        title: result.sent > 0 ? 'Invitations sent!' : 'No new invitations',
        description: parts.join(', '),
        variant: result.sent > 0 ? 'default' : 'destructive',
      });
    },
    onError: () => {
      toast({
        title: 'Bulk invite failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });
}
