# Session — Find Creators "near me" location/radius search (2026-07-07)

Branch: `feat/find-creators-location-search`. Frontend-only (no schema / edge fn / RLS change).
Spec: `docs/superpowers/specs/2026-07-07-find-creators-location-search-design.md`.
Plan: `docs/superpowers/plans/2026-07-07-find-creators-location-search.md`.

## What shipped

The restaurant **Find Creators** page (`/dashboard/business/creators`, `src/pages/CreatorBrowse.tsx`)
gained a prominent **location + radius control** so a business finds creators near a place. The search
bar previously matched only name/bio/skills; location filtering existed but was buried in the Advanced
Filters sheet as exact-match Zip/City/Country inputs.

- **Default "near me":** centers on the restaurant's own saved `business_profiles` location (0 keystrokes),
  filtered to 25 mi, sorted "Nearest first", with "· N mi away" on each card.
- **"Another area" override:** type a city or ZIP (auto-detected) to search elsewhere ("I need content
  made in another city"). Debounced geocode → center.
- **Radius chips:** 10 / 25 / 50 / 100 mi / Any.
- **Empty-state safety net:** a radius that returns 0 shows a one-tap "Widen to Any location"; a subtle
  "N couldn't be placed by distance" note when some creators lack resolvable location.
- **Consolidation:** the buried Zip/City/Country advanced filters were removed; the new control is the
  single source of truth (map centering + activeFilterCount rewired onto it). **County was dropped** as a
  redundant, higher-cost proxy for the same "near me" intent.

All filtering stays **client-side** over the one-shot creator fetch, reusing the existing geo stack
(`geocoding.ts`, `geoUtils.ts` haversine, `usCityCoords.ts` static table, `useCreatorGeocoding`,
`CreatorMapView`). No migration.

## Key decisions

- **Approach A (client-side radius), not server-side lat/lng** — reuses existing geo code, no schema
  change, fits the all-client-side page; upgradeable to a server distance query later without UX change.
- **Brand page too (founder call).** `CreatorBrowseHeader` is shared with the hidden, flag-gated brand
  `BrandCreators` page. Removing the shared Zip/City/Country stripped brand location filtering, so the
  control was wired onto the brand page too with **role-neutral copy** ("Near me") and a **role-aware
  center** (`useCreatorBrowse(accountType)` → `useBusinessLocationCenter(accountType)`). **Brands default
  to no active radius** (`radiusMiles: null`) so the brand surface never silently hides creators before
  the user opts into a location search; restaurants keep the auto-near-me 25 mi default.
- **ZIP-precise geocoding (founder call).** Prefer precise ZIP/address geocoding over the static
  city-centroid fast path (which in a big metro misplaces by miles and wrongly includes/excludes creators
  in a 10–25 mi search). `resolveCreatorCoords` precedence flipped to geocoded-first, static-city
  fallback; ZIP-coded creators are always geocoded; the near-me center is postal-first.
- **Legacy freeform `location` fallback.** Existing profiles with only a freeform `location` string (no
  structured city/ZIP) are geocoded as a last resort so a business keeps its near-me default and legacy
  creators don't vanish as "unplaceable".

## Files

- New: `src/lib/creatorLocationFilter.ts` (+`.test.ts`, 14 tests) — pure `detectQueryKind`,
  `resolveCreatorCoords`, `filterByRadius`, `sortNearest` + the `LocationFilter` model.
- New: `src/hooks/useBusinessLocationCenter.ts` — role-aware default center (postal-first, freeform
  fallback).
- New: `src/components/creator-browse/CreatorLocationControl.tsx` — pill + desktop Popover / mobile Sheet
  (`useIsMobile`), segment toggle, custom input, radius chips; `aria-pressed` throughout.
- Modified: `src/hooks/useCreatorBrowse.ts` (location model + effects + lazy geocoding + radius filter +
  nearest sort; accountType param), `CreatorBrowseHeader.tsx` (mount control, gate Nearest sort),
  `CreatorCard.tsx` (distance line), `CreatorMapView.tsx` (center on model), `CreatorBrowseContent.tsx`
  (widen nudge + note), `CreatorBrowse.tsx` / `BrandCreators.tsx` (wiring),
  `creator-search/AdvancedCreatorFilters.tsx` (legacy location UI removed).

## Process / gotchas

- Built via brainstorm → spec (reviewed) → plan (reviewed) → subagent-driven execution (6 tasks, two-stage
  review each) → whole-branch review → **Codex second review**.
- The plan kept builds green by **adding the location model additively (Task 3) then removing the legacy
  fields in one red→green task (Task 6)**.
- Codex ran **six rounds**, each catching a legitimate effect-dependency / edge-case bug before it clean:
  stale custom center on empty query; near-me re-sync on mode switch and on Clear-All-Filters (the
  sync effect only fires on `[businessCenter, mode]` changes); brand-default auto-hide; ZIP precision;
  legacy-`location` placement. Pattern worth remembering: **React effect-driven state sync silently goes
  stale when a reset/among-mode path doesn't change any dependency** — restore the value directly in the
  reset rather than relying on the effect.
- Shared-component coupling lesson: editing `AdvancedCreatorFilters`/`CreatorBrowseHeader` (used by both
  `CreatorBrowse` and `BrandCreators`) affects the brand surface — always grep for the second consumer.
