import React, { useMemo, useState } from 'react';
import { BarChart3, AlertCircle, Loader2, CheckCircle2, Trash2 } from 'lucide-react';
import { PostMetrics, useOutstandApi, type Post } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { Button } from '@/components/ui/button';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatPostDate, getCaption, getMedia, MediaPreviewStrip } from './postUtils';
import { isInPublishedFeed, postOutcome } from '@/pages/OutstandManager';
import { toast } from 'sonner';

interface PublishedTabProps {
  posts: Post[];
  isLoading: boolean;
  onChanged?: () => void;
}

const STATUS_BADGE: Record<
  string,
  { label: string; className: string; Icon: React.FC<{ className?: string }> }
> = {
  published: {
    label: 'Posted',
    className: 'bg-emerald-100 text-emerald-700',
    Icon: CheckCircle2,
  },
  pending: {
    label: 'Publishing…',
    className: 'bg-amber-100 text-amber-700',
    Icon: Loader2,
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700',
    Icon: AlertCircle,
  },
};

export const PublishedTab: React.FC<PublishedTabProps> = ({ posts, isLoading, onChanged }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; caption: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const published = useMemo(
    () =>
      posts
        .filter(isInPublishedFeed)
        .map((post) => {
          const outcome = postOutcome(post);
          const stamp =
            post.publishedAt ??
            post.socialAccounts?.find((sa) => sa.publishedAt)?.publishedAt ??
            post.createdAt ??
            null;
          return {
            post,
            caption: getCaption(post),
            media: getMedia(post),
            outcome,
            stamp,
          };
        }),
    [posts],
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      let res = await api.delete(`/posts/${deleteTarget.id}`);
      // Outstand has a known bug where DELETE rejects failed posts with
      // "Failed to cancel scheduled post from publishing queue". Try the
      // undocumented `?force=true` escape hatch before giving up.
      if (
        !res.success &&
        typeof res.error === 'string' &&
        /publishing queue/i.test(res.error)
      ) {
        res = await api.delete(`/posts/${deleteTarget.id}?force=true`);
      }
      if (!res.success) {
        const raw = typeof res.error === 'string' ? res.error : 'Delete failed';
        if (/publishing queue/i.test(raw)) {
          throw new Error(
            'This failed post is stuck in the publishing queue and cannot be removed automatically. Try again in a minute, or reach out to support to clear it.',
          );
        }
        throw new Error(raw);
      }
      toast.success('Post deleted.');
      onChanged?.();
      setDeleteTarget(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(message, { duration: 12000 });
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return <DCSkeleton variant="card" count={3} className="mb-3" />;
  }

  if (published.length === 0) {
    return (
      <DCEmptyState
        icon={BarChart3}
        title="Nothing posted yet"
        subtitle="Once you publish a post, it will appear here with metrics and per-platform status."
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {published.map(({ post, caption, media, outcome, stamp }) => (
          <div key={post.id} className="bg-white rounded-2xl p-4 border-2 border-dc-teal space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-gray-500">
                {outcome === 'published' ? 'Published' : 'Created'} {formatPostDate(stamp)}
              </p>
              <PostStatusBadge outcome={outcome} />
            </div>

            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
              {caption || <span className="italic text-gray-400">No caption</span>}
            </p>

            <MediaPreviewStrip media={media} />

            <div className="flex flex-wrap gap-1.5">
              {(post.socialAccounts ?? []).map((sa) => (
                <AccountStatusPill key={sa.id} sa={sa} />
              ))}
            </div>

            {outcome === 'published' && (
              <div className="border-t pt-3">
                <PostMetrics apiKey={apiKey} baseUrl={baseUrl} postId={post.id} />
              </div>
            )}

            <div className="flex items-center justify-end pt-1">
              <Button
                variant="dc-outline"
                size="sm"
                onClick={() =>
                  setDeleteTarget({
                    id: post.id,
                    caption: caption || 'this post',
                  })
                }
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the post from your dashboard. If it was already published to a
              social platform, the platform's copy may remain — you'll need to delete it
              there separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const PostStatusBadge: React.FC<{ outcome: 'published' | 'pending' | 'failed' | 'mixed' }> = ({
  outcome,
}) => {
  if (outcome === 'mixed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
        <AlertCircle className="h-3 w-3" />
        Partial
      </span>
    );
  }
  const cfg = STATUS_BADGE[outcome];
  if (!cfg) return null;
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${cfg.className}`}
    >
      <Icon className={`h-3 w-3 ${outcome === 'pending' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
};

const AccountStatusPill: React.FC<{
  sa: NonNullable<Post['socialAccounts']>[number];
}> = ({ sa }) => {
  const tone =
    sa.status === 'published'
      ? 'bg-dc-teal/10 text-dc-teal'
      : sa.status === 'failed'
        ? 'bg-red-50 text-red-700 border border-red-200'
        : 'bg-amber-50 text-amber-700 border border-amber-200';
  return (
    <span
      className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 font-semibold inline-flex items-center gap-1 ${tone}`}
      title={sa.error ?? undefined}
    >
      {sa.network}
      {sa.status === 'failed' && <AlertCircle className="h-3 w-3" />}
      {sa.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
      {sa.error && (
        <span className="font-normal normal-case ml-1 max-w-[180px] truncate">
          {sa.error}
        </span>
      )}
    </span>
  );
};
