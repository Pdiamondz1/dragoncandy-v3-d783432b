# DragonCandy Post-UX-Update Bugfixes — Design Spec

**Date:** 2026-03-23
**Status:** Approved for implementation

---

## Overview

Six bugs and visual issues identified after the DragonCandy UX frontend theme update. All fixes are independent and scoped to the frontend, except Fix 6 which involves Supabase Edge Function deployment verification.

---

## Fix 1: Transparent Logo in Header

**Problem:** `src/assets/dragon-candy-logo.png` was deleted during the UX update. 12+ files import this missing file, causing broken images across the app. The transparent version exists at `src/assets/Transparent_DragonCandy_logo.png` but is not referenced.

**Fix:**
- Update all imports across the codebase from `dragon-candy-logo.png` to `Transparent_DragonCandy_logo.png`
- The dragon emblem stays the same — only the background becomes transparent so it blends with header backgrounds

**Files affected:** All files importing `@/assets/dragon-candy-logo.png` (~12 files including `MobileTopNav.tsx`, `DashboardLayout.tsx`, `CreatorPortfolioModal.tsx`, and others)

---

## Fix 2: Mobile Overflow Issues

**Problem:** Horizontal overflow/scrolling visible on multiple pages at mobile viewport widths (375–430px). Reported on CreatorEarnings, CampaignWizard, and CampaignsPage. Other pages may also be affected.

**Fix:**
- Audit every page at 375px viewport width for horizontal overflow
- Identify specific child elements breaking the viewport (stat grids with fixed widths, form inputs, tables, padding/margin pushing content out)
- Apply targeted CSS fixes per element:
  - `overflow-x-auto` on wide content containers (tables, horizontal lists)
  - `min-w-0` on flex children to allow shrinking
  - `w-full max-w-full` on inputs and buttons
  - `flex-wrap` on grids that don't fit at narrow widths
- Verify no regressions on other pages

**Pages to audit:** CreatorEarnings, CampaignWizard, CampaignsPage, and a sweep of all other pages

---

## Fix 3: Landing Page Dragon Feed

**Problem:** Two feed implementations exist simultaneously on the landing page:
- **Old (remove):** `CreatorPortfolioFeed` — two fixed vertical columns on left/right sides of the page
- **New (fix):** `PortfolioStrip` — bottom horizontal strip with creator content, but currently static (not scrolling)

**Fix:**
1. Remove `CreatorPortfolioFeed` component import and usage from `LandingPage.tsx`
2. Convert `PortfolioStrip` into an infinite horizontal marquee:
   - Duplicate the content array to fill the strip
   - Use a CSS `@keyframes` animation with `translateX` for seamless looping
   - No JS timers or external libraries needed
3. Delete unused files: `CreatorPortfolioFeed.tsx`, `CreatorFeedColumn.tsx` (if only used by the old feed)

**Files modified:**
- `src/pages/LandingPage.tsx` — remove old feed, keep new strip
- `src/components/landing/PortfolioStrip.tsx` — add infinite marquee animation
- `src/components/landing/CreatorPortfolioFeed.tsx` — delete
- `src/components/landing/CreatorFeedColumn.tsx` — delete (if unused elsewhere)

---

## Fix 4: Creator Portfolio Scrollability

**Problem:** When viewing a creator's portfolio in `CreatorPortfolioModal`, the content collection is not scrollable. If there is only one content item, a duplicate appears underneath.

**Fix:**
1. Add conditional rendering: if only 1 content item, show the hero image only — hide the thumbnail gallery entirely (no duplicate)
2. Ensure the thumbnail gallery is scrollable (horizontally or vertically) when multiple items exist
3. Verify hero image updates when a thumbnail is tapped (existing `currentIndex` navigation logic)

**Files modified:**
- `src/components/creator-profile/CreatorPortfolioModal.tsx`

---

## Fix 5: Donny Center Button Icon

**Problem:** The `DonnyNavButton` in the bottom navigation uses a 🐉 text emoji. It should display the actual dragon emblem from the DragonCandy logo to match the brand.

**Fix:**
1. Extract/crop just the dragon emblem from `Transparent_DragonCandy_logo.png` and save as `src/assets/dragon-emblem.png`
2. Replace the emoji in `DonnyNavButton` with an `<img>` tag referencing the cropped emblem
3. Size the image to fit within the teal gradient circle (e.g., `h-8 w-8 object-contain`)
4. Keep all existing styling: teal gradient background, white border, shadow, notification badge

**Files modified:**
- `src/assets/dragon-emblem.png` — new file (cropped from logo)
- `src/components/donny/DonnyNavButton.tsx` — swap emoji for image

---

## Fix 6: Donny Edge Function Error

**Problem:** "Edge Function returned a non-2xx status code" when sending messages to Donny.

**Root cause:** Edge function secrets and database tables were not configured. User has now:
- Set secrets in Supabase Dashboard (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`)
- Applied the database migration (`20260323_donny_tables.sql`)
- Deploying the edge function via `supabase functions deploy donny-chat`

**Fix:**
- Verify deployment completed successfully
- Test the function end-to-end by sending a message in the app
- If errors persist, inspect Edge Function logs in Supabase Dashboard and fix accordingly

**Files modified:** None (infrastructure/deployment fix)

---

## Out of Scope

- New features or functionality changes
- Database schema changes beyond the already-applied Donny migration
- Backend/API changes
- Desktop layout changes
- Dark mode adjustments
