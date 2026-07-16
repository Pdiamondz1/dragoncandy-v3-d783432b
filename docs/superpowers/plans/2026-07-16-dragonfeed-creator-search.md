# DragonFeed — Instagram-style Creator Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a business/creator types a creator name and/or a ZIP-or-city in the Dragon Feed, replace the media grid with an Instagram-style vertical creator list (avatar + matched name + location · ★rating · posts + skills), tappable to the creator's profile; an empty search returns the existing browse feed. Global by default; a location query narrows by radius.

**Architecture:** `DragonFeedGrid` owns all control state (`searchTerm`, `typeFilter`, `locationQuery`, `radiusMiles`, `viewerIndex`) and calls every hook unconditionally at the top; only the *rendered tree* branches on `searchActive`. A pure, unit-tested `feedCreators.ts` groups the feed's media into a creator list, highlights name matches, and radius-filters creators (reusing the existing `filterByRadius` + geocoding stack from PR #242). A controlled `useFeedCreatorSearch` hook wraps that pure filter with the name filter, a debounced geocode of the typed location (ZIP or city), and lazy creator geocoding. The PR #242 media-zip-filter (`useFeedLocationFilter` + `filterMediaByRadius`) is deleted as superseded.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` tokens), shadcn/ui, `@tanstack/react-query`, Vitest. Frontend-only — no backend/RPC/RLS/schema change.

**Spec:** `docs/superpowers/specs/2026-07-16-dragonfeed-creator-search-design.md`

---

## File Structure

**Modified**
- `src/hooks/useUniqueCreatorPortfolio.ts` — add `skills, average_rating, total_reviews` to the select and to `PortfolioMedia` (Task 1).
- `src/components/dragon-feed/DragonFeedGrid.tsx` — own all control state, remove `useFeedLocationFilter`, add the browse/search mode switch, `browseAllHref` prop (Task 5).
- `src/pages/BusinessDragonFeed.tsx` — pass `browseAllHref="/dashboard/business/creators"` (Task 6).
- `src/lib/creatorLocationFilter.ts` — remove `filterMediaByRadius` (Task 7).
- `src/lib/creatorLocationFilter.test.ts` — remove the `filterMediaByRadius` describe block + its import (Task 7).

**New**
- `src/lib/feedCreators.ts` (+ `src/lib/feedCreators.test.ts`) — `FeedCreator`, `feedCreatorsFromMedia`, `highlightMatch`, `filterCreatorsByRadius` (Task 2).
- `src/hooks/useFeedCreatorSearch.ts` — controlled name + location creator search (Task 3).
- `src/components/dragon-feed/FeedCreatorRow.tsx` (Task 4), `src/components/dragon-feed/FeedCreatorList.tsx` (Task 4).

**Deleted**
- `src/hooks/useFeedLocationFilter.ts` — superseded by the creator search (Task 5).

**Unchanged (do NOT touch)**
- `src/components/dragon-feed/FeedTile.tsx`, `FeedPost.tsx`, `FeedViewer.tsx`, `src/hooks/useCreatorGeocoding.ts`, `src/lib/geocoding.ts`, `src/pages/CreatorDragonFeed.tsx` (renders `<DragonFeedGrid />` with no prop → no browse-all link).

**Dependency order:** Task 1 (data) → Task 2 (pure lib, TDD) → Task 3 (hook, uses Task 2) → Task 4 (components, use Task 2) → Task 5 (grid wiring, uses 2/3/4 + deletes `useFeedLocationFilter`) → Task 6 (page prop) → Task 7 (delete now-dead `filterMediaByRadius`). Task 7 must be last so the deletion happens only after Task 5 removed the final importer.

---

### Task 1: Extend `useUniqueCreatorPortfolio` with creator-card fields

Add `skills`, `average_rating`, `total_reviews` (all real columns on `creator_profiles`, selected today by `useCreatorBrowse.ts:137`) to the feed query and denormalize them onto each media item. Additive — browse mode ignores them.

**Files:**
- Modify: `src/hooks/useUniqueCreatorPortfolio.ts`

- [ ] **Step 1: Add the three fields to the `PortfolioMedia` interface**

In `src/hooks/useUniqueCreatorPortfolio.ts`, after the `location?: string;` line (currently line 16), add:

```ts
  // Creator-card fields (for the Instagram-style creator search list):
  skills?: string[];
  averageRating?: number | null;
  totalReviews?: number | null;
```

