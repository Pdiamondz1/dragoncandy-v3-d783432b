# DragonFeed — Mobile Vertical Feed + Zip-Radius Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On mobile, render the shared Dragon Feed as an Instagram-style single-column feed with a creator header per post; add a zip-code + radius search box (both viewports) that filters the feed to creators within the radius of the typed zip. Desktop grid unchanged.

**Architecture:** Pure frontend. Extend the existing feed data hook with location + avatar fields; add a pure `filterMediaByRadius` core (unit-tested) plus a thin `useFeedLocationFilter` hook that reuses the existing geocoding stack; branch mobile/desktop rendering with `useIsMobile()`. No backend/schema/RLS/edge-function change.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` tokens), shadcn/ui, React Query, Supabase JS v2, Vitest. Reuses `src/lib/creatorLocationFilter.ts`, `src/lib/geocoding.ts`, `src/hooks/useCreatorGeocoding.ts`, `src/hooks/use-mobile.tsx`.

**Spec:** `docs/superpowers/specs/2026-07-16-dragonfeed-mobile-feed-zip-search-design.md`

**Run all commands from the worktree:** `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\dc-issues-2`

---

## File Structure

**Modify**
- `src/lib/creatorLocationFilter.ts` — add pure `filterMediaByRadius` (Task 1).
- `src/lib/creatorLocationFilter.test.ts` — add `filterMediaByRadius` tests (Task 1).
- `src/hooks/useUniqueCreatorPortfolio.ts` — extend select + `PortfolioMedia` fields + avatar resolution (Task 2).
- `src/components/dragon-feed/FeedViewer.tsx` — render `avatarUrl` in the existing avatar (Task 4).
- `src/components/dragon-feed/DragonFeedGrid.tsx` — controls, filter pipeline, `useIsMobile` branch (Task 5).

**Create**
- `src/hooks/useFeedLocationFilter.ts` — zip/radius state + geocoding + filter (Task 3).
- `src/components/dragon-feed/FeedPost.tsx` — mobile IG-style post card (Task 4).

**Unchanged (pass-through):** `FeedTile.tsx`, `useCreatorGeocoding.ts`, `geocoding.ts`, `use-mobile.tsx`, `BusinessDragonFeed.tsx`, `CreatorDragonFeed.tsx`.

---

## Task 1: Pure `filterMediaByRadius` core (TDD)

The unit-testable heart of the zip filter: given media (each carrying its creator's location), a center, a radius, and a precomputed geocode map, return only the media whose creator is in range. Delegates to the existing tested `filterByRadius`.

**Files:**
- Modify: `src/lib/creatorLocationFilter.ts`
- Test: `src/lib/creatorLocationFilter.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the imports at the top of `src/lib/creatorLocationFilter.test.ts` (add `filterMediaByRadius` to the existing `from './creatorLocationFilter'` import list):

```ts
  filterByRadiusWithSearch,
  filterMediaByRadius,
} from './creatorLocationFilter';
```

Append this block to the end of `src/lib/creatorLocationFilter.test.ts`:

```ts
describe('filterMediaByRadius', () => {
  // creators: A ≈ 1 mi from NYC (in range), B in LA (far). No structured city/country,
  // so placement relies entirely on the precomputed geocodedById map.
  const geo = new Map([
    ['A', { lat: 40.72, lng: -74.0 }],
    ['B', { lat: 34.0522, lng: -118.2437 }],
  ]);
  const mk = (id: string, creatorId: string) => ({ id, creatorId } as { id: string; creatorId: string });
  const media = [mk('a1', 'A'), mk('a2', 'A'), mk('b1', 'B')];

  test('no center → passthrough (never silent-empty)', () => {
    expect(filterMediaByRadius(media, null, 25, geo)).toHaveLength(3);
  });

  test('finite radius keeps in-range creators, drops far ones', () => {
    const out = filterMediaByRadius(media, NYC, 25, geo);
    expect(out.map(m => m.id)).toEqual(['a1', 'a2']);
  });

  test('Any radius (null) with a center keeps all placeable media', () => {
    expect(filterMediaByRadius(media, NYC, null, geo)).toHaveLength(3);
  });

  test('media from an unplaceable creator is dropped under a finite radius', () => {
    const withGhost = [...media, mk('c1', 'C')]; // C not in geo, no city/country
    const out = filterMediaByRadius(withGhost, NYC, 25, geo);
    expect(out.map(m => m.id)).toEqual(['a1', 'a2']);
  });

  test('all media from one creator are kept or dropped together', () => {
    const out = filterMediaByRadius(media, NYC, 25, geo);
    expect(out.filter(m => m.creatorId === 'A')).toHaveLength(2);
    expect(out.filter(m => m.creatorId === 'B')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/creatorLocationFilter.test.ts`
