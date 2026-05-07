// src/components/campaigns/CompletedCampaignCard.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Loader2 } from 'lucide-react';
import { CreatorCollaboration } from '@/hooks/useCreatorCollaborations';
import { useCreateReview } from '@/hooks/useCreateReview';
import { formatBudget } from '@/lib/campaignUtils';

interface CompletedCampaignCardProps {
  collaboration: CreatorCollaboration;
}

const StarRating: React.FC<{ rating: number; onRate?: (r: number) => void; interactive?: boolean }> = ({
  rating,
  onRate,
  interactive = false,
}) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        disabled={!interactive}
        onClick={() => onRate?.(star)}
        className={interactive ? 'cursor-pointer' : 'cursor-default'}
      >
        <Star
          className={`w-4 h-4 ${
            star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
          }`}
        />
      </button>
    ))}
  </div>
);

export const CompletedCampaignCard: React.FC<CompletedCampaignCardProps> = ({ collaboration }) => {
  const navigate = useNavigate();
  const { campaign, business_profile } = collaboration;
  const businessName = business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = business_profile?.logo_url;
  const completedDate = collaboration.completed_at
    ? new Date(collaboration.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const createReview = useCreateReview();
  const hasReview = !!collaboration.existing_review_id || submitted;

  const handleSubmitReview = async () => {
    if (reviewRating === 0) return;
    try {
      await createReview.mutateAsync({
        collaborationId: collaboration.id,
        revieweeId: campaign.user_id,
        rating: reviewRating,
        reviewText: reviewText || undefined,
      });
      setSubmitted(true);
      setShowReviewForm(false);
    } catch {
      // Error handled by mutation's onError
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-dc-sm border border-gray-100">
      {/* Header: logo + title */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
          {businessLogo ? (
            <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-dc-teal-dark">
              {businessName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{campaign.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{businessName} <span className="text-dc-teal">✓</span></p>
        </div>
      </div>

      {/* Completion + budget */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">✅</span>
          <span className="text-xs text-gray-600">
            Completed{completedDate ? ` · ${completedDate}` : ''}
          </span>
        </div>
        <span className="text-xs font-semibold text-dc-teal">💰 {formatBudget(campaign)}</span>
      </div>

      {/* Review state */}
      <div className="mt-3">
        {hasReview ? (
          <div className="flex items-center gap-2">
            {(submitted ? reviewRating : collaboration.existing_review_rating) ? (
              <StarRating rating={submitted ? reviewRating : collaboration.existing_review_rating!} />
            ) : null}
            <span className="text-[11px] text-gray-400">Review submitted</span>
          </div>
        ) : showReviewForm ? (
          <div className="border border-gray-200 rounded-xl p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Rate your experience</p>
              <StarRating rating={reviewRating} onRate={setReviewRating} interactive />
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
              placeholder="How was working with this business? (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal resize-none h-16"
              maxLength={500}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReviewForm(false)}
                className="flex-1 text-xs text-gray-500 py-2 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={reviewRating === 0 || createReview.isPending}
                className="flex-1 bg-dc-teal-btn text-white rounded-full py-2 text-xs font-bold hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {createReview.isPending ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Submitting…</>
                ) : (
                  'Submit Review'
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowReviewForm(true)}
            className="text-xs text-dc-teal font-semibold border border-dc-teal rounded-full px-4 py-1.5 hover:bg-teal-50 transition-colors"
          >
            Leave a Review
          </button>
        )}
      </div>

      {/* View Details link */}
      <button
        onClick={() => navigate(`/campaigns/${campaign.id}`)}
        className="text-xs text-dc-teal font-semibold hover:underline mt-2"
      >
        View Details →
      </button>
    </div>
  );
};
