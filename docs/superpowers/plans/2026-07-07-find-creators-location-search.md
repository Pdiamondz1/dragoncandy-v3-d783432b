# Find Creators — "Near me" location/radius search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a prominent "near me" location + radius control to the restaurant Find Creators page that defaults to the restaurant's saved location, allows a city/zip override, filters/sorts creators by distance, and consolidates the buried Advanced-Filter Zip/City/Country into one control.

**Architecture:** Pure, unit-tested distance helpers (`creatorLocationFilter.ts`) + a default-center hook (`useBusinessLocationCenter`) feed a location filter model owned by `useCreatorBrowse`. A presentational `CreatorLocationControl` emits intents; the hook resolves centers (business profile or geocoded query) and geocodes creators lazily (static-first via `lookupCityCoords`, Google fallback via `useCreatorGeocoding`) only while a location filter is active. All client-side — no schema change.

**Tech Stack:** React 18 + TypeScript (strict), Vitest, Tailwind, shadcn/ui (Popover/Sheet), React Query, existing `geocoding.ts` / `geoUtils.ts` / `usCityCoords.ts`.

**Spec:** `docs/superpowers/specs/2026-07-07-find-creators-location-search-design.md`

**Sequencing rule (keep builds green):** Task 3 adds the `location` model **additively** (legacy `city/country/postal_code` fields stay). Task 6 removes the legacy fields + their UI + map/centering wiring in one shot (build goes red→green within that task). Run `npm run build` (from the worktree) at the end of every task.

---

## File Structure

**New**
- `src/lib/creatorLocationFilter.ts` — pure types + logic: `LocationFilter` model, `detectQueryKind`, `resolveCreatorCoords`, `filterByRadius`, `sortNearest`.
- `src/lib/creatorLocationFilter.test.ts` — unit tests for the above.
- `src/hooks/useBusinessLocationCenter.ts` — resolves the restaurant's default "near me" center.
- `src/components/creator-browse/CreatorLocationControl.tsx` — the pill + Popover/Sheet control (presentational).

**Modify**
- `src/hooks/useCreatorBrowse.ts` — location model state, near-me + custom-geocode effects, radius filter + nearest sort, `'nearest'` `SortOption`; (Task 6) remove legacy location fields/branch.
- `src/components/creator-browse/CreatorBrowseHeader.tsx` — mount the control; add `'nearest'` to `SORT_OPTIONS`.
- `src/components/creator-browse/CreatorCard.tsx` — add "· X mi away" to the location line.
- `src/components/creator-browse/CreatorBrowseContent.tsx` — pass location props to the control if needed; empty-state "Widen to Any location" nudge; "N couldn't be placed" note.
- `src/pages/CreatorBrowse.tsx` — drop legacy fields from `activeFilterCount`; thread location props.
- `src/components/creator-search/AdvancedCreatorFilters.tsx` — remove Zip/City/Country inputs + postal auto-fill effect + local interface fields.
- `src/components/creator-browse/CreatorMapView.tsx` — center on `filters.location.center` instead of postal/city/country.

**Reuse unchanged:** `src/lib/geocoding.ts`, `src/lib/geoUtils.ts`, `src/lib/usCityCoords.ts`, `src/hooks/useCreatorGeocoding.ts`.

> **Environment note (critical):** the shell cwd is the MAIN checkout even though we work in the worktree. Always pass explicit worktree paths, and run npm/vitest with the worktree as cwd:
> `npm --prefix "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" run build`
> `npx vitest run src/lib/creatorLocationFilter.test.ts` **from** `C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2`.
> Note `npm run test` exits 1 due to ~pre-existing Playwright e2e file failures in nested worktrees — trust the "Tests N passed" line for our file, not the exit code.

---

## Task 1: Pure location-filter module (`creatorLocationFilter.ts`) — TDD

