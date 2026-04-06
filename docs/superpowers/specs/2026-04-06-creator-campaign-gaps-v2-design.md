# Creator Campaign Gaps — Search, Filter & AI Matching Enhancements

**Date:** 2026-04-06
**Branch:** feat/creator-campaign-gaps
**Status:** Design approved

## Problem

The Creator Campaigns page already has basic search, content-type filters, delivery-tier filters, sorting, and Donny AI matching. However, several gaps remain:

1. No distance-based filtering (radius) — location matching is city-name only
2. No budget range filtering
3. No "Nearest" sort option
4. "Video" content type pill missing (Carousel occupies the top row instead)
5. Donny's Picks not visually promoted on mobile swipe cards
6. Empty state copy is generic, not context-aware

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Geo approach | Static US city → lat/lng map, client-side haversine | No permission prompts, works with existing city/country fields, good enough for 5-50mi radius granularity |
| City data scope | US-only, ~300 cities | Users are US-based; easy to expand later |
| Content type pills | Add Video to top row, move Carousel to expanded section | Top row fits 5 pills on 375px; Video is higher frequency than Carousel |
| Budget filter UX | Preset pill rows for min/max (not a range slider) | Consistent with existing pill UI, better mobile touch targets |
| Mobile Donny Picks | Banner on swipe cards (not a separate section) | Keeps swipe flow unbroken; banner + badge make picks more noticeable |
| Architecture | Compose with separate `useGeoDistance` hook | Geo logic is distinct from keyword filtering; keeps hooks focused and testable |
| Filter area background | White with bottom radius | Clean control surface that separates from gray page background |

## Design

### 1. Data Layer — Geo Utilities

**New file: `src/lib/usCityCoords.ts`**

Static map of ~300 US cities to `{ lat: number; lng: number }`. Keyed by lowercase city name. Approximate city-center coordinates. ~15-20KB.

```ts
export const US_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "new york": { lat: 40.7128, lng: -74.006 },
  "philadelphia": { lat: 39.9526, lng: -75.1652 },
  // ... ~300 entries
};
```

**New file: `src/lib/geoUtils.ts`**

Two pure functions:

- `haversineDistance(lat1, lng1, lat2, lng2): number` — returns distance in miles between two coordinate pairs.
- `lookupCityCoords(city: string, country: string): { lat: number; lng: number } | null` — normalizes the city name (lowercase, trim) and looks it up in the static map. Returns null for unknown cities. Country is normalized before comparison: lowercase, strip periods, handle common variants (`'us'`, `'usa'`, `'u.s.'`, `'u.s.a.'`, `'united states'`). All match to US. Non-US countries return null.

**New hook: `src/hooks/useGeoDistance.ts`**

Calls `useCreatorMatchProfile` internally to get the creator's city/country. Accepts an array of campaigns as its only parameter. Returns an object with `{ campaigns: GeoEnrichedCampaign[], creatorHasCoords: boolean }`. The `creatorHasCoords` flag lets the UI know whether distance-based features are meaningful.

```ts
export interface GeoEnrichedCampaign extends PublicCampaign {
  distanceMiles: number | null;
}

export const useGeoDistance = (campaigns: PublicCampaign[]) => {
  const { data: profile } = useCreatorMatchProfile();
  // ... memoized enrichment logic
  return { campaigns: enriched, creatorHasCoords: boolean };
};
```

The enrichment is memoized via `useMemo` over `[profile, campaigns]`. While the creator profile query is loading, all campaigns get `distanceMiles: null` and `creatorHasCoords` is `false` — no loading spinner needed, the page renders normally and distance features gracefully degrade.

Campaigns where either the creator or business city is unknown get `distanceMiles: null`. These campaigns are NOT excluded — they pass through distance filters but sort to the bottom under "Nearest" sorting.

### 2. Filter State Changes

**Modified: `src/hooks/useCampaignFilters.ts`**

Add to `CampaignFilterState`:

```ts
distanceRadius: 'any' | 5 | 10 | 25 | 50;
budgetMin: 'any' | 50 | 100 | 250;
budgetMax: 'any' | 250 | 500 | 1000 | 2000;
```

Add to `ContentTypeFilter`: `'video'`

The `'video'` filter is a **superset** of all video-based content types: it matches `video_reel`, `tiktok`, and `youtube_short` (the same types that `'reel'` matches). The distinction is semantic: "Video" is the broad category pill in the top row, while "Reel" is a more specific filter for short-form vertical video. In practice, for MVP, they match the same DB values. If new video content types are added later (e.g. `long_form_video`), `'video'` would include them while `'reel'` would not. Add `VIDEO_TYPES` constant: `['video_reel', 'tiktok', 'youtube_short']` — shared by both `'video'` and `'reel'` filters for now.

Add to `SortOption`: `'nearest'`

New filter functions:

