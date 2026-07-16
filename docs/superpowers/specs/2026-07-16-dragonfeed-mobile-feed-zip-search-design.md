# DragonFeed — mobile vertical feed + zip-radius search

- **Date**: 2026-07-16
- **Status**: Design (approved for planning)
- **Author**: Claude (brainstorm with Dame)
- **Type**: Frontend-only feature modification
- **Surfaces**: `BusinessDragonFeed` (`/dashboard/business/...`) and `CreatorDragonFeed` ("My Dragon Feed") — both render the shared `DragonFeedGrid`.

## 1. Problem / Motivation

The Dragon Feed today is a single shared component (`DragonFeedGrid`) rendering creator
portfolio media as a **3-column square grid** on every viewport, with two filters: a
"Search creators…" name box and an image/video type dropdown. Two founder-requested gaps:

1. On mobile the 3-across grid makes each piece of content tiny; it should read like an
   **Instagram vertical feed** (one full-width post per row) so a restaurant can actually
   judge a creator's work while scrolling.
2. There is **no way to find creators by location**. A restaurant browsing the feed wants to
   surface **local** creators. The request is a **separate search-by-zip-code box**.

The codebase already contains a complete, tested location stack (built for the "Find
Creators near me" feature): `src/lib/creatorLocationFilter.ts` (`detectQueryKind`,
`filterByRadius`, `resolveCreatorCoords`, `sortNearest`), `src/lib/geocoding.ts`
(`geocodingService.geocodeLocation`, `geocodeCreators`), and `useCreatorGeocoding`.
Creator profiles already carry `city`, `postal_code`, `country`, `location`, and `avatar_url`.
This feature **reuses** that stack rather than inventing new matching code.

## 2. Decisions (locked during brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Mobile layout | Single-column vertical feed (Instagram-style), one full-width post per row |
| D2 | Desktop layout | **Unchanged** — keep the existing multi-column `FeedTile` grid |
| D3 | Zip filter behavior | **Radius** ("near this zip"), reusing `filterByRadius`; not exact-match |
| D4 | Zip box placement | **Both** desktop and mobile |
| D5 | Mobile post content | **IG-style** — creator header (avatar + name, tappable to profile) above the media |
| D6 | Which pages | **Both** — change the shared component; no per-page gating |
| D7 | Radius control | Keep a compact radius selector (10/25/50/100/Any, default 25 mi), consistent with the approved option preview |

## 3. Goals / Non-Goals

**Goals**
- Mobile (<768px) renders an IG-style single-column feed with a per-post creator header.
- Desktop (≥768px) grid stays byte-for-byte behaviorally the same.
- A zip + radius control on both viewports filters the feed to creators within the radius of
  the typed zip, combining (AND) with the existing name search and type filter.
- Reuse the existing geo/geocoding utilities; add no backend/schema/RLS/edge-function change.
- Keep geocoding cost ~zero until a zip is actually entered (lazy geocoding).

**Non-Goals (YAGNI)**
- No "nearest-first" sort in the feed (the feed keeps its existing shuffle order; radius only
  *filters*). Distance annotation is available from `filterByRadius` but is not surfaced in v1.
- No new engagement features (likes/comments live only in the existing `FeedViewer`).
- No change to `FeedViewer`, `useFeedLike`, `useMessageCreator`, or the lightbox flow.
- No city/free-text location search box (the existing name box is unchanged; only a **zip**
  box is added, per request).
- No backend geocoding of the zip; reuse the client `geocodingService`.

## 4. Architecture Overview