**Files:**
- Create: `src/lib/creatorLocationFilter.ts`
- Test: `src/lib/creatorLocationFilter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/creatorLocationFilter.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import {
  detectQueryKind,
  resolveCreatorCoords,
  filterByRadius,
  sortNearest,
} from './creatorLocationFilter';
import { lookupCityCoords } from './geoUtils';

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };

describe('detectQueryKind', () => {
  test('5-digit string is a zip', () => {
    expect(detectQueryKind('10001')).toBe('zip');
  });
  test('zip+4 is a zip', () => {
    expect(detectQueryKind('10001-1234')).toBe('zip');
  });
  test('trims whitespace before testing', () => {
    expect(detectQueryKind('  07030 ')).toBe('zip');
  });
  test('a place name is a city', () => {
    expect(detectQueryKind('Hoboken')).toBe('city');
    expect(detectQueryKind('New York')).toBe('city');
  });
  test('non-5-digit numbers are treated as city', () => {
    expect(detectQueryKind('123')).toBe('city');
  });
});

describe('resolveCreatorCoords', () => {
  test('prefers static city coords over the geocoded map', () => {
    const nyStatic = lookupCityCoords('New York', 'US');
    expect(nyStatic).not.toBeNull(); // guard: table must contain New York
    const geocoded = new Map([['c1', LA]]);
    const coords = resolveCreatorCoords(
      { id: 'c1', city: 'New York', country: 'US' },
      geocoded,
    );
    expect(coords).toEqual(nyStatic);
  });
  test('falls back to the geocoded map when no static match', () => {
    const geocoded = new Map([['c1', LA]]);
    const coords = resolveCreatorCoords({ id: 'c1', city: 'Nowheresville', country: 'US' }, geocoded);
    expect(coords).toEqual(LA);
  });
  test('returns null when neither static nor geocoded coords exist', () => {
    expect(resolveCreatorCoords({ id: 'c1' }, new Map())).toBeNull();
  });
});

describe('filterByRadius', () => {
  const creators = [
    { id: 'near', city: 'Nowhere', country: 'US' }, // placed via geocoded map = NYC
    { id: 'far', city: 'Nowhere', country: 'US' },   // placed via geocoded map = LA
    { id: 'lost' },                                   // unplaceable
  ];
  const geocoded = new Map([
    ['near', NYC],
    ['far', LA],
  ]);

  test('keeps only creators within the radius and annotates distanceMiles', () => {
    const { list, unplaceableCount } = filterByRadius(creators, NYC, 25, geocoded);
    expect(list.map(c => c.id)).toEqual(['near']);
    expect(list[0].distanceMiles).toBe(0);
    expect(unplaceableCount).toBe(1); // 'lost' couldn't be placed
  });

  test('a larger radius includes the far creator', () => {
    const { list } = filterByRadius(creators, NYC, 3000, geocoded);
    expect(list.map(c => c.id).sort()).toEqual(['far', 'near']);
  });

  test('null radius (Any) keeps everyone and still annotates distance when placeable', () => {
    const { list, unplaceableCount } = filterByRadius(creators, NYC, null, geocoded);
    expect(list.map(c => c.id)).toEqual(['near', 'far', 'lost']);
    expect(list.find(c => c.id === 'near')?.distanceMiles).toBe(0);
    expect(list.find(c => c.id === 'lost')?.distanceMiles).toBeUndefined();
    expect(unplaceableCount).toBe(0); // nothing dropped under "Any"
  });

  test('null center keeps everyone with no distances', () => {
    const { list, unplaceableCount } = filterByRadius(creators, null, 25, geocoded);
    expect(list).toHaveLength(3);
    expect(list.every(c => c.distanceMiles === undefined)).toBe(true);
    expect(unplaceableCount).toBe(0);
  });
});

describe('sortNearest', () => {
  test('orders by ascending distance, undefined last', () => {
    const input = [
      { id: 'a', distanceMiles: 10 },
      { id: 'b', distanceMiles: undefined },
      { id: 'c', distanceMiles: 2 },
    ];
    expect(sortNearest(input).map(c => c.id)).toEqual(['c', 'a', 'b']);
  });
  test('does not mutate the input array', () => {
    const input = [{ id: 'a', distanceMiles: 5 }, { id: 'b', distanceMiles: 1 }];
    sortNearest(input);
    expect(input.map(c => c.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from the worktree): `npx vitest run src/lib/creatorLocationFilter.test.ts`
Expected: FAIL — "Failed to resolve import './creatorLocationFilter'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/creatorLocationFilter.ts`:

