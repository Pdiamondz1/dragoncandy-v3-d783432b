# Creator Campaign Gaps v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add distance filtering, budget filtering, Video content type, Nearest sort, Donny Pick banners on mobile swipe cards, and context-aware empty states to the Creator Campaign Marketplace.

**Architecture:** A new `useGeoDistance` hook enriches campaigns with `distanceMiles` using a static US city coords map + haversine formula. The existing `useCampaignFilters` hook is extended with distance/budget filter state. The `CampaignSearchFilters` component gets new pill rows in its expanded section. The `CampaignSwipeCard` gets a Donny Pick banner treatment replacing the current badge overlay.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, React Query (TanStack Query)

**Spec:** `docs/superpowers/specs/2026-04-06-creator-campaign-gaps-v2-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/usCityCoords.ts` | Create | Static map of ~300 US cities → `{ lat, lng }` |
| `src/lib/geoUtils.ts` | Create | `haversineDistance()` + `lookupCityCoords()` |
| `src/lib/geoUtils.test.ts` | Create | Tests for haversine and city lookup |
| `src/hooks/useGeoDistance.ts` | Create | Hook that enriches campaigns with `distanceMiles` |
| `src/hooks/useCampaignFilters.ts` | Modify | Add distance/budget state, video type, nearest sort, new filter functions |
| `src/hooks/useCampaignFilters.test.ts` | Create | Tests for new filter/sort logic |
| `src/components/campaigns/CampaignSearchFilters.tsx` | Modify | White bg, Video pill, expanded section with Distance/Budget/Carousel pills |
| `src/components/campaigns/CampaignSwipeCard.tsx` | Modify | Donny Pick banner replacing DonnyPicksBadge overlay |
| `src/pages/CreatorCampaignMarketplace.tsx` | Modify | Wire useGeoDistance, new filter props, context-aware empty states |

---

### Task 1: Static US City Coordinates Map

**Files:**
- Create: `src/lib/usCityCoords.ts`

- [ ] **Step 1: Create the city coords data file**

Create `src/lib/usCityCoords.ts` with ~300 US cities. Keys are lowercase city names. Include all major metro areas plus mid-size cities. Approximate city-center coordinates.

```ts
export interface CityCoords {
  lat: number;
  lng: number;
}

export const US_CITY_COORDS: Record<string, CityCoords> = {
  "new york": { lat: 40.7128, lng: -74.0060 },
  "los angeles": { lat: 34.0522, lng: -118.2437 },
  "chicago": { lat: 41.8781, lng: -87.6298 },
  "houston": { lat: 29.7604, lng: -95.3698 },
  "phoenix": { lat: 33.4484, lng: -112.0740 },
  "philadelphia": { lat: 39.9526, lng: -75.1652 },
  "san antonio": { lat: 29.4241, lng: -98.4936 },
  "san diego": { lat: 32.7157, lng: -117.1611 },
  "dallas": { lat: 32.7767, lng: -96.7970 },
  "san jose": { lat: 37.3382, lng: -121.8863 },
  // ... continue for ~300 cities total
  // Include state capitals, cities >50k population, and known metro areas
};
```

Ensure coverage of: all 50 state capitals, top 200 cities by population, and any cities that appear in existing `business_profiles` or `creator_profiles` data.

- [ ] **Step 2: Commit**

```bash
git add src/lib/usCityCoords.ts
git commit -m "feat: add static US city coordinates map (~300 cities)"
```

---

### Task 2: Geo Utility Functions + Tests

**Files:**
- Create: `src/lib/geoUtils.ts`
- Create: `src/lib/geoUtils.test.ts`

- [ ] **Step 1: Write failing tests for haversineDistance**

