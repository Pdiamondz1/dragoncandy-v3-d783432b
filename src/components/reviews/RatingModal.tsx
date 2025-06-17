
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
import { Switch } from '@/components/ui/switch';
import StarRating from './StarRating';
import { useSubmitRating } from '@/hooks/useSubmitRating';
import { CreateReviewData } from '@/types/reviews';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborationId: string;
  revieweeId: string;
  revieweeName: string;
  reviewType: 'business_to_creator' | 'creator_to_business';
}

const RatingModal: React.FC<RatingModalProps> = ({
  isOpen,
  onClose,
  collaborationId,
  revieweeId,
  revieweeName,
  reviewType
}) => {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [communicationRating, setCommunicationRating] = useState(0);
  const [qualityRating, setQualityRating] = useState(0);
  const [timelinessRating, setTimelinessRating] = useState(0);
  const [professionalismRating, setProfessionalismRating] = useState(0);
  const [isPublic, setIsPublic] = useState(true);

  const submitRating = useSubmitRating();

  const handleSubmit = () => {
    if (rating === 0) {
      return;
    }

    const reviewData: CreateReviewData = {
      collaboration_id: collaborationId,
      reviewee_id: revieweeId,
      rating,
      review_text: reviewText || undefined,
      review_type: reviewType,
      communication_rating: communicationRating || undefined,
      quality_rating: qualityRating || undefined,
      timeliness_rating: timelinessRating || undefined,
      professionalism_rating: professionalismRating || undefined,
      is_public: isPublic,
    };

    submitRating.mutate(reviewData, {
      onSuccess: () => {
        onClose();
        // Reset form
        setRating(0);
        setReviewText('');
        setCommunicationRating(0);
        setQualityRating(0);
        setTimelinessRating(0);
        setProfessionalismRating(0);
        setIsPublic(true);
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Your Experience with {revieweeName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div>
            <Label className="text-base font-medium">Overall Rating</Label>
            <div className="mt-2">
              <StarRating rating={rating} onRatingChange={setRating} size="lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Communication</Label>
              <StarRating 
                rating={communicationRating} 
                onRatingChange={setCommunicationRating} 
                size="sm" 
              />
            </div>
            <div>
              <Label className="text-sm">Quality</Label>
              <StarRating 
                rating={qualityRating} 
                onRatingChange={setQualityRating} 
                size="sm" 
              />
            </div>
            <div>
              <Label className="text-sm">Timeliness</Label>
              <StarRating 
                rating={timelinessRating} 
                onRatingChange={setTimelinessRating} 
                size="sm" 
              />
            </div>
            <div>
              <Label className="text-sm">Professionalism</Label>
              <StarRating 
                rating={professionalismRating} 
                onRatingChange={setProfessionalismRating} 
                size="sm" 
              />
            </div>
          </div>

          <div>
            <Label htmlFor="review-text">Written Review (Optional)</Label>
            <Textarea
              id="review-text"
              placeholder="Share your experience working together..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={4}
              className="mt-2"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="public-review">Make review public</Label>
            <Switch
              id="public-review"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>

          <div className="flex gap-3">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RatingModal;
