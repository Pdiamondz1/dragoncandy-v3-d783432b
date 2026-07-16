---
title: Creator Location Search
type: concept
created: 2026-07-07
updated: 2026-07-16
sources: [2026-07-07-find-creators-location-search.md, 2026-07-16-fix-ai-creator-matching-location.md]
tags: [find-creators, geocoding, radius, frontend, browse]
---
# Creator Location Search

The "near me" location + radius filter on the restaurant [[Find Creators]] page
(`src/pages/CreatorBrowse.tsx`) — how a business finds creators near a place. Client-side, no schema
change; reuses the existing geo stack (Google geocoding, haversine, a static US-city table, the creator
map). Also wired onto the hidden brand `BrandCreators` browse. Shipped 2026-07-07 on branch
`feat/find-creators-location-search`.

## The model

One `LocationFilter` (in `src/lib/creatorLocationFilter.ts`) owns everything:
`{ mode: 'near_me' | 'custom' | 'any', center: {lat,lng,label} | null, radiusMiles: number | null,
rawQuery: string, status: 'idle'|'resolving'|'failed' }`. It lives in `useCreatorBrowse`'s filter state;
the presentational `CreatorLocationControl` (pill → desktop Popover / mobile Sheet) emits patches via
`updateLocation`, and the hook resolves centers + geocodes creators + filters/sorts.

- **near_me** (restaurant default): center comes from the restaurant's own saved `business_profiles`
  location via `useBusinessLocationCenter(accountType)`. Zero keystrokes; default 25 mi.
- **custom** ("Another area"): a debounced effect geocodes the typed city/ZIP into a center.
- **radiusMiles `null`** = "Any" (no distance filter; distances still annotate when a center exists).

Pure helpers: `detectQueryKind` (5-digit/zip+4 → zip else city), `resolveCreatorCoords`,
`filterByRadius` (annotate + keep within radius + count the unplaceable), `sortNearest`.

## Precision: geocoded ZIP wins over the static city centroid

The static US-city table (`lookupCityCoords`) is instant and free but resolves everyone in a city to its
**centroid** — which in a large metro misplaces a creator by miles and wrongly includes/excludes them in
a 10–25 mi search. So precision is preferred:

- `resolveCreatorCoords` returns the **geocoded (ZIP-precise) result first**, static city coords only as a
  fallback.
- `creatorsNeedingGeocode` geocodes any creator that has a `postal_code` (even when its city is
  static-resolvable), so precise coords land in `geocodedById`.
- `useBusinessLocationCenter` resolves the center **postal-first**: ZIP geocode → static city → city
  geocode → freeform `location`.
- **Legacy freeform `location`**: profiles with only a freeform `location` string (no structured
  city/ZIP) are geocoded as a last resort, so businesses keep their near-me default and legacy creators
  aren't dropped as "unplaceable".

Geocoding is **gated on an active center** (no needless Google calls when there's no location filter) and
cached (localStorage 7d + React Query 24h).

## Shared-header / two-page coupling (the main trap)

`CreatorBrowseHeader` and `AdvancedCreatorFilters` are shared by **two** pages: restaurant
`CreatorBrowse` and the hidden, `BRAND_ROLE_ENABLED`-gated brand `BrandCreators`. Consequences handled:

- The header's location props are **optional** and the control renders only when wired; the "Nearest
  first" sort option is gated on the control being present.
- The control is on **both** pages (founder decision) with **role-neutral copy** and a **role-aware
  center** (`useCreatorBrowse(accountType)`), but **brands default to `radiusMiles: null`** so the brand
  surface never silently hides creators before the user opts in. Restaurants keep the auto-near-me 25 mi
  default.
- An unrelated **campaign** filter feature (`useBrandCampaignFilters`, `AdvancedCampaignFilters`) has its
  OWN local location fields — left untouched.

## Effect-sync staleness (Codex's repeated catch)

A React effect that syncs derived state only fires when a dependency changes. The near-me center sync
depends on `[businessCenter, filters.location.mode]`; several paths change *neither* yet expect the center
refreshed — so restore the value **directly in that path**, don't rely on the effect:

- **Clear All Filters** while in near_me → `resetFilters` sets `location.center` back to `businessCenter`
  (not `null`), else the page stuck on "Set your area".
- **"Another area"** clears the center immediately so stale restaurant results don't linger.
- **Shortening the custom query below 3 chars** clears center + status (not just status), else the grid
  keeps filtering by a stale place.

## Known limitations / next

- County / state / abbreviation search: not supported (no county/state columns; radius supersedes county).
- Server-side lat/lng + Postgres distance is the scale-up path; the UX is unchanged if adopted later.
- The map (`CreatorMapView`) places markers from structured fields only; freeform-`location`-only creators
  filter correctly but may not appear as map pins.

## See Also
- [[AI Creator Matching]] — the "Find Perfect Creators" matcher reuses this geo stack, **ported**
  into `supabase/functions/_shared/geo.ts` (edge functions can't import from `src/`); the tested
  `src/lib` helpers here remain the source of truth.
- [[Find Creators]] · [[Deep-Link Param Query Race]] · [[Musk's Algorithm]] (deletes county + 3 buried fields)
- [[Google Maps]] geocoding · [[Organizations]] (per-location centering is a future enhancement)
