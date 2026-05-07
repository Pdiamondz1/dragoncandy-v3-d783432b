// src/components/campaigns/CreatorApplicationCard.tsx

import React from 'react';
import { CreatorApplication } from '@/hooks/useCreatorApplications';
import { getRelativeTime } from '@/lib/campaignUtils';

interface CreatorApplicationCardProps {
  application: CreatorApplication;
  onViewDetails: (application: CreatorApplication) => void;
  onViewCounterOffer?: (application: CreatorApplication) => void;
}

const statusConfig = {
  pending: {
    label: '⏳ Pending',
    badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    borderClass: '',
    opacity: '',
  },
  accepted: {
    label: '✅ Accepted',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    borderClass: 'border-l-[3px] border-l-dc-teal',
    opacity: '',
  },
  rejected: {
    label: '✗ Declined',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
    borderClass: '',
    opacity: 'opacity-70',
  },
  counter_offered: {
    label: '💬 Counter Offer',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    borderClass: 'border-l-[3px] border-l-orange-400',
    opacity: '',
  },
};

export const CreatorApplicationCard: React.FC<CreatorApplicationCardProps> = ({
  application,
  onViewDetails,
  onViewCounterOffer,
}) => {
  const config = statusConfig[application.status] ?? statusConfig.pending;
  const campaign = application.campaign;
  const businessName = application.business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = application.business_profile?.logo_url;
  const appliedTime = getRelativeTime(application.created_at);

  const rateDisplay = campaign?.pricing_type === 'fixed' && campaign.fixed_price
    ? `$${campaign.fixed_price} fixed`
    : application.proposed_rate
      ? `Your bid: $${application.proposed_rate}`
      : 'Rate not specified';

  const handleAction = () => {
    if (application.status === 'counter_offered' && onViewCounterOffer) {
      onViewCounterOffer(application);
    } else {
      onViewDetails(application);
    }
  };

  const actionLabel = {
    pending: 'View Details',
    accepted: 'Start Campaign →',
    rejected: 'View Details',
    counter_offered: 'View Offer',
  }[application.status];

  const actionClass = application.status === 'accepted'
    ? 'bg-dc-teal-btn text-white border-dc-teal font-semibold'
    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300';

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-dc-sm ${config.borderClass} ${config.opacity}`}>
      <div className="flex items-center gap-3 mb-3">
        {/* Business avatar */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dc-teal/20 to-dc-pink/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {businessLogo ? (
            <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-dc-teal-dark">
              {businessName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Campaign info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">
            {campaign?.title ?? 'Unknown Campaign'}
          </div>
          <div className="text-xs text-gray-500">
            {businessName} · Applied {appliedTime}
          </div>
        </div>

        {/* Status badge */}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${config.badgeClass}`}>
          {config.label}
        </span>
      </div>

      {/* Bottom row: rate + action */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-dc-teal">{rateDisplay}</span>
        <button
          onClick={handleAction}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${actionClass}`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

