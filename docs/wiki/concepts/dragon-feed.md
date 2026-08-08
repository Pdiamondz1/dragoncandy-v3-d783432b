---
title: Dragon Feed
type: concept
created: 2026-07-16
updated: 2026-08-07
sources: [2026-07-16-dragonfeed-mobile-feed-zip-search.md, 2026-07-16-dragonfeed-creator-search.md, 2026-08-07-dragonfeed-uplift-and-nav-active.md]
tags: [frontend, feed, mobile, location, geocoding, discovery, search, ordering, consent]
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

- **Browse mode (empty search):** the media feed above (grid / `FeedPost` stack), filtered by type
  **and creator skill** (2026-08-07 — see "An item is not a row" below).
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

## An item is not a row (2026-08-07 uplift)

A founder report — "unclear what happens when there is new content", untagged media, almost no
filters, nothing showing what is hot or how many views, unclear video — resolved to a **single root
cause**: a feed item is a *string in a `text[]`* (`creator_profiles.portfolio_urls`). There is no
id, no timestamp, no counter, and nowhere to put a tag. Order was `sort(() => Math.random() - 0.5)`,
reshuffled every mount, so nothing could be "new" *relative to* anything.

### The table that was designed, then cut

A `feed_items` table was specced and rejected. All three reasons generalize:

1. **A composite id that other code PARSES is a public contract.** The item id is
   `${creator.id}-${url}`, and that exact string is persisted as
   `analytics_events.event_data.content_id` by `useFeedLike`. **Two consumers decode it by
   string-stripping the creator-id prefix** to recover the media URL — `useBusinessActivity.ts`
   (the Inspiration page) and `useInspirationStrip.ts` (the dashboard strip). A uuid id makes
   `portfolio.find(u => u === urlPart)` return `undefined`, and both surfaces **drop the item with
   no error**. Grep for consumers before changing any id scheme, however internal it looks.
2. **A mirror table needs a lifecycle contract.** `portfolio_urls` is rewritten as a whole array on
   every profile save (`useCreatorProfileSubmit`) — there is no per-upload event. Nothing would
   have deleted a row when a creator *removed* an item, so removed work would stay live forever.
3. **Check whether the fact is already recorded.** Verified on prod: **34 of 34** items resolve to a
   `storage.objects` row in `profile-assets` carrying a real `created_at` (0 external URLs). The
   per-item timestamp existed all along. **Derive, don't duplicate.**

### What shipped instead

- **Dates + newest-first order** from `storage.objects.created_at`, joined via one
  `storage.list()` per creator (same shared-promise shape the avatar already used). Pure helpers in
  `src/lib/feedOrdering.ts`; unknown timestamps sort last and render no date rather than guessing.
  > **Deliberately NOT the filename timestamp.** `uploadProfileAsset` writes
  > `${userId}/${kind}-${Date.now()}.${ext}`, so the millis are right there — but that value is
  > **client-supplied**, and a creator writing to their own folder could craft a future timestamp
  > to pin their work to the top of the feed permanently. The storage timestamp is server-assigned.
  > *When a value drives ranking, prefer the one the client cannot author.*
- **NEW badge + "N new since your last visit"** against a per-device last-visit marker
  (`useFeedLastVisit`). A first-ever visit badges **nothing** — badging everything is noise.
- **Skill filter chips** from `creator_profiles.skills` (`src/lib/feedSkills.ts`) — data that was
  already fetched and already rendered on creator rows, but had **never been used as a filter**.
  Zero new storage. Chips are derived from skills present in the loaded feed, so none can match
  nothing. Caveat recorded honestly: skills are a **creator**-level attribute, so a video editor's
  stills are still labelled "Video Editing". Per-item AI tagging remains deferred.
- **Video duration badge** from the browser's own `loadedmetadata` — no server-side probe, no new
  column — replacing the bare 16px play icon. A true poster frame was **not** attempted: nothing in
  the codebase generates thumbnails.
- **Desktop attribution.** `FeedTile` previously rendered *nothing* — an anonymous wall of squares —
  while mobile `FeedPost` always had a creator header.
- **Views instrumented, display gated.** `dragon_feed_view` rows keyed by the **same** `content_id`
  likes use, deduped per user/item/day (`src/lib/feedViewTracking.ts`) — an explicitly best-effort
  engagement counter, not a billing ledger. Counts stay off screen until they clear a sample-size
  gate: there are **3** measured posts platform-wide in `content_performance`, so any
  social-sourced view number would be fabricated. See [[Honest Analytics]].
- **"Hot" was deferred rather than faked.** Its draft formula included boost dollars, which are
  structurally **zero** for portfolio items (boosts attach only to `dragonshare_posts`). A blend
  that silently drops a term is the wrong shape for a ranking claiming to be honest.

## Supply: absence was the default, not a decision

The feed showed **2 creators / 8 items**. Three more creators holding **26 more items** were
`is_completed`, `profile_visibility='public'`, and blocked *only* by `allow_portfolio_in_feed =
false` — a flag defaulting off whose sole UI was a switch inside a **collapsed Settings accordion,
filed under Privacy**, never asked at onboarding. 11 of 15 creators never saw it.

