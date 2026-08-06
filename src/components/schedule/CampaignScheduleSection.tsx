import { CalendarCheck2, CalendarClock, CheckCircle2, Clock } from 'lucide-react';
import { useScheduledPosts } from '@/hooks/useScheduledPosts';
import { isAmplificationPost } from '@/lib/postType';

interface CampaignScheduleSectionProps {
  campaignId: string;
  campaignTitle: string;
  postingScheduleStatus: string | null;
  onOpenScheduleReview: () => void;
}

export function CampaignScheduleSection({
  campaignId,
  campaignTitle: _campaignTitle,
  postingScheduleStatus,
  onOpenScheduleReview,
}: CampaignScheduleSectionProps) {
  // Don't render if no schedule configured
  if (!postingScheduleStatus || postingScheduleStatus === 'not_configured') {
    return null;
  }

  // pending_review: CTA card
  if (postingScheduleStatus === 'pending_review') {
    return (
      <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="w-5 h-5 text-dc-teal" />
          <h3 className="font-semibold text-dc-text text-sm">Posting Schedule Ready</h3>
        </div>
        <p className="text-xs text-dc-text-muted">
          Your posting schedule is ready to review. Confirm to start auto-posting.
        </p>
        <button
          type="button"
          onClick={onOpenScheduleReview}
          className="w-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full py-2.5 text-sm font-semibold transition-colors"
        >
          Review Schedule
        </button>
      </div>
    );
  }

  // scheduled / in_progress: Compact summary card with post counts
  if (postingScheduleStatus === 'scheduled' || postingScheduleStatus === 'in_progress') {
    return (
      <ScheduledSummary
        campaignId={campaignId}
        onOpenScheduleReview={onOpenScheduleReview}
      />
    );
  }

  // completed: Success card
  if (postingScheduleStatus === 'completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <h3 className="font-semibold text-dc-text text-sm">All Posts Published</h3>
        </div>
        <p className="text-xs text-dc-text-muted mt-1">
          Your content has been posted across all platforms.
        </p>
      </div>
    );
  }

  // configured: waiting for approval
  if (postingScheduleStatus === 'configured') {
    return (
      <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-dc-teal" />
          <h3 className="font-semibold text-dc-text text-sm">Schedule Configured</h3>
        </div>
        <p className="text-xs text-dc-text-muted mt-1">
          Your posting schedule will be generated after content is approved and payment is released.
        </p>
      </div>
    );
  }

  // failed
  if (postingScheduleStatus === 'failed') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-red-500" />
          <h3 className="font-semibold text-dc-text text-sm">Schedule Failed</h3>
        </div>
        <p className="text-xs text-dc-text-muted mt-1">
          Some posts failed to schedule. Review and retry.
        </p>
        <button
          type="button"
          onClick={onOpenScheduleReview}
          className="mt-2 w-full border border-red-300 text-red-600 rounded-full py-2 text-sm font-medium hover:bg-red-50 transition-colors"
        >
          Review Schedule
        </button>
      </div>
    );
  }

  return null;
}

// Sub-component for scheduled/in_progress summary that fetches post data
function ScheduledSummary({
  campaignId,
  onOpenScheduleReview,
}: {
  campaignId: string;
  onOpenScheduleReview: () => void;
}) {
  const { data: posts = [] } = useScheduledPosts(campaignId);

  // PROGRESS IS ABOUT DELIVERABLES, NOT EVERY ROW ON THE CAMPAIGN.
  //
  // This call intentionally passes no planGroupId, so the query filters on
  // campaign_id alone — and since this branch's Task 1, amplification posts
  // write a donny_scheduled_posts row carrying the campaign's real campaign_id.
  // Those rows belong in the schedule/calendar LISTS (standing decision, see
  // task-1-brief.md) but not in this readout: "X of Y posted" is a claim about
  // campaign deliverable progress, and an amplification is not a commissioned
  // deliverable. Left unfiltered, a 5-post campaign reads "4 of 6" after a
  // single amplification.
  //
  // Filtered HERE rather than inside useScheduledPosts on purpose: the hook is
  // shared with ScheduleReviewScreen and filtering there would hide these rows
  // everywhere and reverse that standing decision. Visibility and progress
  // arithmetic are separate questions, and only the arithmetic is wrong.
  //
  // All three derived values use the SAME filtered set. Excluding amplification
  // from publishedCount but not totalCount would be worse than not filtering at
  // all (it would under-report progress instead of over-reporting the total),
  // and nextPost is rendered as part of this same sentence — an amplification
  // surfacing as "next post" would claim a deliverable is coming when none is.
  const deliverablePosts = posts.filter(p => !isAmplificationPost(p.metadata));

  const publishedCount = deliverablePosts.filter(p => p.status === 'published').length;
  const totalCount = deliverablePosts.length;
  const nextPost = deliverablePosts.find(p => p.status === 'scheduled' && new Date(p.scheduled_at) > new Date());

  const nextPostLabel = nextPost
    ? new Date(nextPost.scheduled_at).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck2 className="w-5 h-5 text-dc-teal" />
        <h3 className="font-semibold text-dc-text text-sm">Posting Schedule</h3>
      </div>
      <p className="text-xs text-dc-text-muted">
        {publishedCount} of {totalCount} posted
        {nextPostLabel && ` — next post ${nextPostLabel}`}
      </p>
      <button
        type="button"
        onClick={onOpenScheduleReview}
        className="w-full border border-dc-teal text-dc-teal rounded-full py-2 text-sm font-medium hover:bg-dc-teal/5 transition-colors"
      >
        Manage Schedule
      </button>
    </div>
  );
}
