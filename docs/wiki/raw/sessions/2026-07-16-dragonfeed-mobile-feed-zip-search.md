# Session: DragonFeed — mobile vertical feed + zip-radius search (2026-07-16)

**Branch:** `worktree-dc-issues-2` · **PR:** #242 · **Type:** frontend-only (no schema/RLS/edge-fn/secret)

## What shipped

Two founder-requested changes to the shared **Dragon Feed** (the surface used by BOTH the business
feed page `BusinessDragonFeed` and the creator "My Dragon Feed" page `CreatorDragonFeed` — both render
the one `DragonFeedGrid` component, which lists creators' portfolio media):

1. **Mobile vertical feed.** On mobile (<768px) the 3-column square grid becomes a single-column
   Instagram-style feed: each post shows a creator header (avatar + name → `/creator/{slug||id}`) above
   full-width `aspect-square` media (tap → the existing `FeedViewer` lightbox). **Desktop (≥768px) keeps
   the exact original `FeedTile` grid** (`grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`), unchanged.
2. **Zip-code + radius search.** A new zip `<Input>` + radius `<Select>` (10/25/50/100/Any, default 25 mi)
   on **both** viewports filters the feed to creators within the radius of the typed zip. It reuses the
   existing location/geocoding stack (`creatorLocationFilter.ts`, `geocoding.ts`, `useCreatorGeocoding`)
   — no new matching code, no backend change.

## Key decisions

- **Mobile only for the vertical feed; zip search on both viewports** (founder call). Maps onto the
  project's mobile/desktop separation: the mobile feed is a `useIsMobile()` JS branch, desktop grid
  classes untouched.
- **Radius by distance ("near this zip"), not exact-zip match** — reuses the tested `filterByRadius`.
- **IG-style card with a creator header** (avatar + name), which also motivated loading `avatar_url`
  into the feed (it additionally fixed the lightbox avatar, previously a placeholder icon only).
- **Applies to both feed pages** — it's the one shared component; no per-page gating.
- **`useIsMobile()` JS branch, not a CSS `hidden`/`lg:block` toggle** — a CSS toggle would mount BOTH
  media trees and download every image/video twice. The JS branch mounts exactly one.

## Architecture

- **`filterMediaByRadius(media, center, radiusMiles, geocodedById)`** — new PURE function in
  `creatorLocationFilter.ts` (unit-tested). Dedups media by `creatorId` into `{id, city, country}`,
  delegates to the existing `filterByRadius`, returns media for the surviving creators. `!center` →
  passthrough (never a silent-empty feed). This is the media-level extension of the creator-level filter.
- **`useFeedLocationFilter(media)`** — new hook. Owns `zip` + `radiusMiles`; debounces the zip ~400ms;
  geocodes it to a center via React Query (`geocodingService.geocodeLocation(zip)` → zip as `postal_code`,
  24h cache); derives unique creators (dedup by `creatorId`, keeping `postal_code` with the
  freeform-`location` fallback `m.postalCode || (!m.city && !m.country ? m.location : undefined)` — the
  same pattern `useCreatorBrowse` uses); **lazily** geocodes creators; builds the `geocodedById` Map from
  `useCreatorGeocoding`'s `geocodedCreators` **array**; returns `{ zip, setZip, radiusMiles,
  setRadiusMiles, filteredMedia, status, active }`. ALL hooks are top-level (Rules of Hooks).
- **`DragonFeedGrid`** — name/type filter runs FIRST (`nameTypeFiltered`), then
  `useFeedLocationFilter(nameTypeFiltered)` adds the zip stage; render branches on `useIsMobile()`.
- **`useUniqueCreatorPortfolio`** — extended select + `PortfolioMedia` with `avatarUrl?, city?,
  postalCode?, country?, location?`; avatar resolved once per creator (shared promise, not per media item).
- **`FeedPost`** (new mobile card) + **`FeedViewer`** (renders the avatar now available on `PortfolioMedia`).

## Gotchas / reusable lessons (both caught by the Codex second review as P2s)

1. **Don't filter while creator geocoding is in flight.** When a valid zip resolves the *center*,
   `active` flips true and the finite-radius filter would run with an empty/stale `geocodedById` (creator
   geocoding is a separate async batch), transiently dropping valid nearby posts / showing "no creators".
   Fix: gate the filter on `!geocodingLoading` — keep the media **unfiltered (passthrough)** until
   `useCreatorGeocoding` finishes, and surface a "Finding nearby creators…" state while `status ===
   'resolving'` (status now also reflects the creator-geocoding phase, not just the center geocoding).
2. **Skip creator geocoding entirely under the "Any" radius.** With `radiusMiles == null`,
   `filterByRadius` keeps every creator regardless of coordinates, so geocoding is wasted billable Google
   calls that only stall the UI in a resolving state. Gate: `creatorsToGeocode = active && radiusMiles !=
   null ? uniqueCreators : []`.
3. **`useCreatorGeocoding` returns `{ geocodedCreators }` (an ARRAY), not a Map** — the caller builds the
   `Map<id, LatLng>` itself with `useMemo` (mirrors `useCreatorBrowse.ts` ~L193-197).
4. **`geocodeLocation(postal_code?, city?, country?)`** — passing the zip as the sole first argument
   correctly treats it as `postal_code`.
5. **Avatar resolution granularity** — resolving the signed avatar URL inside the per-portfolio-item map
   fires N identical signed-URL calls per creator (the module cache can't dedupe them; all N callbacks
   start in the same tick). Resolve it ONCE per creator via a shared promise reused across the items.
6. **Lazy geocoding** — no Google call fires before a valid debounced zip (center query `enabled:
   isValidZip`; creators `[]` until `active && radiusMiles != null`).

## Affected files

- `src/lib/creatorLocationFilter.ts` (+ `.test.ts`) — new `filterMediaByRadius` + 5 tests.
- `src/hooks/useFeedLocationFilter.ts` — NEW.
- `src/hooks/useUniqueCreatorPortfolio.ts` — avatar + location fields.
- `src/components/dragon-feed/FeedPost.tsx` — NEW.
- `src/components/dragon-feed/FeedViewer.tsx` — avatar image.
- `src/components/dragon-feed/DragonFeedGrid.tsx` — controls + `useIsMobile` branch + pipeline.

## Process / verification

Brainstorm (AskUserQuestion forks: radius-vs-exact, IG-header-vs-bare, both-pages, both-viewports) → spec
(spec-reviewer: fixed a Rules-of-Hooks contract bug) → plan (plan-reviewer: replace_all guard nit) →
subagent-driven execution (6 tasks, per-task spec + code-quality reviews; one Important fixed: avatar
per-creator) → whole-branch review (found the transient false-empty) → **Codex second review clean after
2 P2 fixes**. Unit 31/31, typecheck clean, lint 0 errors, build ✓. Both-viewport `verify-prod` post-merge.
