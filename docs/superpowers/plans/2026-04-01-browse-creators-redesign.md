# Browse Creators Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Browse Creators page with a clean white header, content-type filter pills, sort functionality, hybrid creator cards (thumbnail left, data right), responsive grid, map overlay, and client-side favorites.

**Architecture:** Refine existing components — keep `useCreatorBrowse` hook, `CreatorProfileModal`, `CreatorPortfolioModal`, and `CreatorMapView` intact. Redesign `CreatorBrowseHeader`, `CreatorBrowseContent`, and `CreatorCard`. Add sort state to the hook. Move `AdvancedCreatorFilters` into a `Sheet` overlay. Move map into a `Dialog` overlay.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui (Sheet, Dialog), React Query, Supabase

**Spec:** `docs/superpowers/specs/2026-04-01-browse-creators-redesign-design.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useCreatorBrowse.ts` | Modify | Add `sortBy` state, `contentTypeFilter` state, sort logic in `useMemo` |
| `src/components/creator-browse/CreatorBrowseHeader.tsx` | Rewrite | New header: title, subtitle, search bar, content-type pills, sort/filter/map controls |
| `src/components/creator-browse/CreatorBrowseContent.tsx` | Rewrite | Remove tab system, render responsive grid, mount map as Dialog overlay, mount filters as Sheet |
| `src/components/creator-browse/CreatorCard.tsx` | Rewrite | Hybrid layout: thumbnail left, data right, heart favorite, graceful null handling |
| `src/pages/CreatorBrowse.tsx` | Modify | Remove pink bg, pass new props from hook |
| `src/components/creator-search/AdvancedCreatorFilters.tsx` | Modify | Remove search field (promoted to header), remove Card wrapper for sheet usage |

### Files NOT Modified
- `src/components/creator-browse/CreatorMapView.tsx` — mounted differently, component untouched
- `src/components/creator-browse/CreatorProfileModal.tsx` — untouched
- `src/components/creator-browse/CreatorPortfolioModal.tsx` — untouched

---

### Task 1: Add sort and content-type filter to useCreatorBrowse hook

**Files:**
- Modify: `src/hooks/useCreatorBrowse.ts`

- [ ] **Step 1: Add sortBy and contentTypeFilter to state and interface**

Add `sortBy` to `CreatorFilters` and a separate `contentTypeFilter` state. Add sort logic after the existing filter `useMemo`.

In `src/hooks/useCreatorBrowse.ts`, add the `SortOption` type and `contentTypeFilter` state after line 46:

```typescript
export type SortOption = 'relevance' | 'top-rated' | 'price-low' | 'price-high' | 'most-reviewed';
```

After the `filters` state declaration (line 61), add:

```typescript
const [sortBy, setSortBy] = React.useState<SortOption>('relevance');
const [contentTypeFilter, setContentTypeFilter] = React.useState<string[]>([]);
```

- [ ] **Step 2: Add sorting logic to the filteredCreators useMemo**

Replace the `filteredCreators` useMemo (lines 114-181) to include content-type filtering and sorting. The content-type filter uses the same OR logic as skills but is separate state (pills vs advanced filters). After the existing `filter()` call, add content-type filtering and then a `.sort()`:

