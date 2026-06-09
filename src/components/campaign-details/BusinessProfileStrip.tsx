import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { InlineRating } from '@/components/reviews/InlineRating';
import type { BusinessProfile } from '@/hooks/useCampaignDetailEnriched';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';

interface BusinessProfileStripProps {
  profile: BusinessProfile;
  completedCampaignCount: number;
}

export function BusinessProfileStrip({ profile, completedCampaignCount }: BusinessProfileStripProps) {
  const navigate = useNavigate();
  const resolvedLogoUrl = useResolvedLogoUrl(profile.logo_url);
  const [logoError, setLogoError] = useState(false);

  const profilePath = profile.profile_slug
    ? `/business/${profile.profile_slug}`
    : `/business/${profile.user_id}`;

  return (
    <button
      onClick={() => navigate(profilePath)}
      className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 hover:border-dc-teal transition-colors text-left"
    >
      {resolvedLogoUrl && !logoError ? (
        <img
          src={resolvedLogoUrl}
          alt={profile.business_name}
          className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-400"
          onError={() => setLogoError(true)}
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-teal-100 ring-2 ring-teal-400 flex items-center justify-center">
          <span className="text-dc-teal font-bold text-sm">
            {profile.business_name[0]?.toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{profile.business_name}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {profile.city && <span>{profile.city}</span>}
          <InlineRating averageRating={profile.average_rating} totalReviews={profile.total_reviews} />
          {completedCampaignCount > 0 && (
            <span>{completedCampaignCount} campaigns</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </button>
  );
}
