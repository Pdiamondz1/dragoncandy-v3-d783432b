import React, { useState } from 'react';
import { FileText, Send, X as XIcon, CalendarClock, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { useDraftPosts, type DraftPost } from '@/hooks/useDraftPosts';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppCard } from '@/components/app/AppCard';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { parseHashtagInput } from '@/lib/composeCaption';
import { toDatetimeLocal, fromDatetimeLocal } from '@/lib/dateUtils';

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  campaign_social_hook: { label: 'Campaign', className: 'bg-dc-teal/20 text-dc-teal' },
  promotion_social_hook: { label: 'UGC', className: 'bg-pink-100 text-pink-600' },
  dragonshare_social_hook: { label: 'DragonShare', className: 'bg-yellow-100 text-yellow-800' },
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  twitter: 'X',
  youtube: 'YouTube',
};

function SourceBadge({ source }: { source: string | undefined }) {
  const badge = SOURCE_BADGES[source ?? ''] ?? { label: 'Manual', className: 'bg-dc-teal/5 text-dc-text-muted' };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
      {badge.label}
    </span>
  );
}

export const DraftsTab: React.FC = () => {
  const { drafts, isLoading, cancelDraft, updateDraft, scheduleDraft, scheduleAllDrafts } = useDraftPosts();
  const { publishDraft } = useDonnyContext();
  const queryClient = useQueryClient();
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  // The draft currently open in the edit dialog, plus its working copy. Held as
  // one object so opening a different draft cannot leave stale field state
  // behind from the previous one.
  const [editing, setEditing] = useState<
    { draft: DraftPost; caption: string; hashtags: string; scheduledLocal: string } | null
  >(null);

  const openEditor = (draft: DraftPost) => {
    setEditing({
      draft,
      caption: draft.caption ?? '',
      hashtags: (draft.hashtags ?? []).join(' '),
      scheduledLocal: toDatetimeLocal(new Date(draft.scheduled_at)),
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const when = fromDatetimeLocal(editing.scheduledLocal);
    if (!when) {
      toast.error('Enter a valid date and time');
      return;
    }
    try {
      await updateDraft.mutateAsync({
        draftId: editing.draft.id,
        caption: editing.caption.trim() || null,
        hashtags: parseHashtagInput(editing.hashtags),
        scheduledAt: when.toISOString(),
      });
      toast.success('Draft saved');
      setEditing(null);
    } catch (err) {
      // updateDraft's onError already surfaces the message; keep the dialog
      // open so the edit is not silently lost.
      console.error('[DraftsTab] Save failed:', err);
    }
  };

  const handlePostNow = async (draft: DraftPost) => {
    setPublishingId(draft.id);
    try {
      await publishDraft(draft.id);
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    } catch (err) {
      console.error('[DraftsTab] Post failed:', err);
    } finally {
      setPublishingId(null);
    }
  };

  const handleSchedule = async (draft: DraftPost) => {
    setSchedulingId(draft.id);
    try {
      await scheduleDraft.mutateAsync({ draftId: draft.id });
      toast.success(`Scheduled for ${new Date(draft.scheduled_at).toLocaleString()}`);
    } catch (err) {
      console.error('[DraftsTab] Schedule failed:', err);
      toast.error('Failed to schedule post');
    } finally {
      setSchedulingId(null);
    }
  };

  const handleScheduleAll = async () => {
    try {
      await scheduleAllDrafts.mutateAsync();
      toast.success(`Scheduled ${drafts.length} post${drafts.length !== 1 ? 's' : ''} at AI-suggested times`);
    } catch (err) {
      console.error('[DraftsTab] Schedule all failed:', err);
      toast.error('Failed to schedule posts');
    }
  };

  if (isLoading) {
    return <DCSkeleton variant="card" count={3} className="mb-3" />;
  }

  if (drafts.length === 0) {
    return (
      <DCEmptyState
        icon={FileText}
        title="No drafts waiting"
        subtitle="When you approve customer videos or get boosted, Donny will prepare posts for you here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {drafts.length > 1 && (
        <Button
          onClick={handleScheduleAll}
          disabled={scheduleAllDrafts.isPending}
          className="w-full rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
          size="sm"
        >
          <Clock className="h-3 w-3 mr-1" />
          {scheduleAllDrafts.isPending ? 'Scheduling…' : `Schedule All ${drafts.length} Drafts`}
        </Button>
      )}
      {drafts.map((draft) => {
        const source = (draft.metadata as Record<string, unknown>)?.source as string | undefined;
        const scheduledDate = new Date(draft.scheduled_at);
        const captionPreview = draft.caption
          ? draft.caption.length > 120 ? `${draft.caption.slice(0, 120)}…` : draft.caption
          : null;

        return (
          <AppCard key={draft.id} variant="emphasis">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Source + platform badges */}
                <div className="flex items-center gap-1.5 mb-2">
                  <SourceBadge source={source} />
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-dc-teal/5 text-dc-text-muted">
                    {PLATFORM_LABELS[draft.platform] || draft.platform}
                  </span>
                </div>

                {/* Suggested time */}
                <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <CalendarClock className="h-3 w-3" />
                  Suggested: {scheduledDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at{' '}
                  {scheduledDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </p>

                {/* Caption preview */}
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {captionPreview || <span className="italic text-gray-400">No caption</span>}
                </p>

                {/* Hashtags */}
                {draft.hashtags?.length ? (
                  <p className="text-xs text-dc-teal mt-1">{draft.hashtags.join(' ')}</p>
                ) : null}

                {/* Media thumbnail */}
                {draft.media_urls?.[0] && (
                  <div className="mt-2">
                    <img
                      src={draft.media_urls[0]}
                      alt="Draft media"
                      className="h-16 w-16 rounded-lg object-cover border border-dc-teal/15"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSchedule(draft)}
                  disabled={schedulingId === draft.id || scheduleAllDrafts.isPending}
                  className="rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {schedulingId === draft.id ? 'Scheduling…' : 'Schedule'}
                </Button>
                <Button
                  size="sm"
                  variant="dc-outline"
                  onClick={() => handlePostNow(draft)}
                  disabled={publishingId === draft.id}
                  className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                >
                  <Send className="h-3 w-3 mr-1" />
                  {publishingId === draft.id ? 'Posting…' : 'Post Now'}
                </Button>
                <Button
                  variant="dc-outline"
                  size="sm"
                  onClick={() => openEditor(draft)}
                  className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                >
                  Edit
                </Button>
                <Button
                  variant="dc-outline"
                  size="sm"
                  onClick={() => cancelDraft.mutate(draft.id)}
                  disabled={cancelDraft.isPending}
                  className="rounded-full border-pink-300 text-pink-600 hover:bg-pink-50"
                >
                  <XIcon className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          </AppCard>
        );
      })}

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit draft</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="draft-caption">Caption</Label>
                <Textarea
                  id="draft-caption"
                  value={editing.caption}
                  onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                  rows={6}
                  className="border-dc-teal/20 bg-white"
                  placeholder="What should this post say?"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="draft-hashtags">Hashtags</Label>
                <Input
                  id="draft-hashtags"
                  value={editing.hashtags}
                  onChange={(e) => setEditing({ ...editing, hashtags: e.target.value })}
                  className="border-dc-teal/20 bg-white"
                  placeholder="#HobokenEats #SupportLocal"
                />
                <p className="text-xs text-dc-text-muted">
                  Separate with spaces or commas. The # is added for you.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="draft-scheduled">Scheduled for</Label>
                <Input
                  id="draft-scheduled"
                  type="datetime-local"
                  value={editing.scheduledLocal}
                  onChange={(e) => setEditing({ ...editing, scheduledLocal: e.target.value })}
                  className="border-dc-teal/20 bg-white"
                />
              </div>

              {/* Said plainly rather than left for someone to discover: media is
                  behind the provider upload flow and this dialog does not touch it. */}
              {editing.draft.media_urls?.length ? (
                <p className="text-xs text-dc-text-muted">
                  Media stays as it is — it can’t be changed here.
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="dc-secondary"
              onClick={() => setEditing(null)}
              disabled={updateDraft.isPending}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateDraft.isPending}
              className="rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
            >
              {updateDraft.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