- [ ] **Step 2: Add the columns to the Supabase select**

Change the `.select(...)` string (currently line 51) to include `skills, average_rating, total_reviews`:

```ts
          .select('id, user_id, creator_name, avatar_url, portfolio_urls, profile_slug, city, postal_code, country, location, skills, average_rating, total_reviews')
```

- [ ] **Step 3: Attach the fields in the flatMap return object**

In the `.map(async (url: string) => { ... return { ... } })` object (the block returning `id, url, type, creatorName, ...`), add these three keys alongside the existing `location:` key:

```ts
                skills: Array.isArray(creator.skills) ? (creator.skills as string[]) : undefined,
                averageRating: creator.average_rating ?? null,
                totalReviews: creator.total_reviews ?? null,
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS (no errors).
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUniqueCreatorPortfolio.ts
git commit -m "feat(dragonfeed): carry skills/rating/reviews onto feed media for creator search"
```

---

### Task 2: Pure `feedCreators.ts` — grouping, highlight, radius filter (TDD)

Create the tested pure core: group feed media into a per-creator list with a post count, highlight name matches, and radius-filter the creator list (delegating to the existing tested `filterByRadius`). This is the keystone unit — everything else is a thin wrapper.

**Files:**
- Create: `src/lib/feedCreators.ts`
- Test: `src/lib/feedCreators.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/feedCreators.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { feedCreatorsFromMedia, highlightMatch, filterCreatorsByRadius, type FeedCreator } from './feedCreators';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };

const mk = (over: Partial<PortfolioMedia>): PortfolioMedia => ({
  id: 'm', url: 'u', type: 'image', creatorName: 'C', creatorSlug: '', creatorId: 'c', ...over,
});

describe('feedCreatorsFromMedia', () => {
  test('one entry per creatorId; postCount counts that creator\'s media', () => {
    const media = [
      mk({ id: 'a1', creatorId: 'A', creatorName: 'Anna' }),
      mk({ id: 'a2', creatorId: 'A', creatorName: 'Anna' }),
      mk({ id: 'b1', creatorId: 'B', creatorName: 'Bob' }),
    ];
    const out = feedCreatorsFromMedia(media);
    expect(out.map(c => c.creatorId)).toEqual(['A', 'B']);
    expect(out.find(c => c.creatorId === 'A')?.postCount).toBe(2);
    expect(out.find(c => c.creatorId === 'B')?.postCount).toBe(1);
  });

  test('carries name/slug/avatar/location/skills/rating/reviews from the first-seen item', () => {
    const media = [mk({
      creatorId: 'A', creatorName: 'Anna', creatorSlug: 'anna', avatarUrl: 'av',
      city: 'Hoboken', country: 'US', postalCode: '07030', location: 'Hoboken, US',
      skills: ['Food', 'Reels'], averageRating: 4.9, totalReviews: 23,
    })];
    const [c] = feedCreatorsFromMedia(media);
    expect(c).toMatchObject({
      creatorName: 'Anna', creatorSlug: 'anna', avatarUrl: 'av', city: 'Hoboken',
      country: 'US', postalCode: '07030', location: 'Hoboken, US',
      skills: ['Food', 'Reels'], averageRating: 4.9, totalReviews: 23, postCount: 1,
    });
  });

  test('missing skills/rating/reviews default to [] / null', () => {
    const [c] = feedCreatorsFromMedia([mk({ creatorId: 'A' })]);
    expect(c.skills).toEqual([]);
    expect(c.averageRating).toBeNull();
    expect(c.totalReviews).toBeNull();
  });

  test('empty input → []', () => {
    expect(feedCreatorsFromMedia([])).toEqual([]);
  });
});

describe('highlightMatch', () => {
  test('splits around the case-insensitive term, preserving original case in the matched span', () => {
    const segs = highlightMatch('Anna Banana', 'ann');
    expect(segs.map(s => s.text).join('')).toBe('Anna Banana');
    expect(segs.filter(s => s.match).map(s => s.text)).toEqual(['Ann']);
  });

  test('no term → one plain segment', () => {
    expect(highlightMatch('Anna', '')).toEqual([{ text: 'Anna', match: false }]);
    expect(highlightMatch('Anna', '   ')).toEqual([{ text: 'Anna', match: false }]);
  });

  test('no match → one plain segment', () => {
    expect(highlightMatch('Anna', 'xyz')).toEqual([{ text: 'Anna', match: false }]);
  });

  test('highlights every occurrence', () => {
    const segs = highlightMatch('aXa', 'a');
    expect(segs).toEqual([
      { text: 'a', match: true },
      { text: 'X', match: false },
      { text: 'a', match: true },
    ]);
  });
});

describe('filterCreatorsByRadius', () => {
  const base: Omit<FeedCreator, 'creatorId' | 'city' | 'country'> = {
    creatorName: 'C', creatorSlug: '', skills: [], averageRating: null, totalReviews: null, postCount: 1,
  };
  const near: FeedCreator = { ...base, creatorId: 'near', city: 'Nowhere', country: 'US' };
  const far: FeedCreator = { ...base, creatorId: 'far', city: 'Nowhere', country: 'US' };
  const lost: FeedCreator = { ...base, creatorId: 'lost' };
  const creators = [near, far, lost];
  const geocoded = new Map([['near', NYC], ['far', LA]]);

  test('no center → passthrough (never silent-empty)', () => {
    expect(filterCreatorsByRadius(creators, null, 25, geocoded)).toHaveLength(3);
  });

  test('finite radius keeps in-range creators, drops far and unplaceable ones', () => {
    const out = filterCreatorsByRadius(creators, NYC, 25, geocoded);
    expect(out.map(c => c.creatorId)).toEqual(['near']);
  });

  test('a larger radius includes the far creator', () => {
    const out = filterCreatorsByRadius(creators, NYC, 3000, geocoded);
    expect(out.map(c => c.creatorId).sort()).toEqual(['far', 'near']);
  });

  test('"Any" radius (null) with a center keeps all creators', () => {
    expect(filterCreatorsByRadius(creators, NYC, null, geocoded)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/feedCreators.test.ts`
