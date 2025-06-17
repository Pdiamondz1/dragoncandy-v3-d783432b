
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import StarRating from './StarRating';
import { formatDistanceToNow } from 'date-fns';
import { ProjectReview } from '@/types/reviews';

interface ReviewCardProps {
  review: ProjectReview & {
    reviewer: { full_name: string; avatar_url?: string };
    collaboration: { campaign: { title: string } };
  };
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar>
            <AvatarImage src={review.reviewer.avatar_url} />
            <AvatarFallback>
              {review.reviewer.full_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">{review.reviewer.full_name}</h4>
                <p className="text-sm text-gray-500">
                  {review.collaboration.campaign.title}
                </p>
              </div>
              <span className="text-sm text-gray-500">
                {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <StarRating rating={review.rating} readonly />
              <span className="text-sm font-medium">{review.rating}/5</span>
            </div>

            {(review.communication_rating || review.quality_rating || review.timeliness_rating || review.professionalism_rating) && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {review.communication_rating && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Communication</span>
                    <StarRating rating={review.communication_rating} readonly size="sm" />
                  </div>
                )}
                {review.quality_rating && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Quality</span>
                    <StarRating rating={review.quality_rating} readonly size="sm" />
                  </div>
                )}
                {review.timeliness_rating && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Timeliness</span>
                    <StarRating rating={review.timeliness_rating} readonly size="sm" />
                  </div>
                )}
                {review.professionalism_rating && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Professionalism</span>
                    <StarRating rating={review.professionalism_rating} readonly size="sm" />
                  </div>
                )}
              </div>
            )}

            {review.review_text && (
              <p className="text-gray-700 leading-relaxed">{review.review_text}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReviewCard;