```ts
import { haversineDistance, lookupCityCoords } from './geoUtils';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationCenter extends LatLng {
  label: string;
}

export type LocationMode = 'near_me' | 'custom' | 'any';

/** The location filter model owned by useCreatorBrowse and rendered by CreatorLocationControl. */
export interface LocationFilter {
  mode: LocationMode;
  /** Resolved active center (business profile or geocoded query); null while unresolved. */
  center: LocationCenter | null;
  /** Radius in miles; null means "Any" (no distance filter). */
  radiusMiles: number | null;
  /** The typed city/zip for custom mode. */
  rawQuery: string;
  /** Geocode status for the custom query. */
  status: 'idle' | 'resolving' | 'failed';
}

export const DEFAULT_LOCATION_FILTER: LocationFilter = {
  mode: 'near_me',
  center: null,
  radiusMiles: 25,
  rawQuery: '',
  status: 'idle',
};

export const RADIUS_OPTIONS: number[] = [10, 25, 50, 100];

/** A 5-digit or zip+4 string is a zip; anything else is treated as a city name. */
export function detectQueryKind(raw: string): 'zip' | 'city' {
  return /^\d{5}(-\d{4})?$/.test(raw.trim()) ? 'zip' : 'city';
}

/** Static US-city coords first (instant, free); otherwise the Google-geocoded map; else null. */
export function resolveCreatorCoords(
  creator: { id: string; city?: string; country?: string },
  geocodedById: Map<string, LatLng>,
): LatLng | null {
  const staticCoords =
    creator.city && creator.country ? lookupCityCoords(creator.city, creator.country) : null;
  if (staticCoords) return staticCoords;
  return geocodedById.get(creator.id) ?? null;
}

export interface WithDistance {
  distanceMiles?: number;
}

/**
 * Annotate creators with distanceMiles from `center`. When `center` and a finite `radiusMiles`
 * are both set, keep only creators within the radius and report how many couldn't be placed.
 * Under "Any" (radiusMiles null) or no center, keep everyone (distances annotated when placeable).
 */
export function filterByRadius<T extends { id: string; city?: string; country?: string }>(
  creators: T[],
  center: LatLng | null,
  radiusMiles: number | null,
  geocodedById: Map<string, LatLng>,
): { list: (T & WithDistance)[]; unplaceableCount: number } {
  if (!center) {
    return { list: creators.map(c => ({ ...c })), unplaceableCount: 0 };
  }

  const annotate = (c: T): T & WithDistance => {
    const coords = resolveCreatorCoords(c, geocodedById);
    return coords
      ? { ...c, distanceMiles: haversineDistance(center.lat, center.lng, coords.lat, coords.lng) }
      : { ...c };
  };

  if (radiusMiles == null) {
    return { list: creators.map(annotate), unplaceableCount: 0 };
  }

  let unplaceableCount = 0;
  const list: (T & WithDistance)[] = [];
  for (const c of creators) {
    const annotated = annotate(c);
    if (annotated.distanceMiles === undefined) {
      unplaceableCount++;
      continue;
    }
    if (annotated.distanceMiles <= radiusMiles) list.push(annotated);
  }
  return { list, unplaceableCount };
}

/** Ascending by distance; creators without a distance sort last. Non-mutating. */
export function sortNearest<T extends WithDistance>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creatorLocationFilter.test.ts`
Expected: PASS — all cases green. (If the "New York" guard fails, the static table lacks that key; pick another confirmed city from `src/lib/usCityCoords.ts`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/creatorLocationFilter.ts src/lib/creatorLocationFilter.test.ts
git commit -m "feat(find-creators): pure location/radius filter helpers + tests"
```

---

## Task 2: Default-center hook (`useBusinessLocationCenter`)

**Files:**
- Create: `src/hooks/useBusinessLocationCenter.ts`

No unit test (thin data hook; geocoding is external — covered by manual verification in Task 7 and the pure tests in Task 1). Follows the existing `useRestaurantProfile.ts` query pattern.

- [ ] **Step 1: Write the implementation**

Create `src/hooks/useBusinessLocationCenter.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { geocodingService } from '@/lib/geocoding';
import { lookupCityCoords } from '@/lib/geoUtils';
import type { LocationCenter } from '@/lib/creatorLocationFilter';

/**
 * Resolves the restaurant's saved location into a map center for the "near me" default.
 * Static US-city coords first (free/instant), else Google geocoding. Returns null when the
 * business has no usable city/postal_code (control then prompts "Set your area").
 */
export const useBusinessLocationCenter = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['business-location-center', user?.id],
    queryFn: async (): Promise<LocationCenter | null> => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('business_name, city, postal_code, country, location')
        .eq('user_id', user!.id)
        .eq('account_type', 'restaurant')
        .maybeSingle();

      if (error) {
        console.error('Error loading business location:', error);
        return null;
      }
      if (!data) return null;

      const { city, postal_code, country, business_name } = data;
      if (!city && !postal_code) return null; // nothing to geocode

      const staticCoords = city && country ? lookupCityCoords(city, country) : null;
      const coords =
        staticCoords ??
        (await geocodingService.geocodeLocation(
          postal_code ?? undefined,
          city ?? undefined,
          country ?? undefined,
        ));
      if (!coords) return null;

      return { lat: coords.lat, lng: coords.lng, label: business_name || city || 'your area' };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  return { center: data ?? null, isLoading };
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build` (worktree cwd). Expected: build succeeds (hook not yet consumed — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBusinessLocationCenter.ts
git commit -m "feat(find-creators): useBusinessLocationCenter default-center hook"
```

---

## Task 3: Wire the location model into `useCreatorBrowse` (additive)

**Files:**
- Modify: `src/hooks/useCreatorBrowse.ts`

Adds the `location` model, effects, radius filtering, nearest sort, and `'nearest'` sort option — **without removing** the legacy `city/country/postal_code` fields yet (removed in Task 6). No new test file (behavior is covered by Task 1's pure tests + manual). Integration task — read the whole file first.

- [ ] **Step 1: Add `'nearest'` to the SortOption type**

In `src/hooks/useCreatorBrowse.ts:34`, change:
```ts
export type SortOption = 'relevance' | 'top-rated' | 'price-low' | 'price-high' | 'most-reviewed';
```
to:
```ts
export type SortOption = 'relevance' | 'nearest' | 'top-rated' | 'price-low' | 'price-high' | 'most-reviewed';
```

- [ ] **Step 2: Add `distanceMiles` to the CreatorProfile interface**

In the `CreatorProfile` interface (`:7-32`), add after `total_reviews?: number;`:
```ts
  distanceMiles?: number; // annotated client-side by the location filter
```

- [ ] **Step 3: Add imports + the location model to the hook**

At the top of the file add:
```ts
import { useBusinessLocationCenter } from '@/hooks/useBusinessLocationCenter';
import { useCreatorGeocoding } from '@/hooks/useCreatorGeocoding';
import { lookupCityCoords } from '@/lib/geoUtils';
import {
  DEFAULT_LOCATION_FILTER,
  filterByRadius,
  sortNearest,
  type LocationFilter,
  type LatLng,
} from '@/lib/creatorLocationFilter';
```

Add `location` to the `CreatorFilters` interface (keep the legacy fields for now):
```ts
  location: LocationFilter;
```
Add `location: DEFAULT_LOCATION_FILTER` to BOTH the initial `useState` object (`:52`) and the `resetFilters` object (`:102`).

- [ ] **Step 4: Add the default-center + custom-geocode effects**

Inside `useCreatorBrowse`, after the `debouncedFilters` effect, add:
```ts
  const { center: businessCenter } = useBusinessLocationCenter();

  // Keep the near-me center synced from the business profile.
  React.useEffect(() => {
    setFilters(prev => {
      if (prev.location.mode !== 'near_me') return prev;
      if (prev.location.center === businessCenter) return prev;
      return { ...prev, location: { ...prev.location, center: businessCenter } };
    });
  }, [businessCenter]);

  // Resolve a typed city/zip into a center (debounced) when in custom mode.
  React.useEffect(() => {
    const { mode, rawQuery } = filters.location;
    if (mode !== 'custom') return;
    const q = rawQuery.trim();
    if (q.length < 3) return;

    let cancelled = false;
    setFilters(prev => ({ ...prev, location: { ...prev.location, status: 'resolving' } }));
    const timer = setTimeout(async () => {
      const result = await geocodingService.geocodeLocation(q);
      if (cancelled) return;
      setFilters(prev => {
        if (prev.location.mode !== 'custom') return prev;
        return result
          ? { ...prev, location: { ...prev.location, center: { lat: result.lat, lng: result.lng, label: q }, status: 'idle' } }
          : { ...prev, location: { ...prev.location, center: null, status: 'failed' } };
      });
    }, 500);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters.location.mode, filters.location.rawQuery]);
```
(Requires `import { geocodingService } from '@/lib/geocoding';` — add it.)

- [ ] **Step 5: Add an `updateLocation` setter (with auto-nearest sort)**

After `handleFilterChange`, add:
```ts
  const updateLocation = useCallback((patch: Partial<LocationFilter>) => {
    setFilters(prev => ({ ...prev, location: { ...prev.location, ...patch } }));
    // When the user actively sets/changes location, default the sort to Nearest (reversible).
    if (patch.mode === 'custom' || patch.radiusMiles !== undefined) {
      setSortBy(prev => (prev === 'relevance' ? 'nearest' : prev));
    }
  }, []);
```

- [ ] **Step 6: Lazily geocode only the creators a radius search needs**

Before the `filteredCreators` memo, add:
```ts
  const activeCenter: LatLng | null = filters.location.center;

  const creatorsNeedingGeocode = useMemo(() => {
    if (!activeCenter) return [];
    return creators
      .filter(c => !(c.city && c.country && lookupCityCoords(c.city, c.country)))
      .map(c => ({ id: c.id, postal_code: c.postal_code, city: c.city, country: c.country }));
  }, [creators, activeCenter]);

  const { geocodedCreators } = useCreatorGeocoding(creatorsNeedingGeocode);

  const geocodedById = useMemo(
    () => new Map(geocodedCreators.map(g => [g.id, { lat: g.lat, lng: g.lng }])),
    [geocodedCreators],
  );
```

- [ ] **Step 7: Apply the radius filter + nearest sort in the memo**

Change the `filteredCreators` memo so it returns both the list and the unplaceable count. Rename it and destructure:

Replace `const filteredCreators = useMemo(() => {` with `const { filteredCreators, locationUnplaceableCount } = useMemo(() => {`.

Inside, after the existing `.filter(...)` produces `result` (the search/skills/rate/etc. pass — leave those matchers as-is for now; the legacy `matchesPostalCode/City/Country` still run harmlessly until Task 6), and BEFORE the sort block, add:
```ts
    // Location radius filter
    let unplaceable = 0;
    if (activeCenter) {
      const { list, unplaceableCount } = filterByRadius(
        result,
        activeCenter,
        filters.location.radiusMiles,
        geocodedById,
      );
      result = list;
      unplaceable = unplaceableCount;
    }
```
Change the sort block so `'nearest'` is handled and the memo returns the object:
```ts
    // Sort
    if (sortBy === 'nearest') {
      result = sortNearest(result);
    } else if (sortBy !== 'relevance') {
      result = [...result].sort((a, b) => {
        switch (sortBy) {
          case 'top-rated':
            return (b.average_rating ?? -1) - (a.average_rating ?? -1);
          case 'price-low':
            return (a.base_rate_per_hour ?? Infinity) - (b.base_rate_per_hour ?? Infinity);
          case 'price-high':
            return (b.base_rate_per_hour ?? -Infinity) - (a.base_rate_per_hour ?? -Infinity);
          case 'most-reviewed':
            return (b.total_reviews ?? -1) - (a.total_reviews ?? -1);
          default:
            return 0;
        }
      });
    }

    return { filteredCreators: result, locationUnplaceableCount: unplaceable };
```
Add `activeCenter`, `filters.location.radiusMiles`, and `geocodedById` to the memo dependency array.

- [ ] **Step 8: Export the new values**

In the hook's return object add:
```ts
    location: filters.location,
    updateLocation,
    locationUnplaceableCount,
    hasBusinessLocation: businessCenter != null,
```

- [ ] **Step 9: Build + typecheck**

Run: `npm run build` and `npm run typecheck` (worktree cwd). Expected: both pass. Re-run the Task 1 test to confirm no regression: `npx vitest run src/lib/creatorLocationFilter.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useCreatorBrowse.ts
git commit -m "feat(find-creators): location/radius model + distance filter in useCreatorBrowse"
```

---

## Task 4: `CreatorLocationControl` component + header wiring

**Files:**
- Create: `src/components/creator-browse/CreatorLocationControl.tsx`
- Modify: `src/components/creator-browse/CreatorBrowseHeader.tsx`
- Modify: `src/pages/CreatorBrowse.tsx` (thread location props to the header)

- [ ] **Step 1: Create the control**

Create `src/components/creator-browse/CreatorLocationControl.tsx`:

```tsx
import React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { RADIUS_OPTIONS, type LocationFilter } from '@/lib/creatorLocationFilter';

interface CreatorLocationControlProps {
  location: LocationFilter;
  onChange: (patch: Partial<LocationFilter>) => void;
  hasBusinessLocation: boolean;
}

const chipBase =
  'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border';
const chipOn = 'bg-teal-400 text-white border-teal-400';
const chipOff = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';

function buttonLabel(location: LocationFilter, hasBusinessLocation: boolean): string {
  const radius = location.radiusMiles != null ? ` · ${location.radiusMiles} mi` : ' · Any';
  if (location.mode === 'custom') {
    return `${location.center?.label ?? location.rawQuery ?? 'Another area'}${radius}`;
  }
  // near_me
  if (!hasBusinessLocation || !location.center) return 'Set your area';
  return `Near ${location.center.label}${radius}`;
}

const Body: React.FC<CreatorLocationControlProps> = ({ location, onChange, hasBusinessLocation }) => (
  <div className="space-y-4">
    {/* Segment toggle */}
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!hasBusinessLocation}
        onClick={() => onChange({ mode: 'near_me', rawQuery: '', status: 'idle' })}
        className={`${chipBase} ${location.mode === 'near_me' ? chipOn : chipOff} ${!hasBusinessLocation ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        Near my restaurant
      </button>
      <button
        type="button"
        onClick={() => onChange({ mode: 'custom' })}
        className={`${chipBase} ${location.mode === 'custom' ? chipOn : chipOff}`}
      >
        Another area
      </button>
    </div>

    {!hasBusinessLocation && location.mode === 'near_me' && (
      <p className="text-xs text-gray-500">
        Add your address in Business Settings to use “near me,” or search another area below.
      </p>
    )}

    {/* Custom city/zip input */}
    {location.mode === 'custom' && (
      <div className="relative">
        <Input
          placeholder="City or ZIP (e.g. Hoboken, 07030)"
          value={location.rawQuery}
          onChange={(e) => onChange({ rawQuery: e.target.value })}
        />
        {location.status === 'resolving' && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
        {location.status === 'failed' && (
          <p className="text-xs text-pink-600 mt-1">Couldn’t find that place — try a nearby city or ZIP.</p>
        )}
      </div>
    )}

    {/* Radius chips */}
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2">Distance</p>
      <div className="flex flex-wrap gap-2">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange({ radiusMiles: r })}
            className={`${chipBase} ${location.radiusMiles === r ? chipOn : chipOff}`}
          >
            {r} mi
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange({ radiusMiles: null })}
          className={`${chipBase} ${location.radiusMiles == null ? chipOn : chipOff}`}
        >
          Any
        </button>
      </div>
    </div>
  </div>
);

export const CreatorLocationControl: React.FC<CreatorLocationControlProps> = (props) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const label = buttonLabel(props.location, props.hasBusinessLocation);

  const trigger = (
    <button
      type="button"
      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-teal-400 bg-white text-gray-900 hover:bg-teal-50 transition-colors"
    >
      <MapPin className="h-4 w-4 text-teal-500" />
      <span className="truncate max-w-[220px]">{label}</span>
      <span className="text-xs">▾</span>
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Location</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <Body {...props} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <Body {...props} />
      </PopoverContent>
    </Popover>
  );
};
```

> Confirm the mobile hook export name: `grep -n "export" src/hooks/use-mobile.tsx` — if it exports `useIsMobile` (shadcn default), the import above is correct; adjust if it differs.

- [ ] **Step 2: Mount the control in the header**

In `src/components/creator-browse/CreatorBrowseHeader.tsx`:

Add `'nearest'` to `SORT_OPTIONS` (`:10-16`) right after the relevance entry:
```ts
  { value: 'relevance', label: 'Relevance' },
  { value: 'nearest', label: 'Nearest first' },
