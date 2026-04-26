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
      const results = { sent: 0, duplicates: 0, errors: 0 };

      for (const creatorId of creatorIds) {
        try {
          const { data, error } = await supabase.functions.invoke('send-campaign-invitation', {
            body: {
              campaign_id: campaignId,
              creator_id: creatorId,
              invited_by: user!.id,
              invitation_message: message,
            },
          });

          if (error) {
            results.errors++;
            continue;
          }

          const result = typeof data === 'string' ? JSON.parse(data) : data;
          if (result.already_invited) {
            results.duplicates++;
          } else {
            results.sent++;
          }
        } catch {
          results.errors++;
        }
      }

      return results;
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
