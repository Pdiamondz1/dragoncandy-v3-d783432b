---
title: Deep-Link Param Query Race
type: concept
created: 2026-06-11
updated: 2026-06-11
sources: [raw/sessions/2026-06-11-035313-content-engine-phase-c-performance-loop.md]
tags: [react, react-query, deep-link, bug, gotcha, dragonshare]
---

# Deep-Link Param Query Race

A class of silent bug where a deep link's URL params feed **multiple async queries**, and a
**URL-cleanup effect** tears down a query before a sibling query resolves — so a cross-query match
never holds, and the dependent write/UI silently fails.

## The concrete case (DragonShare brief pre-fill)

`usePreselectedOrg` in `src/pages/CreatorDragonShare.tsx` handles a deep link
`?restaurant=<orgId>&brief=<briefId>` (from [[Donny AI]]'s "Make it & submit" CTA). It runs two
independent React Query lookups — org via the `get_restaurant_by_org_id` RPC, brief via a
`content_briefs` select — and a cleanup `useEffect` deletes both params once `org` resolves.

The org query was keyed on the **live** `searchParams.get('restaurant')`. Sequence:

1. `org` resolves → the cleanup effect deletes `?restaurant=` from the URL.
2. The query key changes to `['preselected-org', null]` and `enabled` flips false → **`org` reverts
   to `undefined`** on the next render.
3. The slower `content_briefs` query resolves *after* that — but `org` is already gone, so the match
   `briefOrgId === org.id` (and therefore the derived `sourceBriefId` / `prefillCaption`) never holds
   in the same render.

**Result:** the caption pre-fill never seeded **and** `dragonshare_posts.source_brief_id` was never
recorded — silently, across two shipped slices (see [[Content Engine Phase B Session]]). The
restaurant pre-fill survived only because the submit form captures `preselectedOrg` during the one
render `org` was truthy — which **masked** the dead data link.

## Fix

Capture deep-link params **once at mount** and key queries on the captured value, not on the live
`searchParams.get(...)`:

```ts
const [capturedRestaurantId] = useState(() => searchParams.get('restaurant'));
// org query keyed on capturedRestaurantId → never reverts when the URL is cleaned.
const sourceBriefId =
  briefId && capturedRestaurantId && briefOrgId === capturedRestaurantId ? briefId : null;
```

`get_restaurant_by_org_id` returns `organizations.id == its input`, so matching the brief against the
**captured restaurant id** is equivalent to matching against `org.id` but race-free. (`briefId` was
already captured this way; the bug was that `restaurantId` wasn't.) Fixed in PR #63, commit `ee3334e4`.

## The general rule

- For any deep-link flow whose params feed **more than one async lookup** or a **cross-query match**,
  capture every such param at mount and key queries on the captured value.
- A URL-cleanup effect that strips params will re-key/disable any query bound to the live param.
- **Verify the DB actually recorded the link, not just that the UI looks right** — a surviving UI
  pre-fill can hide a dead data link.

Same "looks-fine-but-silently-wrong" family as the GUC/trigger and schema-drift gotchas; compare
[[Migration Replay Drift]].

## See Also

- [[Content Engine]]
- [[Content Engine Phase B Session]]
- [[DragonShare]]
- [[Migration Replay Drift]]