```

Add imports:
```ts
import { CreatorLocationControl } from './CreatorLocationControl';
import type { LocationFilter } from '@/lib/creatorLocationFilter';
```

Add to `CreatorBrowseHeaderProps`:
```ts
  location: LocationFilter;
  onLocationChange: (patch: Partial<LocationFilter>) => void;
  hasBusinessLocation: boolean;
```
Destructure them in the component signature, and render the control between the Search Bar block (`:76-85`) and the Content-Type Pills block (`:87`):
```tsx
      {/* Location + Radius */}
      <CreatorLocationControl
        location={location}
        onChange={onLocationChange}
        hasBusinessLocation={hasBusinessLocation}
      />
```

- [ ] **Step 3: Thread props from the page**

In `src/pages/CreatorBrowse.tsx`, pull the new values from the hook (`:10-22`):
```ts
    location,
    updateLocation,
    hasBusinessLocation,
    locationUnplaceableCount,
```
and pass to `<CreatorBrowseHeader .../>` (`:44-55`):
```tsx
            location={location}
            onLocationChange={updateLocation}
            hasBusinessLocation={hasBusinessLocation}
```

- [ ] **Step 4: Build + eyeball**

Run: `npm run build` (worktree). Expected: pass. Run `npm run dev`, open `/dashboard/business/creators` as a restaurant, confirm the pill renders and the popover/sheet opens (desktop + a mobile viewport).

- [ ] **Step 5: Commit**

```bash
git add src/components/creator-browse/CreatorLocationControl.tsx src/components/creator-browse/CreatorBrowseHeader.tsx src/pages/CreatorBrowse.tsx
git commit -m "feat(find-creators): location control on the header + Nearest-first sort"
```

---

## Task 5: Show "· X mi away" on the creator card

**Files:**
- Modify: `src/components/creator-browse/CreatorCard.tsx`

- [ ] **Step 1: Update the location line**

In `CreatorCard.tsx`, change the location block (`:161-164`):
```tsx
          {/* Location */}
          {locationStr && (
            <p className="text-xs text-gray-500 mb-1.5 truncate">📍 {locationStr}</p>
          )}
