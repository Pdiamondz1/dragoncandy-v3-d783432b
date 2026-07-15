import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useScheduledPosts, ScheduledPost } from '@/hooks/useScheduledPosts';
import { ScheduleStatsRow } from './ScheduleStatsRow';
import { PostCard } from './PostCard';
import { Calendar, Sparkles } from 'lucide-react';

interface ScheduleReviewScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  planGroupId?: string;
  connectedPlatformCount: number;
  onConfirm?: () => void;
}

function computeSpreadDays(posts: ScheduledPost[]): number {
  if (posts.length < 2) return 1;
  const dates = posts.map(p => new Date(p.scheduled_at).getTime());
  const range = Math.max(...dates) - Math.min(...dates);
  return Math.max(1, Math.ceil(range / 86400000));
}

export function ScheduleReviewScreen({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  planGroupId,
  connectedPlatformCount,
  onConfirm,
}: ScheduleReviewScreenProps) {
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const { data: posts = [], isLoading } = useScheduledPosts(campaignId, planGroupId);

  const spreadDays = computeSpreadDays(posts);
  const allScheduled = posts.length > 0 && posts.every(p => p.status === 'published');
  const confirmDisabled = posts.length === 0 || allScheduled;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Review Schedule</SheetTitle>
        </SheetHeader>

        {/* Header card */}
        <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-dc-teal shrink-0" />
            <span className="font-semibold text-dc-text text-sm leading-snug">{campaignTitle}</span>
          </div>
          {posts.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-dc-text-muted">
                {posts.length} post{posts.length !== 1 ? 's' : ''}
              </span>
              <span className="bg-dc-teal/10 text-dc-teal text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Donny Optimized
              </span>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-dc-text-muted">
            Loading schedule…
          </div>
        )}

        {!isLoading && posts.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="w-14 h-14 rounded-2xl bg-dc-teal/15 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-7 h-7 text-dc-teal" />
            </div>
            <p className="font-bold text-dc-text">No posts scheduled yet</p>
            <p className="text-sm text-dc-text-muted mt-1.5 max-w-xs mx-auto">
              Once this campaign has deliverables, Donny builds a posting schedule you can review and confirm right here.
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-5 bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full px-6 py-3 text-sm font-bold transition-colors"
            >
              Back to campaign
            </button>
          </div>
        )}

        {!isLoading && posts.length > 0 && (
          <>
            <ScheduleStatsRow
              postCount={posts.length}
              crossPostCount={posts.length * connectedPlatformCount}
              spreadDays={spreadDays}
            />

            <div className="space-y-3 mt-4">
              {posts.map((post, i) => (
                <PostCard
                  key={post.id}
                  post={post}
                  index={i}
                  total={posts.length}
                  onEditCaption={(id) => setEditingPostId(id)}
                  onChangeDate={(id) => setEditingPostId(id)}
                />
              ))}
            </div>
          </>
        )}

        {/* Sticky confirm footer — only shown when there is something to confirm */}
        {!isLoading && posts.length > 0 && (
          <div className="sticky bottom-0 bg-white pt-3 pb-4 border-t border-gray-100 mt-4">
            <button
              type="button"
              disabled={confirmDisabled}
              onClick={() => onConfirm?.()}
              className="w-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full py-3 font-bold text-sm transition-colors"
            >
              Confirm &amp; Schedule All Posts
            </button>
            <p className="text-xs text-center text-dc-text-muted mt-1.5">
              Posts will be queued for publishing at the scheduled times
            </p>
          </div>
        )}

        {/* editingPostId is reserved for Task 12 wiring */}
        {editingPostId && null}
      </SheetContent>
    </Sheet>
  );
}
