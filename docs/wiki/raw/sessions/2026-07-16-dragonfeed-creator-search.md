# Session — DragonFeed Instagram-style creator search (2026-07-16)

**Branch:** `feat/dragonfeed-creator-search` (off `origin/main` 9a7488d3). Frontend-only.
**Predecessor:** PR #242 (DragonFeed mobile vertical feed + zip-radius media search).

## What shipped

A second founder iteration on the shared Dragon Feed (`DragonFeedGrid`, used by both
`BusinessDragonFeed` and `CreatorDragonFeed`). Two asks:

1. **Default to any location.** A business anywhere should search creators in *any* location by
   default — not be biased to its own area.
2. **Instagram-style search.** Searching by name and/or location should produce a vertical **creator
   list** (avatar + matched name + sub-line, tap → profile), like Instagram's people search — not a
   filtered media grid.

### The model: two modes, one search box

`DragonFeedGrid` now owns ALL control state (`searchTerm`, `typeFilter`, `locationQuery`,
`radiusMiles`, `viewerIndex`) and calls every hook unconditionally at the top; only the *rendered
tree* branches on `searchActive = searchTerm.trim() !== '' || locationQuery.trim() !== ''`.

- **Browse mode (empty search):** the existing media feed, unchanged — desktop `FeedTile` grid /
  mobile `FeedPost` stack (branched on `useIsMobile()`), type-filtered only, `FeedViewer` lightbox.
- **Search mode (name and/or location present):** the media feed is replaced by a `FeedCreatorList`
  of `FeedCreatorRow`s — avatar (teal ring) + bold-matched name + meta line
  `location · ★rating (reviews) · N posts` + up to 3 teal-tinted skill chips; tap →
  `/creator/{creatorSlug || creatorId}`. A "Browse all creators →" footer link on the business feed
  (via `browseAllHref` prop) escapes to the full Browse Creators page; the creator feed omits it.

**Name match is global** (any location); an optional **location query (ZIP or city, ≥3 chars)**
geocodes to a center and narrows the creator list by radius (10/25/50/100/Any). "Any" lists everyone.

### Supersedes the PR #242 media-zip-filter

Because a zip now *triggers the creator list* (not "narrow the media grid"), the #242
`useFeedLocationFilter` hook + the `filterMediaByRadius` helper (+ its tests) are **deleted** as
superseded. This was the intended evolution, not a regression.

## Files

**New**
- `src/lib/feedCreators.ts` (+ `.test.ts`, 12 tests) — pure `FeedCreator`, `feedCreatorsFromMedia`
  (group media → one-per-creator + `postCount`), `highlightMatch` (case-insensitive name-match
  segments), `filterCreatorsByRadius` (reuses the tested `filterByRadius`, explicit
  `{id: creatorId, city, country}` remap).
- `src/hooks/useFeedCreatorSearch.ts` — CONTROLLED (locationQuery/radiusMiles passed in, no setters):
  global name filter + debounced zip/city geocode (≥3 chars, `geocodeLocation(query)`) + lazy creator
  geocoding (only under a finite radius) + the pure filter. Mirrors the deleted `useFeedLocationFilter`
  internals, adapted to creators.
- `src/components/dragon-feed/FeedCreatorRow.tsx`, `FeedCreatorList.tsx`.

**Modified**
- `src/hooks/useUniqueCreatorPortfolio.ts` — select + `PortfolioMedia` now carry
  `skills / averageRating / totalReviews` (real `creator_profiles` columns, per `useCreatorBrowse`).
- `src/components/dragon-feed/DragonFeedGrid.tsx` — browse/search mode switch; `browseAllHref` prop;
  location input placeholder "Zip or city" (free text, not `inputMode=numeric`); Type select hidden in
  search mode; a `useEffect` closes the lightbox on entering search so it can't re-pop when the search
  clears.
- `src/pages/BusinessDragonFeed.tsx` — passes `browseAllHref="/dashboard/business/creators"`.
- `src/lib/creatorLocationFilter.ts` + `.test.ts` — removed `filterMediaByRadius` + its describe block.

**Deleted**
- `src/hooks/useFeedLocationFilter.ts`.

## Key decisions / gotchas (reusable)

- **A zip is now a search TRIGGER, not a media filter.** This is the pivot from #242 and the reason
  the media-zip path is deleted. Recognizing that made two competing zip-state owners collapse into one.
- **Location box accepts ZIP *or* city** (founder: "zip/city creator-list filter"). The geocode gate is
  **≥3 chars** (not zip-only / `detectQueryKind`); `geocodeLocation(singleString)` resolves either
  (Google), a pattern already used single-arg in `useFeedLocationFilter`/`useBusinessLocationCenter`.
- **Controlled search hook.** With the parent owning `locationQuery`/`radiusMiles`, there is exactly
  one geocoding consumer now (the old `useFeedLocationFilter` is gone), so no shared-state conflict.
- **The two PR #242 lazy-geocoding invariants carry over** to the creator level: don't filter while
  creator geocoding is in flight (pass a `null` center until `geocodingLoading` clears → show
  "Finding nearby creators…"); skip creator geocoding under "Any" radius (wasted Google quota).
- **`creatorSlug` can be `''`** → always `creatorSlug || creatorId` when linking a profile.
- **Deliberate simplification:** dropped #242's per-filter "chip badges" row — one combined `Clear`
  button; input values are visible in the controls.

## Verification

- 12 new unit tests (feedCreators); full vitest suite **804/804 pass**; typecheck / lint / build clean.
- Per-task spec+quality reviews (all Approved), whole-branch review (Ready to merge), **Codex second
  review clean**.
- Two small review-driven polish fixes to `DragonFeedGrid`: close lightbox on entering search;
  trim-consistent `anyFilter` (`searchActive || typeFilter !== 'all'`).
- Prod verify (post-merge): desktop name → creator list; ZIP `07030` narrows; city "Jersey City"
  narrows; "Any" → all; clear → browse feed returns; "Browse all creators →" navigates. Mobile IG list
  on-device (founder — the claude-in-chrome extension can't render <768px).

## Spec / Plan
- Spec: `docs/superpowers/specs/2026-07-16-dragonfeed-creator-search-design.md`
- Plan: `docs/superpowers/plans/2026-07-16-dragonfeed-creator-search.md`