```
to:
```tsx
          {/* Location */}
          {(locationStr || creator.distanceMiles != null) && (
            <p className="text-xs text-gray-500 mb-1.5 truncate">
              📍 {locationStr}
              {creator.distanceMiles != null && (
                <span className="text-teal-600 font-medium">
                  {locationStr ? ' · ' : ''}{creator.distanceMiles} mi away
                </span>
              )}
            </p>
          )}
```

- [ ] **Step 2: Build + eyeball**

Run: `npm run build`. Expected: pass. In dev, set a radius and confirm cards show "· N mi away".

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-browse/CreatorCard.tsx
git commit -m "feat(find-creators): show distance on creator cards"
```

---

## Task 6: Consolidation — remove legacy location filters + rewire map/count/empty-state

**Files:**
- Modify: `src/components/creator-search/AdvancedCreatorFilters.tsx`
- Modify: `src/hooks/useCreatorBrowse.ts`
- Modify: `src/pages/CreatorBrowse.tsx`
- Modify: `src/components/creator-browse/CreatorMapView.tsx`
- Modify: `src/components/creator-browse/CreatorBrowseContent.tsx`

This is the red→green task: removing the legacy fields breaks their consumers, all fixed here.

- [ ] **Step 1: Strip location UI from AdvancedCreatorFilters**

