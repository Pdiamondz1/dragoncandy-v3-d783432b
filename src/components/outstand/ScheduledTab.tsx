import React, { useMemo, useState } from 'react';
import { CalendarClock, X as XIcon } from 'lucide-react';
import { useOutstandApi, type Post } from '@outstand-so/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { Button } from '@/components/ui/button';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { formatPostDate, getCaption, getMedia, getUniqueNetworks, MediaPreviewStrip, NetworkPills } from './postUtils';
import { isScheduled } from '@/pages/OutstandManager';
import { toast } from 'sonner';

interface ScheduledTabProps {
  posts: Post[];
  isLoading: boolean;
  onChanged?: () => void;
}

export const ScheduledTab: React.FC<ScheduledTabProps> = ({ posts, isLoading, onChanged }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const scheduled = useMemo(
    () =>
      posts
        .filter(isScheduled)
        .map((post) => ({
          post,
          networks: getUniqueNetworks(post),
          caption: getCaption(post),
          media: getMedia(post),
        })),
    [posts],
  );

  const cancel = async (postId: string) => {
    setCancellingId(postId);
    try {
      const res = await api.delete(`/posts/${postId}`);
      if (!res.success) throw new Error(res.error || 'Cancel failed');
      toast.success('Scheduled post cancelled.');
      qc.invalidateQueries({ queryKey: ['outstand'] });
      onChanged?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Could not cancel: ${message}`);
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return <DCSkeleton variant="card" count={3} className="mb-3" />;
  }

  if (scheduled.length === 0) {
    return (
      <DCEmptyState
        icon={CalendarClock}
        title="No scheduled posts"
        subtitle="Use Compose to schedule a post for later."
      />
    );
  }

  return (
    <div className="space-y-3">
      {scheduled.map(({ post, networks, caption, media }) => (
        <div key={post.id} className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                <CalendarClock className="h-3 w-3" />
                {formatPostDate(post.scheduledAt)}
              </p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {caption || <span className="italic text-gray-400">No caption</span>}
              </p>
              <MediaPreviewStrip media={media} />
              <NetworkPills networks={networks} />
            </div>
            <Button
              variant="dc-outline"
              size="sm"
              onClick={() => cancel(post.id)}
              disabled={cancellingId === post.id}
              className="border-pink-300 text-pink-600 hover:bg-pink-50"
            >
              <XIcon className="h-3 w-3" />
              {cancellingId === post.id ? 'Cancelling…' : 'Cancel'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
