import { useNavigate } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import type { BusinessProfile } from '@/hooks/useCampaignDetailEnriched';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface BusinessProfileStripProps {
  profile: BusinessProfile;
  completedCampaignCount: number;
}

export function BusinessProfileStrip({ profile, completedCampaignCount }: BusinessProfileStripProps) {
  const navigate = useNavigate();
  const isHttp = profile.logo_url?.startsWith('http');
  const signedLogoUrl = useSignedUrl('profile-assets', isHttp ? null : profile.logo_url);
  const resolvedLogoUrl = isHttp ? profile.logo_url : signedLogoUrl;

  const profilePath = profile.profile_slug
    ? `/business/${profile.profile_slug}`
    : `/business/${profile.user_id}`;

  return (
    <button
      onClick={() => navigate(profilePath)}
      className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 hover:border-dc-teal transition-colors text-left"
    >
      {resolvedLogoUrl ? (
        <img
          src={resolvedLogoUrl}
          alt={profile.business_name}
          className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-400"
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
          {profile.average_rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              {profile.average_rating.toFixed(1)}
            </span>
          )}
          {completedCampaignCount > 0 && (
            <span>{completedCampaignCount} campaigns</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </button>
  );
}
