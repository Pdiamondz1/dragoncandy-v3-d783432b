# Lighthouse Regression Remediation Design

**Date:** 2026-05-08
**Author:** Claude Code
**Status:** Approved
**Baseline audit:** 2026-05-08 fresh Lighthouse run (post May 7 remediation)

## Context

A previous 10-task remediation plan (2026-05-07) was fully executed against the May 2 Lighthouse audit. A fresh audit on May 8 revealed that while Accessibility improved to 100, Performance regressed due to new code merges (sm-integration, auth/RLS fixes) and a Supabase signed URL issue dropped Best Practices to 96.

### Current Scores (May 8 audit)

| Category | Desktop | Mobile |
|----------|---------|--------|
| Performance | 89 | 63 |
| Accessibility | 100 | 100 |
| Best Practices | 96 | 96 |
| SEO | 100 | 100 |

### Target Scores

| Category | Desktop Target | Mobile Target |
|----------|---------------|---------------|
| Performance | 95+ | 85+ |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

## Root Cause Analysis

**Mobile TBT 30ms -> 320ms:** Script Evaluation doubled (401ms -> 920ms), Style & Layout tripled (136ms -> 484ms). Causes: DonnyDesktopPanel eagerly imported, PerformanceMonitor running memory checks, marquee animation forcing repaints, all route guards eagerly imported.

**Best Practices 100 -> 96:** 8 Supabase `object/sign` requests returning 400. The `useCreatorPortfolioFeed` hook calls `createSignedUrl()` for portfolio images, but unauthenticated landing page visitors get 400 errors. The images render fine via public render URLs; the sign attempts are unnecessary.

**LCP Discovery still failing:** The `<link rel="preload">` for the logo is missing `fetchpriority="high"`.

**Unused JS reduced but not eliminated:** ~85 KB remaining (63 KB main bundle, 22 KB vendor-supabase). lucide-react icons not chunked separately.

## Fixes

### Fix 1: Portfolio Signed URL 400 Errors

**Impact:** Best Practices 96 -> 100
**Files:** `src/hooks/useCreatorPortfolioFeed.ts`

Skip the `createSignedUrl()` flow for the portfolio feed. These images are publicly accessible (`allow_portfolio_in_feed = true`). Construct the public render URL directly from storage paths instead of signing then converting. This eliminates all 8 console errors.

The `getSignedUrl` function and its cache remain for other callers; the portfolio feed hook simply stops using them.

### Fix 2: Preload fetchpriority

**Impact:** LCP Discovery pass
**Files:** `index.html`

Add `fetchpriority="high"` to `<link rel="preload" as="image" href="/logo.webp">`. Lighthouse specifically checks for this attribute on the preload link, not just the `<img>` tag.

### Fix 3: PortfolioStrip Image Dimensions

**Impact:** CLS protection, image elements warning resolved
**Files:** `src/components/landing/PortfolioStrip.tsx`

Add `width={160} height={160}` to both `<img>` and `<video>` elements in MarqueeItem. The 160px matches the `md:w-40` display size.

### Fix 4: Reduce Main-Thread Work

**Impact:** Mobile TBT 320ms -> target <100ms
**Files:** `src/App.tsx`, `src/index.css`, `src/components/analytics/PerformanceMonitor.tsx`

Three changes:
1. Lazy-load `DonnyDesktopPanel` — convert from eager import to `lazy()`. It renders null when closed (not needed on landing page).
2. Add `will-change: transform` to the `.animate-marquee` ancestor — promotes marquee to GPU compositor layer, avoiding main-thread repaints.
3. Defer PerformanceMonitor memory monitoring — wrap the 30-second interval in `requestIdleCallback` so it doesn't compete with initial render.

### Fix 5: Chunk lucide-react Icons

**Impact:** Reduce unused JS in main bundle
**Files:** `vite.config.ts`

Add `'vendor-icons': ['lucide-react']` to Vite's `manualChunks`. This splits icon code into its own chunk that can be loaded in parallel, reducing the main bundle's unused JS.

### Fix 6: CSS Cleanup

**Impact:** Reduce unused CSS
**Files:** `src/index.css`

Verify all custom utility classes are inside `@layer utilities` blocks. Check for any dead keyframe animations or unused custom CSS that survived the previous cleanup.

### Fix 7: Lighthouse CI

**Impact:** Prevent future regressions
**Files:** `lighthouserc.js`, `.github/workflows/lighthouse-ci.yml`

GitHub Action that:
- Runs on PRs targeting main
- Tests both desktop and mobile against `/landing`
- Fails if mobile Performance < 85 or desktop Performance < 90
- Fails if Accessibility < 100
- Posts score comparison as PR comment

## Architecture Decisions

**Why not defer Supabase client init?** The auth listener initializes in AuthProvider which wraps the entire app. Deferring it would require significant restructuring of the auth flow (high risk, low reward pre-launch). The lazy-loading of pages already reduces initial JS execution.

**Why not restructure route guards?** ProtectedRoute, BusinessRoute, etc. are small components. Moving them to lazy imports would require wrapping each route individually and add complexity without meaningful bundle reduction.

**Why public render URLs instead of fixing signed URLs?** The portfolio feed images are explicitly public (creators opt in). Using signed URLs adds unnecessary network round-trips, creates auth dependency on the landing page, and produces console errors for unauthenticated visitors. Public render URLs are simpler, faster, and correct.

## Verification

After all fixes:
1. `npm run build` — clean build
2. Run Lighthouse mobile + desktop via `scripts/run-lighthouse.mjs`
3. Verify: Performance >= 85 mobile / 95 desktop, Accessibility 100, Best Practices 100
4. Visual verification: logo loads without flash, portfolio strip animates, buttons readable
5. No console errors on landing page
