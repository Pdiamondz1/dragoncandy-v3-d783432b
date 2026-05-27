import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PostApprovalScheduleCTAProps {
  campaignId: string;
  campaignTitle: string;
  postingScheduleStatus: string;
  onReviewSchedule: () => void;
}

export function PostApprovalScheduleCTA({
  campaignId: _campaignId,
  campaignTitle: _campaignTitle,
  postingScheduleStatus,
  onReviewSchedule,
}: PostApprovalScheduleCTAProps) {
  if (postingScheduleStatus !== 'pending_review') return null;

  return (
    <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-dc-teal" />
        <p className="font-semibold text-dc-text">Content approved and payment released!</p>
      </div>
      <p className="text-sm text-dc-text-muted">Your posting schedule is ready to review.</p>
      <Button
        className="w-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full py-3 font-bold text-sm"
        onClick={onReviewSchedule}
      >
        Review Schedule
      </Button>
    </div>
  );
}
