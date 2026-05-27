import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CalendarDays } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Post } from '@outstand-so/ui';

interface RescheduleConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post | null;
  newDate: Date | null;
  isPast: boolean;
  onConfirm: () => void;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export const RescheduleConfirmDialog: React.FC<RescheduleConfirmDialogProps> = ({
  open, onOpenChange, post, newDate, isPast, onConfirm,
}) => {
  const isMobile = useIsMobile();

  if (!post || !newDate) return null;

  const oldDate = post.scheduledAt ? new Date(post.scheduledAt) : null;

  const body = (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3 bg-gradient-to-br from-[#4DD9C0]/10 to-[#00E5CC]/10 rounded-xl p-4">
        <CalendarDays className="h-8 w-8 text-dc-teal flex-shrink-0" />
        <div>
          {isPast ? (
            <>
              <p className="text-sm font-bold text-gray-900">Re-schedule this post?</p>
              <p className="text-xs text-gray-500 mt-0.5">
                This post was scheduled for{' '}
                <span className="font-semibold">{oldDate ? `${formatDate(oldDate)} at ${formatTime(oldDate)}` : 'an earlier date'}</span>
                {' '}which has passed. Would you like to re-schedule it for{' '}
                <span className="font-semibold">{formatDate(newDate)} at {formatTime(newDate)}</span>?
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-gray-900">Move this post?</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Move to <span className="font-semibold">{formatDate(newDate)}</span>.
                {oldDate && (
                  <> It will keep its original time of <span className="font-semibold">{formatTime(oldDate)}</span>.</>
                )}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="dc-primary"
          className="flex-1"
          onClick={onConfirm}
        >
          {isPast ? 'Reschedule' : 'Confirm'}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader><SheetTitle>{isPast ? 'Re-schedule Post' : 'Move Post'}</SheetTitle></SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{isPast ? 'Re-schedule Post' : 'Move Post'}</DialogTitle></DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
};
