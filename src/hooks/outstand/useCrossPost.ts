import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { toast } from 'sonner';

interface CrossPostInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  scheduledAt?: string;
}

export function useCrossPost() {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ caption, mediaUrls, accountIds, scheduledAt }: CrossPostInput) => {
      const body: Record<string, unknown> = {
        text: caption,
        socialAccountIds: accountIds,
      };
      if (mediaUrls.length > 0) {
        body.mediaUrls = mediaUrls;
      }
      if (scheduledAt) {
        body.scheduledAt = scheduledAt;
      }
      const res = await api.post('/posts', body);
      if (!res.success) throw new Error(res.error || 'Failed to create cross-post');
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['outstand'] });
      toast.success(variables.scheduledAt ? 'Cross-post scheduled!' : 'Cross-post published!');
    },
    onError: (error: Error) => {
      toast.error(`Cross-post failed: ${error.message}`);
    },
  });
}
