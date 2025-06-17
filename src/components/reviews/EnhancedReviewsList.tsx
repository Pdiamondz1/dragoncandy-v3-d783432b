
import React from 'react';
import { useReviews } from '@/hooks/useReviews';
import ReviewCard from './ReviewCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, RefreshCw } from 'lucide-react';
import ReviewsErrorBoundary from './ReviewsErrorBoundary';

interface EnhancedReviewsListProps {
  revieweeId?: string;
  reviewType?: 'business_to_creator' | 'creator_to_business';
  limit?: number;
  showRetry?: boolean;
}

const LoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(3)].map((_, i) => (
      <Card key={i}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const ErrorState = ({ onRetry }: { onRetry?: () => void }) => (
  <Card className="border-amber-200 bg-amber-50">
    <CardContent className="flex flex-col items-center justify-center py-8">
      <MessageSquare className="h-12 w-12 text-amber-500 mb-4" />
      <h3 className="text-lg font-semibold text-amber-900 mb-2">
        Unable to load reviews
      </h3>
      <p className="text-amber-700 text-center mb-4">
        There was a problem loading the reviews. Please check your connection and try again.
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="border-amber-300">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      )}
    </CardContent>
  </Card>
);

const EmptyState = () => (
  <div className="text-center py-8">
    <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
    <h3 className="text-lg font-semibold text-gray-900 mb-2">No reviews yet</h3>
    <p className="text-gray-600">Reviews will appear here once projects are completed.</p>
  </div>
);

const EnhancedReviewsList: React.FC<EnhancedReviewsListProps> = ({ 
  revieweeId, 
  reviewType,
  limit,
  showRetry = true
}) => {
  const { data: reviews, isLoading, error, refetch } = useReviews(revieweeId, reviewType);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState onRetry={showRetry ? () => refetch() : undefined} />;
  }

  if (!reviews || reviews.length === 0) {
    return <EmptyState />;
  }

  const displayedReviews = limit ? reviews.slice(0, limit) : reviews;

  return (
    <ReviewsErrorBoundary>
      <div className="space-y-4">
        {displayedReviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </ReviewsErrorBoundary>
  );
};

export default EnhancedReviewsList;
