# Mobile Nav: Fixed Header + Collapsible Bottom Nav

**Date:** 2026-05-04
**Status:** Approved

## Problem

On mobile, the top header (`MobileTopNav`) uses `sticky top-0` but is nested inside `<main className="flex-1 overflow-auto">` in App.tsx. Depending on intermediate flex/overflow contexts, the sticky positioning can fail — the header scrolls away instead of staying pinned. The bottom nav is fixed but always visible, consuming screen real estate when users are scrolling through content.

## Solution

Two changes:

1. **Fixed top header** — change `MobileTopNav` from `sticky` to `fixed` positioning so it is viewport-locked and never moves regardless of scroll container nesting.
2. **Collapsible bottom nav** — auto-hide the bottom nav on scroll-down, reappear on scroll-up (Instagram/TikTok pattern) using a lightweight `useScrollDirection` hook.

## Design

### Fixed Top Header

`MobileTopNav` header element changes from `sticky top-0 z-50` to `fixed top-0 left-0 right-0 w-full z-50`.

The mobile `<main>` element inside `DashboardLayout` gains `pt-14` (56px) to offset content below the now-fixed header. The header height is ~48-52px based on `py-2` plus the logo, so 56px provides comfortable clearance.

Desktop header is untouched — it remains `sticky top-0` within the sidebar layout.

### Collapsible Bottom Nav

A new `useScrollDirection` hook (~20 lines):

- Attaches a scroll listener to `document.getElementById('main-content')` — the actual scroll container defined in App.tsx.
- Stores `prevScrollTop` in a ref. On each scroll event, compares current `scrollTop` to previous.
- Returns `"down"` or `"up"` with a ~10px deadzone threshold to prevent flickering on micro-scrolls.
- Throttled via `requestAnimationFrame` for performance.
- Initial return value is `"up"` so the bottom nav is visible on page load before any scrolling.

`MobileBottomNav` consumes the hook:

- When direction is `"down"`: adds `translate-y-full` to slide the nav off-screen.
- When direction is `"up"`: removes it so the nav slides back into view.
- `transition-transform duration-300` handles the smooth animation.

Existing `pb-24` bottom padding on mobile content areas remains unchanged. When the nav hides, users simply see more content in that space.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useScrollDirection.ts` | New — scroll direction detection hook |
| `src/components/MobileTopNav.tsx` | `sticky top-0` → `fixed top-0 left-0 right-0 w-full` |
| `src/components/MobileBottomNav.tsx` | Import hook, conditional `translate-y-full` + transition classes |
| `src/components/DashboardLayout.tsx` | Add `pt-14` to mobile `<main>` for fixed header offset |

## Scope Boundaries — Not Touched

- App.tsx outer `<main>` scroll container — unchanged
- Desktop header and sidebar — no changes, all `md:` and `lg:` classes preserved
- Bottom nav `pb-24` spacing on individual pages — unchanged
- Other scroll behavior (infinite scroll in creator browse, feed animations) — unchanged
- No new dependencies added
