// src/components/campaign-details/CampaignHero.tsx

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Users } from 'lucide-react';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { CampaignMediaItem } from '@/types/campaignMedia';
import { getCoverImageUrl, getRelativeTime } from '@/lib/campaignUtils';

interface CampaignHeroProps {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  businessLogoUrl?: string | null;
  distance?: number | null;
  applicationCount?: number;
}

const TIER_LABELS: Record<string, string> = {
  dragonrush: 'DragonDash',
  expedited: 'Express',
  standard: 'Standard',
};

export function CampaignHero({
  campaign,
  media,
  businessLogoUrl,
  distance,
  applicationCount,
}: CampaignHeroProps) {
  const navigate = useNavigate();
  const tierLabel = campaign.delivery_type
    ? TIER_LABELS[campaign.delivery_type] ?? 'Standard'
    : 'Standard';
  const tierEmoji =
    campaign.delivery_type === 'dragonrush'
      ? '🐉'
      : campaign.delivery_type === 'expedited'
        ? '⚡'
        : '📦';
  const businessName =
    (campaign.ai_analysis as Record<string, unknown>)?.business_name as
      | string
      | undefined;
  const tagline = campaign.tagline;
  const campaignType =
    campaign.campaign_type?.replace(/_/g, ' ') ?? 'Campaign';

  const cover = getCoverImageUrl(
    media,
    campaign.ai_preview_status,
    businessLogoUrl
  );

  return (
    <div className="relative overflow-hidden">
      {/* Cover image or gradient */}
      {cover.url ? (
        <div className="relative h-48 lg:h-64">
          <img
            src={cover.url}
            alt={campaign.title}
            className={`w-full h-full object-cover ${cover.type === 'logo' ? 'blur-sm scale-110' : ''}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        </div>
      ) : (
        <div className="relative h-48 lg:h-64 bg-gradient-to-br from-dc-teal to-dc-teal-dark" />
      )}

      {/* Back button */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5"
          aria-label="Back"
        >
          <div className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-white" />
          </div>
          <span className="text-white/85 text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Delivery tier badge */}
      <div className="absolute top-4 right-4 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
        <span className="text-white text-xs font-semibold">
          {tierEmoji} {tierLabel}
        </span>
      </div>

      {/* Bottom overlay content */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
        <h1 className="text-xl font-bold text-white mb-0.5">{campaign.title}</h1>
        <span className="text-xs text-white/80 capitalize">
          {campaignType}
          {businessName ? ` · ${businessName}` : ''}
        </span>
        {tagline && (
          <p className="text-white/90 text-sm italic mt-1">"{tagline}"</p>
        )}

        {/* Meta row: distance, posted time, applicants */}
        <div className="flex items-center gap-3 mt-2">
          {distance != null && (
            <span className="flex items-center gap-1 text-white/75 text-xs">
              <MapPin className="w-3 h-3" />
              {distance} mi
            </span>
          )}
          <span className="flex items-center gap-1 text-white/75 text-xs">
            <Clock className="w-3 h-3" />
            {getRelativeTime(campaign.created_at)}
          </span>
          {applicationCount != null && applicationCount > 0 && (
            <span className="flex items-center gap-1 text-white/75 text-xs">
              <Users className="w-3 h-3" />
              {applicationCount} applied
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
