import { useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SocialPostEditor } from './SocialPostEditor';
import { useCGCReviewSheet } from '@/hooks/useCGCReviewSheet';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { usePromotions, type PromotionSubmission } from '@/hooks/usePromotions';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface CGCReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissions: PromotionSubmission[];
  initialIndex: number;
  promotionTitle: string;
}

export function CGCReviewSheet({
  open,
  onOpenChange,
  submissions,
  initialIndex,
  promotionTitle,
}: CGCReviewSheetProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduleForLater, setScheduleForLater] = useState(false);
  const [editedCaption, setEditedCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [platformsInitialized, setPlatformsInitialized] = useState(false);

  const isMobile = useIsMobile();
  const submission = submissions[currentIndex];
  const { reviewSubmission } = usePromotions();
  const crossPost = useCrossPost();

  const {
    caption,
    hashtags,
    suggestedTime,
    defaultPlatforms,
    connectedAccounts,
    isLoading: socialLoading,
  } = useCGCReviewSheet(
    submission?.id ?? null,
    promotionTitle,
    submission?.video_url ?? null,
  );

  // Initialize platforms from defaults when data loads
  if (!platformsInitialized && defaultPlatforms.length > 0) {
    setSelectedPlatforms(defaultPlatforms);
    setEditedCaption(caption);
    setPlatformsInitialized(true);
  }

  // Sync caption when it loads from AI
  if (caption && !editedCaption) {
    setEditedCaption(caption);
  }

  const handleApprove = useCallback(async (withSocialPost: boolean) => {
    if (!submission) return;

    let socialAction: 'post_now' | 'schedule' | 'skip' = 'skip';
    if (withSocialPost && connectedAccounts.length > 0) {
      socialAction = scheduleForLater ? 'schedule' : 'post_now';
    }

    try {
      reviewSubmission.mutate({
        submissionId: submission.id,
        status: 'approved',
        socialAction,
        platforms: selectedPlatforms,
        caption: editedCaption,
        hashtags,
        scheduledAt: scheduleForLater ? (scheduledAt || suggestedTime || undefined) : undefined,
      });

      // If posting now via Outstand
      if (socialAction === 'post_now' && selectedPlatforms.length > 0) {
        const accountIds = connectedAccounts
          .filter(a => selectedPlatforms.includes(a.platform))
          .map(a => a.outstand_social_account_id);

        if (accountIds.length > 0) {
          try {
            await crossPost.mutateAsync({
              caption: `${editedCaption}\n\n${hashtags.join(' ')}`,
              mediaUrls: submission.video_url ? [submission.video_url] : [],
              accountIds,
            });
          } catch {
            toast.warning('Approved! Social posting failed — try again from Content Library.');
          }
        }
      }

      // Move to next or close
      if (currentIndex < submissions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setRejecting(false);
        setRejectionReason('');
        setPlatformsInitialized(false);
        setEditedCaption('');
      } else {
        onOpenChange(false);
      }
    } catch {
      toast.error('Failed to approve submission');
    }
  }, [submission, connectedAccounts, selectedPlatforms, editedCaption, hashtags, scheduleForLater, scheduledAt, suggestedTime, currentIndex, submissions.length, reviewSubmission, crossPost, onOpenChange]);

  const handleReject = useCallback(() => {
    if (!submission || !rejectionReason.trim()) return;
    reviewSubmission.mutate({
      submissionId: submission.id,
      status: 'rejected',
      rejectionReason: rejectionReason.trim(),
    });
    if (currentIndex < submissions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setRejecting(false);
      setRejectionReason('');
    } else {
      onOpenChange(false);
    }
  }, [submission, rejectionReason, currentIndex, submissions.length, reviewSubmission, onOpenChange]);

  if (!submission) return null;

  const isPhoto = submission.video_url?.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i);
  const hasAccounts = connectedAccounts.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[90vh] rounded-t-3xl' : 'w-[480px]'}
      >
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-bold">Review Submission</SheetTitle>
            {submissions.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-dc-text-muted">
                <button
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="p-1 rounded-full hover:bg-dc-teal/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>{currentIndex + 1} of {submissions.length}</span>
                <button
                  onClick={() => setCurrentIndex(prev => Math.min(submissions.length - 1, prev + 1))}
                  disabled={currentIndex === submissions.length - 1}
                  className="p-1 rounded-full hover:bg-dc-teal/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto pb-24">
          {/* Zone 1: Content Preview */}
          <div className="rounded-2xl overflow-hidden bg-black aspect-video">
            {isPhoto ? (
              <img src={submission.video_url!} alt="Submission" className="w-full h-full object-contain" />
            ) : (
              <video src={submission.video_url!} controls className="w-full h-full" />
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-dc-text-muted px-1">
            <span>{submission.customer_name || submission.customer_email}</span>
            <span>{new Date(submission.created_at).toLocaleDateString()}</span>
          </div>

          {/* Zone 2: Social Post Editor */}
          {!rejecting && (
            <SocialPostEditor
              connectedAccounts={connectedAccounts}
              caption={editedCaption}
              onCaptionChange={setEditedCaption}
              hashtags={hashtags}
              onHashtagsChange={() => {}}
              selectedPlatforms={selectedPlatforms}
              onPlatformsChange={setSelectedPlatforms}
              scheduleForLater={scheduleForLater}
              onScheduleToggle={setScheduleForLater}
              suggestedTime={suggestedTime}
              scheduledAt={scheduledAt}
              onScheduledAtChange={setScheduledAt}
              videoUrl={submission.video_url}
              isLoading={socialLoading}
            />
          )}

          {/* Rejection reason input */}
          {rejecting && (
            <div className="space-y-2">
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection (required)"
                className="min-h-[80px] rounded-xl text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full"
                  onClick={handleReject}
                  disabled={!rejectionReason.trim()}
                >
                  Confirm Reject
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setRejecting(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Zone 3: Sticky Actions */}
        {!rejecting && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-dc-teal/10 space-y-2">
            {hasAccounts ? (
              <>
                <Button
                  className="w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white font-semibold"
                  onClick={() => handleApprove(true)}
                  disabled={reviewSubmission.isPending || crossPost.isPending}
                >
                  {(reviewSubmission.isPending || crossPost.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Check className="h-4 w-4 mr-2" />
                  Approve & Post
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  onClick={() => handleApprove(false)}
                  disabled={reviewSubmission.isPending}
                >
                  Approve Only
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white font-semibold"
                  onClick={() => handleApprove(false)}
                  disabled={reviewSubmission.isPending}
                >
                  {reviewSubmission.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Check className="h-4 w-4 mr-2" />
                  Approve{submission.video_url ? ' & Download' : ''}
                </Button>
              </>
            )}
            <button
              className="w-full text-center text-xs text-dc-text-muted hover:text-red-500 py-1"
              onClick={() => setRejecting(true)}
            >
              Reject
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