Expected: FAIL — `filterMediaByRadius is not a function` (or import error).

- [ ] **Step 3: Implement `filterMediaByRadius`**

Append to `src/lib/creatorLocationFilter.ts` (end of file). It reuses `filterByRadius` and the already-imported `LatLng`:

```ts
/**
 * Filter a list of MEDIA items by whether each item's creator is within `radiusMiles` of
 * `center`. Dedups creators (by `creatorId`), runs the tested per-creator `filterByRadius`, then
 * keeps every media item belonging to a surviving creator. `!center` → passthrough (the feed
 * never silent-empties while a zip is unresolved). NOTE: this internal dedup deliberately omits
 * `postal_code` — `filterByRadius`/`resolveCreatorCoords` only read id/city/country; postal_code
 * is consumed upstream by the geocoding pass that builds `geocodedById`.
 */
export function filterMediaByRadius<
  M extends { creatorId: string; city?: string; country?: string },
>(
  media: M[],
  center: LatLng | null,
  radiusMiles: number | null,
  geocodedById: Map<string, LatLng>,
): M[] {
  if (!center) return media;
  const uniq = new Map<string, { id: string; city?: string; country?: string }>();
  for (const m of media) {
    if (!uniq.has(m.creatorId)) {
      uniq.set(m.creatorId, { id: m.creatorId, city: m.city, country: m.country });
    }
  }
  const { list } = filterByRadius([...uniq.values()], center, radiusMiles, geocodedById);
  const survivors = new Set(list.map(c => c.id));
  return media.filter(m => survivors.has(m.creatorId));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/creatorLocationFilter.test.ts`
Expected: PASS (all new tests green; existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/creatorLocationFilter.ts src/lib/creatorLocationFilter.test.ts
git commit -m "feat(dragonfeed): add pure filterMediaByRadius core + tests"
```

---

## Task 2: Extend `useUniqueCreatorPortfolio` with location + avatar

Add location fields and a resolved avatar URL to each media item, so the zip filter and the IG header have the data they need. Reuse the hook's existing `getSignedUrl` helper (signs the `profile-assets` bucket, 1h cache) for storage-key avatars.

**Files:**
- Modify: `src/hooks/useUniqueCreatorPortfolio.ts`

- [ ] **Step 1: Extend the `PortfolioMedia` interface**

Replace the `PortfolioMedia` interface (currently lines 4-11) with:

```ts
export interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorSlug: string;
  creatorId: string;
  // Location bundle (for the zip-radius filter) + avatar (for the IG header / lightbox):
  avatarUrl?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  location?: string;
}
```

- [ ] **Step 2: Extend the Supabase select**

In the `.from('creator_profiles').select(...)` call, replace the select string:

```ts
          .select('id, user_id, creator_name, avatar_url, portfolio_urls, profile_slug, city, postal_code, country, location')