```typescript
const filteredCreators = useMemo(() => {
  let result = creators.filter(creator => {
    const matchesSearch = 
      creator.creator_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.bio?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.skills?.some(skill => skill.toLowerCase().includes(filters.searchTerm.toLowerCase()));

    const matchesSkills = filters.skills.length === 0 || 
      creator.skills?.some(skill => filters.skills.includes(skill));

    const isPostalCodeSearch = !!debouncedFilters.postal_code && filters._isLocationAutoFilled;
    
    const matchesPostalCode = !debouncedFilters.postal_code || (() => {
      const filterPostal = debouncedFilters.postal_code.toLowerCase().trim();
      const creatorPostal = (creator.postal_code || '').toLowerCase().trim();
      if (creatorPostal && creatorPostal.startsWith(filterPostal)) return true;
      if (!creatorPostal && creator.location?.toLowerCase().includes(filterPostal)) return true;
      return false;
    })();

    const matchesCity = isPostalCodeSearch ? true : (!debouncedFilters.city || (() => {
      const filterCity = debouncedFilters.city.toLowerCase().trim();
      const creatorCity = (creator.city || '').toLowerCase().trim();
      if (creatorCity && creatorCity.includes(filterCity)) return true;
      if (!creatorCity && creator.location?.toLowerCase().includes(filterCity)) return true;
      return false;
    })());

    const matchesCountry = isPostalCodeSearch ? true : (!debouncedFilters.country || (() => {
      const filterCountry = debouncedFilters.country.toLowerCase().trim();
      const creatorCountry = (creator.country || '').toLowerCase().trim();
      if (creatorCountry && creatorCountry.includes(filterCountry)) return true;
      if (!creatorCountry && creator.location?.toLowerCase().includes(filterCountry)) return true;
      return false;
    })());

    const matchesRate = (() => {
      const rate = creator.base_rate_per_hour || 0;
      return rate >= filters.minRate && rate <= filters.maxRate;
    })();

    const matchesPlatforms = filters.platforms.length === 0 || (() => {
      const creatorPlatforms = [];
      if (creator.instagram_url) creatorPlatforms.push('Instagram');
      if (creator.tiktok_url) creatorPlatforms.push('TikTok');
      if (creator.youtube_url) creatorPlatforms.push('YouTube');
      if (creator.facebook_url) creatorPlatforms.push('Facebook');
      if (creator.linkedin_url) creatorPlatforms.push('LinkedIn');
      if (creator.x_url) creatorPlatforms.push('X (Twitter)');
      return filters.platforms.some(platform => creatorPlatforms.includes(platform));
    })();

    const matchesAvailability = !filters.availability || filters.availability === "any" ||
      creator.availability === filters.availability;

    const matchesExperience = !filters.experienceLevel || filters.experienceLevel === "any";

    // Content-type pill filter (separate from advanced skills filter)
    const matchesContentType = contentTypeFilter.length === 0 ||
      creator.skills?.some(skill => contentTypeFilter.includes(skill));

    return matchesSearch && matchesSkills && matchesPostalCode && matchesCity && 
           matchesCountry && matchesRate && matchesPlatforms && matchesAvailability && 
           matchesExperience && matchesContentType;
  });

  // Sort
  if (sortBy !== 'relevance') {
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'top-rated':
          return (b.average_rating ?? -1) - (a.average_rating ?? -1);
        case 'price-low':
          return (a.base_rate_per_hour ?? Infinity) - (b.base_rate_per_hour ?? Infinity);
        case 'price-high':
          return (b.base_rate_per_hour ?? -1) - (a.base_rate_per_hour ?? -1);
        case 'most-reviewed':
          return (b.total_reviews ?? -1) - (a.total_reviews ?? -1);
        default:
          return 0;
      }
    });
  }

  return result;
}, [creators, filters, debouncedFilters, sortBy, contentTypeFilter]);
```

- [ ] **Step 3: Export the new state and setters in the return**

Update the return object (currently lines 183-193) to include the new values:

```typescript
return {
  creators,
  filteredCreators,
  filters,
  debouncedFilters,
  isLoading,
  error,
  handleFilterChange,
  resetFilters,
  sortBy,
  setSortBy,
  contentTypeFilter,
  setContentTypeFilter,
};
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No TypeScript errors (new exports are unused but that's fine — consumers come in later tasks)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreatorBrowse.ts
git commit -m "feat(creators): add sort and content-type filter to useCreatorBrowse hook"
```

---

### Task 2: Redesign CreatorBrowseHeader

**Files:**
- Rewrite: `src/components/creator-browse/CreatorBrowseHeader.tsx`

- [ ] **Step 1: Define the new props interface**

The header now needs search, pills, sort, filter sheet, and map overlay controls. Replace the entire file:

