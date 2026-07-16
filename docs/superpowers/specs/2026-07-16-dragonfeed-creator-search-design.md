# DragonFeed — Instagram-style creator search

- **Date**: 2026-07-16
- **Status**: Design (approved for planning)
- **Author**: Claude (brainstorm with Dame)
- **Type**: Frontend-only feature (evolves the DragonFeed zip work, PR #242)
- **Branch**: `feat/dragonfeed-creator-search` (off `origin/main`)
- **Surfaces**: `DragonFeedGrid` (shared by `BusinessDragonFeed` + `CreatorDragonFeed`).

## 1. Problem / Motivation

Two founder requests after the DragonFeed mobile+zip work (PR #242) shipped and verified:

1. **Default to any location.** A business anywhere should browse/search creators in *any* location
   by default, not be biased to its local area.
2. **Instagram-style search.** When searching by creator name and/or zip, the results should look
   like Instagram's people search (screenshot supplied): a **vertical list of matching creators**
   (avatar + name + a sub-line), each tappable to that creator's profile — not a filtered media grid.

**Consequence for PR #242:** in #242 a zip *narrowed the media grid* to nearby creators' posts. The
founder now wants a zip (like a name) to produce the **Instagram creator list**. So a zip becomes a
**search trigger**, and #242's media-zip-filter (`useFeedLocationFilter` + the `filterMediaByRadius`
helper) is **superseded and removed** — there is no longer any "narrow the media grid by zip" path.
This is the intended evolution, not a regression (it's exactly what request #2 asks for).

## 2. Decisions (locked during brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Search results shape | **Instagram-style creator list** (rows), replacing the media feed while a search is active |
| D2 | Row sub-info | **Location · ★rating (review count) · post count** + a row of **top skills** |
| D3 | Location model | **Global by default, location narrows** — name matches anywhere; an optional **location query (ZIP *or* city name)** is a radius filter *on the creator list* |
| D4 | Search-mode trigger | Active when **name OR location (zip/city)** is present; empty (no name, no location) → the browse media feed |
| D5 | Type (image/video) filter | Browse mode only (it filters posts). Hidden in search mode |
| D10 | Location input | Accepts a **ZIP code or a city name** (placeholder "Zip or city", free text). Any query ≥3 chars is geocoded to a center via `geocodingService.geocodeLocation(query)` (Google geocodes either) — NOT zip-only |
| D6 | Search scope | Creators **who have content in the feed** (the "Dragon Feed" scope); do NOT duplicate Browse Creators |
| D7 | Escape hatch | A **"Browse all creators →"** link at the bottom of the creator-list results (business feed only) → the existing Browse Creators page |
| D8 | Tap target | A creator row → `/creator/{creatorSlug || creatorId}` (same route the feed header/lightbox use; `creatorSlug` is the denormalized `profile_slug` and can be `''`, so the `|| creatorId` fallback is required) |
| D9 | #242 media-zip-filter | **Removed** — a zip now triggers search mode, so `useFeedLocationFilter` + `filterMediaByRadius` (+ its tests) are deleted (superseded by the creator search) |

## 3. Goals / Non-Goals

**Goals**
- Typing a creator name shows a global (any-location) IG-style creator list.
- Typing a **ZIP or a city name** narrows that list to creators within the radius (reusing
  `filterByRadius` + the geocoding stack from PR #242; `geocodeLocation` handles zip or city).
- Rows show avatar + name (matched letters emphasized) + location · rating · posts + skills.
- Empty search → the existing browse feed (media grid desktop / IG `FeedPost` feed mobile),
  otherwise unchanged (minus the now-removed zip media-filter).
- Frontend-only; reuse `filterByRadius`/`geocodingService`/`useCreatorGeocoding`. No backend change.

**Non-Goals (YAGNI)**
- No exhaustive creator search (all creators regardless of feed content) — that's Browse Creators.
- No new backend, RPC, RLS, or schema change; no "followers" concept.
- No change to the browse-mode media tiles (`FeedTile`/`FeedPost`) or the `FeedViewer` lightbox.
- No sort controls, pagination, or infinite scroll in v1 (≤50-creator scope doesn't need them).

## 4. Architecture Overview

`DragonFeedGrid` owns ALL the control state — `searchTerm`, `locationQuery` (zip or city),
`radiusMiles` — and calls every hook **unconditionally at the top level**; only the *rendered tree*
branches on `searchActive`.

```
DragonFeedGrid  (shared; both feed pages)
  state (owned here): searchTerm, typeFilter, locationQuery, radiusMiles, viewerIndex
  const isMobile = useIsMobile()
  const { portfolioMedia } = useUniqueCreatorPortfolio()   // EXTENDED: + skills, rating, reviews
  const feedCreators = useMemo(() => feedCreatorsFromMedia(portfolioMedia), [portfolioMedia])
  const search = useFeedCreatorSearch(feedCreators, searchTerm, locationQuery, radiusMiles)  // CONTROLLED (no setters)
  const searchActive = searchTerm.trim() !== '' || locationQuery.trim() !== ''

  controls row: [Search creators…]  [All Types ▾ — browse only]  [Zip or city]  [radius ▾]  [Clear]

  if searchActive:  → <FeedCreatorList creators={search.results} status={search.status}
                                       locationActive={search.locationActive}
                                       searchTerm={searchTerm} browseAllHref={browseAllHref} />
  else (browse):    mobile → <FeedPost> stack   desktop → <FeedTile> grid
                    (media type-filtered by typeFilter; NO location filter — a location query would be searchActive)
```

Only one tree renders at a time. `useFeedCreatorSearch` is always called (its internal geocoding is
lazy/no-op unless a valid location query is present), so there is no conditional-hook issue.

## 5. Detailed Design

### 5.1 Data — extend `useUniqueCreatorPortfolio` (`src/hooks/useUniqueCreatorPortfolio.ts`)

`PortfolioMedia` already carries `creatorId, creatorName, creatorSlug, avatarUrl, city, postalCode,
country, location` (PR #242). Add the creator-card fields:

Select add: **`skills, average_rating, total_reviews`** (all exist on `creator_profiles`; confirmed
via `useCreatorBrowse`). Interface add:

```ts
  // NEW (per-creator, denormalized onto each of that creator's media items):
  skills?: string[];
  averageRating?: number | null;
  totalReviews?: number | null;
```

Attach in the flatMap: `skills: Array.isArray(creator.skills) ? creator.skills : undefined`,
`averageRating: creator.average_rating ?? null`, `totalReviews: creator.total_reviews ?? null`.
Additive; browse mode ignores them.

### 5.2 Pure grouping — `feedCreatorsFromMedia` (in `src/lib/feedCreators.ts`, unit-tested)

Groups the feed's media into a creator list with a post count. One entry per `creatorId`.

```ts
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

export function feedCreatorsFromMedia(media: PortfolioMedia[]): FeedCreator[] {
  const map = new Map<string, FeedCreator>();
  for (const m of media) {
    const existing = map.get(m.creatorId);
    if (existing) { existing.postCount += 1; continue; }
    map.set(m.creatorId, {
      creatorId: m.creatorId,
      creatorName: m.creatorName,
      creatorSlug: m.creatorSlug,
      avatarUrl: m.avatarUrl,
      city: m.city, country: m.country, postalCode: m.postalCode, location: m.location,
      skills: m.skills ?? [],
      averageRating: m.averageRating ?? null,
      totalReviews: m.totalReviews ?? null,
      postCount: 1,
    });
  }
  return [...map.values()];
}
```

Stable order = first-seen (the feed's shuffle order). No sort in v1.

Also a small pure `highlightMatch(name, term)` helper (same file): returns the segments of `name`
split around the case-insensitive `term` so the row can bold the matched span. No term / no match →
one plain segment. Unit-tested.

### 5.3 Search hook — `useFeedCreatorSearch` (`src/hooks/useFeedCreatorSearch.ts`)

**Controlled** — `locationQuery`/`radiusMiles` come in as props (the single source of truth in
`DragonFeedGrid`); the hook owns NO location state (no setters returned). This is the only geocoding
consumer in the app now (`useFeedLocationFilter` is deleted per D9), so there is no shared-state conflict.

```ts
interface FeedCreatorSearch {
  results: FeedCreator[];
  status: 'idle' | 'resolving' | 'failed';  // geocoding status of the typed location (zip or city)
  locationActive: boolean;                   // a resolved center is localizing the list
}
export function useFeedCreatorSearch(
  creators: FeedCreator[],
  searchTerm: string,
  locationQuery: string,   // ZIP or city name
  radiusMiles: number | null,
): FeedCreatorSearch
```

Internals (all hooks top-level; mirrors PR #242's proven `useFeedLocationFilter` shape, adapted to
creators + zip-or-city):
1. **Name filter (global, first):** `const named = creators.filter(c =>
   c.creatorName.toLowerCase().includes(searchTerm.trim().toLowerCase()))`. No location restriction (D3).
2. **Location → center (ZIP or city):** debounce `locationQuery` (~400ms); when the debounced value is
   ≥3 chars (a real place query, not zip-only — D10), geocode via React Query
   (`geocodingService.geocodeLocation(debounced)` → passed as the geocode query; Google resolves a zip
   OR a city string, 24h cache, keyed on the debounced value).
3. **Lazy creator geocoding:** `creatorsToGeocode = center && radiusMiles != null ? uniqueByCreator(named) : []`
   → `useCreatorGeocoding` → build `geocodedById` Map (the two PR #242 invariants: **skip geocoding
   under "Any" radius**; and don't drop while loading — see step 4).
4. **Location narrow (optional):** if no center → `results = named` (global, unfiltered). If a center
   but `status==='resolving'` (creators still geocoding) → `results = named` (don't transiently drop).
   Else run the pure `filterCreatorsByRadius(named, center, radiusMiles, geocodedById)`, which
   **explicitly remaps** each `FeedCreator` to the `{ id: creatorId, city, country }` shape
   `filterByRadius` expects (not a bare cast), then delegates to `filterByRadius` and returns the
   surviving `FeedCreator`s. Carry the freeform-`location` geocode fallback
   (`postalCode || (!city && !country ? location : undefined)`) when building `creatorsToGeocode`.
5. `status`: `debounced <3 chars → 'idle'`; center loading → `'resolving'`; center resolved but creator
   geocoding loading → `'resolving'`; center resolved-null → `'failed'`; else `'idle'`.
   `locationActive = validQuery && !!center`.

Filtering is a **pure function** `filterCreatorsByRadius(named, center, radiusMiles, geocodedById)`
in `feedCreators.ts` (unit-tested); the hook is the thin stateful wrapper (name filter + debounce +
React Query + `useCreatorGeocoding`) around it.

> **Refactor note (plan's call, non-blocking):** steps 2–3 are byte-similar to the deleted
> `useFeedLocationFilter`. The plan MAY extract a shared internal
> `useLocationCenter(locationQuery, radiusMiles, itemsToGeocode)` used only by `useFeedCreatorSearch`,
> or keep it inline. External behavior is identical; the tested pure filter is unchanged either way.

### 5.4 `DragonFeedGrid` mode switch (`src/components/dragon-feed/DragonFeedGrid.tsx`)

- **Lift/own** `searchTerm`, `typeFilter`, `locationQuery`, `radiusMiles`, `viewerIndex` state here.
- Call `useUniqueCreatorPortfolio`, `useIsMobile`, `useMemo(feedCreatorsFromMedia)`,
  `useFeedCreatorSearch(...)` unconditionally at the top (before any early `return`).
- `searchActive = searchTerm.trim() !== '' || locationQuery.trim() !== ''`.
- **Delete** the `useFeedLocationFilter` import + usage (superseded, D9). Browse mode renders the
  media directly, filtered only by `typeFilter`.
- **Controls:** Search box + location input (**placeholder "Zip or city"**, free text — NOT
  `inputMode="numeric"`/`maxLength=10`; a `MapPin` icon prefix) + radius `Select` always visible;
  **All Types** `Select` shown only when `!searchActive` (browse). `Clear` resets
  searchTerm/typeFilter/locationQuery/radius; visible when any is set.
- **Render:** `searchActive` → `<FeedCreatorList>`; else the existing `isMobile ? FeedPost stack :
  FeedTile grid` over the `typeFilter`-filtered media.
- **Count line:** browse → "N items found"; search → "Finding nearby creators…" while
  `status==='resolving'`, else "N creators found".

### 5.5 `FeedCreatorList` + `FeedCreatorRow` (`src/components/dragon-feed/`)

`FeedCreatorRow` (both viewports; full-width row, tap → profile). Prop is a `creator: FeedCreator`
(+ `searchTerm` for match emphasis):

```
┌───────────────────────────────────────────────┐
│ ●avatar   Dave Fano                            │   ← name bold; matched letters emphasized
│           Hoboken, NJ · ★ 4.9 (23) · 12 posts  │   ← meta line; omit missing segments
│           Food · Reels · Photography           │   ← up to ~3 skill chips
└───────────────────────────────────────────────┘
```

- Row is a `button`/`Link`, tap → `navigate('/creator/' + (creator.creatorSlug || creator.creatorId))`
  (the `|| creatorId` fallback matters — `creatorSlug` can be `''`).
- Avatar: `Avatar`/`AvatarImage`/`AvatarFallback` (teal ring), `creator.avatarUrl`.
- Name: bold `dc-text`; **match emphasis** via `highlightMatch(creator.creatorName, searchTerm)` —
  render segments, bolding the matched one.
- Meta line (`text-dc-text-muted`): join present segments with " · " — location
  (`creator.city || creator.location`), rating (`★ {averageRating.toFixed(1)} ({totalReviews})` only
  when `totalReviews && totalReviews > 0`), `{postCount} post{postCount===1?'':'s'}`.
- Skills: first ~3 as small teal-tinted pill chips (per design system; NOT gray).
- Design system: white row, teal focus-visible ring, dividers or `rounded-2xl` per row; avatar
  `rounded-full ring-2 ring-teal-400`. No gray surfaces.

`FeedCreatorList`:
- Renders the rows (a divided / `space-y-2` list).
- **Empty state:** "No creators found" + a nudge ("Try a different name", or "Try a wider radius or
  'Any'" when `locationActive` — passed in as a prop from the search hook).
- **Footer link (business feed only):** when the `browseAllHref` prop is set, a
  "Browse all creators →" link to it. Always shown at the bottom of the results (and in the empty
  state). `CreatorDragonFeed` omits the prop → no link.

### 5.6 Page wiring

- `BusinessDragonFeed` → `<DragonFeedGrid browseAllHref="/dashboard/business/creators" />`.
- `CreatorDragonFeed` → `<DragonFeedGrid />` (no `browseAllHref`).

`DragonFeedGrid` gains an optional prop: `interface Props { browseAllHref?: string }`.

## 6. Edge Cases

- **Search term matches nothing** → "No creators found" empty state (+ browse-all link on business).
- **Location (zip/city) mid-geocode in search mode** → don't drop creators; show "Finding nearby
  creators…"; once resolved, narrow (mirrors PR #242's fix).
- **Ambiguous / unresolvable location text** (e.g. a 1–2 char fragment, or a city Google can't place)
  → `status` stays `'idle'`/`'failed'`, no narrowing (results = name-filtered list); a `'failed'`
  center shows a gentle "Couldn't find that location" hint. Never a silent empty.
- **Creator with no location** → still listed (name search is global); meta line omits the location
  segment; under an active finite-radius location they're placed via the freeform-`location` fallback,
  else excluded from the narrowed list.
- **Creator with 0 reviews** → omit the rating segment (never "★ 0").
- **Only a location typed, no name** → search mode listing all feed creators near that zip/city.
- **"Any" radius + location** → creators listed globally (the location resolves the mode but the
  radius doesn't narrow); no creator geocoding fires (the skip-under-Any invariant).
- **Viewport resize across 768px while searching** → the creator list is layout-responsive, no mode
  change (search mode is viewport-independent). Browse mode still branches on `useIsMobile()`.

## 7. Testing

- **Unit** (`src/lib/feedCreators.test.ts`):
  - `feedCreatorsFromMedia`: dedup by creatorId; `postCount` counts a creator's media; fields carried;
    empty input → `[]`.
  - `highlightMatch`: bolds the matched span, case-insensitive; no term / no match → one plain segment.
  - `filterCreatorsByRadius`: in-radius kept, far dropped, unplaceable dropped under finite radius,
    passthrough when no center, "Any" keeps all placeable (mirrors PR #242's `filterMediaByRadius`
    cases, at the creator level). Remove the now-dead `filterMediaByRadius` tests.
- **Build/verify:** `npm run typecheck`, `npm run lint` (no `react-hooks/rules-of-hooks`, no unused
  imports after the `useFeedLocationFilter` deletion), `npm run build`, `npm run test` (feed unit files).
- **Prod verify** (post-deploy): desktop — type a name → creator list rows (matched letters bold, meta
  + skills); type a **zip** → narrows; type a **city name** (e.g. "Jersey City") → narrows; "Any" → all;
  clear → browse feed returns; "Browse all creators →" navigates. Mobile IG list on-device (founder).

## 8. Rollout / Risk

- Pure frontend; ships on merge → Vercel. No migration/edge-fn/secret/RLS change. Reversible.
- Removing `useFeedLocationFilter` + `filterMediaByRadius`: they were added in PR #242 and are now
  superseded; deleting them (and their tests) is safe because nothing else imports them (the plan
  greps to confirm before deleting).
- Cost: geocoding is the same lazy, cached client path as PR #242 (only on a typed zip).
- Design-system compliance: teal focus rings, no gray surfaces, pill chips, mobile base vs desktop
  `lg:` kept separate.

## 9. Files Touched

**Modified**
- `src/hooks/useUniqueCreatorPortfolio.ts` — select + `PortfolioMedia` fields (skills/rating/reviews).
- `src/components/dragon-feed/DragonFeedGrid.tsx` — own all control state, remove
  `useFeedLocationFilter`, mode switch, search render, `browseAllHref` prop.
- `src/pages/BusinessDragonFeed.tsx` — pass `browseAllHref="/dashboard/business/creators"`.
- `src/lib/creatorLocationFilter.ts` — **remove** `filterMediaByRadius`.
- `src/lib/creatorLocationFilter.test.ts` — **remove** the `filterMediaByRadius` describe block.

**New**
- `src/lib/feedCreators.ts` (+ `.test.ts`) — `feedCreatorsFromMedia`, `highlightMatch`,
  `filterCreatorsByRadius`.
- `src/hooks/useFeedCreatorSearch.ts` — controlled name + zip creator search.
- `src/components/dragon-feed/FeedCreatorList.tsx`, `FeedCreatorRow.tsx`.

**Deleted**
- `src/hooks/useFeedLocationFilter.ts` — superseded by the creator search (D9).

**Unchanged**
- `FeedTile.tsx`, `FeedPost.tsx`, `FeedViewer.tsx`, `useCreatorGeocoding.ts`, `geocoding.ts`,
  `CreatorDragonFeed.tsx` (renders `<DragonFeedGrid />` unchanged).

## 10. Musk's-Algorithm Summary

- **Deletes**: the media-zip-filter path (`useFeedLocationFilter` + `filterMediaByRadius`) — one code
  path removed, replaced by the single creator search; and the "why can't I find creator X here?"
  confusion (the Browse-all link).
- **Simplifies**: one search box, two obvious modes (empty = browse content, typing = find creators);
  a single zip consumer instead of two.
- **Automates**: global creator discovery — a business anywhere finds any creator's content.
- **Keystrokes removed**: type a name → the creator, no scrolling a media grid guessing whose post is whose.
