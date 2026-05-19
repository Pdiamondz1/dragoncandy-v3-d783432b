import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useToast } from '@/hooks/use-toast';

interface CrossPostInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  scheduledAt?: string;
}

export function useCrossPost() {
  const { apiKey, baseUrl } = useOutstandConfig();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ caption, mediaUrls, accountIds, scheduledAt }: CrossPostInput) => {
      const container: Record<string, unknown> = { content: caption };
      if (mediaUrls.length > 0) {
        container.media = mediaUrls.map((url, i) => ({
          id: `media-${i}`,
          url,
          filename: url.split('/').pop() || `upload-${i}`,
        }));
      }
      const payload: Record<string, unknown> = {
        socialAccountIds: accountIds,
        containers: [container],
      };
      if (scheduledAt) {
        payload.scheduledAt = scheduledAt;
      }

      const res = await fetch(`${baseUrl}/posts/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Post failed (${res.status})`);
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['outstand'] });
      toast({
        title: variables.scheduledAt ? 'Cross-post scheduled!' : 'Cross-post published!',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Cross-post failed',
        description: error.message,
      });
    },
  });
}