Create `src/lib/geoUtils.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { haversineDistance, lookupCityCoords } from './geoUtils';

describe('haversineDistance', () => {
  test('returns 0 for same coordinates', () => {
    expect(haversineDistance(40.7128, -74.0060, 40.7128, -74.0060)).toBe(0);
  });

  test('calculates NYC to Philadelphia (~95 miles)', () => {
    const distance = haversineDistance(40.7128, -74.0060, 39.9526, -75.1652);
    expect(distance).toBeGreaterThan(90);
    expect(distance).toBeLessThan(100);
  });

  test('calculates NYC to LA (~2450 miles)', () => {
    const distance = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
    expect(distance).toBeGreaterThan(2400);
    expect(distance).toBeLessThan(2500);
  });

  test('calculates short distance (~10 miles)', () => {
    // Manhattan to Newark NJ is about 10 miles
    const distance = haversineDistance(40.7580, -73.9855, 40.7357, -74.1724);
    expect(distance).toBeGreaterThan(8);
    expect(distance).toBeLessThan(12);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/geoUtils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement haversineDistance**

Create `src/lib/geoUtils.ts`:

```ts
import { US_CITY_COORDS } from './usCityCoords';

const EARTH_RADIUS_MILES = 3958.8;

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_MILES * c * 10) / 10; // Round to 1 decimal
}
```

- [ ] **Step 4: Run tests to verify haversineDistance passes**

Run: `npx vitest run src/lib/geoUtils.test.ts`
Expected: All haversineDistance tests PASS

- [ ] **Step 5: Write failing tests for lookupCityCoords**

Add to `src/lib/geoUtils.test.ts`:

```ts
describe('lookupCityCoords', () => {
  test('returns coords for known US city', () => {
    const result = lookupCityCoords('Philadelphia', 'US');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(39.9526, 1);
    expect(result!.lng).toBeCloseTo(-75.1652, 1);
  });

  test('is case-insensitive for city name', () => {
    const result = lookupCityCoords('PHILADELPHIA', 'United States');
    expect(result).not.toBeNull();
  });

  test('handles country variants: us, usa, u.s., u.s.a., united states', () => {
    const variants = ['us', 'USA', 'U.S.', 'U.S.A.', 'united states', 'United States'];
    for (const country of variants) {
      const result = lookupCityCoords('New York', country);
      expect(result).not.toBeNull();
    }
  });

  test('returns null for non-US country', () => {
    expect(lookupCityCoords('London', 'UK')).toBeNull();
    expect(lookupCityCoords('Toronto', 'Canada')).toBeNull();
  });

  test('returns null for unknown US city', () => {
    expect(lookupCityCoords('Tinyville', 'US')).toBeNull();
  });

  test('returns null for empty city or country', () => {
    expect(lookupCityCoords('', 'US')).toBeNull();
    expect(lookupCityCoords('Philadelphia', '')).toBeNull();
  });

  test('trims whitespace from city name', () => {
    const result = lookupCityCoords('  Philadelphia  ', 'US');
    expect(result).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run tests to verify lookupCityCoords tests fail**

Run: `npx vitest run src/lib/geoUtils.test.ts`
Expected: FAIL — lookupCityCoords not defined

- [ ] **Step 7: Implement lookupCityCoords**

Add to `src/lib/geoUtils.ts`:

```ts
const US_COUNTRY_VARIANTS = new Set([
  'us', 'usa', 'united states', 'united states of america',
]);

function normalizeCountry(country: string): string {
  return country.toLowerCase().trim().replace(/\./g, '');
}

function isUSCountry(country: string): boolean {
  return US_COUNTRY_VARIANTS.has(normalizeCountry(country));
}

export function lookupCityCoords(
  city: string,
  country: string,
): { lat: number; lng: number } | null {
  if (!city || !country) return null;
  if (!isUSCountry(country)) return null;

  const normalized = city.toLowerCase().trim();
  const coords = US_CITY_COORDS[normalized];
  return coords ?? null;
}
```

- [ ] **Step 8: Run all geoUtils tests**

Run: `npx vitest run src/lib/geoUtils.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/geoUtils.ts src/lib/geoUtils.test.ts
git commit -m "feat: add haversineDistance and lookupCityCoords with tests"
```

---

### Task 3: useGeoDistance Hook

**Files:**
- Create: `src/hooks/useGeoDistance.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useMemo } from 'react';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreatorMatchProfile } from '@/hooks/useCreatorMatchProfile';
import { lookupCityCoords, haversineDistance } from '@/lib/geoUtils';

export interface GeoEnrichedCampaign extends PublicCampaign {
  distanceMiles: number | null;
}

export interface GeoDistanceResult {
  campaigns: GeoEnrichedCampaign[];
  creatorHasCoords: boolean;
}

export const useGeoDistance = (campaigns: PublicCampaign[]): GeoDistanceResult => {
  const { data: profile } = useCreatorMatchProfile();

  return useMemo(() => {
    const creatorCoords = profile?.city && profile?.country
      ? lookupCityCoords(profile.city, profile.country)
      : null;

    const enriched: GeoEnrichedCampaign[] = campaigns.map((campaign) => {
      if (!creatorCoords) {
        return { ...campaign, distanceMiles: null };
      }

      const businessCity = campaign.business_profile?.city;
      const businessCountry = campaign.business_profile?.country;

      if (!businessCity || !businessCountry) {
        return { ...campaign, distanceMiles: null };
      }

      const businessCoords = lookupCityCoords(businessCity, businessCountry);
      if (!businessCoords) {
        return { ...campaign, distanceMiles: null };
      }

      const distance = haversineDistance(
        creatorCoords.lat, creatorCoords.lng,
        businessCoords.lat, businessCoords.lng,
      );

      return { ...campaign, distanceMiles: distance };
    });

    return {
      campaigns: enriched,
      creatorHasCoords: creatorCoords !== null,
    };
  }, [profile?.city, profile?.country, campaigns]);
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useGeoDistance.ts
git commit -m "feat: useGeoDistance hook enriches campaigns with distance"
```

---

### Task 4: Extend useCampaignFilters + Tests

**Files:**
- Modify: `src/hooks/useCampaignFilters.ts`
- Create: `src/hooks/useCampaignFilters.test.ts`

- [ ] **Step 1: Write failing tests for new filter functions**

Create `src/hooks/useCampaignFilters.test.ts`:

```ts
import { describe, test, expect } from 'vitest';

// We'll test the pure filter/sort functions directly.
// They need to be exported from useCampaignFilters.ts (or extracted to a helper).
// For testability, export: matchesDistance, matchesBudget, VIDEO_TYPES
import {
  matchesDistance,
  matchesBudget,
  VIDEO_TYPES,
} from './useCampaignFilters';

describe('VIDEO_TYPES', () => {
  test('includes video_reel, tiktok, youtube_short', () => {
    expect(VIDEO_TYPES).toContain('video_reel');
    expect(VIDEO_TYPES).toContain('tiktok');
    expect(VIDEO_TYPES).toContain('youtube_short');
  });
});

describe('matchesDistance', () => {
  test('always passes when radius is "any"', () => {
    expect(matchesDistance(null, 'any')).toBe(true);
    expect(matchesDistance(100, 'any')).toBe(true);
  });

  test('passes when campaign has no distance (null)', () => {
    expect(matchesDistance(null, 10)).toBe(true);
  });

  test('passes when distance is within radius', () => {
    expect(matchesDistance(5, 10)).toBe(true);
    expect(matchesDistance(10, 10)).toBe(true);
  });

  test('fails when distance exceeds radius', () => {
    expect(matchesDistance(15, 10)).toBe(false);
    expect(matchesDistance(51, 50)).toBe(false);
  });
});

describe('matchesBudget', () => {
  test('passes when both min and max are "any"', () => {
    expect(matchesBudget({ fixed_price: null, budget_min: null, budget_max: null }, 'any', 'any')).toBe(true);
  });

  test('passes when campaign has no budget data', () => {
    expect(matchesBudget({ fixed_price: null, budget_min: null, budget_max: null }, 100, 500)).toBe(true);
  });

  test('fixed price campaign: passes when within range', () => {
    expect(matchesBudget({ fixed_price: 200, budget_min: null, budget_max: null }, 100, 500)).toBe(true);
  });

  test('fixed price campaign: fails when below min', () => {
    expect(matchesBudget({ fixed_price: 50, budget_min: null, budget_max: null }, 100, 'any')).toBe(false);
  });

  test('fixed price campaign: fails when above max', () => {
    expect(matchesBudget({ fixed_price: 600, budget_min: null, budget_max: null }, 'any', 500)).toBe(false);
  });

  test('range campaign: passes when ranges overlap', () => {
    // Campaign $200-$800, filter min $100 max $500
    // max payout (800) >= filter min (100) ✓
    // entry price (200) <= filter max (500) ✓
    expect(matchesBudget({ fixed_price: null, budget_min: 200, budget_max: 800 }, 100, 500)).toBe(true);
  });

  test('range campaign: fails when max payout below filter min', () => {
    // Campaign $50-$100, filter min $250
    expect(matchesBudget({ fixed_price: null, budget_min: 50, budget_max: 100 }, 250, 'any')).toBe(false);
  });

  test('range campaign: fails when entry price above filter max', () => {
    // Campaign $600-$1000, filter max $500
    expect(matchesBudget({ fixed_price: null, budget_min: 600, budget_max: 1000 }, 'any', 500)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useCampaignFilters.test.ts`
Expected: FAIL — matchesDistance, matchesBudget not found

- [ ] **Step 3: Implement new filter types, functions, and exports**

Modify `src/hooks/useCampaignFilters.ts`:

1. Update type definitions:

```ts
export type ContentTypeFilter = 'all' | 'photo' | 'video' | 'reel' | 'story' | 'carousel';
export type DeliveryTierFilter = 'all' | 'dragonrush' | 'expedited' | 'standard';
export type SortOption = 'nearest' | 'newest' | 'budget' | 'ending_soon';
export type DistanceRadius = 'any' | 5 | 10 | 25 | 50;
export type BudgetMinPreset = 'any' | 50 | 100 | 250;
export type BudgetMaxPreset = 'any' | 250 | 500 | 1000 | 2000;

export const VIDEO_TYPES = ['video_reel', 'tiktok', 'youtube_short'];
const REEL_TYPES = VIDEO_TYPES; // Same for MVP — shared constant
```

2. Extend `CampaignFilterState`:

```ts
export interface CampaignFilterState {
  searchTerm: string;
  contentType: ContentTypeFilter;
  deliveryTier: DeliveryTierFilter;
  sortBy: SortOption;
  distanceRadius: DistanceRadius;
  budgetMin: BudgetMinPreset;
  budgetMax: BudgetMaxPreset;
}
```

3. Add and export `matchesDistance`:

```ts
export function matchesDistance(
  distanceMiles: number | null,
  radius: DistanceRadius,
): boolean {
  if (radius === 'any') return true;
  if (distanceMiles === null) return true; // Don't exclude unknowns
  return distanceMiles <= radius;
}
```

4. Add and export `matchesBudget`:

```ts
interface BudgetFields {
  fixed_price: number | null;
  budget_min: number | null;
  budget_max: number | null;
}

export function matchesBudget(
  campaign: BudgetFields,
  filterMin: BudgetMinPreset,
  filterMax: BudgetMaxPreset,
): boolean {
  const { fixed_price, budget_min, budget_max } = campaign;

  // No budget data — pass through
  if (fixed_price == null && budget_min == null && budget_max == null) return true;

  const maxPayout = fixed_price ?? budget_max ?? 0;
  const entryPrice = fixed_price ?? budget_min ?? 0;

  if (filterMin !== 'any' && maxPayout < filterMin) return false;
  if (filterMax !== 'any' && entryPrice > filterMax) return false;

  return true;
}
```

5. Update `matchesContentType` to handle `'video'`:

```ts
function matchesContentType(campaign: PublicCampaign, filter: ContentTypeFilter): boolean {
  if (filter === 'all') return true;
  const types = campaign.content_types ?? [];
  if (filter === 'video') return types.some((t) => VIDEO_TYPES.includes(t));
  if (filter === 'reel') return types.some((t) => REEL_TYPES.includes(t));
  return types.includes(filter);
}
```

**Important:** The campaigns array passed to `useCampaignFilters` will now be `GeoEnrichedCampaign[]` (which extends `PublicCampaign` with `distanceMiles`). Update the hook signature to accept a generic:

```ts
import type { GeoEnrichedCampaign } from '@/hooks/useGeoDistance';

export const useCampaignFilters = (campaigns: GeoEnrichedCampaign[]) => {
```

This lets the filter/sort functions access `campaign.distanceMiles` directly without `as any` casts. No `any` usage — strict TypeScript throughout.

6. Update `sortCampaigns` to handle `'nearest'`:

```ts
case 'nearest': {
  const aDist = a.distanceMiles ?? Infinity;
  const bDist = b.distanceMiles ?? Infinity;
  return aDist - bDist;
}
```

7. Update `filteredCampaigns` to include new filters:

Add `matchesDistance(c.distanceMiles, filters.distanceRadius)` and `matchesBudget(c, filters.budgetMin, filters.budgetMax)` to the filter chain.

8. Add new setters and update defaults/clear:

```ts
const setDistanceRadius = useCallback((r: DistanceRadius) => {
  setFilters((prev) => ({ ...prev, distanceRadius: r }));
}, []);

const setBudgetMin = useCallback((min: BudgetMinPreset) => {
  setFilters((prev) => {
    const next = { ...prev, budgetMin: min };
    // Auto-reset max if min exceeds it
    if (min !== 'any' && prev.budgetMax !== 'any' && min > prev.budgetMax) {
      next.budgetMax = 'any';
    }
    return next;
  });
}, []);

const setBudgetMax = useCallback((max: BudgetMaxPreset) => {
  setFilters((prev) => ({ ...prev, budgetMax: max }));
}, []);
```

Update `clearFilters`:
```ts
const clearFilters = useCallback(() => {
  setFilters({
    searchTerm: '', contentType: 'all', deliveryTier: 'all',
    sortBy: 'newest', distanceRadius: 'any', budgetMin: 'any', budgetMax: 'any',
  });
}, []);
```

Update `hasActiveFilters`:
```ts
const hasActiveFilters = filters.searchTerm !== '' ||
  filters.contentType !== 'all' ||
  filters.deliveryTier !== 'all' ||
  filters.distanceRadius !== 'any' ||
  filters.budgetMin !== 'any' ||
  filters.budgetMax !== 'any';
```

Return the new setters from the hook.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/useCampaignFilters.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run existing tests to check for regressions**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCampaignFilters.ts src/hooks/useCampaignFilters.test.ts
git commit -m "feat: extend campaign filters with distance, budget, video type, nearest sort"
```

---

### Task 5: Update CampaignSearchFilters UI

**Files:**
- Modify: `src/components/campaigns/CampaignSearchFilters.tsx`

- [ ] **Step 1: Update the component props interface**

Add new props for the expanded filter controls:

```ts
interface CampaignSearchFiltersProps {
  filters: CampaignFilterState;
  filteredCount: number;
  hasActiveFilters: boolean;
  onSearchChange: (term: string) => void;
  onContentTypeChange: (ct: ContentTypeFilter) => void;
  onDeliveryTierChange: (dt: DeliveryTierFilter) => void;
  onSortChange: (sort: SortOption) => void;
  onDistanceChange: (radius: DistanceRadius) => void;
  onBudgetMinChange: (min: BudgetMinPreset) => void;
  onBudgetMaxChange: (max: BudgetMaxPreset) => void;
  onClearFilters: () => void;
}
```

- [ ] **Step 2: Update imports**

Update the import from `@/hooks/useCampaignFilters` to include the new types:

```ts
import type {
  ContentTypeFilter,
  DeliveryTierFilter,
  SortOption,
  DistanceRadius,
  BudgetMinPreset,
  BudgetMaxPreset,
  CampaignFilterState,
} from '@/hooks/useCampaignFilters';
```

- [ ] **Step 3: Update the pill constants**

Update `CONTENT_TYPE_PILLS` — move Carousel out, add Video:

```ts
const CONTENT_TYPE_PILLS: { value: ContentTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
];

const MORE_CONTENT_PILLS: { value: ContentTypeFilter; label: string }[] = [
  { value: 'carousel', label: 'Carousel' },
];

const DISTANCE_PILLS: { value: DistanceRadius; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 5, label: '5 mi' },
  { value: 10, label: '10 mi' },
  { value: 25, label: '25 mi' },
  { value: 50, label: '50 mi' },
];

const BUDGET_MIN_PILLS: { value: BudgetPreset; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 50, label: '$50+' },
  { value: 100, label: '$100+' },
  { value: 250, label: '$250+' },
];

const BUDGET_MAX_PILLS: { value: BudgetPreset; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 250, label: '≤$250' },
  { value: 500, label: '≤$500' },
  { value: 1000, label: '≤$1k' },
  { value: 2000, label: '≤$2k+' },
];
```

Add `'nearest'` to `SORT_OPTIONS`:

```ts
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'newest', label: 'Newest' },
  { value: 'budget', label: 'Highest Budget' },
  { value: 'ending_soon', label: 'Ending Soon' },
];
```

- [ ] **Step 4: Update the component JSX**

1. Add white background to the outer wrapper:

Change `<div className="px-4 pt-3 pb-2 space-y-2">` to:
```tsx
<div className="bg-white rounded-b-2xl px-4 pt-3 pb-2 space-y-2">
```

2. In the expanded section, add the new pill rows after the existing delivery tier pills. Use a helper to render pill rows to avoid repetition:

```tsx
{/* Section label helper — used for each expanded row */}
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
    {children}
  </div>
);
```

Add to the expanded section (inside the `{expanded && (...)}` block), after the delivery tier pills:

```tsx
<SectionLabel>More Content Types</SectionLabel>
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
  {MORE_CONTENT_PILLS.map((pill) => (
    <button
      key={pill.value}
      onClick={() => onContentTypeChange(pill.value)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        filters.contentType === pill.value
          ? 'bg-dc-teal text-white'
          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
      }`}
    >
      {pill.label}
    </button>
  ))}
</div>

<SectionLabel>Distance</SectionLabel>
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
  {DISTANCE_PILLS.map((pill) => (
    <button
      key={String(pill.value)}
      onClick={() => onDistanceChange(pill.value)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        filters.distanceRadius === pill.value
          ? 'bg-dc-teal text-white'
          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
      }`}
    >
      {pill.label}
    </button>
  ))}