Expected: FAIL — `Cannot find module './feedCreators'` (file not created yet).

- [ ] **Step 3: Write `feedCreators.ts`**

Create `src/lib/feedCreators.ts`:

```ts
import { filterByRadius, type LatLng } from './creatorLocationFilter';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

/** A creator surfaced in the Dragon Feed search list (one per creatorId, with a post count). */
export interface FeedCreator {
  creatorId: string;
  creatorName: string;
  creatorSlug: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  location?: string;
  skills: string[];
  averageRating: number | null;
  totalReviews: number | null;
  postCount: number;
}

/**
 * Group the feed's media into a creator list. One entry per creatorId; `postCount` counts that
 * creator's media items. Per-creator fields are taken from the first-seen media item. Stable order
 * = first-seen (the feed's shuffle order). No sort in v1.
 */
export function feedCreatorsFromMedia(media: PortfolioMedia[]): FeedCreator[] {
  const map = new Map<string, FeedCreator>();
  for (const m of media) {
    const existing = map.get(m.creatorId);
    if (existing) {
      existing.postCount += 1;
      continue;
    }
    map.set(m.creatorId, {
      creatorId: m.creatorId,
      creatorName: m.creatorName,
      creatorSlug: m.creatorSlug,
      avatarUrl: m.avatarUrl,
      city: m.city,
      country: m.country,
      postalCode: m.postalCode,
      location: m.location,
      skills: m.skills ?? [],
      averageRating: m.averageRating ?? null,
      totalReviews: m.totalReviews ?? null,
      postCount: 1,
    });
  }
  return [...map.values()];
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Split `name` into segments around every case-insensitive occurrence of `term`, preserving the
 * original casing of the matched spans. No term (trimmed empty) or no match → a single plain
 * segment. Lets the creator row bold the matched letters (Instagram-style).
 */
export function highlightMatch(name: string, term: string): HighlightSegment[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [{ text: name, match: false }];
  const hay = name.toLowerCase();
  const segments: HighlightSegment[] = [];
  let i = 0;
  while (i < name.length) {
    const found = hay.indexOf(needle, i);
    if (found === -1) {
      segments.push({ text: name.slice(i), match: false });
      break;
    }
    if (found > i) segments.push({ text: name.slice(i, found), match: false });
    segments.push({ text: name.slice(found, found + needle.length), match: true });
    i = found + needle.length;
  }
  if (segments.length === 0) return [{ text: name, match: false }];
  return segments;
}

/**
 * Narrow a creator list to those within `radiusMiles` of `center`, reusing the tested per-creator
 * `filterByRadius`. Explicitly remaps each FeedCreator to the `{ id, city, country }` shape
 * `filterByRadius` expects (not a bare cast). `!center` → passthrough (the list never silent-empties
 * while a location is unresolved). Under "Any" (radiusMiles null) everyone is kept.
 */
export function filterCreatorsByRadius(
  creators: FeedCreator[],
  center: LatLng | null,
  radiusMiles: number | null,
  geocodedById: Map<string, LatLng>,
): FeedCreator[] {
  if (!center) return creators;
  const remapped = creators.map(c => ({ id: c.creatorId, city: c.city, country: c.country }));
  const { list } = filterByRadius(remapped, center, radiusMiles, geocodedById);
  const survivors = new Set(list.map(c => c.id));
  return creators.filter(c => survivors.has(c.creatorId));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/feedCreators.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feedCreators.ts src/lib/feedCreators.test.ts
git commit -m "feat(dragonfeed): pure feedCreators lib (group, highlight, radius filter) + tests"
```

