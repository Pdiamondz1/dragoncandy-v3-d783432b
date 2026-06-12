
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, X } from 'lucide-react';
import { RatingModal } from './RatingModal';

interface RatingPromptProps {
  collaborationId?: string;
  sponsorshipId?: string;
  revieweeId: string;
  revieweeName: string;
  reviewType: 'business_to_creator' | 'creator_to_business' | 'brand_to_business' | 'business_to_brand';
  onDismiss: () => void;
  /** 'row' renders a compact line for the dashboard attention section */
  variant?: 'card' | 'row';
}

export const RatingPrompt: React.FC<RatingPromptProps> = ({
  collaborationId,
  sponsorshipId,
  revieweeId,
  revieweeName,
  reviewType,
  onDismiss,
  variant = 'card'
}) => {
  const [showModal, setShowModal] = useState(false);

  if (variant === 'row') {
    return (
      <>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="rounded-full bg-dc-pink/20 p-1.5 shrink-0">
            <Star className="h-4 w-4 text-dc-pink-accent" />
          </span>
          <p className="text-sm text-dc-text flex-1 min-w-0">
            How was working with <span className="font-semibold">{revieweeName}</span>?
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="text-sm font-semibold text-dc-teal-btn hover:underline shrink-0"
          >
            Leave review
          </button>
          <button
            onClick={onDismiss}
            className="text-sm text-dc-text-muted hover:text-dc-text shrink-0"
          >
            Later
          </button>
        </div>

        <RatingModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          collaborationId={collaborationId}
          sponsorshipId={sponsorshipId}
          revieweeId={revieweeId}
          revieweeName={revieweeName}
          reviewType={reviewType}
        />
      </>
    );
  }

  return (
    <>
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-100 p-2">
                <Star className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-blue-900">
                  Rate Your Experience
                </h4>
                <p className="text-sm text-blue-700 mt-1">
                  How was working with {revieweeName}? Your feedback helps improve our community.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    onClick={() => setShowModal(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Leave Review
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={onDismiss}
                    className="border-blue-300 text-blue-700"
                  >
                    Later
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-blue-600 hover:bg-blue-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <RatingModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        collaborationId={collaborationId}
        sponsorshipId={sponsorshipId}
        revieweeId={revieweeId}
        revieweeName={revieweeName}
        reviewType={reviewType}
      />
    </>
  );
};

