# Lighthouse Performance & Accessibility Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise Lighthouse mobile Performance from 74 to 90+ and Accessibility from 96 to 100.

**Architecture:** Surgical fix-by-weight approach — 10 independent commits ordered by Lighthouse scoring weight. Each commit targets one audit failure, verified with `npm run build`. No new dependencies, no architectural changes.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Supabase, framer-motion

**Spec:** `docs/superpowers/specs/2026-05-07-lighthouse-performance-remediation-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `public/logo.webp` | Create | Stable (non-hashed) logo for preload |
| `index.html` | Modify | Add preload, preconnect, critical CSS |
| `src/components/landing/Header.tsx` | Modify | Logo src, fetchpriority, dimensions |
| `src/App.tsx` | Modify | Lazy-load 3 eager pages, QueryClient tuning |
| `src/lib/motion.tsx` | Modify | LazyMotion tree-shaking |
| `src/components/landing/PortfolioStrip.tsx` | Modify | Image dimensions |
| `tailwind.config.ts` | Modify | Content globs, contrast color tokens |
| `src/index.css` | Modify | @layer wrappers for custom CSS |
| `src/App.css` | Delete | Redundant with index.css |
| `public/_headers` | Create | Cache-control headers |
| `src/assets/Donny_icon.png` | Delete | Unused, 1.3 MB |
| `src/assets/Donny_emblem.png` | Delete | Unused, 1.3 MB |
| `src/assets/Donny_emblem_cropped.png` | Delete | Unused, 1.4 MB |
| `src/assets/Donny_solo.png` | Delete | Unused, 1.3 MB |
| `src/assets/donny-emblem.png` | Delete | Unused, 1.3 MB (webp version exists) |

---

### Task 1: LCP Optimization — Logo Preload & Dimensions

**Files:**
- Create: `public/logo.webp`
- Modify: `index.html:16` (add preload after preconnect)
- Modify: `src/components/landing/Header.tsx:4,39-43`

- [ ] **Step 1: Copy logo to public/ for stable preload URL**

Copy the existing WebP logo to `public/` so it has a stable, non-hashed URL that survives Vite rebuilds:

```powershell
Copy-Item "src/assets/Transparent_DragonCandy_logo.webp" "public/logo.webp"
```

- [ ] **Step 2: Add preload and preconnect to index.html**

In `index.html`, add the logo preload after the existing font preconnect lines (after line 17), and add Supabase preconnect:

```html
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://zocahiffooqdybdhguqv.supabase.co" crossorigin>
    <link rel="preload" as="image" type="image/webp" href="/logo.webp">
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pacifico&display=swap">
```

This adds two lines: the Supabase preconnect and the logo preload.

- [ ] **Step 3: Update Header.tsx — change src, add fetchpriority and dimensions**

Replace the logo import and img tag in `src/components/landing/Header.tsx`:

Remove the import on line 4:
```typescript
// DELETE: import dragonCandyLogo from "@/assets/Transparent_DragonCandy_logo.webp";
```

Replace the `<img>` tag (lines 39-44) with:
```tsx
      <img
        src="/logo.webp"
        alt="DragonCandy"
        width={140}
        height={47}
        fetchPriority="high"
        className="w-[100px] md:w-[120px] lg:w-[140px] h-auto cursor-pointer transition-transform duration-200 hover:scale-105"
        onClick={() => navigate('/')}
      />
```

The `width` and `height` attributes tell the browser the intrinsic size (matching the lg: display size for retina). Tailwind classes still control the responsive rendering. `fetchPriority="high"` ensures the browser prioritizes this image.

- [ ] **Step 4: Verify build**

```powershell
npm run build
```

Expected: Clean build, no errors. The logo should load from `/logo.webp` with a preload hint.

- [ ] **Step 5: Commit**

```powershell
git add public/logo.webp index.html src/components/landing/Header.tsx
git commit -m "perf: preload logo via stable public/ URL with fetchpriority and dimensions"
```

---

### Task 2: Lazy-Load Eagerly Imported Pages

**Files:**
- Modify: `src/App.tsx:20,23-24`

- [ ] **Step 1: Convert eager imports to lazy imports**

In `src/App.tsx`, replace lines 20, 23-24:

```typescript
// BEFORE (line 20):
import Index from "./pages/Index";
// AFTER:
const Index = lazy(() => import("./pages/Index"));

// BEFORE (line 23):
import NotFound from "./pages/NotFound";
// AFTER:
const NotFound = lazy(() => import("./pages/NotFound"));

