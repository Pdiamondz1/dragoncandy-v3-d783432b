
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star } from 'lucide-react';
import { StarRating } from './StarRating';
import { ReviewsErrorBoundary } from './ReviewsErrorBoundary';
import { useSubmitRating } from '@/hooks/useSubmitRating';
import { CreateReviewData } from '@/types/reviews';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborationId?: string;
  sponsorshipId?: string;
  revieweeId: string;
  revieweeName: string;
  reviewType: 'business_to_creator' | 'creator_to_business' | 'brand_to_business' | 'business_to_brand';
}

export const RatingModal: React.FC<RatingModalProps> = ({
  isOpen,
  onClose,
  collaborationId,
  sponsorshipId,
  revieweeId,
  revieweeName,
  reviewType
}) => {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submitRating = useSubmitRating();

  const handleClose = () => {
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = () => {
    if (rating === 0) {
      return;
    }

    const reviewData: CreateReviewData = {
      collaboration_id: collaborationId,
      sponsorship_id: sponsorshipId,
      reviewee_id: revieweeId,
      rating,
      review_text: reviewText || undefined,
      review_type: reviewType,
      is_public: true,
    };

    submitRating.mutate(reviewData, {
      onSuccess: () => {
        setSubmitted(true);
        setRating(0);
        setReviewText('');
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { handleClose(); } }}>
      <DialogContent className="max-w-md">
        <ReviewsErrorBoundary>
        <DialogHeader>
          <DialogTitle>Rate Your Experience with {revieweeName}</DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-dc-teal/15 flex items-center justify-center">
              <Star className="h-6 w-6 text-dc-teal-btn fill-dc-teal-btn" />
            </div>
            <p className="text-base font-bold text-dc-text">Your review is in.</p>
            <p className="text-sm text-dc-text-muted">
              It goes live once {revieweeName} reviews you too — or automatically in 14 days.
            </p>
            <Button
              onClick={handleClose}
              className="w-full rounded-full bg-dc-teal-btn text-white font-bold h-12 hover:bg-dc-teal-btn-hover"
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Overall Rating</Label>
              <div className="mt-2">
                <StarRating rating={rating} onRatingChange={setRating} size="lg" />
              </div>
            </div>

            <div>
              <Label htmlFor="review-text">Written Review (Optional)</Label>
              <Textarea
                id="review-text"
                placeholder="Share your experience working together…"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
                className="mt-2"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={rating === 0 || submitRating.isPending}
                className="flex-1"
              >
                {submitRating.isPending ? 'Submitting…' : 'Submit Review'}
              </Button>
            </div>
          </div>
        )}
        </ReviewsErrorBoundary>
      </DialogContent>
    </Dialog>
  );
};