```

(Leave the `.eq('is_completed', true)`, `.eq('allow_portfolio_in_feed', true)`, `.not('portfolio_urls', 'is', null)`, `.limit(50)` chain unchanged.)

- [ ] **Step 3: Resolve the avatar and attach fields to each media item**

Inside the `creators.flatMap((creator) => { ... })` body, add avatar resolution before the `return urls...` and attach the new fields in the returned object. The resolved-avatar promise is reused across the creator's media via the module-level `signedUrlCache`, so repeat calls are cache hits. Replace the flatMap body:

```ts
        const mediaPromises = creators.flatMap((creator) => {
          const urls = Array.isArray(creator.portfolio_urls) ? creator.portfolio_urls : [];
          const rawAvatar = typeof creator.avatar_url === 'string' ? creator.avatar_url : '';
          return urls
            .filter((url: unknown) => typeof url === 'string' && url.length > 0)
            .map(async (url: string) => {
              const isExternal = url.startsWith('http');
              const finalUrl = isExternal ? url : await getSignedUrl(url);
              if (!finalUrl) return null;
              // Avatar: external http URL used directly; storage key signed (cached).
              const avatarUrl = rawAvatar
                ? rawAvatar.startsWith('http')
                  ? rawAvatar
                  : (await getSignedUrl(rawAvatar)) ?? undefined
                : undefined;
              const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
              return {
                id: `${creator.id}-${url}`,
                url: finalUrl,
                type: isVideo ? 'video' : 'image',
                creatorName: creator.creator_name || 'Creator',
                creatorSlug: creator.profile_slug || '',
                creatorId: creator.user_id || creator.id,
                avatarUrl,
                city: creator.city ?? undefined,
                postalCode: creator.postal_code ?? undefined,
                country: creator.country ?? undefined,
                location: creator.location ?? undefined,
              } as PortfolioMedia;
            });
        });
```

- [ ] **Step 4: Verify types + build**

Run: `npm run typecheck`
Expected: PASS (no errors).
Run: `npm run build`
Expected: PASS (`vite build` completes).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUniqueCreatorPortfolio.ts
git commit -m "feat(dragonfeed): load creator location + avatar into feed media"
```

---

## Task 3: `useFeedLocationFilter` hook

