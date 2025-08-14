
import React from 'react';
import { useReviewStats } from '@/hooks/useReviews';
import StarRating from './StarRating';
import { Progress } from '@/components/ui/progress';

interface RatingStatsProps {
  revieweeId?: string;
  reviewType?: 'business_to_creator' | 'creator_to_business';
}

const RatingStats: React.FC<RatingStatsProps> = ({ revieweeId, reviewType }) => {
  const { data: stats, isLoading, error } = useReviewStats(revieweeId, reviewType);

  if (isLoading || !stats) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded" />;
  }

  if (error) {
    console.error('RatingStats error:', error);
    return (
      <div className="text-center py-6 text-gray-500">
        <p>Unable to load ratings</p>
      </div>
    );
  }

  if (stats.total_reviews === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <p className="mb-1">No ratings yet</p>
        <p className="text-sm">Ratings will appear here after completed collaborations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold">{stats.average_rating}</div>
          <StarRating rating={Math.round(stats.average_rating)} readonly />
          <div className="text-sm text-gray-500 mt-1">
            {stats.total_reviews} review{stats.total_reviews !== 1 ? 's' : ''}
          </div>
        </div>
        
        <div className="flex-1 space-y-2">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = stats.rating_breakdown[rating as keyof typeof stats.rating_breakdown];
            const percentage = stats.total_reviews > 0 ? (count / stats.total_reviews) * 100 : 0;
            
            return (
              <div key={rating} className="flex items-center gap-2 text-sm">
                <span className="w-3">{rating}</span>
                <StarRating rating={1} readonly size="sm" />
                <Progress value={percentage} className="flex-1" />
                <span className="w-8 text-gray-500">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RatingStats;