In `src/components/creator-search/AdvancedCreatorFilters.tsx`:
- Delete the postal auto-fill machinery: the `isLookingUp`/`lastLookedUpPostalRef`/`userEditedCityRef` state (`:45-47`), both `useEffect`s (`:50-94`), and the `geocodingService` import (`:18`) and `Loader2` if now unused.
- Delete the entire **Location** block from the JSX (`:125-186`, the `<div className="space-y-6">`'s first child through its closing `</div>` before `<Separator />`), plus that first `<Separator />` (`:188`).
- Remove `city`, `country`, `postal_code`, `_isLocationAutoFilled` from the local `CreatorFilters` interface (`:20-32`).
- Remove now-unused imports (`MapPin`, `Loader2`, `Input` if no longer referenced — check the file after deletion).

- [ ] **Step 2: Remove legacy fields + matchers from useCreatorBrowse**

In `src/hooks/useCreatorBrowse.ts`:
- Remove `city`, `country`, `postal_code`, `_isLocationAutoFilled` from the `CreatorFilters` interface and from the initial state + `resetFilters` objects.
- Delete the legacy location matchers in the filter memo (`isPostalCodeSearch`, `matchesPostalCode`, `matchesCity`, `matchesCountry` — old `:133-163`) and remove them from the final `return matchesSearch && … ` boolean.
- If `debouncedFilters` is now referenced only by the map, keep it (still passed as `mapFilters`); it no longer affects the grid.

- [ ] **Step 3: Fix activeFilterCount (drop legacy fields; location has its own control)**

In `src/pages/CreatorBrowse.tsx` (`:28-37`), replace the array with:
```ts
  const activeFilterCount = [
    filters.skills.length > 0,
    filters.platforms.length > 0,
    filters.availability,
    filters.experienceLevel,
    filters.minRate > 0 || filters.maxRate < 500,
  ].filter(Boolean).length;
```
(Location is a visible control now, not part of the Filters-sheet badge.)

- [ ] **Step 4: Re-center the map on the resolved center**

In `src/components/creator-browse/CreatorMapView.tsx`, replace the centering effect body (`:65-124`) so it uses the already-resolved `filters.location.center` instead of geocoding postal/city/country. Replace the `f`/`hasLocation`/`geocodeLocation` logic with:
```ts
  useEffect(() => {
    if (!map) return;
    const timeoutId = setTimeout(() => {
      const center = filters.location.center;
      const fitAllMarkers = (points: Array<{ lat: number; lng: number }>) => {
        if (points.length === 0) return;
        const bounds = new google.maps.LatLngBounds();
        points.forEach(p => bounds.extend(p));
        map.fitBounds(bounds);
        google.maps.event.addListenerOnce(map, 'idle', () => {
          const currentZoom = map.getZoom() ?? 12;
          const clampedZoom = Math.min(currentZoom, 12);
          const c = map.getCenter()?.toJSON() ?? DEFAULT_MAP_CENTER;
          setMapCenter(c);
          setMapZoom(clampedZoom);
          if (currentZoom > 12) map.setZoom(12);
        });
      };

      if (center) {
        const radius = filters.location.radiusMiles;
        const zoom = radius == null ? 9 : radius <= 10 ? 12 : radius <= 25 ? 11 : radius <= 50 ? 10 : 9;
        map.setCenter({ lat: center.lat, lng: center.lng });
        map.setZoom(zoom);
        setMapCenter({ lat: center.lat, lng: center.lng });
        setMapZoom(zoom);
        return;
      }

      if (geocodedCreators.length > 0) {
        fitAllMarkers(geocodedCreators.map(c => ({ lat: c.lat, lng: c.lng })));
      } else {
        map.setCenter(DEFAULT_MAP_CENTER);
        map.setZoom(DEFAULT_MAP_ZOOM);
        setMapCenter(DEFAULT_MAP_CENTER);
        setMapZoom(DEFAULT_MAP_ZOOM);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [filters, map, geocodedCreators]);
```
Remove the now-unused `geocodingService` import if nothing else uses it.

- [ ] **Step 5: Empty-state "widen" nudge + unplaceable note in the content**

In `src/components/creator-browse/CreatorBrowseContent.tsx`:
- Add props to `CreatorBrowseContentProps`:
```ts
  locationUnplaceableCount?: number;
  onWidenLocation?: () => void;
  isLocationFiltered?: boolean;
```
- In the empty state (`:64-77`), when `isLocationFiltered`, show the widen action in addition to Clear All Filters:
```tsx
          {isLocationFiltered && onWidenLocation && (
            <button
              onClick={onWidenLocation}
              className="mb-3 px-6 py-2.5 bg-dc-teal text-dc-text rounded-full font-semibold text-sm hover:bg-teal-500 transition-colors"
            >
              Widen to Any location
            </button>
          )}
```
- Above the grid (inside the non-empty branch, before the grid `<div>` at `:80`), add the subtle count:
```tsx
          {locationUnplaceableCount ? (
            <p className="text-xs text-gray-400 mb-2">
              {locationUnplaceableCount} creator{locationUnplaceableCount !== 1 ? 's' : ''} couldn’t be placed on the map.
            </p>
          ) : null}
```
- In `src/pages/CreatorBrowse.tsx`, pass the new props to `<CreatorBrowseContent .../>`:
```tsx
            locationUnplaceableCount={locationUnplaceableCount}
            isLocationFiltered={location.center != null && location.radiusMiles != null}
            onWidenLocation={() => updateLocation({ radiusMiles: null })}
```

- [ ] **Step 6: Build, typecheck, lint, test**

Run (worktree cwd):
- `npm run build` — Expected: PASS (all legacy references resolved).
- `npm run typecheck` — Expected: PASS.
- `npm run lint` — Expected: no new errors (fix any unused-import warnings introduced by deletions).
- `npx vitest run src/lib/creatorLocationFilter.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(find-creators): consolidate legacy location filters into the location control"
```

---

## Task 7: Manual verification, review, finish

- [ ] **Step 1: Manual QA (both viewports)** — `npm run dev`, `/dashboard/business/creators` as a restaurant:
  - Default loads "Near {business}" · 25 mi, grid distance-filtered, cards show "· N mi away", sort shows Nearest first.
  - "Another area" → type a ZIP and a city → grid re-centers; bad input shows the "couldn't find" hint.
  - Radius chips change results; "Any" clears the radius.
  - A radius yielding 0 results shows "Widen to Any location"; tapping it recovers.
  - "N couldn't be placed" note appears when some creators lack location.
  - Map button: map centers on the chosen location.
  - Advanced Filters sheet no longer has Zip/City/Country; its other filters still work; Filters badge count is correct.
  - Test a restaurant account with **no** saved location → control shows "Set your area"; typing a place works.
  - Verify desktop (Popover) and a mobile viewport (bottom Sheet).

- [ ] **Step 2: Codex second review (required)** — use the `codex-review` skill:
  ```bash
  codex review --base main --title "Find Creators near-me location search"
  ```
  Fix any real findings, re-run until clean, relay the verdict.

- [ ] **Step 3: Knowledge sync** — per CLAUDE.md branch-finish rule, run the `knowledge-sync` skill: write `docs/wiki/raw/sessions/2026-07-07-find-creators-location-search.md`, `/wiki-ops ingest` it, refresh `PROJECT_CONTEXT.md` (Active Workstreams) — no schema/design/workflow change, so DATABASE_SCHEMA/DESIGN_SYSTEM/CLAUDE.md untouched. Include the wiki/doc changes in the PR.

- [ ] **Step 4: Finish the branch** — use `superpowers:finishing-a-development-branch`: verify tests, then push and open a PR (option 2). This is frontend-only (no schema, no edge function), so no MCP/CLI deploy; Lovable deploys the frontend on merge. After merge, run `verify-prod` (both viewports, console errors) and the RAG sync step of `knowledge-sync`.

---

## Notes / guardrails

- **DRY/YAGNI:** distance logic lives once in `creatorLocationFilter.ts`; County, server-side lat/lng, and state search are out of scope (see spec §9).
- **Design system:** the location pill is brand-accented (teal border, teal pin); radius chips are teal when selected — consistent with the content-type pills. Match existing header-control spacing. Mobile = base classes, desktop = the responsive Popover/Sheet split via `useIsMobile`.
- **Never touch auth logic**; no RLS/schema/edge-function change in this plan.
- **Progressive placement:** creators needing Google geocoding appear as their coords resolve (static-city creators appear immediately). This is expected; the "couldn't be placed" count reflects the current frame.
