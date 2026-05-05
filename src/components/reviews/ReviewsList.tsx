
import React from 'react';
import { useReviews, ReviewWithRelations } from '@/hooks/useReviews';
import { ReviewCard } from './ReviewCard';
import { Skeleton } from '@/components/ui/skeleton';

interface ReviewsListProps {
  revieweeId?: string;
  reviewType?: 'business_to_creator' | 'creator_to_business';
  limit?: number;
}

export const ReviewsList: React.FC<ReviewsListProps> = ({ 
  revieweeId, 
  reviewType,
  limit 
}) => {
  const { data: reviews, isLoading, error } = useReviews(revieweeId, reviewType);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(limit || 3)].map((_, i) => (
          <div key={i} className="border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    console.error('ReviewsList error:', error);
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="mb-2">Unable to load reviews at this time.</p>
        <p className="text-sm">This feature is being improved. Please check back later.</p>
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="mb-2">No reviews yet</p>
        <p className="text-sm">Reviews will appear here once collaborations are completed.</p>
      </div>
    );
  }

  const displayedReviews = limit ? reviews.slice(0, limit) : reviews;

  return (
    <div className="space-y-4">
      {displayedReviews.map((review: ReviewWithRelations) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
};

