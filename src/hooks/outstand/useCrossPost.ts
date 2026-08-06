import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useToast } from '@/hooks/use-toast';
import { extractOutstandPostId } from '@/lib/outstandPostId';

interface CrossPostInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  scheduledAt?: string;
  silent?: boolean;
}

export function useCrossPost(options?: { onPublished?: () => void }) {
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
        accounts: accountIds,
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
        let errMsg = Array.isArray(data?.error)
          ? data.error[0]?.message ?? JSON.stringify(data.error)
          : data?.error || data?.message || `Post failed (${res.status})`;
        if (/invalid datetime/i.test(errMsg)) {
          errMsg = 'The scheduled time is invalid or in the past. Please try again.';
        }
        throw new Error(errMsg);
      }
      // Routed through the one shared reader (2026-08-06). This call site's own
      // union was the CORRECT one of the three that existed — it is the proven
      // production reader, and extractOutstandPostId adopts its exact priority
      // order, so this is behaviour-preserving here and a fix for the other two.
      const outstandPostId = extractOutstandPostId(data);
      return { ...data, _outstandPostId: outstandPostId };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['outstand'] });
      if (!variables.scheduledAt) {
        setTimeout(() => {
          qc.refetchQueries({ queryKey: ['outstand'] });
          options?.onPublished?.();
        }, 3000);
      }
      if (!variables.silent) {
        toast({
          title: variables.scheduledAt ? 'Cross-post scheduled!' : 'Cross-post published!',
        });
      }
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
