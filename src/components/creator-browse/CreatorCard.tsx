import React, { useState, useMemo } from 'react';
import CreatorProfileModal from './CreatorProfileModal';
import { CreatorPortfolioModal } from '@/components/creator-profile/CreatorPortfolioModal';
import { Heart } from 'lucide-react';
import type { CreatorProfile } from '@/hooks/useCreatorBrowse';

const SUPABASE_URL = 'https://zocahiffooqdybdhguqv.supabase.co';

/** Build a public URL for a storage path, with optional image transform for thumbnails. */
const resolveStorageUrl = (raw: string | null | undefined, width?: number): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    if (!width) return raw;
    // Apply image transform only to Supabase storage URLs
    const marker = '/storage/v1/object/public/';
    const idx = raw.indexOf(marker);
    if (idx === -1) return raw;
    const storagePath = raw.substring(idx + marker.length);
    return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
  }
  // Relative storage path
  if (width) {
    return `${SUPABASE_URL}/storage/v1/render/image/public/profile-assets/${raw}?width=${width}&quality=75`;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${raw}`;
};

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

export const CreatorCard: React.FC<CreatorCardProps> = ({ creator }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [portfolioIndex, setPortfolioIndex] = useState(0);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(() => getFavorites().includes(creator.id));

  // Resolve thumbnail synchronously — no async effects, no network flood.
  // Priority: first portfolio image → avatar → null
  const thumbnailUrl = useMemo(() => {
    if (thumbnailError) return null;
    const firstPortfolio = creator.portfolio_urls?.[0];
    if (firstPortfolio) return resolveStorageUrl(firstPortfolio, 300);
    if (creator.avatar_url) return resolveStorageUrl(creator.avatar_url, 300);
    return null;
  }, [creator.portfolio_urls, creator.avatar_url, thumbnailError]);

  // Resolved portfolio URLs for the portfolio modal (synchronous)
  const resolvedPortfolioUrls = useMemo(() => {
    const first = creator.portfolio_urls?.[0];
    if (!first) return [];
    const url = resolveStorageUrl(first);
    return url ? [url] : [];
  }, [creator.portfolio_urls]);

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
        className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      >
        {/* Thumbnail */}
        <div className="w-[110px] sm:w-[130px] flex-shrink-0 relative">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={creator.creator_name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setThumbnailError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
              <span className="text-white text-xl font-bold">{initials}</span>
            </div>
          )}
          {/* Heart */}
          <button
            onClick={handleHeartClick}
            className="absolute top-2 right-2 bg-white/90 rounded-full w-7 h-7 flex items-center justify-center hover:bg-white transition-colors"
          >
            <Heart
              className={`h-4 w-4 ${isFavorite ? 'fill-pink-300 text-pink-300' : 'text-gray-300'}`}
            />
          </button>
        </div>

        {/* Info */}
        <div className="p-3 flex-1 flex flex-col justify-center min-w-0">
          {/* Name + Rating */}
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-bold text-gray-900 text-sm truncate">{creator.creator_name || 'Unknown Creator'}</span>
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
                  {skill}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-gray-400 text-[11px] py-0.5">+{overflowCount}</span>
              )}
            </div>
          )}

          {/* Metrics */}
          {metricParts.length > 0 && (
            <p className="text-xs text-gray-400">{metricParts.join(' · ')}</p>
          )}

          {/* CTA Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
            className="mt-2 w-full bg-teal-400 text-white rounded-full font-semibold text-sm py-1.5 hover:bg-teal-500 transition-colors"
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

      <CreatorPortfolioModal
        isOpen={isPortfolioOpen}
        onClose={() => setIsPortfolioOpen(false)}
        creatorName={creator.creator_name}
        images={resolvedPortfolioUrls.map((url) => ({
          url,
          artistName: creator.creator_name,
        }))}
        currentIndex={portfolioIndex}
        onIndexChange={setPortfolioIndex}
      />
    </>
  );
};