```
DragonFeedGrid  (shared; both pages)
├─ useUniqueCreatorPortfolio()      → PortfolioMedia[]  (EXTENDED: +avatarUrl +location bundle)
├─ nameTypeFiltered = name search + type filter        (existing, unchanged) applied to media FIRST
├─ useFeedLocationFilter(nameTypeFiltered)  → { filteredMedia, ... }  (NEW hook; zip-radius only)
│    ├─ geocodingService.geocodeLocation(debouncedZip)  → center LatLng (react-query, cached)
│    ├─ useCreatorGeocoding(creatorsToGeocode)           → geocodedCreators[] → geocodedById Map (lazy)
│    └─ filterMediaByRadius(...)                         → survivor creatorId set → zip-filtered media
├─ controls row: [Search creators…] [Zip] [radius ▾] [All Types ▾] [Clear]
└─ render branch on useIsMobile()  (over the hook's returned filteredMedia)
     ├─ mobile (<768): <FeedPost/> stack (NEW)   — IG card, tap media → FeedViewer
     └─ desktop (≥768): <FeedTile/> grid (existing, unchanged)
   → both feed the SAME final list into the SAME <FeedViewer/>
```

**Filter pipeline / naming:** the name-search + type filter run **first** on the raw media
(`nameTypeFiltered`); that array is passed into `useFeedLocationFilter`, whose returned
`filteredMedia` is the zip-radius-filtered *final* list the grid renders. So "filtered media"
downstream (§5.4) = name + type + zip, even though the hook itself only adds the zip stage.

Only one media tree mounts at a time (mobile *or* desktop), chosen by `useIsMobile()`.
The rejected alternative — rendering both trees and toggling with CSS `hidden`/`lg:block` —
would download every image/video twice; unacceptable given signed URLs + videos.

## 5. Detailed Design

### 5.1 Data layer — `useUniqueCreatorPortfolio` (`src/hooks/useUniqueCreatorPortfolio.ts`)

Extend the `creator_profiles` select and denormalize onto each media item.

Current select: `id, user_id, creator_name, portfolio_urls, profile_slug`
New select: **`+ avatar_url, city, postal_code, country, location`**

`PortfolioMedia` interface gains:

```ts
export interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorSlug: string;
  creatorId: string;
  // NEW:
  avatarUrl?: string;          // creator_profiles.avatar_url (undefined → placeholder icon)
  city?: string;
  postalCode?: string;
  country?: string;
  location?: string;           // freeform fallback
}
```

Notes:
- `creatorId` is already `creator.user_id || creator.id`. The location fields come off the
  same `creator` row in the existing `flatMap`, so every media item from one creator carries
  the same location bundle (denormalized) — acceptable; the filter dedups by creator anyway.
- Populating `avatarUrl` also improves the **existing** `FeedViewer` bottom bar avatar, which
  currently only renders `AvatarFallback` (a `User` icon). `FeedViewer` will render
  `activeItem.avatarUrl` when present (small additive edit; fallback preserved).
- `avatar_url` may be a storage path or an external URL. Match how `useCreatorBrowse` /
  existing avatar rendering resolves it (verify during implementation — if it's a storage
  key needing a signed URL, reuse the same resolution the browse cards use; do **not**
  blindly wrap in a signed-URL helper — see the DragonShare `content_file_path` lesson about
  public-URL-vs-storage-key). If resolution is nontrivial, v1 may fall back to the placeholder
  icon rather than mis-render. **Open implementation check, not a blocker.**

### 5.2 Zip-radius filter — new `useFeedLocationFilter` (`src/hooks/useFeedLocationFilter.ts`)

Owns the zip/radius state and returns the location-filtered media. **The hook takes `media`**
and does all geocoding/filtering at its top level (no hooks inside callbacks — see the Rules of
Hooks note below). It returns the already-filtered `media`, not a filter closure.

```ts
interface FeedLocationFilter {
  zip: string;
  setZip: (z: string) => void;
  radiusMiles: number | null;              // null = "Any"; default 25
  setRadiusMiles: (r: number | null) => void;
  filteredMedia: PortfolioMedia[];         // media after the zip-radius filter (passthrough when inactive)
  status: 'idle' | 'resolving' | 'failed'; // geocode status of the typed zip
  active: boolean;                         // a usable center is resolved
}
export function useFeedLocationFilter(media: PortfolioMedia[]): FeedLocationFilter
```

