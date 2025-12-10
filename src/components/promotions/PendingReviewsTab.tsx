import React from 'react';
import { usePromotions } from '@/hooks/usePromotions';
import { SubmissionCard } from './SubmissionCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Video, CheckCircle } from 'lucide-react';

export const PendingReviewsTab: React.FC = () => {
  const { pendingSubmissions, isLoading, reviewSubmission } = usePromotions();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    );
  }

  if (!pendingSubmissions?.length) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
        <h3 className="text-lg font-medium mb-2">All Caught Up!</h3>
        <p className="text-muted-foreground">
          No pending video submissions to review right now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Video className="h-5 w-5" />
        <span className="text-lg font-semibold">
          {pendingSubmissions.length} Pending Review{pendingSubmissions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pendingSubmissions.map(submission => (
          <SubmissionCard
            key={submission.id}
            submission={submission}
            onApprove={() => reviewSubmission.mutate({ 
              submissionId: submission.id, 
              status: 'approved' 
            })}
            onReject={(reason) => reviewSubmission.mutate({ 
              submissionId: submission.id, 
              status: 'rejected',
              rejectionReason: reason
            })}
            isLoading={reviewSubmission.isPending}
          />
        ))}
      </div>
    </div>
  );
};