```typescript
import React from 'react';
import { Search, SlidersHorizontal, MapPin } from 'lucide-react';
import type { SortOption } from '@/hooks/useCreatorBrowse';

const CONTENT_TYPES = [
  'Video Editing',
  'Photography',
  'UGC Creation',
  'Social Media Management',
  'Copywriting',
  'Graphic Design',
  'Animation',
  'Content Strategy',
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'top-rated', label: 'Top Rated' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'most-reviewed', label: 'Most Reviewed' },
];

interface CreatorBrowseHeaderProps {
  resultCount: number;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  contentTypeFilter: string[];
  onContentTypeChange: (types: string[]) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  onOpenFilters: () => void;
  onOpenMap: () => void;
  activeFilterCount: number;
}

export const CreatorBrowseHeader: React.FC<CreatorBrowseHeaderProps> = ({
  resultCount,
  searchTerm,
  onSearchChange,
  contentTypeFilter,
  onContentTypeChange,
  sortBy,
  onSortChange,
  onOpenFilters,
  onOpenMap,
  activeFilterCount,
}) => {
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  const sortRef = React.useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleContentType = (type: string) => {
    if (contentTypeFilter.includes(type)) {
      onContentTypeChange(contentTypeFilter.filter(t => t !== type));
    } else {
      onContentTypeChange([...contentTypeFilter, type]);
    }
  };

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Relevance';

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Find Creators</h1>
        <p className="text-sm text-gray-500 mt-1">Discover local creators matched to your brand</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search creators by name or skill..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 bg-gray-100 rounded-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition-colors"
        />
      </div>

      {/* Content-Type Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => onContentTypeChange([])}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            contentTypeFilter.length === 0
              ? 'bg-teal-400 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {CONTENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleContentType(type)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              contentTypeFilter.includes(type)
                ? 'bg-teal-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Sort + Filter + Map Row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{resultCount} creator{resultCount !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Sort: {currentSortLabel} <span className="text-xs">▾</span>
            </button>
            {isSortOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 min-w-[180px]">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      sortBy === option.value ? 'text-teal-600 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filters Button */}
          <button
            onClick={onOpenFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-teal-400 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Map Button */}
          <button
            onClick={onOpenMap}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <MapPin className="h-3.5 w-3.5" />
            Map
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build errors about missing props in `CreatorBrowse.tsx` — that's expected, will fix in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-browse/CreatorBrowseHeader.tsx
git commit -m "feat(creators): redesign header with search, pills, sort, filter controls"
```

---

### Task 3: Redesign CreatorCard with hybrid layout

**Files:**
- Rewrite: `src/components/creator-browse/CreatorCard.tsx`

- [ ] **Step 1: Rewrite CreatorCard with hybrid layout**

The card keeps existing image-resolution logic and modal integration but gets a new visual layout. Replace the entire file:

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import CreatorProfileModal from './CreatorProfileModal';
import { CreatorPortfolioModal } from '@/components/creator-profile/CreatorPortfolioModal';
import { Heart, User } from 'lucide-react';

interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_urls?: string[];
  location?: string;
  city?: string;
  country?: string;
  availability?: string;
  base_rate_per_hour?: number;
  average_rating?: number;
  total_reviews?: number;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  website_url?: string;
}

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
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [portfolioIndex, setPortfolioIndex] = useState(0);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [resolvedPortfolioUrls, setResolvedPortfolioUrls] = useState<string[]>([]);
  const [isFavorite, setIsFavorite] = useState(() => getFavorites().includes(creator.id));

  // Resolve portfolio images (keep existing logic)
  useEffect(() => {
    const loadPortfolioImages = async () => {
      if (!creator.portfolio_urls || creator.portfolio_urls.length === 0) {
        setResolvedPortfolioUrls([]);
        return;
      }

      const resolved = await Promise.all(
        creator.portfolio_urls.map(async (url) => {
          if (url.startsWith('http://') || url.startsWith('https://')) return url;
          try {
            const { data } = await supabase.storage
              .from('profile-assets')
              .createSignedUrl(url, 3600);
            return data?.signedUrl ?? null;
          } catch {
            return null;
          }
        })
      );

      const valid = resolved.filter((u): u is string => u !== null);
      setResolvedPortfolioUrls(valid);
    };

    loadPortfolioImages();
  }, [creator.portfolio_urls]);

  // Resolve thumbnail: portfolio[0] -> avatar -> null
  useEffect(() => {
    const loadThumbnail = async () => {
      // Try portfolio first
      if (resolvedPortfolioUrls.length > 0) {
        setThumbnailUrl(resolvedPortfolioUrls[0]);
        return;
      }

      // Try avatar
      if (creator.avatar_url) {
        if (creator.avatar_url.startsWith('http://') || creator.avatar_url.startsWith('https://')) {
          setThumbnailUrl(creator.avatar_url);
          return;
        }
        try {
          const { data } = await supabase.storage
            .from('profile-assets')
            .createSignedUrl(creator.avatar_url, 3600);
          if (data?.signedUrl) {
            setThumbnailUrl(data.signedUrl);
            return;
          }
        } catch {
          // fall through to null
        }
      }

      setThumbnailUrl(null);
    };

    loadThumbnail();
  }, [creator.avatar_url, resolvedPortfolioUrls]);

  const handleCardClick = () => setIsModalOpen(true);

  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFavorite(toggleFavorite(creator.id));
  };

  // Build location string
  const locationStr = [creator.city, creator.country].filter(Boolean).join(', ');

  // Creator initials for fallback
  const initials = creator.creator_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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
            <span className="font-bold text-gray-900 text-sm truncate">{creator.creator_name}</span>
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: May have warnings about unused vars (isPortfolioOpen is kept for future use via profile modal). No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-browse/CreatorCard.tsx
git commit -m "feat(creators): hybrid card layout with thumbnail, data, favorites"
```

---

### Task 4: Adapt AdvancedCreatorFilters for Sheet usage

**Files:**
- Modify: `src/components/creator-search/AdvancedCreatorFilters.tsx`

- [ ] **Step 1: Remove Card wrapper and search field**

The search field is now in the header. The Card wrapper is replaced because this component will render inside a Sheet. Edit the component:

1. Remove the `Card`, `CardContent`, `CardHeader`, `CardTitle` imports and wrapper.
2. Remove the search field section (lines 249-262 in the current file).
3. Remove the `Collapsible` wrapper — all filters are now always visible (they're in a sheet).
4. Keep all filter logic (skills, platforms, availability, rate, experience, location) intact.
5. Remove the result count and reset button from the header (those are in the main page now).

Replace the return JSX starting at line 148 with:

```tsx
return (
  <div className="space-y-6">
    {/* Location */}
    <div className="space-y-4">
      <Label className="flex items-center gap-2 text-base font-semibold">
        <MapPin className="h-5 w-5" />
        Location
      </Label>
      <div className="space-y-3">
        <div>
          <Label htmlFor="filter-postal-code">Postal/Zip Code</Label>
          <div className="relative">
            <Input
              id="filter-postal-code"
              placeholder="e.g., 10001, SW1A 1AA"
              value={filters.postal_code || ''}
              onChange={(e) => {
                const value = e.target.value;
                onFilterChange('postal_code', value);
                if (!value) {
                  onFilterChange('_isLocationAutoFilled', false);
                  lastLookedUpPostalRef.current = '';
                }
              }}
            />
            {isLookingUp && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="filter-city">City</Label>
          <Input
            id="filter-city"
            placeholder="e.g., New York, London"
            value={filters.city || ''}
            onChange={(e) => {
              onFilterChange('city', e.target.value);
              userEditedCityRef.current = true;
              onFilterChange('_isLocationAutoFilled', false);
            }}
          />
        </div>
        <div>
          <Label htmlFor="filter-country">Country</Label>
          <Input
            id="filter-country"
            placeholder="e.g., United States, UK"
            value={filters.country || ''}
            onChange={(e) => {
              onFilterChange('country', e.target.value);
              userEditedCityRef.current = true;
              onFilterChange('_isLocationAutoFilled', false);
            }}
          />
        </div>
      </div>
    </div>

    <Separator />

    {/* Skills */}
    <div>
      <Label className="flex items-center gap-2 mb-3">
        <Star className="h-4 w-4" />
        Skills & Expertise
      </Label>
      <div className="flex flex-wrap gap-2">
        {availableSkills.map(skill => (
          <Badge
            key={skill}
            variant={filters.skills?.includes(skill) ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => toggleSkill(skill)}
          >
            {skill}
          </Badge>
        ))}
      </div>
    </div>

    <Separator />

    {/* Platforms */}
    <div>
      <Label className="flex items-center gap-2 mb-3">
        Social Media Platforms
      </Label>
      <div className="flex flex-wrap gap-2">
        {availablePlatforms.map(platform => (
          <Badge
            key={platform}
            variant={filters.platforms?.includes(platform) ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => togglePlatform(platform)}
          >
            {platform}
          </Badge>
        ))}
      </div>
    </div>

    <Separator />

    {/* Availability */}
    <div>
      <Label htmlFor="availability">Availability</Label>
      <Select value={filters.availability || "any"} onValueChange={(value) => onFilterChange('availability', value === "any" ? "" : value)}>
        <SelectTrigger>
          <SelectValue placeholder="Any availability" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any availability</SelectItem>
          <SelectItem value="Available">Available</SelectItem>
          <SelectItem value="Busy">Busy</SelectItem>
          <SelectItem value="Booked">Booked</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <Separator />

    {/* Rate Range */}
    <div>
      <Label className="flex items-center gap-2 mb-3">
        <DollarSign className="h-4 w-4" />
        Hourly Rate: ${filters.minRate} - ${filters.maxRate}
      </Label>
      <div className="px-2">
        <Slider
          value={[filters.minRate, filters.maxRate]}
          onValueChange={([min, max]) => {
            onFilterChange('minRate', min);
            onFilterChange('maxRate', max);
          }}
          max={500}
          min={0}
          step={10}
          className="w-full"
        />
      </div>
      <div className="flex justify-between text-sm text-muted-foreground mt-1">
        <span>$0</span>
        <span>$500+</span>
      </div>
    </div>

    <Separator />

    {/* Experience Level */}
    <div>
      <Label htmlFor="experience">Experience Level</Label>
      <Select value={filters.experienceLevel || "any"} onValueChange={(value) => onFilterChange('experienceLevel', value === "any" ? "" : value)}>
        <SelectTrigger>
          <SelectValue placeholder="Any experience level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any experience level</SelectItem>
          <SelectItem value="beginner">Beginner (0-1 years)</SelectItem>
          <SelectItem value="intermediate">Intermediate (2-4 years)</SelectItem>
          <SelectItem value="expert">Expert (5+ years)</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* Reset Button */}
    <Button variant="outline" className="w-full" onClick={onResetFilters}>
      <X className="h-4 w-4 mr-2" />
      Reset All Filters
    </Button>
  </div>
);
```

Also clean up unused imports: remove `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, `Filter`, `ChevronDown`, `ChevronUp`, and `Search`. Keep `Button`, `Input`, `Label`, `Badge`, `Separator`, `Select*`, `Slider`, `MapPin`, `DollarSign`, `Star`, `X`, `Loader2`.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors. The props interface hasn't changed so callers still work.

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-search/AdvancedCreatorFilters.tsx
git commit -m "refactor(creators): flatten AdvancedCreatorFilters for sheet usage"
```

---

### Task 5: Rewrite CreatorBrowseContent with grid, sheet, and map overlay

**Files:**
- Rewrite: `src/components/creator-browse/CreatorBrowseContent.tsx`

- [ ] **Step 1: Replace the entire component**

Remove the tab system. Add responsive grid, Sheet for filters, Dialog for map. Replace the entire file:

```typescript
import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CreatorCard } from './CreatorCard';
import { CreatorMapView } from './CreatorMapView';
import AdvancedCreatorFilters from '@/components/creator-search/AdvancedCreatorFilters';
import type { CreatorFilters } from '@/hooks/useCreatorBrowse';

interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_urls?: string[];
  location?: string;
  city?: string;
  country?: string;
  availability?: string;
  base_rate_per_hour?: number;
  average_rating?: number;
  total_reviews?: number;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  website_url?: string;
}

interface CreatorBrowseContentProps {
  filteredCreators: CreatorProfile[];
  filters: CreatorFilters;
  mapFilters?: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: any) => void;
  onResetFilters: () => void;
  isLoading: boolean;
  error: any;
  isFiltersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  isMapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
}

export const CreatorBrowseContent: React.FC<CreatorBrowseContentProps> = ({
  filteredCreators,
  filters,
  mapFilters,
  onFilterChange,
  onResetFilters,
  isLoading,
  error,
  isFiltersOpen,
  onFiltersOpenChange,
  isMapOpen,
  onMapOpenChange,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Search className="h-12 w-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load creators</h3>
        <p className="text-gray-500">There was an error loading creator profiles.</p>
      </div>
    );
  }

  return (
    <>
      {/* Creator Grid or Empty State */}
      {filteredCreators.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No creators found</h3>
          <p className="text-gray-500 text-sm text-center mb-5 max-w-xs">
            Try expanding your search or adjusting filters to see more creators.
          </p>
          <button
            onClick={onResetFilters}
            className="px-6 py-2.5 bg-teal-400 text-white rounded-full font-semibold text-sm hover:bg-teal-500 transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCreators.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      )}

      {/* Filters Sheet */}
      <Sheet open={isFiltersOpen} onOpenChange={onFiltersOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <AdvancedCreatorFilters
              filters={filters}
              onFilterChange={onFilterChange}
              onResetFilters={onResetFilters}
              resultCount={filteredCreators.length}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Map Overlay */}
      <Dialog open={isMapOpen} onOpenChange={onMapOpenChange}>
        <DialogContent className="max-w-4xl w-[95vw] h-[80vh] p-0 overflow-hidden">
          <div className="h-full">
            <CreatorMapView
              filteredCreators={filteredCreators}
              filters={mapFilters ?? filters}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Errors in `CreatorBrowse.tsx` about missing props — fixed in next task.

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-browse/CreatorBrowseContent.tsx
git commit -m "feat(creators): grid layout with filters sheet and map overlay"
```

---

### Task 6: Wire everything together in CreatorBrowse page

**Files:**
- Modify: `src/pages/CreatorBrowse.tsx`

- [ ] **Step 1: Update the page component to pass all new props**

Replace the entire file:

```typescript
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { CreatorBrowseHeader } from '@/components/creator-browse/CreatorBrowseHeader';
import { CreatorBrowseContent } from '@/components/creator-browse/CreatorBrowseContent';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';

const CreatorBrowse: React.FC = () => {
  const {
    filteredCreators,
    filters,
    debouncedFilters,
    isLoading,
    error,
    handleFilterChange,
    resetFilters,
    sortBy,
    setSortBy,
    contentTypeFilter,
    setContentTypeFilter,
  } = useCreatorBrowse();

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

  // Count active advanced filters (excluding search and content-type pills)
  const activeFilterCount = [
    filters.skills.length > 0,
    filters.city,
    filters.country,
    filters.postal_code,
    filters.platforms.length > 0,
    filters.availability,
    filters.experienceLevel,
    filters.minRate > 0 || filters.maxRate < 500,
  ].filter(Boolean).length;

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-4 sm:p-6 lg:p-8 bg-white min-h-screen overflow-x-hidden">
        <div className="max-w-7xl mx-auto space-y-4">
          <CreatorBrowseHeader
            resultCount={filteredCreators.length}
            searchTerm={filters.searchTerm}
            onSearchChange={(value) => handleFilterChange('searchTerm', value)}
            contentTypeFilter={contentTypeFilter}
            onContentTypeChange={setContentTypeFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onOpenFilters={() => setIsFiltersOpen(true)}
            onOpenMap={() => setIsMapOpen(true)}
            activeFilterCount={activeFilterCount}
          />
          <CreatorBrowseContent
            filteredCreators={filteredCreators}
            filters={filters}
            mapFilters={debouncedFilters}
            onFilterChange={handleFilterChange}
            onResetFilters={resetFilters}
            isLoading={isLoading}
            error={error}
            isFiltersOpen={isFiltersOpen}
            onFiltersOpenChange={setIsFiltersOpen}
            isMapOpen={isMapOpen}
            onMapOpenChange={setIsMapOpen}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorBrowse;
```

Key changes:
- `bg-dc-pink-bg` → `bg-white`
- `space-y-6` → `space-y-4` (tighter spacing)
- New props wired between hook → header → content

- [ ] **Step 2: Full build verification**

Run: `npm run build`
Expected: Clean build with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreatorBrowse.tsx
git commit -m "feat(creators): wire redesigned browse page components together"
```

---

### Task 7: Final verification and combined commit

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, zero errors.

- [ ] **Step 2: Visual smoke test**

Run: `npm run dev`

Check at these widths:
- **375px** (mobile): 1-column grid, full-width cards, pills scroll horizontally
- **768px** (tablet): 2-column grid
- **1440px** (desktop): 3-column grid

Verify:
- Header shows "Find Creators" with subtitle
- Search bar filters by name/skill
- Content-type pills toggle correctly (teal active, gray inactive)
- Sort dropdown changes card order
- Filters button opens sheet with location/skills/rate/platforms
- Map button opens fullscreen map overlay
- Cards show thumbnail, name, rating, location, tags, metrics
- Cards with missing data hide those rows gracefully
- Heart toggles between outline and filled pink
- Empty state shows when no creators match
- "Clear All Filters" resets everything

- [ ] **Step 3: Final commit with all files**

```bash
git add src/pages/CreatorBrowse.tsx src/components/creator-browse/CreatorBrowseHeader.tsx src/components/creator-browse/CreatorBrowseContent.tsx src/components/creator-browse/CreatorCard.tsx src/hooks/useCreatorBrowse.ts src/components/creator-search/AdvancedCreatorFilters.tsx
git commit -m "creators: data-driven browse page with filtering"
```