A thin stateful wrapper around `filterMediaByRadius`: owns zip/radius state, debounces the zip, geocodes it to a center (React Query, cached), lazily geocodes creators (only when a zip is active — mirroring `useCreatorBrowse`'s freeform-location fallback so those creators are placeable), builds the `geocodedById` map, and returns the zip-filtered media. **All hooks at the top level** (no `useCreatorGeocoding` inside a callback).

**Files:**
- Create: `src/hooks/useFeedLocationFilter.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useFeedLocationFilter.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geocodingService } from '@/lib/geocoding';
import { useCreatorGeocoding } from '@/hooks/useCreatorGeocoding';
import {
  detectQueryKind,
  filterMediaByRadius,
  DEFAULT_LOCATION_FILTER,
  type LatLng,
} from '@/lib/creatorLocationFilter';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

export interface FeedLocationFilter {
  zip: string;
  setZip: (z: string) => void;
  radiusMiles: number | null; // null = "Any"
  setRadiusMiles: (r: number | null) => void;
  filteredMedia: PortfolioMedia[];
  status: 'idle' | 'resolving' | 'failed';
  active: boolean; // a usable center is resolved
}

/**
 * Zip-radius filter for the Dragon Feed. Takes the (already name/type-filtered) media and returns
 * it narrowed to creators within `radiusMiles` of the typed zip. Geocoding is lazy — nothing hits
 * the network until a valid zip resolves a center.
 */
export function useFeedLocationFilter(media: PortfolioMedia[]): FeedLocationFilter {
  const [zip, setZip] = useState('');
  const [radiusMiles, setRadiusMiles] = useState<number | null>(
    DEFAULT_LOCATION_FILTER.radiusMiles,
  );

  // Debounce the raw zip (~400ms) so we don't geocode every keystroke.
  const [debouncedZip, setDebouncedZip] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedZip(zip.trim()), 400);
    return () => clearTimeout(t);
  }, [zip]);

  const isValidZip = detectQueryKind(debouncedZip) === 'zip';

  // Geocode the typed zip -> center. geocodeLocation(postal_code?, city?, country?): the zip is the
  // sole first argument, so it is treated as the postal_code.
  const { data: center, isLoading: centerLoading } = useQuery({
    queryKey: ['feed-zip-center', debouncedZip],
    queryFn: async (): Promise<LatLng | null> => {
      const r = await geocodingService.geocodeLocation(debouncedZip);
      return r ? { lat: r.lat, lng: r.lng } : null;
    },
    enabled: isValidZip,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const active = isValidZip && !!center;

  // Unique creators for geocoding — keep postal_code (useCreatorGeocoding needs it), and mirror
  // useCreatorBrowse: a creator with only a freeform `location` passes that string as postal_code
  // so it still geocodes (and becomes placeable) rather than being dropped.
  const uniqueCreators = useMemo(() => {
    const map = new Map<
      string,
      { id: string; postal_code?: string; city?: string; country?: string }
    >();
    for (const m of media) {
      if (!map.has(m.creatorId)) {
        map.set(m.creatorId, {
          id: m.creatorId,
          postal_code: m.postalCode || (!m.city && !m.country ? m.location : undefined),
          city: m.city,
          country: m.country,
        });
      }
    }
    return [...map.values()];
  }, [media]);

  // Lazy: pass [] until a zip center is active, so useCreatorGeocoding (enabled: length > 0) idles.
  const creatorsToGeocode = active ? uniqueCreators : [];
  const { geocodedCreators } = useCreatorGeocoding(creatorsToGeocode);

  const geocodedById = useMemo(
    () => new Map<string, LatLng>(geocodedCreators.map(g => [g.id, { lat: g.lat, lng: g.lng }])),
    [geocodedCreators],
  );

  const filteredMedia = useMemo(
    () => filterMediaByRadius(media, active ? center ?? null : null, radiusMiles, geocodedById),
    [media, active, center, radiusMiles, geocodedById],
  );

  const status: FeedLocationFilter['status'] = !isValidZip
    ? 'idle'
    : centerLoading
      ? 'resolving'
      : center
        ? 'idle'
        : 'failed';

  return { zip, setZip, radiusMiles, setRadiusMiles, filteredMedia, status, active };
}
```

- [ ] **Step 2: Verify types + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFeedLocationFilter.ts
git commit -m "feat(dragonfeed): add useFeedLocationFilter zip-radius hook"
```

---

## Task 4: `FeedPost` (mobile IG card) + `FeedViewer` avatar

The mobile single-column post — creator header (avatar + name → profile) over full-width media (tap → existing lightbox). Also render the newly-available avatar in the lightbox's existing avatar (today a placeholder icon only).

**Files:**
- Create: `src/components/dragon-feed/FeedPost.tsx`
- Modify: `src/components/dragon-feed/FeedViewer.tsx`

- [ ] **Step 1: Create `FeedPost.tsx`**

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

interface FeedPostProps {
  media: PortfolioMedia;
  onOpen: () => void;
}

export const FeedPost: React.FC<FeedPostProps> = ({ media, onOpen }) => {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const goToProfile = () => navigate(`/creator/${media.creatorSlug || media.creatorId}`);

  return (
    <article className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
      {/* Creator header → profile */}
      <button
        type="button"
        onClick={goToProfile}
        aria-label={`View ${media.creatorName}'s profile`}
        className="flex w-full items-center gap-3 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
      >
        <Avatar className="h-9 w-9 ring-2 ring-teal-400">
          <AvatarImage src={media.avatarUrl} alt={media.creatorName} />
          <AvatarFallback className="text-xs">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-semibold text-dc-text">{media.creatorName}</span>
      </button>

      {/* Media → lightbox */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${media.type} by ${media.creatorName}`}
        className="group relative block aspect-square w-full overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
      >
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
            <Spinner className="border-2 border-primary border-t-transparent" label="Loading content..." />
          </div>
        )}

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="text-muted-foreground text-xs">Failed to load</div>
          </div>
        ) : media.type === 'video' ? (
          <video
            src={media.url}
            aria-label={`Video by ${media.creatorName}`}
            className="h-full w-full object-cover"
            onLoadedData={() => setLoaded(true)}
            onError={() => setError(true)}
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={media.url}
            alt={`Content by ${media.creatorName}`}
            className="h-full w-full object-cover"
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}

        {media.type === 'video' && !error && (
          <Play className="absolute top-2 right-2 h-5 w-5 text-white fill-white drop-shadow" />
        )}
      </button>
    </article>
  );
};
```

- [ ] **Step 2: Render the avatar in `FeedViewer`**

In `src/components/dragon-feed/FeedViewer.tsx`, update the avatar import (line 6) to include `AvatarImage`:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
```

Then in the bottom action bar, add an `AvatarImage` inside the existing `<Avatar>` (the block around lines 169-173), so it becomes:

```tsx
                <Avatar className="h-8 w-8 ring-2 ring-teal-400">
                  <AvatarImage src={activeItem.avatarUrl} alt={activeItem.creatorName} />
                  <AvatarFallback className="text-xs">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
```

- [ ] **Step 3: Verify types + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dragon-feed/FeedPost.tsx src/components/dragon-feed/FeedViewer.tsx
git commit -m "feat(dragonfeed): add mobile FeedPost card + lightbox avatar image"
```

---

## Task 5: Wire `DragonFeedGrid` — controls, pipeline, viewport branch

Add the zip input + radius selector, run the name/type filter then the zip filter, and branch the render on `useIsMobile()`. Desktop grid classes stay identical.

**Files:**
- Modify: `src/components/dragon-feed/DragonFeedGrid.tsx`

- [ ] **Step 1: Update imports**

Replace the import block at the top of `src/components/dragon-feed/DragonFeedGrid.tsx` with (adds `useMemo`, `MapPin`, `FeedPost`, `useIsMobile`, `useFeedLocationFilter`, `RADIUS_OPTIONS`):

```tsx
import React, { useState, useMemo } from 'react';
import { useUniqueCreatorPortfolio } from '@/hooks/useUniqueCreatorPortfolio';
import { useFeedLocationFilter } from '@/hooks/useFeedLocationFilter';
import { useIsMobile } from '@/hooks/use-mobile';
import { RADIUS_OPTIONS } from '@/lib/creatorLocationFilter';
import { FeedTile } from './FeedTile';
import { FeedPost } from './FeedPost';
import { FeedViewer } from './FeedViewer';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
```

- [ ] **Step 2: Replace the component state + filter pipeline**

Replace the top of the component (the current lines 13-27: the `useUniqueCreatorPortfolio` call through `clearFilters`) with:

```tsx
  const { portfolioMedia, loading, error } = useUniqueCreatorPortfolio();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();

  // Stage 1: name + type filter (existing behavior).
  const nameTypeFiltered = useMemo(
    () =>
      portfolioMedia.filter((item) => {
        const matchesSearch = item.creatorName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || item.type === typeFilter;
        return matchesSearch && matchesType;
      }),
    [portfolioMedia, searchTerm, typeFilter],
  );

  // Stage 2: zip-radius filter (new). `filteredMedia` is the final list the feed renders.
  const { zip, setZip, radiusMiles, setRadiusMiles, filteredMedia, status, active } =
    useFeedLocationFilter(nameTypeFiltered);

  const zipActive = zip.trim().length > 0;
  const anyFilter = searchTerm !== '' || typeFilter !== 'all' || zipActive;

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setZip('');
    setRadiusMiles(25);
  };
```

- [ ] **Step 3: Add the zip + radius controls to the controls row**

In the controls `<div className="flex flex-col sm:flex-row gap-4">` block, after the existing type `<Select>` (the block ending `</Select>` around current line 83) and BEFORE the `{(searchTerm || typeFilter !== 'all') && (` Clear button, insert the zip input + radius selector:

```tsx
          <div className="relative flex-1 sm:max-w-[180px]">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              inputMode="numeric"
              maxLength={10}
              placeholder="Zip code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="pl-10"
              aria-label="Search by zip code"
            />
          </div>

          <Select
            value={radiusMiles == null ? 'any' : String(radiusMiles)}
            onValueChange={(v) => setRadiusMiles(v === 'any' ? null : Number(v))}
            disabled={!zipActive}
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
```

Then change the guard `{(searchTerm || typeFilter !== 'all') && (` to `{anyFilter && (` (so Clear also appears when only a zip is set). **Heads-up:** this exact string occurs **twice** in the file — the Clear-button guard AND the "Active Filters" guard (handled in Step 4). Do them both in one `replace_all` of `{(searchTerm || typeFilter !== 'all') && (` → `{anyFilter && (` rather than a unique-match edit (which will error on non-uniqueness).

- [ ] **Step 4: Add the zip status hint + zip badge**

Immediately after the closing `</div>` of the controls row (before the "Active Filters" badges block), add the zip failure hint:

```tsx
        {zipActive && status === 'failed' && (
          <p className="text-sm text-dc-pink-accent">Couldn't find that zip — try another.</p>
        )}
```

The "Active Filters" outer guard `{(searchTerm || typeFilter !== 'all') && (` → `{anyFilter && (` was already handled by the `replace_all` in Step 3 (both occurrences). Inside that badge list, after the `typeFilter` badge, add a zip badge:

```tsx
            {zipActive && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Near {zip.trim()}{active ? ` · ${radiusMiles == null ? 'Any' : `${radiusMiles} mi`}` : ''}
                <button onClick={() => setZip('')} aria-label="Clear zip filter" className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
```

- [ ] **Step 5: Use `filteredMedia` for the count, empty state, and render branch**

Replace every remaining reference to the old `filteredMedia` variable name — it now comes from the hook, so the results count and viewer already work. Replace the results-count + media-grid + viewer block (current lines 116-151) with:

```tsx
      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredMedia.length} {filteredMedia.length === 1 ? 'item' : 'items'} found
        </p>
      </div>

      {/* Feed */}
      {filteredMedia.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No content found</h3>
            <p className="text-muted-foreground text-center">
              {active
                ? 'No creators near that zip. Try a wider radius or "Any".'
                : 'Try adjusting your search criteria or filters to find more content.'}
            </p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-4">
          {filteredMedia.map((media, i) => (
            <FeedPost key={media.id} media={media} onOpen={() => setViewerIndex(i)} />
          ))}
        </div>
      ) : (
        <div className="-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5">
          {filteredMedia.map((media, i) => (
            <FeedTile key={media.id} media={media} onOpen={() => setViewerIndex(i)} />
          ))}
        </div>
      )}

      {viewerIndex !== null && filteredMedia[viewerIndex] && (
        <FeedViewer
          items={filteredMedia}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
```

- [ ] **Step 6: Verify types, lint, build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS (no new errors; in particular no `react-hooks/rules-of-hooks`).
Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/dragon-feed/DragonFeedGrid.tsx
git commit -m "feat(dragonfeed): mobile vertical feed + zip-radius controls in DragonFeedGrid"
```

---

## Task 6: Full verification + review gates

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test + build suite**

Run: `npx vitest run src/lib/creatorLocationFilter.test.ts`
Expected: PASS (the feed's pure filter tests).
Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS.

> Note: `npm run test` (whole suite) exits non-zero due to ~pre-existing Playwright e2e file failures in nested worktrees — trust the "N passed, 0 failed" line for the unit run, not the exit code (see project memory "Vitest pre-existing file failures").

- [ ] **Step 2: Manual dev smoke (both viewports)**

Run: `npm run dev` → open `http://127.0.0.1:8080`, sign in, open a Dragon Feed page.
- Desktop (≥768px): unchanged multi-column grid; zip box + radius visible; typing a valid zip narrows the count.
- Mobile (<768px, devtools device toolbar): single-column feed, each post shows creator avatar + name (tap → `/creator/...`), tap media → lightbox.
- Enter a zip like `07030`, radius `25 mi` → feed narrows to nearby creators; clear → all return. Bad zip (`00000`) → "Couldn't find that zip" hint, no crash, all media remain.

- [ ] **Step 3: Codex second review (required before PR)**

Per CLAUDE.md, run the mandatory independent Codex pass and fix any real findings:

```bash
codex review --base main --title "DragonFeed mobile feed + zip-radius search"
```

Re-run until clean; relay Codex's verdict.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR. Include the spec + plan in the PR. After merge, run `knowledge-sync` (per CLAUDE.md) and `verify-prod` (both viewports on dragoncandy.io).

---

## Notes / Gotchas

- **Shell cwd is the MAIN checkout** (project memory): run every command with the worktree as cwd and write only to the worktree path `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\dc-issues-2`.
- **Desktop untouched:** the `lg:grid-cols-4 xl:grid-cols-5` grid classes must remain byte-identical (design-system mobile/desktop separation). Only the mobile (base) branch is new.
- **No gray surfaces** (design rule): the `FeedPost` card is white with a teal border; status hint uses `dc-pink-accent`, not gray.
- **Avatar resolution** reuses the hook's `getSignedUrl` (profile-assets, 1h cache); if a storage key fails to sign, the `AvatarFallback` User icon shows — graceful.
- **Freeform-location creators** are placeable (their `location` string is geocoded as the query), mirroring `useCreatorBrowse` — better than the spec's conservative "excluded" wording.
- **Frontend-only:** no migration, edge function, secret, RLS, or `types.ts` change. Ships on merge → Vercel.
```