**Rules-of-Hooks constraint (must hold):** `useCreatorGeocoding` internally calls
`useQuery`/`useState`/`useEffect`, so it may be called **only at the hook's top level**, never
inside a render callback. An earlier draft exposed a `filterByZip(media)` callback that called
`useCreatorGeocoding` — that is a hard `react-hooks/rules-of-hooks` violation and is rejected.
The correct shape mirrors `useCreatorBrowse` (see below).

Internals, all at the hook top level:
1. `zip`, `radiusMiles` (default `DEFAULT_LOCATION_FILTER.radiusMiles` = **25**) state.
2. `debouncedZip` (~400ms) — small `useEffect`+timeout or an existing debounce hook.
3. `isValidZip = detectQueryKind(debouncedZip) === 'zip'` (5-digit or zip+4).
4. Geocode zip → center via react-query:
   `queryKey: ['feed-zip-center', debouncedZip]`,
   `queryFn: () => geocodingService.geocodeLocation(debouncedZip)`,
   `enabled: isValidZip`, `staleTime: 24h`.
   **Signature note:** `geocodeLocation(postal_code?, city?, country?)` — passing the zip as the
   sole first argument correctly treats it as `postal_code`; do not "fix" it into another shape.
   `isLoading → 'resolving'`; resolved-null → `'failed'`; resolved coords → `center`, `active: true`.
5. `uniqueCreators = useMemo(...)` derived from `media`: dedup by `creatorId` into
   `{ id: creatorId, city, country, postal_code }` — this pass **keeps** `postal_code` because
   `useCreatorGeocoding` needs it. (This is deliberately a *separate* dedup from the one inside
   `filterMediaByRadius`, which drops `postal_code` because `filterByRadius` never reads it.
   Do not merge the two — the differing field sets are intentional, not duplication to simplify.)
6. **Lazy geocoding:** `const creatorsToGeocode = active ? uniqueCreators : []`, then
   `const { geocodedCreators } = useCreatorGeocoding(creatorsToGeocode)` at top level — the
   hook's own `enabled: creators.length > 0` means **no Google calls fire until a zip resolves**.
7. Build the map the caller must construct itself (the hook returns an **array**, not a Map),
   mirroring `useCreatorBrowse.ts` (~L193-197):
   `const geocodedById = useMemo(() => new Map(geocodedCreators.map(g => [g.id, { lat: g.lat, lng: g.lng }])), [geocodedCreators])`.
8. `filteredMedia = useMemo(() => filterMediaByRadius(media, active ? center : null, radiusMiles, geocodedById), [media, active, center, radiusMiles, geocodedById])`.

Placement semantics: creators placeable only via structured `city+country` fall back to
`lookupCityCoords` inside `filterByRadius`; creators with only freeform `location` are
**unplaceable** and excluded while a zip is active (matches existing CreatorBrowse behavior).
Under "Any" (`radiusMiles = null`) with a resolved center, `filterByRadius` keeps everyone
placeable (no distance drop). Reuse `RADIUS_OPTIONS` (`[10, 25, 50, 100]`) from
`creatorLocationFilter.ts` for the selector rather than re-declaring it.

**Purity boundary for tests**: the media-filtering core is a **pure function**
`filterMediaByRadius(media, center, radiusMiles, geocodedById)` added to
`creatorLocationFilter.ts`, unit-tested directly. It derives unique creators from `media` and
delegates to the existing `filterByRadius`:

```ts
export function filterMediaByRadius<
  M extends { creatorId: string; city?: string; country?: string },
>(media: M[], center: LatLng | null, radiusMiles: number | null,
  geocodedById: Map<string, LatLng>): M[] {
  if (!center) return media;                                   // passthrough — never silent-empty
  const uniq = new Map<string, { id: string; city?: string; country?: string }>();
  for (const m of media)
    if (!uniq.has(m.creatorId)) uniq.set(m.creatorId, { id: m.creatorId, city: m.city, country: m.country });
  const { list } = filterByRadius([...uniq.values()], center, radiusMiles, geocodedById);
  const survivors = new Set(list.map(c => c.id));
  return media.filter(m => survivors.has(m.creatorId));
}
```

