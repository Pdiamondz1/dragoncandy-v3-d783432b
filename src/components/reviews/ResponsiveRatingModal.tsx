
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
import MobileOptimizedStarRating from './MobileOptimizedStarRating';
import { useSubmitRating } from '@/hooks/useSubmitRating';
import { CreateReviewData } from '@/types/reviews';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ResponsiveRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborationId: string;
  revieweeId: string;
  revieweeName: string;
  reviewType: 'business_to_creator' | 'creator_to_business';
}

const ResponsiveRatingModal: React.FC<ResponsiveRatingModalProps> = ({
  isOpen,
  onClose,
  collaborationId,
  revieweeId,
  revieweeName,
  reviewType
}) => {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  const submitRating = useSubmitRating();

  const handleSubmit = () => {
    if (rating === 0) return;

    const reviewData: CreateReviewData = {
      collaboration_id: collaborationId,
      reviewee_id: revieweeId,
      rating,
      review_text: reviewText || undefined,
      review_type: reviewType,
      is_public: true,
    };

    submitRating.mutate(reviewData, {
      onSuccess: () => {
        onClose();
        // Reset form
        setRating(0);
        setReviewText('');
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg mx-4 md:mx-auto max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg md:text-xl">
            Rate Your Experience with {revieweeName}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[70vh] px-6">
          <div className="space-y-6 pb-6">
            <div>
              <Label className="text-base font-medium">Overall Rating</Label>
              <div className="mt-3 flex justify-center md:justify-start">
                <MobileOptimizedStarRating 
                  rating={rating} 
                  onRatingChange={setRating} 
                  size="lg" 
                />
              </div>
            </div>

            <div>
              <Label htmlFor="review-text" className="text-sm font-medium">
                Written Review (Optional)
              </Label>
              <Textarea
                id="review-text"
                placeholder="Share your experience working together..."
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
                className="mt-2 text-base md:text-sm"
              />
            </div>
          </div>
        </ScrollArea>

        <div className="flex gap-3 p-6 pt-0">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={rating === 0 || submitRating.isPending}
            className="flex-1"
          >
            {submitRating.isPending ? 'Submitting...' : 'Submit Review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResponsiveRatingModal;