// BEFORE (line 24):
import AuthPage from "./pages/AuthPage";
// AFTER:
const AuthPage = lazy(() => import("./pages/AuthPage"));
```

`lazy` is already imported on line 2. These three pages were the only eager imports among 60+ routes, meaning their code was bundled into the main chunk instead of being split.

- [ ] **Step 2: Verify build**

```powershell
npm run build
```

Expected: Clean build. The main bundle size should decrease as Index, NotFound, and AuthPage are now separate chunks.

- [ ] **Step 3: Commit**

```powershell
git add src/App.tsx
git commit -m "perf: lazy-load Index, NotFound, and AuthPage to reduce main bundle"
```

---

### Task 3: Tree-Shake framer-motion with LazyMotion

**Files:**
- Modify: `src/lib/motion.tsx`

- [ ] **Step 1: Replace motion.tsx with LazyMotion setup**

Replace the entire contents of `src/lib/motion.tsx`:

```tsx
import { LazyMotion, domAnimation, m, useReducedMotion, AnimatePresence } from "framer-motion";

export { m as motion, useReducedMotion, AnimatePresence, LazyMotion, domAnimation };

export const tapScale = {
  whileTap: { scale: 0.98, y: 2 },
  transition: { duration: 0.05 },
};

export const liftHover = {
  whileHover: { y: -2 },
  transition: { duration: 0.15 },
};

export const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: "easeOut" },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: "easeOut" },
};

export const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 },
  transition: { duration: 0.2 },
};

export const slideUp = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { type: "spring", damping: 25, stiffness: 300 },
};
```

Key changes:
- Import `LazyMotion`, `domAnimation`, and `m` instead of `motion`
- Re-export `m` aliased as `motion` so the 11 consuming files don't need changes
- Export `LazyMotion` and `domAnimation` for wrapping in the app shell

**Verification note:** The `m` component is framer-motion's tree-shakeable substitute for `motion`. When rendered inside a `<LazyMotion>` ancestor, `m.div` behaves identically to `motion.div`. The alias `m as motion` preserves the existing API so no consuming files need changes. Since `<LazyMotion>` is placed at the app root (Step 2), all 11 consuming components will be inside the provider. After this change, run the app and verify animations still work on the landing page, onboarding wizard, and page transitions.

- [ ] **Step 2: Wrap the app in LazyMotion provider**

In `src/App.tsx`, add the import and wrap the app content:

Add to imports (near line 2):
```typescript
import { LazyMotion, domAnimation } from "@/lib/motion";
```

Wrap the `<BrowserRouter>` contents with `<LazyMotion>`. Find the `<BrowserRouter>` in the return statement and add:
```tsx
<LazyMotion features={domAnimation} strict>
  {/* existing BrowserRouter children */}
</LazyMotion>
```

Place `<LazyMotion>` just inside `<QueryClientProvider>`, wrapping everything inside it.

- [ ] **Step 3: Verify build**

```powershell
npm run build
```

Expected: Clean build. The vendor-motion chunk should be smaller (~20 KB vs 42 KB).

- [ ] **Step 4: Commit**

```powershell
git add src/lib/motion.tsx src/App.tsx
git commit -m "perf: tree-shake framer-motion with LazyMotion and domAnimation"
```

---

### Task 4: Image Optimization — Dimensions & Donny Cleanup

**Files:**
- Modify: `src/components/landing/PortfolioStrip.tsx:35,46-51`
- Delete: `src/assets/Donny_icon.png`, `src/assets/Donny_emblem.png`, `src/assets/Donny_emblem_cropped.png`, `src/assets/Donny_solo.png`, `src/assets/donny-emblem.png`

- [ ] **Step 1: Add aspect-ratio to PortfolioStrip images**

In `src/components/landing/PortfolioStrip.tsx`, the image container divs (line 35) already set fixed dimensions (`w-28 h-28 md:w-40 md:h-40`). Add `width` and `height` to the `<img>` tag (lines 46-51):

```tsx
          <img
            src={toThumbnailUrl(item.url)}
            alt={`Portfolio work by ${item.creatorName}`}
            className="w-full h-full object-cover"
            loading="lazy"
            width={160}
            height={160}
          />
