
import React, { useState, useRef } from 'react';
import TinderCard from 'react-tinder-card';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { MapPin, Users } from 'lucide-react';
import logo from '@/assets/Transparent_DragonCandy_logo.webp';
import DeliveryBadge from './DeliveryBadge';
import { mapDeliveryType, getRelativeTime, formatBudget } from '@/lib/campaignUtils';

interface CampaignSwipeCardProps {
  campaigns: PublicCampaign[];
  onSwipe: (direction: string, campaign: PublicCampaign) => void;
  onViewDetail: (campaign: PublicCampaign) => void;
  matchScores?: Map<string, { score: number; matchReasons: string[] }>;
}

export const CampaignSwipeCard: React.FC<CampaignSwipeCardProps> = ({
  campaigns,
  onSwipe,
  onViewDetail,
  matchScores,
}) => {
  const [currentIndex, setCurrentIndex] = useState(campaigns.length - 1);
  const currentIndexRef = useRef(currentIndex);

  // Reset index when campaigns array changes (e.g. re-fetch or filter change)
  const campaignFingerprint = `${campaigns.length}-${campaigns[0]?.id ?? ''}`;
  React.useEffect(() => {
    setCurrentIndex(campaigns.length - 1);
    currentIndexRef.current = campaigns.length - 1;
  }, [campaignFingerprint]);

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
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-220px)] max-h-[680px] px-6 text-center">
        <img src={logo} alt="Dragon Candy" className="w-20 h-20 mb-4 opacity-60" />
        <p className="text-white font-bold text-xl mb-2">All caught up!</p>
        <p className="text-white/70 text-sm">No more campaigns available right now. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-220px)] max-h-[680px] touch-none select-none">
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
                <CardContent campaign={campaign} onViewDetail={onViewDetail} matchInfo={matchScores?.get(campaign.id)} />
              </TinderCard>
            ) : (
              <div className="pointer-events-none w-full h-full">
                <CardContent campaign={campaign} onViewDetail={onViewDetail} matchInfo={matchScores?.get(campaign.id)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface CardContentProps {
  campaign: PublicCampaign;
  onViewDetail: (campaign: PublicCampaign) => void;
  matchInfo?: { score: number; matchReasons: string[] };
}

const CardContent: React.FC<CardContentProps> = ({ campaign, onViewDetail, matchInfo }) => {
  const businessName = campaign.business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = campaign.business_profile?.logo_url;
  const location = campaign.business_profile?.city
    ? `${campaign.business_profile.city}${campaign.business_profile.country ? ', ' + campaign.business_profile.country : ''}`
    : campaign.business_profile?.location ?? null;
  const deliveryTier = mapDeliveryType(campaign.delivery_type);
  const applicantCount = campaign.application_count ?? 0;
  const postedTime = getRelativeTime(campaign.created_at);
  const deliverableCount = campaign.deliverable_count ?? campaign.deliverables?.length ?? 0;
  const contentTypes = campaign.content_types ?? [];

  // Cover image fallback rendering
  const [imgError, setImgError] = useState(false);

  const brandedFallback = (
    <div className="w-full h-full bg-gradient-to-br from-dc-teal via-dc-pink/40 to-dc-teal-dark flex items-center justify-center">
      <div className="text-center px-4">
        <img src={logo} alt="Dragon Candy" className="w-16 h-16 mx-auto mb-2 opacity-70" draggable={false} />
        <p className="text-white/80 font-bold text-sm line-clamp-2">{campaign.title}</p>
      </div>
    </div>
  );

  const renderCoverImage = () => {
    if (imgError || !campaign.cover_image_url) return brandedFallback;

    if (campaign.cover_image_type === 'reference' || campaign.cover_image_type === 'ai_preview') {
      return (
        <img
          src={campaign.cover_image_url}
          alt={campaign.title}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
          onError={() => setImgError(true)}
        />
      );
    }
    if (campaign.cover_image_type === 'logo') {
      return (
        <div className="w-full h-full relative overflow-hidden">
          <img
            src={campaign.cover_image_url}
            alt="Campaign logo"
            className="w-full h-full object-cover scale-150 blur-2xl opacity-60"
            loading="lazy"
            draggable={false}
            onError={() => setImgError(true)}
          />
          <img
            src={campaign.cover_image_url}
            alt={businessName}
            className="absolute inset-0 m-auto w-20 h-20 object-contain rounded-full"
            loading="lazy"
            draggable={false}
          />
        </div>
      );
    }
    return brandedFallback;
  };

  const contentTypeLabels: Record<string, string> = {
    photo: 'Photo',
    video_reel: 'Reel',
    story: 'Story',
    carousel: 'Carousel',
    tiktok: 'TikTok',
    youtube_short: 'YT Short',
  };

  return (
    <div
      className={`bg-white rounded-2xl shadow-xl h-full flex flex-col cursor-grab active:cursor-grabbing overflow-hidden ${
        matchInfo ? 'border-2 border-dc-teal' : ''
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onViewDetail(campaign);
      }}
    >
      {/* Donny Pick banner */}
      {matchInfo && (
        <div className="bg-gradient-to-br from-dc-teal to-teal-600 px-3.5 py-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <img src={logo} alt="Business logo" className="w-4 h-4" />
            <span className="text-xs font-bold text-white">Donny's Pick</span>
          </div>
          <span className="bg-white text-dc-teal text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
            {matchInfo.score}% Match
          </span>
        </div>
      )}

      {/* Hero image area — 60% height */}
      <div className="relative" style={{ height: '60%', flexShrink: 0 }}>
        {renderCoverImage()}

        {/* Dark overlay gradient at bottom of image */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Delivery badge — top-right */}
        {deliveryTier && (
          <div className="absolute top-3 right-3 z-10">
            <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />
          </div>
        )}

        {/* Applicant count — top-left */}
        {applicantCount > 0 && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-black/50 rounded-full px-2.5 py-1">
            <Users className="w-3 h-3 text-white" />
            <span className="text-white text-xs font-medium">{applicantCount} applied</span>
          </div>
        )}

        {/* Title + location overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <p className="text-white font-bold text-lg leading-tight drop-shadow-sm line-clamp-2">
            {campaign.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-white/75 text-xs">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-dc-pink flex-shrink-0" />
                {location}
              </span>
            )}
            {location && <span className="opacity-50">·</span>}
            <span>{postedTime}</span>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Scrollable details area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {/* Budget + deliverable count */}
          <div className="flex items-center justify-between">
            <span className="text-dc-teal font-bold text-base">{formatBudget(campaign)}</span>
            {deliverableCount > 0 && (
              <span className="text-gray-500 text-xs">{deliverableCount} deliverable{deliverableCount !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Content type pills */}
          {contentTypes.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {contentTypes.slice(0, 4).map((type) => (
                <span
                  key={type}
                  className="bg-teal-50 text-teal-700 text-[10px] px-2 py-0.5 rounded-full border border-teal-200"
                >
                  {contentTypeLabels[type] ?? type}
                </span>
              ))}
            </div>
          )}

          {/* Business row */}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-7 h-7 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
              {businessLogo ? (
                <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-dc-teal-dark">
                  {businessName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-sm font-semibold text-gray-700 truncate">{businessName}</span>
            <span className="text-dc-teal text-xs">✓</span>
          </div>

          {/* Match reasons */}
          {matchInfo && matchInfo.matchReasons.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">
              Matches your: {matchInfo.matchReasons.join(', ')}
            </p>
          )}
        </div>

        {/* View Campaign CTA — pinned at bottom */}
        <div className="relative flex-shrink-0 px-4 pb-3 pt-1">
          <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onViewDetail(campaign);
            }}
            className="w-full bg-dc-teal text-white rounded-full h-11 font-bold hover:bg-dc-teal-dark transition-colors duration-150 active:scale-95 text-sm relative z-10"
          >
            View Campaign
          </button>
        </div>
      </div>
    </div>
  );
};
