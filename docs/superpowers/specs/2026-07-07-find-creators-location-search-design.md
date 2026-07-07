# Find Creators — Location ("Near me" radius) search — Design

> Status: approved design (brainstorming). Next: implementation plan.
> Date: 2026-07-07 · Branch: `feat/find-creators-location-search`

## 1. Problem & goal

On the restaurant/business **Find Creators** page (`/dashboard/business/creators`,
`src/pages/CreatorBrowse.tsx`), the main search bar matches only **name / bio / skills**. A
restaurant wants to find creators **near a place** — usually near their own restaurant, but
sometimes in **another city** where they need content made. Today that capability is half-built and
buried: the **Advanced Filters** sheet already has separate **Zip / City / Country** text inputs, but
they're one click away, they're exact-match (a Hoboken restaurant searching "Hoboken" misses a
creator one town over), and there is no "near me" / radius concept.

**Goal:** a prominent, low-typing **location + radius** control on the Find Creators header that
defaults to the restaurant's own saved location ("near me") and lets the user override with a **city
or zip** and pick a **radius**. Results filter to that radius and can sort **Nearest first**. This
resolves the request "find creators by Zip Code, City, or County" — **County is dropped** as a
redundant, higher-cost proxy for the same "near me" intent.

Aligned to the north star (*less typing = more margin*): the default case is **zero keystrokes** (center
comes from the restaurant's profile). Musk's algorithm: **delete** the three separate Advanced-Filter
location fields and County; **simplify** to one location source of truth.

## 2. Chosen approach (A) — client-side radius, reuse the existing geo stack

All filtering on this page is already **client-side** over a one-shot fetch of completed creators
(`useCreatorBrowse.ts`). We keep that architecture. No schema change, no migration, no server round-trip.
We reuse the geo primitives that already exist:

- `src/lib/geocoding.ts` — `geocodingService.geocodeLocation(postal?, city?, country?)` and
  `lookupPostalCode(zip)` (Google Geocoding, localStorage-cached 7 days).
- `src/lib/geoUtils.ts` — `haversineDistance(lat1,lng1,lat2,lng2)` (miles) and
  `lookupCityCoords(city, country)` (static, instant, free).
- `src/lib/usCityCoords.ts` — ~250 US cities → coords (fast path, no API call).
- `src/hooks/useCreatorGeocoding.ts` — batch-geocodes creators (currently for the map).
- `src/components/creator-browse/CreatorMapView.tsx` — existing map, re-centered on the new center.

Rejected alternatives: **B (server-side lat/lng + Postgres distance)** — more accurate & scalable but
needs a migration, backfill, and geocode-on-save; converts a client-side page to server-side; overkill
pre-launch. Approach A can be upgraded to B later **without changing this UX**. **C (surface exact
zip/city on the bar, no radius)** — cheapest but doesn't deliver "near me" (misses adjacent towns).

## 3. Current state (verified in code)

- **Creator query** (`src/hooks/useCreatorBrowse.ts:78-95`): `from('creator_profiles')` `.select(...)`
  incl. `location, city, country, postal_code`, `.eq('is_completed', true)`. All filtering is
  client-side (`:119-210`); search match is `creator_name || bio || skills` (`:122-124`). The
  `CreatorProfile` type is at `:7-32`.
- **Header** (`src/components/creator-browse/CreatorBrowseHeader.tsx`): search input `:76-85`,
  content-type pills `:87-112`, plus Sort dropdown, Filters button, Map button.
- **Advanced Filters** (`src/components/creator-browse/AdvancedCreatorFilters.tsx`): Zip/Postal
  `:133-153` (auto-fills city/country via `geocodingService.lookupPostalCode`), City `:156-169`,
  Country `:172-185`, then Skills/Platforms/Availability/Rate/Experience.
- **Page** (`src/pages/CreatorBrowse.tsx`): `activeFilterCount` (`:28-37`) counts
  `filters.city / filters.country / filters.postal_code`; passes `mapFilters={debouncedFilters}`.
- **Creator location columns:** `creator_profiles` has `city`, `country`, `postal_code`, `location`
  (freeform), `timezone`. **No** `latitude/longitude`, **no** `county`, **no** `state`.
- **Business default center (dependency — confirmed):** `business_profiles` stores `city`,
  `postal_code`, `country`, `location` (edited via `useBusinessProfileForm.ts`). So the "near me"
  center is available. (v1 centers on the business profile; per-location `org_units` centering is a
  future enhancement, out of scope.)

## 4. UX

A **Location control** renders on the header, directly under the search bar and above the category
pills, as a pill button in the teal/pink system (brand-adjacent — not gray):

```
📍 Near Uncle Rocco's · 25 mi ▾
```

Tapping opens a **Popover** (desktop) / bottom **Sheet** (mobile) with:

1. **Segment toggle:** *Near my restaurant* (default) · *Another area*.
2. **"Another area" → one text input** accepting a **city or zip**; auto-detected (5-digit / zip+4 →
   zip; otherwise treated as a city). Debounced, geocoded to a center. This is the "content in another
   city" path.
3. **Radius chips (tap, not type):** `10 · 25 · 50 · 100 mi · Any` — default **25 mi**.

Effects:
- The grid filters to creators within the radius.
- Each creator card gains a "**· 4 mi away**" line (cards already show a location line).
- The Sort dropdown gains **Nearest first**; when the user sets/changes a location, sort defaults to
  Nearest (reversible by picking another sort).
- Button label reflects state: `Near {business_name}`, `Near {typed place}`, or `Any location`.

**Design-system rules:** `rounded-full` pill, `dc-teal`/`dc-pink` tokens, teal border; mobile = base
classes, desktop = `lg:` (Sheet on mobile, Popover on desktop). Verify both viewports.

## 5. Data flow

**Default center** — new `src/hooks/useBusinessLocationCenter.ts`:
- React-Query fetch of the current user's `business_profiles` row (`account_type='restaurant'`),
  selecting `business_name, city, postal_code, country, location`.
- Geocode to `{ lat, lng, label }` via `geocodingService` (static `lookupCityCoords` fast-path first,
  then Google), label = `business_name`. Cached (React Query + geocoding cache).
- If `city` **and** `postal_code` are both empty → center `null` → control shows **"Set your area."**

**Custom center** — geocode the debounced typed zip/city via `geocodingService.lookupPostalCode` (zip)
or `geocodeLocation` (city).

**Creator coords** — reuse `useCreatorGeocoding` / `lookupCityCoords` to place each creator, then
`haversineDistance(center, creator)`.

**Filter + sort** — a pure module `src/lib/creatorLocationFilter.ts`:
- `detectQueryKind(raw): 'zip' | 'city'` (5-digit or zip+4 → zip).
- `annotateDistance(creators, center)` → adds `distanceMiles?: number` (undefined if unplaceable).
- `filterByRadius(creators, radiusMiles)` → when a center + finite radius are set, keep
  `distanceMiles <= radius`; drop unplaceable creators and **return their count** for the note.
- `sortNearest(creators)` → ascending by `distanceMiles`.
These are integrated into `useCreatorBrowse.ts`, replacing the old `city/country/postal_code`
filter branch with a single `filters.location` model:
`{ mode: 'near_me' | 'custom' | 'any', center: {lat,lng,label} | null, radiusMiles: number | null, rawQuery: string }`.

## 6. Consolidation (approved)

Remove the **Zip / City / Country** inputs from `AdvancedCreatorFilters.tsx`; the new control owns
location. Update:
- `useCreatorBrowse.ts` — drop `city/country/postal_code` filter fields, add the `location` model.
- `CreatorBrowse.tsx:28-37` — `activeFilterCount` counts the location model (active when
  `mode !== 'near_me'` default or a non-default radius), not the removed fields.
- `CreatorMapView.tsx` — currently centers on `postal_code/city/country` filters; re-point it to the
  new `filters.location.center`. (Map otherwise unchanged.)

## 7. Edge cases & error handling

- **No saved restaurant location** → control shows "Set your area"; typing a zip/city sets a custom
  center; include a soft link to Business Settings. No radius applied until a center exists. No crash.
- **Geocoding fails / offline** → fall back to static `lookupCityCoords`; if still unresolvable,
  degrade to plain city-name substring match with an inline note ("showing by city name — couldn't map
  exact distance"). The list never breaks.
- **Creators we can't place** → hidden while a radius is active; counted and surfaced subtly
  ("N creators couldn't be placed"). Shown normally under **Any location**.
- **International** → `geocodeLocation` handles non-US; static table is US-only (falls through to
  Google).
- **Debounce** the custom-location input (mirror the existing `debouncedFilters` pattern).

## 8. Testing

- Pure unit tests (`src/lib/creatorLocationFilter.test.ts`), geocoding mocked:
  `detectQueryKind` (zip / zip+4 / city / empty), `annotateDistance` (placeable vs missing coords),
  `filterByRadius` (inside/outside radius, unplaceable dropped + counted), `sortNearest` (ordering).
- Confirm `haversineDistance` has coverage; add a test if missing.
- Manual: both viewports (desktop Popover + mobile Sheet); default near-me with a seeded business
  location; "Another area" with a zip and with a city; radius changes; "couldn't be placed" note;
  no-business-location prompt.

## 9. Out of scope (deliberate)

- **County** search (dropped — redundant with radius; no county data stored).
- **Approach B** (DB `latitude/longitude` + Postgres distance) — future scale-up.
- **State / abbreviation** search (no `state` column).
- **Per-location / multi-unit (`org_units`) centering** — v1 centers on the business profile.
- Map redesign beyond re-centering.

## 10. Files

**New**
- `src/components/creator-browse/CreatorLocationControl.tsx` — the pill + Popover/Sheet.
- `src/hooks/useBusinessLocationCenter.ts` — default center from `business_profiles`.
- `src/lib/creatorLocationFilter.ts` (+ `.test.ts`) — pure detect/annotate/filter/sort helpers.

**Modify**
- `src/hooks/useCreatorBrowse.ts` — `location` filter model, distance annotation, radius filter,
  nearest sort; remove old zip/city/country branch.
- `src/components/creator-browse/CreatorBrowseHeader.tsx` — mount the control; add "Nearest first" to Sort.
- `src/pages/CreatorBrowse.tsx` — `activeFilterCount` for the location model.
- `src/components/creator-browse/AdvancedCreatorFilters.tsx` — remove Zip/City/Country inputs.
- `src/components/creator-browse/CreatorMapView.tsx` (+ its geocoding consumer) — center on the new model.
- The creator card component in `src/components/creator-browse/` — add "· X mi away".

**Reuse unchanged:** `src/lib/geocoding.ts`, `src/lib/geoUtils.ts`, `src/lib/usCityCoords.ts`,
`src/hooks/useCreatorGeocoding.ts`.

## 11. Deletes / simplifies / automates / keystrokes

- **Deletes:** 3 Advanced-Filter fields (Zip/City/Country) → 1 control; County dropped.
- **Simplifies:** one location source of truth feeding both the grid filter and the map.
- **Automates:** nothing new (no broken process automated — Musk rule respected).
- **Keystrokes removed:** default "near me" = **0** keystrokes vs. typing a location every visit.