---

### Task 3: `useFeedCreatorSearch` — controlled name + location search hook

A controlled hook (no location state of its own — `locationQuery`/`radiusMiles` come from `DragonFeedGrid`). Name filter is global; a debounced location query (ZIP or city, ≥3 chars) geocodes to a center; creators are lazily geocoded only under a finite radius; the pure `filterCreatorsByRadius` narrows the list. Mirrors the deleted `useFeedLocationFilter`'s proven internals, adapted to creators and to a zip-or-city gate.

**Files:**
- Create: `src/hooks/useFeedCreatorSearch.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useFeedCreatorSearch.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geocodingService } from '@/lib/geocoding';
import { useCreatorGeocoding } from '@/hooks/useCreatorGeocoding';
import { type LatLng } from '@/lib/creatorLocationFilter';
import { filterCreatorsByRadius, type FeedCreator } from '@/lib/feedCreators';

export interface FeedCreatorSearch {
  results: FeedCreator[];
  status: 'idle' | 'resolving' | 'failed'; // geocoding status of the typed location (zip or city)
  locationActive: boolean;                  // a resolved center is localizing the list
}

/**
 * Controlled creator search over the feed's creators. Name filter is global (any location); an
 * optional location query (ZIP or city name, ≥3 chars) is geocoded to a center and used to narrow
 * the list by radius. Geocoding is lazy — nothing hits the network until a ≥3-char location resolves
 * a center, and creators are only geocoded under a finite radius (never under "Any").
 */
export function useFeedCreatorSearch(
  creators: FeedCreator[],
  searchTerm: string,
  locationQuery: string,
  radiusMiles: number | null,
): FeedCreatorSearch {
  // 1) Name filter — global, first. No location restriction.
  const named = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return creators;
    return creators.filter(c => c.creatorName.toLowerCase().includes(t));
  }, [creators, searchTerm]);

  // 2) Debounce the location query (~400ms) so we don't geocode every keystroke.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(locationQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [locationQuery]);

  // A location query needs ≥3 chars to be a real place (ZIP or city) — NOT zip-only (D10).
  const validQuery = debounced.length >= 3;

  // 3) Geocode the typed location → center. geocodeLocation resolves a ZIP or a city string
  //    (single first arg = the place query), cached 24h and keyed on the debounced value.
  const { data: center, isLoading: centerLoading } = useQuery({
    queryKey: ['feed-location-center', debounced],
    queryFn: async (): Promise<LatLng | null> => {
      const r = await geocodingService.geocodeLocation(debounced);
      return r ? { lat: r.lat, lng: r.lng } : null;
    },
    enabled: validQuery,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const hasCenter = validQuery && !!center;

  // 4) Unique creators to geocode — mirror useCreatorBrowse: a creator with only a freeform
  //    `location` passes that string as postal_code so it still geocodes (and is placeable).
  const uniqueCreators = useMemo(() => {
    const map = new Map<string, { id: string; postal_code?: string; city?: string; country?: string }>();
    for (const c of named) {
      if (!map.has(c.creatorId)) {
        map.set(c.creatorId, {
          id: c.creatorId,
          postal_code: c.postalCode || (!c.city && !c.country ? c.location : undefined),
          city: c.city,
          country: c.country,
        });
      }
    }
    return [...map.values()];
  }, [named]);

  // Lazy: geocode creators only when a center is active AND a finite radius is set. Under "Any"
  // (radiusMiles null) filterByRadius keeps everyone regardless of coords, so geocoding would be
  // wasted Google-quota work. Pass [] to idle useCreatorGeocoding.
  const creatorsToGeocode = hasCenter && radiusMiles != null ? uniqueCreators : [];
  const { geocodedCreators, isLoading: geocodingLoading } = useCreatorGeocoding(creatorsToGeocode);

  const geocodedById = useMemo(
    () => new Map<string, LatLng>(geocodedCreators.map(g => [g.id, { lat: g.lat, lng: g.lng }])),
    [geocodedCreators],
  );

  // 5) Narrow by radius. No center → global (unfiltered). Center but creators still geocoding →
  //    don't transiently drop (pass null center). Else run the pure filter.
  const results = useMemo(
    () =>
      filterCreatorsByRadius(
        named,
        hasCenter && !geocodingLoading ? center ?? null : null,
        radiusMiles,
        geocodedById,
      ),
    [named, hasCenter, geocodingLoading, center, radiusMiles, geocodedById],
  );

  const status: FeedCreatorSearch['status'] = !validQuery
    ? 'idle'
    : centerLoading
      ? 'resolving'
      : !center
        ? 'failed'
        : geocodingLoading
          ? 'resolving'
          : 'idle';

  return { results, status, locationActive: hasCenter };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (The hook is exercised end-to-end by Task 5's wiring + the prod verify; its pure core — `filterCreatorsByRadius` — is unit-tested in Task 2, so there is no separate hook unit test here, matching PR #242's approach for `useFeedLocationFilter`.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS — no `react-hooks/rules-of-hooks` (all hooks are top-level), no unused imports.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFeedCreatorSearch.ts
git commit -m "feat(dragonfeed): controlled useFeedCreatorSearch (global name + zip/city radius)"
```

