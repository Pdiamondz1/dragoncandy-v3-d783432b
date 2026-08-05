import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface AmplifyInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  campaignId: string;
  scheduledAt?: string;
}

export function useSponsorshipAmplification() {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ caption, mediaUrls, accountIds, campaignId, scheduledAt }: AmplifyInput) => {
      const body: Record<string, unknown> = {
        text: caption,
        socialAccountIds: accountIds,
      };
      if (mediaUrls.length > 0) body.mediaUrls = mediaUrls;
      if (scheduledAt) body.scheduledAt = scheduledAt;

      const res = await fetch(`${baseUrl}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to amplify post');
      const data: Record<string, unknown> = await res.json();

      for (const accountId of accountIds) {
        const { error: logError } = await supabase.from('social_post_log').insert({
          user_id: user!.id,
          campaign_id: campaignId,
          outstand_post_id: (data.id ?? (data.data as Record<string, unknown>)?.id ?? 'unknown') as string,
          platform: accountId,
          post_type: 'amplification',
        });
        if (logError) console.error('[useSponsorshipAmplification] Failed to log social post:', logError);
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['outstand'] });
      qc.invalidateQueries({ queryKey: ['brand-sponsorships'] });
      toast.success(variables.scheduledAt ? 'Amplification scheduled!' : 'Content amplified to your channels!');
    },
    onError: (err: Error) => {
      toast.error(`Amplification failed: ${err.message}`);
    },
  });
}