- **Onboarding asks it**, defaulted Yes, on the existing bio step (no extra step = no extra
  keystrokes). **`OnboardingWizard` upserts `creator_profiles` directly** and never goes through
  `useCreatorProfileForm`, so changing that hook's default would have done nothing here — the
  wizard needed its own control and its own write.
- **The Settings switch moved Privacy → Portfolio** and was relabelled to the feed's real name. For
  a creator this is a *discovery* decision, not a privacy one.
- **A self-limiting dashboard card** (`FeedOptInCard`/`useFeedOptIn`) prompts creators who have work
  but are opted out. `shouldPrompt` requires the flag to still be false, so opting in removes the
  card permanently — **no dismissal state to store**. `first_run_missions` was evaluated and
  rejected: `completeMission` early-returns once `completed_at` is set, so a later dismissal would
  never persist.

> **Deliberately NOT done: flipping `useCreatorProfileForm`'s default to `true`.**
> `CreatorSettings`'s `handleFieldBlur` submits the **entire** `formData` on any field blur with
> **no `isLoaded` guard**, while the form seeds every field with empty defaults and fills them
> asynchronously. Flipping the default would let an existing creator's stored `false` be silently
> overwritten — the exact retroactive consent flip the change existed to avoid. **Before changing a
> form default, check whether any path writes the whole form back.**

## Why the DragonShare merge is deferred

The obvious next step — show real campaign work, not just portfolios — is a **cross-tenant change**,
not a feature toggle. `dragonshare_posts` has **no public SELECT policy**: reads are
`creator_id = auth.uid()`, `status='verified' AND target_org_id IN (get_user_org_ids())`, or admin.
A post is content a creator made **for one specific business**. Merging as-is shows Business A's paid
content to Business B — see [[Cross-Tenant Proxy Authorization]] for how often this class recurs here.

Two facts, both verified on prod, shape the eventual fix:

- **The media file is already world-readable.** Bucket `dragonshare-content` is `public = true` with
  an unconditional public SELECT policy. So surfacing the *file* is not new exposure — surfacing the
  **association** (this creator made this for this business), the caption/hashtags, and the
  discoverability is. *Distinguish "the bytes are reachable" from "the relationship is disclosed".*
- **No consent flag exists anywhere.** No `share_to_feed` / `is_public` / `opt_in` on
  `dragonshare_posts` or `organizations`. `landing-clips` currently treats *"a business paid to
  boost it"* as implicit consent to place the video on the anonymous homepage; neither party is asked.

**Founder decision (2026-08-07):** creator opts in (their craft), **business can veto** (their venue,
they paid), default off, asked at boost time. Note the resulting RLS predicate is
business-consent-based and will **not** generalize from the portfolio one.

## Key Decisions

- **Derive, don't duplicate** — no mirror table; the id and `portfolio_urls` stay the source of truth.
- Rank on server-assigned timestamps, never client-authored ones.
- Instrument metrics immediately, but gate their **display** on sample size ([[Honest Analytics]]).
- Consent is asked where the creator already is, and never flipped on their behalf.
- Mobile vertical feed only; **search on both viewports**; both feed pages; radius (not exact-zip) match.
- **Global by default, location narrows** — a business anywhere searches any creator; a ZIP or city is
  an optional radius filter on the creator list.
- A location query is a **search trigger** (creator list), superseding #242's zip-narrows-media-grid.
- Frontend-only — no schema / RLS / edge-function / secret change; ships on merge → Vercel.

## Known Issues

- One-frame stale-empty is theoretically possible between `geocodingLoading` flipping false and
  `useCreatorGeocoding`'s effect publishing `geocodedCreators` (that hook is shared/out-of-scope);
  imperceptible and self-heals.
- **Skill filtering is creator-level, not item-level** — every item by a creator carries that
  creator's whole skill set, so a video editor's stills read as "Video Editing". Honest and free,
  but per-item tagging is the real fix (deferred: needs an edge function, `_shared/cost-ledger.ts`
  routing, a controlled vocabulary, and a backfill for the existing items).
- **No poster frames.** Nothing in the codebase generates video thumbnails, so tiles show whatever
  `preload="metadata"` yields. The duration badge ships; a real poster does not.
- **View dedup is per-device** (`localStorage`), so a cleared browser or a second device can
  double-count. Deliberate — a server-side ledger would mean a table, an RLS policy and a
  round-trip per item open, for a number used only to rank and display.
- **"N new" reads 0 at ship.** The marker is set on first visit and only post-marker uploads badge,
  so the fix is structural on day one, not visible. It becomes visible as creators upload.
- The **8 → 34 item** jump is consent-dependent: it requires the three prompted creators to accept.

## See Also

- [[Creator Location Search]] — the shared geo stack (`filterByRadius`, `geocoding`,
  `useCreatorGeocoding`) this feature extends to media-level filtering.
- [[Mobile Viewport & Fixed Positioning]] — the mobile/desktop separation rule the render branch honors.
- [[DragonShare]] — a different creator-content surface (organic uploads + boosts), not the portfolio
  feed. The **deferred** merge of its posts into this feed is the cross-tenant question above.
- [[Honest Analytics]] — the display-gating rule the view counts follow.
- [[Cross-Tenant Proxy Authorization]] — the recurring defect class the DragonShare merge would enter.
- [[Nav Active State]] — shipped in the same PR; the sibling "one highlighted item" fix.
