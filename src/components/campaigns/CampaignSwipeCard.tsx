
import React, { useState, useRef } from 'react';
import TinderCard from 'react-tinder-card';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { MapPin, DollarSign } from 'lucide-react';
import logo from '@/assets/Transparent_DragonCandy_logo.png';

interface CampaignSwipeCardProps {
  campaigns: PublicCampaign[];
  onSwipe: (direction: string, campaign: PublicCampaign) => void;
  onApply: (campaign: PublicCampaign) => void;
}

function formatBudget(campaign: PublicCampaign): string {
  if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
    return `$${campaign.fixed_price}`;
  }
  if (campaign.budget_min && campaign.budget_max) {
    return `$${campaign.budget_min} – $${campaign.budget_max}`;
  }
  if (campaign.budget_min) {
    return `From $${campaign.budget_min}`;
  }
  if (campaign.budget_max) {
    return `Up to $${campaign.budget_max}`;
  }
  return 'Budget TBD';
}

export const CampaignSwipeCard: React.FC<CampaignSwipeCardProps> = ({
  campaigns,
  onSwipe,
  onApply,
}) => {
  const [currentIndex, setCurrentIndex] = useState(campaigns.length - 1);
  const currentIndexRef = useRef(currentIndex);

  const updateCurrentIndex = (val: number) => {
    currentIndexRef.current = val;
    setCurrentIndex(val);
  };

  const handleSwipe = (direction: string, campaign: PublicCampaign, index: number) => {
    updateCurrentIndex(index - 1);
    onSwipe(direction, campaign);
  };

  if (!campaigns.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
        <img src={logo} alt="Dragon Candy" className="w-20 h-20 mb-4 opacity-60" />
        <p className="text-white font-bold text-xl mb-2">All caught up!</p>
        <p className="text-white/70 text-sm">No more campaigns available right now. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="relative h-[60vh] touch-none select-none">
      {campaigns.map((campaign, index) => {
        const isFront = index === currentIndex;
        const isSecond = index === currentIndex - 1;
        const isThird = index === currentIndex - 2;

        // Only render visible cards (front + 2 behind)
        if (!isFront && !isSecond && !isThird) return null;

        const scaleValue = isFront ? 1 : isSecond ? 0.95 : 0.90;
        const translateY = isFront ? 0 : isSecond ? 12 : 22;
        const opacityValue = isFront ? 1 : isSecond ? 0.85 : 0.65;

        return (
          <div
            key={campaign.id}
            className="absolute inset-0"
            style={{
              transform: `scale(${scaleValue}) translateY(${translateY}px)`,
              opacity: opacityValue,
              zIndex: isFront ? 30 : isSecond ? 20 : 10,
              transition: 'transform 0.2s ease, opacity 0.2s ease',
              transformOrigin: 'top center',
            }}
          >
            {isFront ? (
              <TinderCard
                onSwipe={(dir) => handleSwipe(dir, campaign, index)}
                preventSwipe={['up', 'down']}
                swipeRequirementType="position"
                swipeThreshold={100}
                className="w-full h-full"
              >
                <CardContent campaign={campaign} onApply={onApply} />
              </TinderCard>
            ) : (
              <CardContent campaign={campaign} onApply={onApply} />
            )}
          </div>
        );
      })}
    </div>
  );
};

interface CardContentProps {
  campaign: PublicCampaign;
  onApply: (campaign: PublicCampaign) => void;
}

const CardContent: React.FC<CardContentProps> = ({ campaign, onApply }) => {
  const businessName = campaign.business_profile?.business_name ?? 'Company Name';
  const businessLogo = campaign.business_profile?.logo_url;
  const location = campaign.business_profile?.city
    ? `${campaign.business_profile.city}${campaign.business_profile.country ? ', ' + campaign.business_profile.country : ''}`
    : null;

  // Use a placeholder gradient when no image is available
  const hasImage = false; // campaigns don't have a hero image field yet — use gradient placeholder

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden h-full flex flex-col cursor-grab active:cursor-grabbing">
      {/* Hero image area — 65% height */}
      <div className="relative" style={{ height: '65%', flexShrink: 0 }}>
        {hasImage ? (
          <img
            src=""
            alt={campaign.title}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-dc-teal/30 via-dc-pink/20 to-dc-teal-dark/40 flex items-center justify-center">
            <div className="text-center px-4">
              <img src={logo} alt="Dragon Candy" className="w-16 h-16 mx-auto mb-2 opacity-60" />
            </div>
          </div>
        )}

        {/* Dark overlay gradient at bottom of image */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Title overlaid on image */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-white font-bold text-xl leading-tight drop-shadow-sm line-clamp-2">
            {campaign.title}
          </p>
          {location && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-dc-pink flex-shrink-0" />
              <span className="text-white/80 text-xs">{location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card body — remaining height */}
      <div className="flex flex-col flex-1 px-4 py-3 min-h-0">
        {/* Description */}
        <p className="text-sm text-gray-500 line-clamp-2 flex-shrink-0">
          {campaign.description ?? 'Use our AI-powered campaign wizard to define your goals and find the perfect creators'}
        </p>

        {/* Budget badge */}
        <div className="flex items-center gap-1 mt-2 flex-shrink-0">
          <DollarSign className="w-4 h-4 text-dc-teal flex-shrink-0" />
          <span className="text-sm font-semibold text-dc-teal">{formatBudget(campaign)}</span>
        </div>

        {/* Company row */}
        <div className="flex items-center gap-2 mt-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
            {businessLogo ? (
              <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-dc-teal-dark">
                {businessName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-700 truncate">{businessName}</span>
        </div>

        {/* Apply Now CTA */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApply(campaign);
          }}
          className="w-full bg-dc-pink text-white rounded-full h-12 font-bold mt-3 flex-shrink-0 hover:bg-dc-pink-accent transition-colors duration-150 active:scale-95"
        >
          Apply Now
        </button>
      </div>
    </div>
  );
};