---

### Task 4: `FeedCreatorRow` + `FeedCreatorList` presentation

The Instagram-style row (avatar + matched name + meta line + skill chips, tap → profile) and the list wrapper (rows + empty state + optional "Browse all creators →" footer). Design-system compliant: white surfaces, teal focus rings, teal-tinted skill chips, avatar teal ring — no gray.

**Files:**
- Create: `src/components/dragon-feed/FeedCreatorRow.tsx`
- Create: `src/components/dragon-feed/FeedCreatorList.tsx`

- [ ] **Step 1: Write `FeedCreatorRow.tsx`**

Create `src/components/dragon-feed/FeedCreatorRow.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { highlightMatch, type FeedCreator } from '@/lib/feedCreators';

interface FeedCreatorRowProps {
  creator: FeedCreator;
  searchTerm: string;
}

export const FeedCreatorRow: React.FC<FeedCreatorRowProps> = ({ creator, searchTerm }) => {
  // creatorSlug can be '' — the || creatorId fallback matters (same route the feed header uses).
  const href = `/creator/${creator.creatorSlug || creator.creatorId}`;
  const nameSegments = highlightMatch(creator.creatorName, searchTerm);

  const location = creator.city || creator.location;
  const hasRating = creator.totalReviews != null && creator.totalReviews > 0 && creator.averageRating != null;
  const meta = [
    location,
    hasRating ? `★ ${creator.averageRating!.toFixed(1)} (${creator.totalReviews})` : null,
    `${creator.postCount} post${creator.postCount === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[];

  const skills = creator.skills.slice(0, 3);

  return (
    <Link
      to={href}
      aria-label={`View ${creator.creatorName}'s profile`}
      className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-white p-3 transition-colors hover:bg-dc-teal/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
    >
      <Avatar className="h-11 w-11 shrink-0 ring-2 ring-teal-400">
        <AvatarImage src={creator.avatarUrl} alt={creator.creatorName} />
        <AvatarFallback className="text-xs">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-dc-text">
          {nameSegments.map((seg, i) => (
            <span key={i} className={seg.match ? 'font-bold' : 'font-medium'}>
              {seg.text}
            </span>
          ))}
        </p>
        {meta.length > 0 && (
          <p className="truncate text-xs text-dc-text-muted">{meta.join(' · ')}</p>
        )}
        {skills.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {skills.map(skill => (
              <span
                key={skill}
                className="rounded-full bg-dc-teal/12 px-2 py-0.5 text-[10px] font-medium text-dc-teal-btn"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};
```

- [ ] **Step 2: Write `FeedCreatorList.tsx`**

Create `src/components/dragon-feed/FeedCreatorList.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { FeedCreatorRow } from './FeedCreatorRow';
import type { FeedCreator } from '@/lib/feedCreators';

interface FeedCreatorListProps {
  creators: FeedCreator[];
  searchTerm: string;
  locationActive: boolean;
  /** Business feed only — a "Browse all creators →" escape hatch. Omitted on the creator feed. */
  browseAllHref?: string;
}

export const FeedCreatorList: React.FC<FeedCreatorListProps> = ({
  creators,
  searchTerm,
  locationActive,
  browseAllHref,
}) => {
  const browseAll = browseAllHref ? (
    <div className="pt-2 text-center">
      <Link
        to={browseAllHref}
        className="text-sm font-semibold text-dc-pink-accent hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal rounded"
      >
        Browse all creators →
      </Link>
    </div>
  ) : null;

  if (creators.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dc-teal/12">
              <Search className="h-6 w-6 text-dc-teal-btn" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-dc-text">No creators found</h3>
            <p className="text-center text-dc-text-muted">
              {locationActive
                ? 'Try a wider radius or "Any".'
                : 'Try a different name.'}
            </p>
          </CardContent>
        </Card>
        {browseAll}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {creators.map(creator => (
        <FeedCreatorRow key={creator.creatorId} creator={creator} searchTerm={searchTerm} />
      ))}
      {browseAll}
    </div>
  );
};
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dragon-feed/FeedCreatorRow.tsx src/components/dragon-feed/FeedCreatorList.tsx
git commit -m "feat(dragonfeed): FeedCreatorRow + FeedCreatorList (IG-style creator search UI)"
```

---

### Task 5: `DragonFeedGrid` browse/search mode switch + delete `useFeedLocationFilter`

Rewire the grid to own all control state, call every hook top-level, and branch the rendered tree on `searchActive` (search → `FeedCreatorList`; empty → the existing browse feed). Add the `browseAllHref` prop. Remove the `useFeedLocationFilter` usage and delete the now-orphaned hook file.

**Files:**
- Modify: `src/components/dragon-feed/DragonFeedGrid.tsx` (full rewrite of the component body)
- Delete: `src/hooks/useFeedLocationFilter.ts`

- [ ] **Step 1: Replace `DragonFeedGrid.tsx` with the mode-switch version**

Overwrite `src/components/dragon-feed/DragonFeedGrid.tsx` with:

```tsx
import React, { useState, useMemo } from 'react';
import { useUniqueCreatorPortfolio } from '@/hooks/useUniqueCreatorPortfolio';
import { useIsMobile } from '@/hooks/use-mobile';
import { RADIUS_OPTIONS } from '@/lib/creatorLocationFilter';
import { feedCreatorsFromMedia } from '@/lib/feedCreators';
import { useFeedCreatorSearch } from '@/hooks/useFeedCreatorSearch';
import { FeedTile } from './FeedTile';
import { FeedPost } from './FeedPost';
import { FeedViewer } from './FeedViewer';
import { FeedCreatorList } from './FeedCreatorList';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface DragonFeedGridProps {
  /** Business feed only — passed straight to FeedCreatorList's "Browse all creators →" link. */
  browseAllHref?: string;
}

export const DragonFeedGrid: React.FC<DragonFeedGridProps> = ({ browseAllHref }) => {
  const { portfolioMedia, loading, error } = useUniqueCreatorPortfolio();
  const isMobile = useIsMobile();

  // All control state is owned here; only the rendered tree branches on searchActive.
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [locationQuery, setLocationQuery] = useState('');
  const [radiusMiles, setRadiusMiles] = useState<number | null>(25);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const feedCreators = useMemo(() => feedCreatorsFromMedia(portfolioMedia), [portfolioMedia]);
  const search = useFeedCreatorSearch(feedCreators, searchTerm, locationQuery, radiusMiles);

  const searchActive = searchTerm.trim() !== '' || locationQuery.trim() !== '';
  const locationSet = locationQuery.trim() !== '';
  const anyFilter = searchTerm !== '' || typeFilter !== 'all' || locationSet;

  // Browse-mode media: type filter only (a location query would be searchActive, not browse).
  const browseMedia = useMemo(
    () => portfolioMedia.filter(item => typeFilter === 'all' || item.type === typeFilter),
    [portfolioMedia, typeFilter],
  );

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setLocationQuery('');
    setRadiusMiles(25);
    setViewerIndex(null);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="h-10 bg-muted rounded-md flex-1 animate-pulse" />
          <div className="h-10 bg-muted rounded-md w-32 animate-pulse" />
        </div>
        <div className="-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <X className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load content</h3>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const countLine = searchActive
    ? search.status === 'resolving'
      ? 'Finding nearby creators…'
      : `${search.results.length} ${search.results.length === 1 ? 'creator' : 'creators'} found`
    : `${browseMedia.length} ${browseMedia.length === 1 ? 'item' : 'items'} found`;

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search creators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {!searchActive && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="relative flex-1 sm:max-w-[180px]">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zip or city"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              className="pl-10"
              aria-label="Search creators by zip or city"
            />
          </div>

          <Select
            value={radiusMiles == null ? 'any' : String(radiusMiles)}
            onValueChange={(v) => setRadiusMiles(v === 'any' ? null : Number(v))}
            disabled={!locationSet}
          >
            <SelectTrigger className="w-full sm:w-28" aria-label="Search radius">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>{r} mi</SelectItem>
              ))}
              <SelectItem value="any">Any</SelectItem>
            </SelectContent>
          </Select>

          {anyFilter && (
            <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {locationSet && search.status === 'failed' && (
          <p className="text-sm text-dc-pink-accent">Couldn't find that location — try another.</p>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{countLine}</p>
      </div>

      {/* Feed / Search results */}
      {searchActive ? (
        <FeedCreatorList
          creators={search.results}
          searchTerm={searchTerm}
          locationActive={search.locationActive}
          browseAllHref={browseAllHref}
        />
      ) : browseMedia.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No content found</h3>
            <p className="text-muted-foreground text-center">
              Try adjusting your filters to find more content.
            </p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-4">
          {browseMedia.map((media, i) => (
            <FeedPost key={media.id} media={media} onOpen={() => setViewerIndex(i)} />
          ))}
        </div>
      ) : (
        <div className="-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5">
          {browseMedia.map((media, i) => (
            <FeedTile key={media.id} media={media} onOpen={() => setViewerIndex(i)} />
          ))}
        </div>
      )}

      {!searchActive && viewerIndex !== null && browseMedia[viewerIndex] && (
        <FeedViewer
          items={browseMedia}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify nothing else imports `useFeedLocationFilter`, then delete it**

Run: `git grep -n "useFeedLocationFilter" -- src`
Expected: NO matches (the only importer was `DragonFeedGrid`, now rewired). If any match remains, fix that importer before deleting.

Then delete the file:
```bash
git rm src/hooks/useFeedLocationFilter.ts
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS (no unused `useFeedLocationFilter` import, no rules-of-hooks error).
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dragon-feed/DragonFeedGrid.tsx
git commit -m "feat(dragonfeed): browse/search mode switch in DragonFeedGrid; drop useFeedLocationFilter"
```

---

### Task 6: Wire `browseAllHref` on the business feed page

Pass the Browse-Creators href from the business feed; the creator feed leaves it unset (no browse-all link).

**Files:**
- Modify: `src/pages/BusinessDragonFeed.tsx`

- [ ] **Step 1: Pass the prop**

In `src/pages/BusinessDragonFeed.tsx`, change `<DragonFeedGrid />` to:

```tsx
          <DragonFeedGrid browseAllHref="/dashboard/business/creators" />
```

(Leave `src/pages/CreatorDragonFeed.tsx` unchanged — `<DragonFeedGrid />` with no prop.)

- [ ] **Step 2: Confirm the Browse-Creators route path**

Run: `git grep -n "dashboard/business/creators" -- src`
Expected: at least one match (the route is registered / linked elsewhere), confirming the href is valid. If the path differs, use the actual Browse-Creators route for the business role.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessDragonFeed.tsx
git commit -m "feat(dragonfeed): business feed passes browseAllHref to the creator search list"
```

---

### Task 7: Remove the superseded `filterMediaByRadius` + its tests

`filterMediaByRadius` was added in PR #242 for the media-zip-filter; that path is gone (Task 5). Delete the function and its test block. Do this LAST so the deletion happens only after every importer is gone.

**Files:**
- Modify: `src/lib/creatorLocationFilter.ts`
- Modify: `src/lib/creatorLocationFilter.test.ts`

- [ ] **Step 1: Confirm nothing imports `filterMediaByRadius` outside its own test**

Run: `git grep -n "filterMediaByRadius" -- src`
Expected: matches ONLY in `src/lib/creatorLocationFilter.ts` (definition) and `src/lib/creatorLocationFilter.test.ts` (import + describe block). If any other file matches, stop — a consumer was missed.

- [ ] **Step 2: Delete the function from `creatorLocationFilter.ts`**

Remove the entire `filterMediaByRadius` export block (the doc comment starting `/** Filter a list of MEDIA items ...` through the closing `}` of the function, currently lines ~177–203). Leave every other export (`filterByRadius`, `filterByRadiusWithSearch`, `resolveCreatorCoords`, `sortNearest`, `matchesLocationText`, `isPlaceQueryMatch`, `detectQueryKind`, `RADIUS_OPTIONS`, types) untouched.

- [ ] **Step 3: Delete the test block + import in `creatorLocationFilter.test.ts`**

Remove `filterMediaByRadius` from the import list at the top of the test file, and delete the entire `describe('filterMediaByRadius', () => { ... })` block (currently lines ~184–218). Leave all other describe blocks intact.

- [ ] **Step 4: Run the location-filter tests**

Run: `npx vitest run src/lib/creatorLocationFilter.test.ts`
Expected: PASS (remaining describe blocks green; no reference to the removed function).

- [ ] **Step 5: Typecheck, lint, build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/creatorLocationFilter.ts src/lib/creatorLocationFilter.test.ts
git commit -m "refactor(dragonfeed): remove superseded filterMediaByRadius + its tests"
```

---

## Final Verification (after all tasks)

- [ ] **Full test run** — `npm run test`
  Expected: the feed unit files pass (`feedCreators.test.ts`, `creatorLocationFilter.test.ts`). Per project memory, `npm run test` exits non-zero from ~103 pre-existing Playwright e2e file failures in nested worktrees — trust the "Tests N passed, 0 failed" summary line for the vitest unit suite, not the process exit code. Confirm no NEW failing unit file was introduced.
- [ ] **Typecheck** — `npm run typecheck` → PASS.
- [ ] **Lint** — `npm run lint` → PASS (no `react-hooks/rules-of-hooks`, no unused imports after the deletions).
- [ ] **Build** — `npm run build` → PASS.
- [ ] **Dead-code sweep** — `git grep -n "useFeedLocationFilter\|filterMediaByRadius" -- src` → NO matches.
- [ ] **Codex second review** (required before PR) — from the worktree: `codex review --base main --title "DragonFeed creator search"`. Fix any real findings and re-run until clean. (Frontend-only; no `edge-function-reviewer` needed.)
- [ ] **Prod verify** (post-merge, via `verify-prod`): desktop — type a name → IG creator list (matched letters bold, meta line + skill chips); type a **ZIP** (e.g. `07030`) → list narrows; type a **city** (e.g. `Jersey City`) → list narrows; set radius "Any" → all creators; clear → the browse media feed returns unchanged; "Browse all creators →" (business feed) navigates to Browse Creators. Mobile IG list confirmed on-device by the founder (the claude-in-chrome extension can't render <768px).

## Notes for the implementer

- **Rules of Hooks:** every hook in `DragonFeedGrid` (`useUniqueCreatorPortfolio`, `useIsMobile`, `useMemo`, `useFeedCreatorSearch`) is called unconditionally before any early `return`. Only the JSX branches. Do not move a hook inside a conditional.
- **`creatorSlug` can be `''`** — always route with `creator.creatorSlug || creator.creatorId` (the fallback is load-bearing).
- **Design system:** no gray surfaces — skill chips use `bg-dc-teal/12 text-dc-teal-btn`, focus rings use `ring-dc-teal`, avatars use `ring-2 ring-teal-400` (per `docs/DESIGN_SYSTEM.md`). Keep mobile base classes and desktop `lg:`/`xl:` classes separate — the browse grid's responsive classes are unchanged.
- **Deliberate simplification:** the old active-filter "chip badges" row is dropped (the input values are visible in the controls, and `Clear` resets everything) — one fewer moving part, no behavior lost.
- **Geocoding is the same lazy, cached path as PR #242** — only a typed location ≥3 chars geocodes, and creators geocode only under a finite radius. No new network cost pattern.
