# Oversized Pill-Shaped Button & Badge Audit

## Context

The Creator Dashboard's Campaigns page has an Invitations tab badge that stretches the full width of its tab button (~33% of the tab bar) instead of displaying as a compact inline count badge. The Brand Dashboard's BrandFreeTrioHero component has three full-width pill buttons inside cards and a full-width pill-shaped banner that feel disproportionately large on desktop. These need fixing across both Desktop and Mobile, followed by a full visual audit of all three roles (Restaurant, Creator, Brand) in production.

## Root Causes

**Invitations badge:** Uses `display: flex` (block-level) which expands to fill the parent `flex-1` tab button width. Every other badge in the codebase correctly uses `inline-flex` or no flex.

**BrandFreeTrioHero buttons:** Use `w-full rounded-full` which creates stretched-out pill shapes on desktop where the cards are in a 3-column grid.

**BrandFreeTrioHero banner:** Uses `rounded-full` on a full-width element, creating an exaggerated capsule shape inappropriate for a banner.

## Changes

### Fix 1: Invitations Tab Badge

**File:** `src/pages/CreatorCampaignMarketplace.tsx` line 206
- Change `flex` to `inline-flex` so the badge sizes to its content

### Fix 2: BrandFreeTrioHero Card Buttons

**File:** `src/components/dashboard/BrandFreeTrioHero.tsx` lines 84, 107, 132
- Add `md:w-fit` to keep full-width on mobile (design system rule) while shrinking to content on desktop

### Fix 3: BrandFreeTrioHero Banner

**File:** `src/components/dashboard/BrandFreeTrioHero.tsx` line 142
- Change `rounded-full` to `rounded-xl` for appropriate banner rounding

### Fix 4: Full Visual Audit

After deploying, log into all three roles in production to visually verify fixes and catch any additional oversized pill elements.

## Verification

1. `npm run build` passes
2. Creator Dashboard Campaigns tab: Invitations badge is compact, not stretched
3. Brand Dashboard: BrandFreeTrioHero buttons are content-width on desktop, full-width on mobile
4. Brand Dashboard: "Free forever" banner has rounded-xl corners
5. No console errors in Chrome DevTools
6. Full visual audit across all three roles finds no remaining oversized pills