- `matchesDistance(campaign, radius)` — if radius is `'any'`, pass. If campaign has no `distanceMiles`, pass (don't exclude unknowns). Otherwise, `distanceMiles <= radius`.
- `matchesBudget(campaign, min, max)` — logic:
  - Campaign's effective budget: `fixed_price` if set, otherwise fall back to `budget_min`/`budget_max` range.
  - For `budgetMin` filter: campaign passes if its max payout (`fixed_price ?? budget_max ?? 0`) >= filter min. (Campaign must offer at least this much.)
  - For `budgetMax` filter: campaign passes if its entry price (`fixed_price ?? budget_min ?? 0`) <= filter max. (Campaign's starting price must be at or below this.)
  - If campaign has no budget data at all (`fixed_price`, `budget_min`, `budget_max` all null), pass through (don't exclude unknowns).
  - **Min/max conflict:** if user selects `budgetMin` > `budgetMax`, auto-reset `budgetMax` to `'any'`. (Handled in the setter callback, not the filter function.)

New sort:

- `'nearest'` — sort by `distanceMiles` ascending. Campaigns with `null` distance go last.

`hasActiveFilters` updated to include distance and budget checks.

`clearFilters` resets all fields to defaults: `{ searchTerm: '', contentType: 'all', deliveryTier: 'all', sortBy: 'newest', distanceRadius: 'any', budgetMin: 'any', budgetMax: 'any' }`.

### 3. UI Components

**Modified: `src/components/campaigns/CampaignSearchFilters.tsx`**

White background (`bg-white`) with `rounded-b-2xl` bottom radius.

**Top row (always visible):**
- Search button (expands to full-width input with Donny icon)
- Content type pills: All | Photo | Video | Reel | Story
- Chevron expand button

**Expanded section (on chevron tap):**
- **Delivery Speed** label + pills: All | DragonDash ⚡ | Express | Standard
- **More Content Types** label + pill: Carousel
- **Distance** label + pills: Any | 5 mi | 10 mi | 25 mi | 50 mi
- **Budget Min** label + pills: Any | $50+ | $100+ | $250+
- **Budget Max** label + pills: Any | ≤$250 | ≤$500 | ≤$1k | ≤$2k+
- Sort dropdown (Nearest | Highest Budget | Newest | Ending Soon) + Clear filters link

Pill styling:
- Selected: teal (`bg-dc-teal text-white`) for content/distance/budget, pink (`bg-dc-pink text-white`) for delivery
- Unselected: `bg-gray-50 text-gray-600 border border-gray-200`
- Section labels: `text-[10px] font-semibold text-gray-400 uppercase tracking-wide`

**Modified: `src/components/campaigns/CampaignSwipeCard.tsx`**

When a campaign has a match score (is a Donny Pick):
- **Replaces** the existing `DonnyPicksBadge` overlay with a new banner treatment:
- Teal gradient banner at top of card: `bg-gradient-to-br from-dc-teal to-teal-600`
- Left: dragon icon + "Donny's Pick" white bold text
- Right: white pill badge with "95% Match" in teal
- Bottom of card info area: "Matches: Photography, Located in Philadelphia" in small gray text
- Card border: `border-2 border-dc-teal`
- The existing `DonnyPicksBadge` component remains available for the desktop `DonnyPicksRow` (unchanged) but is no longer rendered on swipe cards.

Regular cards remain unchanged.

### 4. Empty States

| Scenario | Condition | Copy | Action |
|----------|-----------|------|--------|
| No search results | `hasActiveFilters && filteredCount === 0` and distance is `'any'` | "No campaigns found. Try different filters or ask Donny for suggestions." | Clear filters button |
| No campaigns in area | `hasActiveFilters && filteredCount === 0` and distance is not `'any'` | "No campaigns in your area yet. Expand your search radius or check back soon." | Button to set distance to "Any" |
| No Donny matches | `donnyPicks.length === 0` and creator profile exists | "We're still learning your preferences. Complete more campaigns to improve your matches." | Subtle message, not blocking |
| No campaigns at all | `!hasActiveFilters && swipeCampaigns.length === 0` | Existing copy: "You've reviewed all available campaigns. Check back soon for new opportunities!" | Existing behavior |

### 5. Page Wiring

**Modified: `src/pages/CreatorCampaignMarketplace.tsx`**

1. Call `useGeoDistance(campaigns)` to get geo-enriched campaigns
2. Pass enriched campaigns to `useCampaignFilters` (instead of raw campaigns)
3. Pass distance data to `CampaignSearchFilters` (new props for distance/budget filter callbacks)
4. Pass match scores map to `CampaignSwipeCard` (already done)
5. Update empty state rendering to use the four-scenario logic

### 6. Sort Dropdown Update

Full sort options: Nearest | Highest Budget | Newest | Ending Soon

"Nearest" sorts by `distanceMiles` ascending, nulls last. If creator has no coords, all campaigns treated as equal distance (original order preserved). The "Nearest" sort option is always visible in the dropdown — no disabling or hiding. When it has no effect (no creator coords), it simply preserves the existing order, which is a fine UX.

## New Files

| File | Purpose |
|------|---------|
| `src/lib/usCityCoords.ts` | Static US city → coords map (~300 cities) |
| `src/lib/geoUtils.ts` | `haversineDistance()` + `lookupCityCoords()` |
| `src/hooks/useGeoDistance.ts` | Enriches campaigns with `distanceMiles` |

## Modified Files

| File | Changes |
|------|---------|
| `src/hooks/useCampaignFilters.ts` | Add distance/budget filter state, video content type, nearest sort, new filter functions |
| `src/components/campaigns/CampaignSearchFilters.tsx` | White bg, Video pill in top row, expanded section with Carousel/Distance/Budget pills |
| `src/components/campaigns/CampaignSwipeCard.tsx` | Donny Pick banner with match score badge + match reasons |
| `src/pages/CreatorCampaignMarketplace.tsx` | Wire useGeoDistance, pass new filter props, context-aware empty states |

## Not Modified

- No restaurant/business pages touched
- No database schema changes
- No Supabase edge functions
- Desktop `lg:` Tailwind classes preserved
- Existing Donny matching algorithm unchanged
- DonnyPicksRow (desktop) unchanged
