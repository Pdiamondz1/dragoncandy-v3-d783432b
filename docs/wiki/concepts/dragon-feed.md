---
title: Dragon Feed
type: concept
created: 2026-07-16
updated: 2026-07-16
sources: [2026-07-16-dragonfeed-mobile-feed-zip-search.md]
tags: [frontend, feed, mobile, location, geocoding, discovery]
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

## Zip-radius search (reusing the location stack)

The feed's "search by zip" filters media to creators within a radius of a typed zip, **reusing the
same geo stack** as [[Creator Location Search]] rather than inventing new matching code:

- **`filterMediaByRadius(media, center, radiusMiles, geocodedById)`** (pure, in
  `creatorLocationFilter.ts`) — the media-level extension of the creator-level `filterByRadius`. It
  dedups media by `creatorId` into `{id, city, country}`, delegates to `filterByRadius`, then keeps
  every media item whose creator survived. `!center` → passthrough (the feed **never silent-empties**
  while a zip is unresolved).
- **`useFeedLocationFilter(media)`** — a thin stateful wrapper: debounces the zip (~400ms), geocodes
  it to a center via React Query (`geocodeLocation(zip)` → zip as `postal_code`, 24h cache), lazily
  geocodes creators via `useCreatorGeocoding`, builds the `geocodedById` Map, and returns
  `filteredMedia` + `{status, active}`. It runs AFTER the name/type filter in `DragonFeedGrid`
  (`nameTypeFiltered` → `useFeedLocationFilter`), so the two same-named "filtered" values compose:
  name+type first, zip last.

## Lazy-geocoding invariants (both were Codex second-review catches)

These are the reusable gotchas when driving distance filtering off an async geocode:

1. **Don't filter while creator geocoding is in flight.** Center geocoding and creator geocoding are
   two separate async steps. When the *center* resolves, `active` flips true — but `geocodedById` is
   still empty until the *creator* batch lands, so a naive filter transiently drops valid nearby posts
   and shows "no creators near that zip." Fix: **keep the media unfiltered (pass a `null` center) until
   `geocodingLoading` completes**, and let `status` report `'resolving'` through that window so the UI
   shows "Finding nearby creators…" instead of a false empty.
2. **Skip creator geocoding entirely under the "Any" radius.** With `radiusMiles == null`,
   `filterByRadius` keeps every creator regardless of coordinates — so geocoding is wasted billable
   Google-quota work that only stalls the feed in a resolving state. Gate:
   `creatorsToGeocode = active && radiusMiles != null ? uniqueCreators : []`.

Other reusable details: `useCreatorGeocoding` returns `{ geocodedCreators }` as an **array** (the
caller builds the `Map` with `useMemo`, mirroring `useCreatorBrowse`); a creator with only a freeform
`location` is still placeable because that string is passed as the geocode `postal_code`
(`m.postalCode || (!m.city && !m.country ? m.location : undefined)`); and the feed's avatar must be
resolved **once per creator** (a shared signed-URL promise) — resolving it inside the per-media-item
map fires N identical signed-URL calls that the module cache can't dedupe (all start in the same tick).

## Key Decisions

- Mobile vertical feed only; zip search on both viewports; both feed pages; radius (not exact-zip) match.
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
