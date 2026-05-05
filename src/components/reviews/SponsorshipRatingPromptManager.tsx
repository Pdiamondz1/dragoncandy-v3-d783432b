
import React, { useState, useEffect } from 'react';
import { useSponsorshipReviewCompletion } from '@/hooks/useSponsorshipReviewCompletion';
import { RatingPrompt } from './RatingPrompt';

const STORAGE_KEY = 'dismissedSponsorshipRatingPrompts';

export const SponsorshipRatingPromptManager: React.FC = () => {
  const { data: sponsorshipsForReview, isLoading } = useSponsorshipReviewCompletion();
  const [dismissedPrompts, setDismissedPrompts] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setDismissedPrompts(JSON.parse(stored));
      } catch (e) {
        console.error('Error parsing dismissed sponsorship prompts:', e);
      }
    }
  }, []);

  const handleDismiss = (sponsorshipId: string) => {
    const updated = [...dismissedPrompts, sponsorshipId];
    setDismissedPrompts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  if (isLoading || !sponsorshipsForReview) {
    return null;
  }

  const visiblePrompts = sponsorshipsForReview.filter(
    (s) => s.canReview && !dismissedPrompts.includes(s.id)
  );

  if (visiblePrompts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mb-6">
      {visiblePrompts.map((sponsorship) => (
        <RatingPrompt
          key={sponsorship.id}
          sponsorshipId={sponsorship.id}
          revieweeId={sponsorship.otherPartyId}
          revieweeName={sponsorship.otherPartyName}
          reviewType={sponsorship.userRole === 'brand' ? 'brand_to_business' : 'business_to_brand'}
          onDismiss={() => handleDismiss(sponsorship.id)}
        />
      ))}
    </div>
  );
};

