import React, { useState, useEffect } from 'react';
import { CreatorProfileModal } from './CreatorProfileModal';
import { getMediaType } from '@/lib/mediaUtils';
import { Heart, Play } from 'lucide-react';
import type { CreatorProfile } from '@/hooks/useCreatorBrowse';
import { getSignedProfileUrl } from '@/hooks/useSignedUrl';
import { VerifiedBadge } from '@/components/outstand/VerifiedBadge';
import { useVerifiedStatus } from '@/hooks/outstand/useVerifiedStatus';
import { formatSkillLabel } from '@/lib/skillUtils';
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';

interface CreatorCardProps {
  creator: CreatorProfile;
}

const FAVORITES_KEY = 'creator-favorites';

const getFavorites = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
};

const toggleFavorite = (id: string): boolean => {
  const favorites = getFavorites();
  const isFav = favorites.includes(id);
  const updated = isFav ? favorites.filter(f => f !== id) : [...favorites, id];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return !isFav;
};


export const CreatorCard: React.FC<CreatorCardProps> = React.memo(({ creator }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [portfolioImgFailed, setPortfolioImgFailed] = useState(false);
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);
  const [isFavorite, setIsFavorite] = useState(() => getFavorites().includes(creator.id));
  const { isVerified } = useVerifiedStatus(creator.user_id);

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isVideoThumbnail, setIsVideoThumbnail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (creator.avatar_url && !avatarImgFailed) {
        const url = await getSignedProfileUrl(creator.avatar_url);
        if (!cancelled && url) { setThumbnailUrl(url); setIsVideoThumbnail(false); return; }
      }
      const firstPortfolio = creator.portfolio_urls?.[0];
      if (firstPortfolio && !portfolioImgFailed) {
        const mediaType = getMediaType(firstPortfolio);
        const url = await getSignedProfileUrl(firstPortfolio);
        if (!cancelled && url) {
          setThumbnailUrl(url);
          setIsVideoThumbnail(mediaType === 'Reel');
          return;
        }
      }
      if (!cancelled) { setThumbnailUrl(null); setIsVideoThumbnail(false); }
    };
    resolve();
    return () => { cancelled = true; };
  }, [creator.portfolio_urls, creator.avatar_url, portfolioImgFailed, avatarImgFailed]);

  const handleCardClick = () => setIsModalOpen(true);

  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFavorite(toggleFavorite(creator.id));
  };

  // Build location string
  const locationStr = [creator.city, creator.country].filter(Boolean).join(', ');

  // Creator initials for fallback
  const initials = (creator.creator_name || '?')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  // Skills display: first 2 + overflow
  const visibleSkills = (creator.skills ?? []).slice(0, 2);
  const overflowCount = (creator.skills?.length ?? 0) - 2;

  // Metrics line parts
  const metricParts: string[] = [];
  if (creator.total_reviews != null && creator.total_reviews > 0) {
    metricParts.push(`${creator.total_reviews} review${creator.total_reviews !== 1 ? 's' : ''}`);
  }
  if (creator.base_rate_per_hour != null) {
    metricParts.push(`$${creator.base_rate_per_hour}/hr`);
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-row items-start p-4 gap-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative"
      >
        {/* Avatar — preserve the full uploaded photo */}
        <div className="w-24 flex-shrink-0 self-center">
          <div className="max-h-32 rounded-xl bg-gray-100 ring-2 ring-teal-400 overflow-hidden flex items-center justify-center">
            {thumbnailUrl && isVideoThumbnail ? (
              <div className="relative w-full h-24">
                <VideoThumbnail src={thumbnailUrl} className="w-full h-24 object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center">
                    <Play className="h-3 w-3 text-white ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
            ) : thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={creator.creator_name}
                className="block w-full h-auto max-h-32 object-contain"
                loading="lazy"
                onError={() => {
                  if (creator.avatar_url && !avatarImgFailed) {
                    setAvatarImgFailed(true);
                  } else {
                    setPortfolioImgFailed(true);
                  }
                }}
              />
            ) : (
              <div className="w-full h-24 bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                <span className="text-white text-xl font-bold">{initials}</span>
              </div>
            )}
          </div>
        </div>

        {/* Heart — top right */}
        <button
          onClick={handleHeartClick}
          className="absolute top-3 right-3 bg-white/90 rounded-full w-8 h-8 flex items-center justify-center hover:bg-white transition-colors"
        >
          <Heart
            className={`h-4 w-4 ${isFavorite ? 'fill-pink-300 text-pink-300' : 'text-gray-300'}`}
          />
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Name + Rating */}
          <div className="flex items-center gap-1.5 mb-0.5 pr-8">
            <span className="font-bold text-gray-900 text-sm truncate">{creator.creator_name || 'Unknown Creator'}</span>
            {isVerified && <VerifiedBadge />}
            {creator.average_rating != null && (
              <span className="text-yellow-400 text-xs flex-shrink-0">★ {creator.average_rating.toFixed(1)}</span>
            )}
          </div>

          {/* Location */}
          {locationStr && (
            <p className="text-xs text-gray-500 mb-1.5 truncate">📍 {locationStr}</p>
          )}

          {/* Skill Tags */}
          {visibleSkills.length > 0 && (
            <div className="flex gap-1 mb-1.5 flex-wrap">
              {visibleSkills.map((skill) => (
                <span
                  key={skill}
                  className="bg-teal-50 text-teal-700 rounded-full text-[11px] px-2 py-0.5 font-medium"
                >
                  {formatSkillLabel(skill)}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-gray-400 text-[11px] py-0.5">+{overflowCount}</span>
              )}
            </div>
          )}

          {/* Metrics */}
          {metricParts.length > 0 && (
            <p className="text-xs text-gray-400 mb-2">{metricParts.join(' · ')}</p>
          )}

          {/* CTA Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
            className="mt-auto w-full bg-dc-teal-btn text-dc-text rounded-full font-semibold text-sm py-2 hover:bg-dc-teal-btn-hover transition-colors"
          >
            View Profile
          </button>
        </div>
      </div>

      <CreatorProfileModal
        creator={creator}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
});
