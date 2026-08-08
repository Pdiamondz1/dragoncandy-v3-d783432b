---
title: Nav Active State
type: concept
created: 2026-08-07
updated: 2026-08-07
sources: [2026-08-07-dragonfeed-uplift-and-nav-active.md]
tags: [frontend, navigation, routing, ux]
---
# Nav Active State

How DragonCandy decides which navigation item renders as "current". One pure helper —
`activeNavHref(pathname, hrefs)` in `src/lib/navActive.ts` — is the **only** implementation, shared
by the desktop sidebar (`DashboardLayout`), the mobile bottom nav (`MobileBottomNav`), and the
mobile drawer (`MobileTopNav`).

## The bug it replaced

Reported as "the desktop button is double-clicked" — on `/dashboard/business/dragon-feed`, both
**Dashboard** and **Dragon Feed** rendered in the active teal state. The check was, per item:

```ts
location.pathname === href || location.pathname.startsWith(href + '/')
```

Each role's Dashboard item points at the **bare role root** (`/dashboard/business`,
`/dashboard/brand`, `/dashboard/creator`), which is a prefix of **all ~26** of that role's child
routes. So Dashboard was wrongly lit on *every* page of that dashboard — Dragon Feed was simply
where someone noticed. The same was true for the other two roles.

## Longest match wins

```ts
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname !== href && !pathname.startsWith(href + '/')) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
```

**Exact matching would have been the opposite regression.** There is no nav item for
`/campaigns/:id`, and "My Campaigns" must stay lit while you are on a campaign detail page. The
requirement is not *equality*, it is *specificity*: of the items that match, the most specific one
wins.

| Path | Matching hrefs | Active |
|---|---|---|
| `/dashboard/business/dragon-feed` | root + dragon-feed | Dragon Feed only |
| `/dashboard/business/campaigns/123` | root + campaigns | My Campaigns (parent stays lit — intended) |
| `/dashboard/business` | root only | Dashboard |

It is also **self-maintaining**: nesting a new route under an existing item needs no `exact` flag
and no edit here. The alternative — tagging the three role roots `exact: true` — works today and
silently rots the next time someone adds a nav item whose href prefixes another.

The `+ '/'` guard matters: without it `/dashboard/businesses` would match a `/dashboard/business`
item. Covered by a test.

## Two reusable lessons

1. **"The parent is also highlighted" is a specificity bug, not an equality bug.** Reaching for
   exact matching (or React Router's `end` prop) fixes the reported symptom and breaks detail pages,
   which is a quieter regression than the one being fixed.
2. **The same expression in three files is one missing helper, not three bugs.** The check was
   copy-pasted into all three nav components with no shared function and no test, so a single fix
   had to be found and applied three times — and the mobile ones had gone unreported for longer
   simply because their item lists are shorter. When fixing a duplicated line, extract it; the
   duplication is the actual defect.

## Known Issues

- The **Analytics** item points at `/dashboard/analytics` for all three roles
  (`navConfig.ts`), while a separate `/dashboard/brand/analytics` route exists. On that URL nothing
  highlights correctly. **Flagged, not fixed** — it needs a founder call on which route is intended,
  and guessing would move a live link.
- `creatorSidebarNav` has **no** Dragon Feed entry (only the drawer does), so on
  `/dashboard/creator/dragon-feed` the sidebar lights "Dashboard". That is *correct* under
  longest-match — the sidebar genuinely has no more specific item — but it looks like the original
  bug. Do not file it as a regression.

## See Also

- [[Mobile Viewport & Fixed Positioning]] — the other cross-cutting nav-chrome contract (`z-40`
  chrome below the `z-50` Radix modal layer; fixed-position containing blocks).
- [[Dragon Feed]] — shipped in the same PR; the page where the double-highlight was reported.
