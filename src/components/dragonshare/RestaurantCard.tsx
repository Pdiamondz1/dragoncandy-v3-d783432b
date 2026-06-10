// src/components/dragonshare/RestaurantCard.tsx
import { useState } from 'react';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { MapPin } from 'lucide-react';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';
import { InlineRating } from '@/components/reviews/InlineRating';

interface Props {
  restaurant: RestaurantSearchResult;
  onSelect: (restaurant: RestaurantSearchResult) => void;
}

const GRADIENT_COLORS = [
  'from-teal-50 to-emerald-50',
  'from-pink-50 to-fuchsia-50',
  'from-amber-50 to-yellow-50',
  'from-violet-50 to-indigo-50',
  'from-orange-50 to-amber-50',
  'from-sky-50 to-blue-50',
];

function getGradient(name: string): string {
  const index = name.charCodeAt(0) % GRADIENT_COLORS.length;
  return GRADIENT_COLORS[index];
}

export function RestaurantCard({ restaurant, onSelect }: Props) {
  const resolvedLogo = useResolvedLogoUrl(restaurant.logo_url);
  const [imgError, setImgError] = useState(false);
  const gradient = getGradient(restaurant.name);

  return (
    <button
      onClick={() => onSelect(restaurant)}
      className="text-left bg-white rounded-2xl overflow-hidden border border-dc-teal/10 hover:border-dc-teal/30 hover:shadow-md transition-all group"
    >
      {/* Header with gradient + logo */}
      <div className={`relative h-28 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        {resolvedLogo && !imgError ? (
          <img src={resolvedLogo} alt="" className="h-14 w-14 rounded-xl object-cover shadow-sm" onError={() => setImgError(true)} />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-dc-teal/20 flex items-center justify-center text-2xl font-bold text-dc-teal">
            {restaurant.name.charAt(0).toUpperCase()}
          </div>
        )}
        {restaurant.brand_category && (
          <span className="absolute top-2 right-2 text-[10px] bg-dc-teal/15 text-dc-teal-btn px-2.5 py-0.5 rounded-full font-semibold capitalize">
            {restaurant.brand_category}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3.5">
        <h3 className="text-sm font-bold text-dc-text truncate">{restaurant.name}</h3>
        {restaurant.address && (
          <div className="flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3 text-dc-text-muted flex-shrink-0" />
            <span className="text-xs text-dc-text-muted truncate">{restaurant.address}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-2.5">
          <InlineRating
            averageRating={restaurant.average_rating}
            totalReviews={restaurant.total_reviews}
          />
          <span className="text-xs font-semibold text-dc-teal group-hover:text-dc-teal-dark transition-colors flex-shrink-0">
            Select &rarr;
          </span>
        </div>
      </div>
    </button>
  );
}