The hook is a thin stateful wrapper (debounce + react-query center + `useCreatorGeocoding` +
the `geocodedById` `useMemo`) around this pure core.

### 5.3 Controls (`DragonFeedGrid`)

Add to the existing controls block:
- **Zip input**: `inputMode="numeric"`, `maxLength=10`, placeholder `"Zip code"`, teal focus
  ring per design system. A small `MapPin` icon prefix (lucide) to distinguish it from the
  name search's `Search` icon.
- **Radius `Select`**: `10 mi / 25 mi / 50 mi / 100 mi / Any`, default `25 mi`, disabled/greyed
  until a zip is entered.
- Layout: desktop inline in the existing `sm:flex-row` row; mobile stacked
  (`flex-col`): name search full-width, then a row of `[Zip] [radius]`, then `All Types`.
- The **Clear** button (already present) also resets zip + radius to defaults.
- Active-filter badges: add a "Near {zip} · {radius}" badge alongside the existing search/type
  badges, with an `X` to clear just the zip.
- `status === 'resolving'` → subtle spinner/greyed state on the radius; `'failed'` → inline
  hint "Couldn't find that zip — try another." (no results dropped).

### 5.4 Rendering — mobile `FeedPost` vs desktop `FeedTile`

`DragonFeedGrid` applies the name + type filter to the raw media (`nameTypeFiltered`), passes
that into `useFeedLocationFilter(nameTypeFiltered)`, and renders the hook's returned
`filteredMedia` (= name + type + zip). Then:

```tsx
const isMobile = useIsMobile();
...
{filteredMedia.length === 0 ? <EmptyState/> : isMobile ? (
  <div className="space-y-4">
    {filteredMedia.map((m, i) => <FeedPost key={m.id} media={m} onOpen={() => setViewerIndex(i)} />)}
  </div>
) : (
  <div className="-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5">
    {filteredMedia.map((m, i) => <FeedTile key={m.id} media={m} onOpen={() => setViewerIndex(i)} />)}
  </div>
)}
```

Note: desktop keeps the exact existing grid classes. The `grid-cols-3` base is now only
reached on desktop widths in the **`md`→`lg` band (768–1023px)** — mobile (<768) never renders
the grid because `useIsMobile` routes it to `FeedPost`. `FeedTile` is **unchanged**.

**New `FeedPost.tsx`** (mobile IG card):
- Container: `rounded-2xl` card, white bg, subtle border per design system (teal-adjacent, no
  gray). One per row.
- **Header** (`button`, tap → `navigate('/creator/' + (media.creatorSlug || media.creatorId))`):
  avatar (`avatar_url` or `User` fallback, `rounded-full` + teal ring per design system) +
  `creatorName` (truncate). Mirrors `FeedViewer`'s existing creator button + route.
- **Media** (`button`, tap → `onOpen()` → `FeedViewer`): full-width, `aspect-square`,
  `object-cover`. Image `loading="lazy"`; video `muted playsInline preload="metadata"` with
  the same top-right `Play` badge as `FeedTile`. Reuse `FeedTile`'s loaded/error state pattern
  (extract a small shared `FeedMedia` presentational piece if it reduces duplication; else copy
  the ~15-line pattern — logic-dup-≤twice rule).
- Accessibility: header `aria-label={`View ${creatorName}'s profile`}`, media
  `aria-label={`View ${type} by ${creatorName}`}`, teal focus-visible ring.

### 5.5 `FeedViewer` (`src/components/dragon-feed/FeedViewer.tsx`)

Minimal additive edit: render `activeItem.avatarUrl` inside the existing bottom-bar `Avatar`
(add `AvatarImage`) with the current `User` fallback preserved. No structural change.

## 6. Edge Cases

