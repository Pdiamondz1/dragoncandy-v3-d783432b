# Lighthouse Performance & Accessibility Remediation

**Date:** 2026-05-07
**Audit source:** `docs/lighthouse-mobile.pdf` (Lighthouse 13.0.1, 2026-05-02)
**Audited URL:** `https://dragoncandy.io/landing`
**Scope:** Site-wide fixes, ordered by Lighthouse scoring weight
**Approach:** Surgical fix-by-weight — one commit per fix, `npm run build` verification after each

---

## Baseline Scores

| Category | Score |
|----------|-------|
| Performance | 74 |
| Accessibility | 96 |
| Best Practices | 100 |
| SEO | 100 |

## Target Scores

| Category | Target |
|----------|--------|
| Performance | 90+ |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

---

## What's Already In Place

These audit recommendations are already implemented and require no changes:

- **Route-level code splitting** — Most routes use `React.lazy()` with Suspense fallback (exception: see Fix 3c)
- **Vite manualChunks** — Configured for react, query, supabase, and motion vendor bundles
- **Logo format** — Already WebP (70 KB vs 138 KB PNG original)
- **Portfolio lazy loading** — Images use `loading="lazy"` and Supabase CDN transforms (`quality=75`)
- **embla-carousel-react** — Actively used in `src/components/ui/carousel.tsx` (not removable)
- **`install` and `sharp` packages** — Not in `package.json` (audit recommendation doesn't apply)

---

## Fix 1: LCP Optimization (weight 25, 4.5s -> target <2.5s)

**Files:** `index.html`, `src/components/landing/Header.tsx`

### 1a. Preload the logo image via public/ copy

Vite content-hashes asset filenames on every build, making a hardcoded `<link rel="preload">` in `index.html` fragile. Instead:

1. Place an optimized logo at `public/logo.webp` (non-hashed, stable URL)
2. Add the preload in `index.html`:
   ```html
   <link rel="preload" as="image" type="image/webp" href="/logo.webp">
   ```
3. Update `Header.tsx` to reference `/logo.webp` instead of the Vite-imported asset

This gives a stable preload target that survives rebuilds.

### 1b. Add fetchpriority="high" to the logo img

In `Header.tsx`, add `fetchpriority="high"` to the logo `<img>` element so the browser prioritizes it over below-the-fold images.

### 1c. Resize the logo for actual display size

The logo is 69.9 KB but displays at 100-140px wide. Generate an optimized version at 280px wide (2x retina at max display size) to reduce to ~5-10 KB. Place the resized version in `src/assets/` as a new file.

### 1d. Add explicit width and height attributes to the logo

Add `width` and `height` attributes to the logo `<img>` in `Header.tsx` to eliminate layout shift and help the browser reserve space before the image loads.

---

## Fix 2: FCP Optimization (weight 10, 3.3s -> target <1.8s)

**Files:** `index.html`

### 2a. Keep existing non-blocking font loading (no change needed)

The current `index.html` already uses the correct pattern: `<link rel="preload" as="style">` combined with `media="print" onload="this.media='all'"`. This is an intentional non-blocking technique — replacing it with a plain `<link rel="stylesheet">` would make fonts render-blocking, directly contradicting Fix 6. No changes needed here.

The FCP improvement comes from the preconnect (2b) and the LCP preload (Fix 1).

### 2b. Add preconnect to Supabase

The landing page fetches creator profiles from Supabase. Add a preconnect hint to save a connection round-trip:

```html
<link rel="preconnect" href="https://zocahiffooqdybdhguqv.supabase.co" crossorigin>
```

---

## Fix 3: Unused JavaScript Reduction (~110.9 KB savings)

**Files:** `vite.config.ts`, components that import framer-motion

### 3a. Tree-shake framer-motion with LazyMotion

Replace global `motion` imports with `LazyMotion` + `domAnimation` features. This loads only the animation features actually used, roughly halving the vendor-motion chunk (41.5 KB -> ~20 KB).

Components using framer-motion would wrap animations in `<LazyMotion features={domAnimation}>` and use `m` instead of `motion` for animated elements.

### 3b. Defer Supabase client initialization

The Supabase client initializes eagerly in the app shell. The landing page only needs it for the PortfolioStrip query. Ensure the full auth listener doesn't block initial render — the auth state subscription can be deferred until the user navigates to a protected route.

### 3c. Lazy-load eagerly imported pages and audit main bundle

Three pages are eagerly imported in `src/App.tsx` instead of using `React.lazy()`:
- `Index` (line 20): `import Index from "./pages/Index"`
- `NotFound` (line 23): `import NotFound from "./pages/NotFound"`
- `AuthPage` (line 24): `import AuthPage from "./pages/AuthPage"`

Convert these to lazy imports like the other 57+ routes. Additionally, the index chunk (101 KB) likely includes top-level App.tsx imports like Toaster, Sonner, and tooltip providers. Move non-critical UI providers behind dynamic imports or load them after initial render.

---

## Fix 4: Unused CSS Reduction (~22.8 KB savings)

**Files:** `src/index.css`, `src/App.css`, `tailwind.config.ts`

### 4a. Wrap custom utilities in @layer

Custom CSS in `src/index.css` (scrollbar-hide, text-gradient, glass morphism, animations) should be wrapped in `@layer utilities` or `@layer components` so Tailwind manages them properly.

### 4b. Clean up Tailwind content config

Remove redundant glob patterns (`./pages/**`, `./components/**`, `./app/**`) that are already covered by `./src/**`.

### 4c. Audit App.css

Verify `#root` sizing rules in `src/App.css` are still needed. Remove if redundant with Tailwind classes.

**Expected impact:** Limited — Tailwind already purges unused classes. The 22.8 KB is per-page waste, not globally unused CSS. This is a lower-priority fix.

---

## Fix 5: Image Optimization (156 KiB savings)

**Files:** `src/components/landing/PortfolioStrip.tsx`, `src/assets/`

### 5a. Optimize Supabase image transforms

Verify PortfolioStrip transform dimensions match actual rendered sizes on mobile (~150-200px per thumbnail). Consider lowering quality to 60 for thumbnails.

### 5b. Add width/height to all img elements site-wide

Every `<img>` tag should have explicit `width` and `height` attributes or `aspect-ratio` CSS. For dynamic images where dimensions aren't known ahead of time, use `aspect-ratio` CSS.

### 5c. Convert oversized Donny assets to WebP

Four PNGs over 1 MB each need conversion:

| File | Current Size | Target |
|------|-------------|--------|
| `Donny_icon.png` | 1.3 MB | ~60-80 KB WebP |
| `Donny_emblem.png` | 1.3 MB | ~60-80 KB WebP |
| `Donny_emblem_cropped.png` | 1.4 MB | ~60-80 KB WebP |
| `Donny_solo.png` | 1.3 MB | ~60-80 KB WebP |

`donny-emblem.webp` (61 KB) already exists as a reference. These PNGs are not currently imported in any `src/` component (grep confirms no references), but they inflate the repo and will cause performance issues when eventually used. Create WebP versions for all four. Since no code references the PNGs, no import updates are needed — just add the optimized WebP files and delete the oversized PNGs.

---

## Fix 6: Render-Blocking CSS (629ms)

**Files:** `index.html`, potentially `vite.config.ts`

### 6a. Inline critical CSS

Extract above-the-fold styles (header, hero section, background) and inline them as a `<style>` tag in `index.html`. Load the full stylesheet asynchronously.

Option A (manual): Hand-pick critical Tailwind classes for the landing page header/hero and inline them in a `<style>` tag in `index.html`.
Option B (automated): Use `vite-plugin-critical` to automate critical CSS extraction at build time. Requires `npm install -D vite-plugin-critical` and adding the plugin to `vite.config.ts`.

**Recommendation:** Option A (manual) — Lovable.dev controls the build pipeline and may not support arbitrary Vite plugins. Manual inlining of ~20 critical Tailwind classes is small, predictable, and has no dependency risk. If Option A proves too brittle (classes changing frequently), revisit Option B after confirming Lovable plugin compatibility.

---

## Fix 7: Cache Headers (478 KiB repeat-visit savings)

**Files:** `public/_headers`

### 7a. Add a _headers file

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache, must-revalidate

/*
  Cache-Control: public, max-age=3600
```

Vite content-hashes all asset filenames, making long-lived caching safe. Note: the `_headers` file format is Netlify/Cloudflare-specific. Lovable.dev uses its own hosting infrastructure which may not respect this file. If it doesn't take effect, there's no downside — the file is inert. To confirm, check Lovable's documentation or test by inspecting response headers after deploy.

---

## Fix 8: Accessibility — Color Contrast (weight 7)

**Files:** `tailwind.config.ts`, button component classes

### 8a. Darken button fill colors for white text contrast

The failing buttons use **white text on teal/pink fill backgrounds**. The issue is the fill colors are too light for white text to meet WCAG AA (4.5:1 for normal text).

| Button Style | Current Fill | Proposed Fill | White Text Contrast |
|-------------|-------------|---------------|-------------------|
| `bg-dc-teal text-white` | `#4DD9C0` (~3.2:1) | `#0D9488` (teal-600) | ~4.5:1 |
| `bg-dc-pink-accent text-white` | `#EC4899` (~3.9:1) | `#DB2777` (pink-600) | ~5.3:1 |

The visual change is subtle — one shade darker on each fill — while bringing all 6+ failing buttons into AA compliance. The teal/pink palette for non-button uses (borders, highlights, backgrounds without white text) stays unchanged.

### 8b. Update Tailwind config color tokens

Adjust the specific shade values in `tailwind.config.ts` for the tokens used on button backgrounds and text. The full palette stays intact; only the functional button shades change.

---

## Fix 9: Network Dependency Tree & Forced Reflow

### 9a. Reduce critical chain depth

The preload/preconnect hints from Fixes 1-2 already address the longest request chains. Additionally, move the Google Fonts `<link>` higher in `<head>` (before other stylesheets) so font fetching starts early.

### 9b. Forced reflow mitigation

Likely caused by framer-motion's layout animations reading geometric properties after DOM mutations. The LazyMotion migration in Fix 3a should reduce this. If it persists post-fix, profiling will identify the specific component.

---

## Fix 10: React Query Tuning

**Files:** `src/App.tsx`

### 10a. Disable refetchOnWindowFocus globally

Add `refetchOnWindowFocus: false` to the QueryClient default options. This prevents unnecessary re-fetches when users tab back to the app. Queries that genuinely need live data (like messages) can override this per-query.

---

## Execution Order

Fixes ordered by Lighthouse scoring weight (highest impact first). Each step is one commit, verified with `npm run build` before moving to the next.

| Step | Fix | Category | Weight/Impact |
|------|-----|----------|---------------|
| 1 | Fix 1: LCP optimization | Performance | weight 25 |
| 2 | Fix 2: FCP optimization | Performance | weight 10 |
| 3 | Fix 3: Unused JS + lazy-load pages | Performance | weight 10 (Speed Index) |
| 4 | Fix 5: Image optimization + dimensions | Performance | weight 25 (via LCP) |
| 5 | Fix 8: Accessibility contrast | Accessibility | weight 7 |
| 6 | Fix 6: Render-blocking CSS | Performance | unweighted |
| 7 | Fix 7: Cache headers | Performance | unweighted |
| 8 | Fix 4: Unused CSS | Performance | low impact |
| 9 | Fix 10: React Query tuning | Performance | low impact |
| 10 | Fix 9: Network tree & forced reflow | Performance | addressed by earlier fixes |

---

## Verification Plan

After all fixes are applied:

1. Run `npm run build` — confirm clean build with no errors
2. Run Lighthouse audit on the local dev server (mobile throttling profile)
3. Compare scores against baseline (Performance 74, Accessibility 96)
4. Target: Performance 90+, Accessibility 100
5. If any metric regresses, bisect commits to identify the cause

---

## Out of Scope

- Stripe integration changes
- Auth flow modifications
- Database schema changes
- New feature development
- Service worker / PWA additions
