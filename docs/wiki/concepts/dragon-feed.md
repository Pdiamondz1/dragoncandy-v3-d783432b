---
title: Dragon Feed
type: concept
created: 2026-07-16
updated: 2026-07-16
sources: [2026-07-16-dragonfeed-mobile-feed-zip-search.md, 2026-07-16-dragonfeed-creator-search.md]
tags: [frontend, feed, mobile, location, geocoding, discovery, search]
---
# Dragon Feed

The **Dragon Feed** is the creator-content discovery surface: a scrollable wall of creators'
portfolio media, used by BOTH the business feed page (`BusinessDragonFeed`) and the creator
"My Dragon Feed" page (`CreatorDragonFeed`). Both render the single shared component
`DragonFeedGrid`; its data comes from `useUniqueCreatorPortfolio` (creator_profiles with
`allow_portfolio_in_feed = true`, flattened to one media item per portfolio URL). Tapping any
item opens the `FeedViewer` lightbox (swipe pager + like + message-creator).

## Mobile vertical feed vs. desktop grid

The render branches on **`useIsMobile()`** (768px), not a CSS `hidden`/`lg:block` toggle:

- **Mobile (<768px):** a single-column Instagram-style feed of `FeedPost` cards
  (`space-y-4`) — each card is a creator header (avatar + name, tap → `/creator/{slug||id}`)
  above full-width `aspect-square` media (tap → lightbox).
- **Desktop (≥768px):** the original `FeedTile` grid, unchanged
  (`-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5`).

**Why a JS branch, not CSS:** a CSS toggle would mount BOTH trees and download every image/video
twice (signed URLs + videos are expensive). The JS branch mounts exactly one tree. `useIsMobile`
initializes synchronously from `window.innerWidth`, so there's no wrong-layout flash. This mirrors
the project's mobile/desktop separation rule (base classes = mobile, `lg:`/`xl:` = desktop) — see
[[Mobile Viewport & Fixed Positioning]].

## Search: browse mode vs. Instagram-style creator search

The one search box drives **two modes**, chosen by `searchActive` (any name OR any location typed).
`DragonFeedGrid` owns ALL control state (`searchTerm`, `typeFilter`, `locationQuery`, `radiusMiles`,
`viewerIndex`) and calls every hook unconditionally at the top; only the *rendered tree* branches.

- **Browse mode (empty search):** the media feed above (grid / `FeedPost` stack), type-filtered only.
- **Search mode (name and/or location):** the media feed is replaced by a **vertical creator list**
  (`FeedCreatorList` of `FeedCreatorRow`s) — avatar (teal ring) + bold-matched name + meta line
  `location · ★rating (reviews) · N posts` + up to 3 teal-tinted skill chips; tap →
  `/creator/{creatorSlug || creatorId}`. A "Browse all creators →" footer (business feed only, via the
  `browseAllHref` prop) escapes to the full Browse Creators page.

**Name match is global** (any location — a business anywhere finds any creator); an optional **location
query (ZIP or city, ≥3 chars)** geocodes to a center and narrows the *creator list* by radius
(10/25/50/100/Any). This reuses the same geo stack as [[Creator Location Search]]:

- **`feedCreators.ts`** (pure, unit-tested) — `feedCreatorsFromMedia` groups the feed's media into
  one `FeedCreator` per `creatorId` (with `postCount`); `highlightMatch` splits a name into
  case-insensitive match segments for bolding; `filterCreatorsByRadius` remaps each `FeedCreator` to
  `{id: creatorId, city, country}` and delegates to the tested `filterByRadius` (`!center` →
  passthrough, never silent-empties).
- **`useFeedCreatorSearch(creators, searchTerm, locationQuery, radiusMiles)`** — **CONTROLLED** (the
  parent owns location/radius; no setters returned): global name filter → debounced (~400ms) zip/city
  geocode via React Query → lazy `useCreatorGeocoding` → the pure filter. Returns
  `{results, status, locationActive}`.

> **A zip is a search *trigger*, not a media filter.** This is the pivot from the earlier
> [[Dragon Feed Mobile & Zip Search Session|PR #242]] design, where a zip *narrowed the media grid*.
> That path — `useFeedLocationFilter` + `filterMediaByRadius` (+ its tests) — is now **deleted as
> superseded**. There is one geocoding consumer now, so no shared zip-state conflict.

## Lazy-geocoding invariants (carried from PR #242, now at the creator level)

Reusable gotchas when driving distance filtering off an async geocode (originally Codex catches in
#242, preserved in `useFeedCreatorSearch`):

1. **Don't filter while creator geocoding is in flight.** Center geocoding and creator geocoding are
   two separate async steps. When the *center* resolves, `hasCenter` flips true — but `geocodedById` is
   still empty until the *creator* batch lands, so a naive filter transiently drops valid nearby
   creators. Fix: **pass a `null` center to the pure filter until `geocodingLoading` completes**
   (`hasCenter && !geocodingLoading ? center : null`), and report `status:'resolving'` so the UI shows
   "Finding nearby creators…" instead of a false empty.
2. **Skip creator geocoding entirely under the "Any" radius.** With `radiusMiles == null`,
   `filterByRadius` keeps everyone regardless of coordinates — so geocoding is wasted billable
   Google-quota work. Gate: `creatorsToGeocode = hasCenter && radiusMiles != null ? uniqueCreators : []`.

Other reusable details: `useCreatorGeocoding` returns `{ geocodedCreators }` as an **array** (the
caller builds the `Map` with `useMemo`, mirroring `useCreatorBrowse`); a creator with only a freeform
`location` is still placeable because that string is passed as the geocode `postal_code`
(`c.postalCode || (!c.city && !c.country ? c.location : undefined)`); the feed's avatar must be
resolved **once per creator** (a shared signed-URL promise), not per media item; and the lightbox is
closed on entering search (a `useEffect` on `searchActive`) so a stale `viewerIndex` can't re-pop it
when the search later clears.

## Key Decisions

- Mobile vertical feed only; **search on both viewports**; both feed pages; radius (not exact-zip) match.
- **Global by default, location narrows** — a business anywhere searches any creator; a ZIP or city is
  an optional radius filter on the creator list.
- A location query is a **search trigger** (creator list), superseding #242's zip-narrows-media-grid.
- Frontend-only — no schema / RLS / edge-function / secret change; ships on merge → Vercel.

## Known Issues

- One-frame stale-empty is theoretically possible between `geocodingLoading` flipping false and
  `useCreatorGeocoding`'s effect publishing `geocodedCreators` (that hook is shared/out-of-scope);
  imperceptible and self-heals.

## See Also

- [[Creator Location Search]] — the shared geo stack (`filterByRadius`, `geocoding`,
  `useCreatorGeocoding`) this feature extends to media-level filtering.
- [[Mobile Viewport & Fixed Positioning]] — the mobile/desktop separation rule the render branch honors.
- [[DragonShare]] — a different creator-content surface (organic uploads + boosts), not the portfolio feed.