- **Non-zip text in the zip box** (e.g. a city name) → ignored (`status: 'idle'`), no filter.
  Rationale: the request was specifically a *zip* box; city search stays on the name box.
- **Zip geocode fails / offline** → keep all media, show the inline "couldn't find that zip"
  hint. Never a silent empty feed.
- **Zip valid but 0 creators in range** → existing "No content found" empty state, augmented
  with a "Try a wider radius or 'Any'" nudge (only shown when a zip filter is active).
- **Creator unplaceable** (only freeform `location`, no `city`/`postal_code`) → excluded while
  a zip is active; counted internally (may surface a subtle "N not shown — no location on
  file" note, low priority; can defer).
- **Viewport resize across 768px** while browsing → `useIsMobile` re-renders into the other
  layout; `filteredMedia` and `viewerIndex` are preserved (same array), so an open lightbox
  keeps its position.
- **Media that fails to load** → per-item error state (existing pattern), not a whole-feed
  failure.

## 7. Testing

- **Unit** (`src/lib/creatorLocationFilter.test.ts` sibling or new
  `useFeedLocationFilter` pure-core test):
  - `filterMediaByRadius`: media from an in-radius creator kept; out-of-radius dropped;
    unplaceable dropped only when a center is set; "Any" (null radius) keeps placeable;
    no center → passthrough.
  - Dedup: multiple media items from one creator all kept/dropped together.
  - `detectQueryKind` gating: `"07030"` → zip; `"Hoboken"` → not a zip (no filter).
- **Component smoke** (optional, existing testing-library setup): controls render on both
  viewports; entering a zip narrows the count text.
- **Build/verify**: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test`.
- **Prod verify** (post-deploy, `verify-prod`): screenshot mobile (single-column feed +
  header) and desktop (unchanged grid); enter a zip on both; check console clean.

## 8. Rollout / Risk

- Pure frontend; ships on merge → Vercel. No migration, edge fn, secret, or RLS change.
- Reversible (revert the PR). No data writes.
- Cost: geocoding is client-side and lazy (only on a typed zip), react-query-cached 24h; ≤50
  creators per feed load. Negligible; no `donny_cost_ledger` / AI-budget impact.
- Design-system compliance: pill/rounded controls, teal focus rings, **no gray** surfaces,
  mobile base classes vs desktop `lg:`/`xl:` kept strictly separate (D1/D2).

## 9. Files Touched

**Modified**
- `src/hooks/useUniqueCreatorPortfolio.ts` — extend select + `PortfolioMedia` fields.
- `src/components/dragon-feed/DragonFeedGrid.tsx` — zip/radius controls, `useFeedLocationFilter`
  wiring, `useIsMobile` render branch.
- `src/components/dragon-feed/FeedViewer.tsx` — render `avatarUrl` in the existing avatar.
- `src/lib/creatorLocationFilter.ts` — add pure `filterMediaByRadius` helper (+ tests).

**New**
- `src/hooks/useFeedLocationFilter.ts` — zip/radius state + geocoding + filter.
- `src/components/dragon-feed/FeedPost.tsx` — mobile IG-style post card.
- (optional) `src/components/dragon-feed/FeedMedia.tsx` — shared media/loaded/error piece if it
  cleanly de-dups `FeedTile`/`FeedPost`.

**Unchanged**
- `FeedTile.tsx`, `useCreatorGeocoding.ts`, `geocoding.ts`, `useFeedLike`, `useMessageCreator`,
  `BusinessDragonFeed.tsx`, `CreatorDragonFeed.tsx` (they just pass through the shared grid).

## 10. Musk's-Algorithm Summary

- **Deletes**: the double-mount trap (JS branch, one media tree); new matching code (reuses the
  tested geo stack).
- **Simplifies**: one shared component still serves both pages; the pure filter core is
  unit-testable in isolation.
- **Automates**: local-creator discovery — type a zip, see only nearby creators' work.
- **Keystrokes removed**: a restaurant finds local talent with one zip entry instead of
  scrolling the entire feed.