```

Also add to the video tag (line 37-44):
```tsx
          <video
            src={item.url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="none"
            width={160}
            height={160}
          />
```

The 160px value matches the `md:w-40` display size (40 × 4px = 160px).

- [ ] **Step 2: Lower thumbnail quality for PortfolioStrip**

In `src/components/landing/PortfolioStrip.tsx`, line 18, change quality from 75 to 60:

```typescript
    return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=60`;
```

- [ ] **Step 3: Delete unused Donny PNG assets**

These PNGs have no imports anywhere in `src/` (confirmed via grep). Only `donny-emblem.webp` (61 KB) is referenced by `DonnyNavButton.tsx` and `DonnyAvatar.tsx`:

```powershell
git rm src/assets/Donny_icon.png src/assets/Donny_emblem.png src/assets/Donny_emblem_cropped.png src/assets/Donny_solo.png src/assets/donny-emblem.png
```

This removes ~6.5 MB of dead weight from the repo.

- [ ] **Step 4: Verify build**

```powershell
npm run build
```

Expected: Clean build. No broken imports since these PNGs weren't referenced.

- [ ] **Step 5: Commit**

Stage all changes (PortfolioStrip edits + the git-rm'd Donny PNGs):

```powershell
git add src/components/landing/PortfolioStrip.tsx src/assets/Donny_icon.png src/assets/Donny_emblem.png src/assets/Donny_emblem_cropped.png src/assets/Donny_solo.png src/assets/donny-emblem.png
git commit -m "perf: add image dimensions, lower thumbnail quality, delete unused Donny PNGs"
```

---

### Task 5: Accessibility — Darken Button Fill Colors for WCAG AA Contrast

**Files:**
- Modify: `tailwind.config.ts:28-29,32`

- [ ] **Step 1: Identify the contrast-failing tokens**

The Lighthouse audit flags 6+ `<button>` elements. The failing patterns are:
- `bg-dc-teal text-white` — #4DD9C0 on white text is ~2.1:1 (needs 4.5:1)
- `bg-dc-pink-accent text-white` — #EC4899 on white text is ~3.9:1 (needs 4.5:1)

These tokens are defined in `tailwind.config.ts` at lines 28-29 and 32.

- [ ] **Step 2: Add button-specific contrast tokens to Tailwind config**

The `dc-teal` token (`#4DD9C0`) is used for borders, highlights, headings, AND button fills. Changing it globally would alter the entire visual identity. Instead, add new button-specific tokens that meet WCAG AA contrast with white text, and keep the decorative teal unchanged.

In `tailwind.config.ts`, add new tokens inside the `dc` object (after line 30):

```typescript
				dc: {
					teal: '#4DD9C0',
					'teal-dark': '#00E5CC',
					'teal-hover': '#3ec4ac',
					'teal-btn': '#0D9488',
					'teal-btn-hover': '#0F766E',
					pink: '#F9A8D4',
					'pink-accent': '#EC4899',
					'pink-accent-btn': '#DB2777',
					'pink-accent-btn-hover': '#BE185D',
					'pink-bg': '#F9C8E0',
					// ... rest unchanged
```

New tokens:
- `teal-btn`: `#0D9488` (teal-600, ~4.5:1 against white) — for `bg-dc-teal-btn text-white` buttons
- `teal-btn-hover`: `#0F766E` (teal-700) — hover state
- `pink-accent-btn`: `#DB2777` (pink-600, ~5.3:1 against white) — for `bg-dc-pink-accent-btn text-white` buttons
- `pink-accent-btn-hover`: `#BE185D` (pink-700) — hover state

- [ ] **Step 3: Update buttons that use white text on teal/pink fills**

Search for buttons using `bg-dc-teal text-white` and `bg-dc-pink-accent text-white` and update them to use the new contrast-safe tokens. Key files on the landing page:

In `src/components/landing/Header.tsx` (line 65):
```tsx
// BEFORE:
className="rounded-full bg-dc-teal text-white font-semibold px-6 hover:bg-dc-teal-dark ..."
// AFTER:
className="rounded-full bg-dc-teal-btn text-white font-semibold px-6 hover:bg-dc-teal-btn-hover ..."
```

In `src/components/landing/Header.tsx` (line 103):
```tsx
// BEFORE:
className="w-full rounded-full bg-dc-teal text-white font-bold hover:bg-dc-teal-dark"
// AFTER:
className="w-full rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
```

In `src/components/landing/HeroSection.tsx` (line 26):
```tsx
// BEFORE:
className="w-full h-12 rounded-full bg-dc-pink-accent text-white ..."
// AFTER:
className="w-full h-12 rounded-full bg-dc-pink-accent-btn text-white font-bold text-base hover:bg-dc-pink-accent-btn-hover ..."
```

Run a project-wide search for other `bg-dc-teal text-white` and `bg-dc-pink-accent text-white` button patterns and update them similarly. Key files include:
- `src/pages/VerifyEmail.tsx`
- `src/pages/UpdatePassword.tsx`
- `src/pages/SiteGate.tsx`
- `src/pages/PublicCreatorProfile.tsx`
- `src/pages/PublicBusinessProfile.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/ui/error-state.tsx`
- `src/components/onboarding/OnboardingWizard.tsx`
- `src/components/brand-campaigns/*.tsx`

**Do NOT change** `bg-dc-teal` usages that pair with dark text (e.g., `bg-dc-teal text-dc-text`) or decorative usages (borders, backgrounds without text, icons).

No CSS custom property changes needed — `--primary` stays at the current value since it maps to the decorative teal.

- [ ] **Step 4: Verify build and spot-check**

```powershell
npm run build
```

Expected: Clean build. After deploying, all buttons with white text on teal/pink fills should now use the darker contrast-safe tokens. Decorative teal (borders, highlights, headings) remains unchanged.

- [ ] **Step 5: Commit**

```powershell
git add tailwind.config.ts src/components/landing/Header.tsx src/components/landing/HeroSection.tsx
git add src/pages/VerifyEmail.tsx src/pages/UpdatePassword.tsx src/pages/SiteGate.tsx src/pages/PublicCreatorProfile.tsx src/pages/PublicBusinessProfile.tsx
git add src/components/ErrorBoundary.tsx src/components/ui/error-state.tsx src/components/onboarding/OnboardingWizard.tsx
git commit -m "a11y: add contrast-safe button tokens for WCAG AA compliance"
```

Note: Include all files where `bg-dc-teal text-white` or `bg-dc-pink-accent text-white` was updated.

---

### Task 6: Render-Blocking CSS — Inline Critical Styles

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add inline critical CSS to index.html**

Add a `<style>` tag in `<head>` before the stylesheet link. This contains the minimum CSS needed to render the landing page above-the-fold (header + hero background) without waiting for the full stylesheet:

In `index.html`, add before the CSP meta tag (around line 10), or just before `</head>`:

```html
    <style>
      body{margin:0;font-family:'Outfit',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
      #root{width:100%;min-height:100vh}
      .bg-white{background-color:#fff}
      .text-dc-teal{color:#4DD9C0}
      .font-extrabold{font-weight:800}
      .text-center{text-align:center}
      .flex{display:flex}
      .items-center{align-items:center}
      .justify-between{justify-content:space-between}
      .py-4{padding-top:1rem;padding-bottom:1rem}
      .h-auto{height:auto}
      .animate-fade-in{animation:fadeIn .4s ease-out}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    </style>
```

This covers the header layout and hero text color — enough for the browser to paint a meaningful first frame while the full CSS loads asynchronously.

- [ ] **Step 2: Verify build**

```powershell
npm run build
```

Expected: Clean build. The inline styles provide an unstyled-but-readable first paint before the full CSS arrives.

- [ ] **Step 3: Commit**

```powershell
git add index.html
git commit -m "perf: inline critical CSS for faster first paint"
```

---

### Task 7: Cache Headers

**Files:**
- Create: `public/_headers`

- [ ] **Step 1: Create the _headers file**

Create `public/_headers`:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/logo.webp
  Cache-Control: public, max-age=86400

/index.html
  Cache-Control: no-cache, must-revalidate

/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
```

Vite content-hashes `/assets/*` filenames, making immutable caching safe. The logo at `/logo.webp` is non-hashed, so it gets a 24-hour TTL. The root document always revalidates. Note: this file format is Netlify/Cloudflare-specific — if Lovable.dev doesn't respect it, no harm done.

- [ ] **Step 2: Verify build**

```powershell
npm run build
```

Expected: Clean build. The `_headers` file should be copied to `dist/_headers` by Vite.

- [ ] **Step 3: Commit**

```powershell
git add public/_headers
git commit -m "perf: add cache-control headers for static assets"
```

---

### Task 8: Unused CSS Cleanup

**Files:**
- Modify: `tailwind.config.ts:6-11`
- Modify: `src/index.css:37-51`
- Delete: `src/App.css`
- Modify: `src/main.tsx` (remove App.css import if present)

- [ ] **Step 1: Clean up Tailwind content config**

In `tailwind.config.ts`, replace the redundant content array (lines 6-11):

```typescript
	content: [
		"./index.html",
		"./src/**/*.{ts,tsx}",
	],
```

The previous globs (`./pages/**`, `./components/**`, `./app/**`) were all inside `./src/` and therefore redundant. Added `./index.html` to catch any Tailwind classes used in the HTML file (including our new critical CSS).

- [ ] **Step 2: Move fixed-sidebar styles into @layer utilities**

In `src/index.css`, the `.fixed-sidebar` classes (lines 37-51) are outside any `@layer`, making them harder for Tailwind to manage. Move them into the existing `@layer utilities` block (starting at line 170):

Delete lines 36-51 (the fixed-sidebar block) and add them inside `@layer utilities { ... }`:

```css
@layer utilities {
  .fixed-sidebar {
    position: fixed !important;
    top: 76px !important;
    height: calc(100vh - 76px) !important;
    z-index: 0 !important;
    transform: none !important;
  }

  .fixed-sidebar-left {
    left: 0 !important;
  }

  .fixed-sidebar-right {
    right: 0 !important;
  }

  .scrollbar-hide {
    /* ... existing ... */
```

- [ ] **Step 3: Delete App.css**

`src/App.css` contains only `#root` sizing rules that are already covered by `src/index.css` (lines 28-34 handle the same `#root` constraints). Check if `src/main.tsx` imports it:

```powershell
# Check for App.css import in both main.tsx and App.tsx
Select-String -Path "src/main.tsx","src/App.tsx" -Pattern "App.css"
```

If imported in either file, remove that import line. Then delete the file (grep confirms no `App.css` import exists anywhere in `src/`, so this is already dead code):

```powershell
git rm src/App.css
```

- [ ] **Step 4: Verify build**

```powershell
npm run build
```

Expected: Clean build. CSS output should be slightly smaller.

- [ ] **Step 5: Commit**

```powershell
git add tailwind.config.ts src/index.css src/main.tsx
git commit -m "perf: clean up Tailwind content config, move utilities to @layer, remove App.css"
```

---

### Task 9: React Query Tuning

**Files:**
- Modify: `src/App.tsx:88-98`

- [ ] **Step 1: Add refetchOnWindowFocus: false to QueryClient**

In `src/App.tsx`, update the QueryClient configuration (lines 88-98):

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        console.error('Query failed:', error);
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
```

This prevents unnecessary re-fetches when users tab back to the app. Queries that need live data (e.g., messages with Realtime subscriptions) already manage their own freshness and don't depend on window focus refetching.

- [ ] **Step 2: Verify build**

```powershell
npm run build
```

Expected: Clean build. No behavioral change for most queries since staleTime is already 5 minutes.

- [ ] **Step 3: Commit**

```powershell
git add src/App.tsx
git commit -m "perf: disable refetchOnWindowFocus globally to reduce network chatter"
```

---

### Task 10: Network Dependency Tree — Optimize Head Order

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Reorder head elements for optimal loading**

In `index.html`, ensure the `<head>` elements are ordered for maximum parallelism:

1. Charset and viewport (already first)
2. Preconnect hints (fonts + Supabase — early connection setup)
3. Preloads (logo, font CSS — tell browser what to fetch next)
4. Critical inline CSS (paint without waiting for external CSS)
5. Async external CSS (fonts, main stylesheet load in background)
6. Meta tags, icons (non-blocking, can be anywhere)

The current order already has preconnects early. Verify the preload for the logo (added in Task 1) comes before any script or stylesheet references. No further changes should be needed if Tasks 1 and 6 were applied correctly.

- [ ] **Step 2: Verify build**

```powershell
npm run build
```

Expected: Clean build.

- [ ] **Step 3: Final verification — run local dev server**

```powershell
npm run dev
```

Open `http://127.0.0.1:8080/landing` in Chrome, run Lighthouse (mobile throttling). Compare against baseline:
- Performance: 74 → target 90+
- Accessibility: 96 → target 100

- [ ] **Step 4: Commit (if any head reordering was needed)**

```powershell
git add index.html
git commit -m "perf: optimize head element order for faster resource discovery"
```

---

## Intentionally Deferred

These spec items are consciously skipped from this plan:

- **Spec Fix 1c (Resize logo to 280px):** Requires image processing tools (sharp, imagemagick) not available in this environment. The existing 70 KB WebP is copied as-is to `public/logo.webp`. The user can manually resize and replace it for an additional ~60 KB savings.
- **Spec Fix 3b (Defer Supabase client initialization):** The auth listener initializes in `AuthProvider` which wraps the entire app. Deferring it would require significant restructuring of the auth flow — high risk for low reward, especially pre-launch. The lazy-loading of pages (Task 2) already reduces initial JS execution.

---

## Post-Implementation Checklist

After all 10 tasks are complete:

- [ ] Run `npm run build` — clean build, no errors
- [ ] Run Lighthouse mobile audit on `/landing` — compare all metrics to baseline
- [ ] Verify logo loads without flash of missing image
- [ ] Verify all buttons have readable text (contrast check)
- [ ] Verify framer-motion animations still work (page transitions, hover effects)
- [ ] Verify PortfolioStrip images still load with marquee animation
- [ ] Check that no desktop (`lg:`) Tailwind classes were accidentally modified