</div>

<SectionLabel>Budget Min</SectionLabel>
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
  {BUDGET_MIN_PILLS.map((pill) => (
    <button
      key={String(pill.value)}
      onClick={() => onBudgetMinChange(pill.value)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        filters.budgetMin === pill.value
          ? 'bg-dc-teal text-white'
          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
      }`}
    >
      {pill.label}
    </button>
  ))}
</div>

<SectionLabel>Budget Max</SectionLabel>
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
  {BUDGET_MAX_PILLS.map((pill) => (
    <button
      key={String(pill.value)}
      onClick={() => onBudgetMaxChange(pill.value)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        filters.budgetMax === pill.value
          ? 'bg-dc-teal text-white'
          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
      }`}
    >
      {pill.label}
    </button>
  ))}
</div>
```

3. Update existing pill backgrounds for consistency. In both the top-row and `searchOpen` content type pill renderers, change unselected pill class from `bg-white text-gray-600 border border-gray-200` to `bg-gray-50 text-gray-600 border border-gray-200`. Same for delivery tier pills in the expanded section.

4. Update the campaign count text color for white background:

Change `<p className="text-xs text-white/60 px-1">` to:
```tsx
<p className="text-xs text-gray-400 px-1">
```

- [ ] **Step 5: Verify build**

Run: `npx vite build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/CampaignSearchFilters.tsx
git commit -m "feat: update filter UI — white bg, Video pill, distance/budget pill rows"
```

---

### Task 6: Donny Pick Banner on Swipe Cards

**Files:**
- Modify: `src/components/campaigns/CampaignSwipeCard.tsx`

- [ ] **Step 1: Replace the DonnyPicksBadge overlay with banner treatment**

In the `CardContent` component in `CampaignSwipeCard.tsx`:

1. Remove the `DonnyPicksBadge` import (line 8) and the badge overlay JSX (lines 211-216):

Remove this block:
```tsx
{/* Donny Picks match badge — top-left, below applicant count */}
{matchInfo && (
  <div className={`absolute left-3 z-10 ${applicantCount > 0 ? 'top-12' : 'top-3'}`}>
    <DonnyPicksBadge score={matchInfo.score} />
  </div>
)}
```

2. Add a Donny Pick banner ABOVE the hero image area. Modify the outer card div to conditionally add a teal border:

Change the card wrapper:
```tsx
<div
  className={`bg-white rounded-2xl shadow-xl overflow-hidden h-full flex flex-col cursor-grab active:cursor-grabbing ${
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
        <img src={logo} alt="" className="w-4 h-4" />
        <span className="text-xs font-bold text-white">Donny's Pick</span>
      </div>
      <span className="bg-white text-dc-teal text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
        {matchInfo.score}% Match
      </span>
    </div>
  )}

  {/* Hero image area — 60% height */}
  ...
```

3. The match reasons at the bottom of the card body (lines 276-280) already exist — keep them as-is.

- [ ] **Step 2: Verify build**

Run: `npx vite build`
Expected: Build succeeds. The `DonnyPicksBadge` import can be removed since it's no longer used in this file. It remains used in `DonnyPicksRow.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignSwipeCard.tsx
git commit -m "feat: replace Donny Pick badge with banner on mobile swipe cards"
```

---

### Task 7: Wire Everything in CreatorCampaignMarketplace + Empty States

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`

- [ ] **Step 1: Add useGeoDistance to the data pipeline**

Add import:
```ts
import { useGeoDistance } from '@/hooks/useGeoDistance';
```

After the existing `usePublicCampaigns` call (line 31), add:
```ts
const { campaigns: geoCampaigns } = useGeoDistance(campaigns);
```

Then change the `useCampaignFilters` call to use `geoCampaigns` instead of `campaigns`:
```ts
const {
  filters,
  filteredCampaigns: filteredBySearch,
  hasActiveFilters,
  setSearchTerm,
  setContentType,
  setDeliveryTier,
  setSortBy,
  setDistanceRadius,
  setBudgetMin,
  setBudgetMax,
  clearFilters,
} = useCampaignFilters(geoCampaigns);
```

- [ ] **Step 2: Pass new filter props to CampaignSearchFilters**

Update the `<CampaignSearchFilters>` usage to include the new callback props:

```tsx
<CampaignSearchFilters
  filters={filters}
  filteredCount={availableFilteredCount}
  hasActiveFilters={hasActiveFilters}
  onSearchChange={setSearchTerm}
  onContentTypeChange={setContentType}
  onDeliveryTierChange={setDeliveryTier}
  onSortChange={setSortBy}
  onDistanceChange={setDistanceRadius}
  onBudgetMinChange={setBudgetMin}
  onBudgetMaxChange={setBudgetMax}
  onClearFilters={clearFilters}
/>
```

- [ ] **Step 3: Update mobile empty states**

Replace the existing empty state block in the mobile `availableTab` section (lines 223-235) with context-aware empty states:

```tsx
{swipeCampaigns.length === 0 && hasActiveFilters && (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <p className="text-white font-semibold mb-2">
      {filters.distanceRadius !== 'any'
        ? 'No campaigns in your area yet.'
        : 'No campaigns found.'}
    </p>
    <p className="text-white/60 text-sm mb-4">
      {filters.distanceRadius !== 'any'
        ? 'Expand your search radius or check back soon.'
        : 'Try different filters or ask Donny for suggestions.'}
    </p>
    <button
      onClick={filters.distanceRadius !== 'any'
        ? () => setDistanceRadius('any')
        : clearFilters}
      className="rounded-full bg-dc-teal text-white text-sm font-bold px-6 py-2 hover:bg-dc-teal-dark transition-colors"
    >
      {filters.distanceRadius !== 'any' ? 'Expand radius' : 'Clear filters'}
    </button>
  </div>
)}
```

- [ ] **Step 4: Add the "still learning" Donny message**

Below the search filters on mobile, when Donny has no picks but the creator has a profile, show a subtle hint. Add this after the `<CampaignSearchFilters>` component:

```tsx
{donnyPicks.length === 0 && swipeCampaigns.length > 0 && (
  <div className="px-4 pb-1">
    <p className="text-xs text-white/40 text-center">
      We're still learning your preferences. Complete more campaigns to improve your matches.
    </p>
  </div>
)}
```

- [ ] **Step 5: Verify build**

Run: `npx vite build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "feat: wire geo distance, new filter props, context-aware empty states"
```

---

### Task 8: Final Build Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (including new geoUtils and useCampaignFilters tests)

- [ ] **Step 2: Run production build**

Run: `npx vite build`
Expected: Build succeeds with no TypeScript errors or warnings

- [ ] **Step 3: Verify no restaurant/business pages modified**

Run: `git diff --name-only main`
Expected: Only files listed in the File Map above appear. No files under paths like `RestaurantDashboard`, `BusinessDashboard`, etc.

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If any uncommitted changes, commit them
```
