---
title: Landing Page Button Reorder & Creator Dashboard Crash Fix
type: bugfix
created: 2026-05-24
updated: 2026-05-24
---

# Landing Page Button Reorder & Creator Dashboard Crash Fix

## Context

Two issues reported on dragoncandy.io (production):

1. The landing page CTA buttons are in the wrong order — Creator should be first, not last.
2. The creator dashboard crashes immediately after login with: `Cannot read properties of undefined (reading 'div')`.

Both issues affect the creator user experience and must be fixed for both desktop and mobile viewports.

## Issue 1: Landing Page Button Reorder

**File:** `src/components/landing/HeroSection.tsx`

**Current order (lines 19–37):**
1. "I'm a Restaurant — Get Started" (teal, `bg-dc-teal`)
2. "I'm a Brand/Sponsor — Launch Campaigns" (pink, `bg-dc-pink-accent-btn`)
3. "I'm a Creator — Join the Marketplace" (outline, white bg with pink text)

**Target order:** Creator → Restaurant → Brand.

**Change:** Move the Creator `<Button>` JSX block (currently lines 31–37) to position 1, above the Restaurant button. No style changes needed — each button retains its existing classes. The container uses `flex flex-col gap-3` so visual order matches JSX order. Both desktop and mobile share this component; no viewport-specific work required.

## Issue 2: Creator Dashboard Crash

**Error:** `Cannot read properties of undefined (reading 'div')`
**URL:** `dragoncandy.io/dashboard/creator/campaigns`
**Frequency:** Every time a creator logs in.

**Post-login flow (from `src/pages/AuthPage.tsx`, line 141):**
After creator login, the app navigates directly to `/dashboard/creator/campaigns`, which renders `CreatorCampaignMarketplace` inside `ProtectedRoute`.

### Investigation Summary

All routes pass through `PageTransition` (`src/components/PageTransition.tsx`), which renders `motion.div`. The `motion` export is `m` from framer-motion (the lightweight LazyMotion proxy), re-exported via `src/lib/motion.tsx`. `LazyMotion` wraps the entire app in `src/App.tsx` (line 380) with `strict` mode enabled.

Key observations:
- Public pages (landing, auth) render successfully through the same `PageTransition` + `motion.div` path.
- Authenticated pages add `DonnyProviderWithAuth` and `AuthenticatedShell` wrappers, but neither uses motion components.
- `m` is a valid export from framer-motion v12.38.0 (verified: `typeof m === 'function'`).
- No component in the `CreatorCampaignMarketplace` render tree explicitly accesses `.div` on a potentially undefined value.
- `react-tinder-card` v1.6.4 (used in `CampaignSwipeCard`) has an unusual `package.json` without `main`/`module` fields.

**Likely candidates:**
1. LazyMotion feature loading race condition — `loadMotionFeatures` uses dynamic `import("framer-motion")` which may resolve differently in production builds.
2. Production-specific tree-shaking of framer-motion v12 causing `m.div` to be undefined.
3. A downstream component import that resolves to `undefined` in the production bundle.

### Fix Strategy

Since the root cause cannot be definitively identified from static analysis:

1. **Reproduce** the crash in production using `/browser-use` — log in as creator, open Chrome DevTools Console, capture the full error stack trace (file, line, column).
2. **Diagnose** based on the stack trace — identify the exact component and property access causing the crash.
3. **Fix** the root cause.
4. **Build locally** (`npm run build`) to verify no build errors.
5. **Push and verify** in production.

## Verification Plan

### Pre-push
- `npm run typecheck` passes
- `npm run build` succeeds
- `npm run preview` — manually verify both fixes locally

### Post-deploy (production at dragoncandy.io)
- **Landing page:** Confirm button order is Creator → Restaurant → Brand on both desktop (1280px+) and mobile (375px) viewports.
- **Creator login:** Log in as creator (`damewillie@gmail.com`), confirm `/dashboard/creator/campaigns` loads without crash.
- **Console check:** Open Chrome DevTools, verify no console errors on the creator campaigns page.
- **Regression check:** Log in as restaurant (`dwilliams@harbormill.net`) and brand (`damesonpoint@gmail.com`) accounts, verify dashboards load correctly.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/landing/HeroSection.tsx` | Reorder button JSX: Creator first |
| TBD (based on stack trace) | Fix root cause of `undefined.div` crash |
