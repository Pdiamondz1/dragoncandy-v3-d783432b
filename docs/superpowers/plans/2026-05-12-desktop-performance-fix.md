# Desktop Performance Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise desktop Lighthouse performance score from 43 to 80+ by reducing main-thread blocking time, accelerating LCP, and deferring non-critical resources.

**Architecture:** Three surgical changes to the critical rendering path: (1) preload the two font weights used above the fold, (2) switch framer-motion to async feature loading so animation code doesn't block first paint, (3) lazy-load the BriefGeneratorPreview component (and its Supabase dependency) since it's below the fold on the landing page.

**Tech Stack:** Vite, React, framer-motion LazyMotion, woff2 fonts

---

### Task 1: Preload critical fonts

**Files:**
- Modify: `index.html:15-16`

The browser currently discovers Outfit 400 and 800 only after parsing the inline `<style>` block. Adding `<link rel="preload">` starts the download immediately, reducing FCP and LCP by letting fonts arrive before CSS evaluation completes.

- [ ] **Step 1: Add preload links for Outfit 400 and 800**

Insert two `<link rel="preload">` tags after the existing preconnect line (line 15) in `index.html`:

```html
<link rel="preload" as="font" type="font/woff2" href="/fonts/outfit-latin-400.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/outfit-latin-800.woff2" crossorigin>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "perf: preload critical Outfit font weights for faster FCP/LCP"
```

---

### Task 2: Async framer-motion feature loading

**Files:**
- Modify: `src/lib/motion.tsx:1-3`
- Modify: `src/App.tsx:15,330`
- Modify: `vite.config.ts:29-35`

Currently `domAnimation` is statically imported and evaluated on page load (~154ms). Switching to async loading defers this work. The lightweight `m` proxy renders immediately as plain elements; animations activate once features arrive.

- [ ] **Step 1: Create async feature loader in lib/motion.tsx**

Replace the static `domAnimation` export with an async loader function. Keep all other exports unchanged:

```tsx
import { LazyMotion, m, useReducedMotion, AnimatePresence } from "framer-motion";

const loadMotionFeatures = () =>
  import("framer-motion").then((mod) => mod.domAnimation);

export { m as motion, useReducedMotion, AnimatePresence, LazyMotion, loadMotionFeatures };
```

- [ ] **Step 2: Update App.tsx to use async features**

Change the import at line 15 from:
```tsx
import { LazyMotion, domAnimation } from "@/lib/motion";
```
to:
```tsx
import { LazyMotion, loadMotionFeatures } from "@/lib/motion";
```

Change line 330 from:
```tsx
<LazyMotion features={domAnimation} strict>
```
to:
```tsx
<LazyMotion features={loadMotionFeatures} strict>
```

- [ ] **Step 3: Remove framer-motion from manualChunks**

In `vite.config.ts`, remove the `'vendor-motion': ['framer-motion']` line from `manualChunks`. Since framer-motion is now dynamically imported for its heavy features, Rollup will naturally code-split it. The lightweight proxy (`m`, `useReducedMotion`) stays in the main bundle; the animation engine loads async.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build. The `vendor-motion` chunk should disappear; framer-motion features appear in an async chunk instead.

- [ ] **Step 5: Commit**

```bash
git add src/lib/motion.tsx src/App.tsx vite.config.ts
git commit -m "perf: load framer-motion features asynchronously"
```

---

### Task 3: Lazy-load BriefGeneratorPreview on landing page

**Files:**
- Modify: `src/pages/LandingPage.tsx:5,40`

BriefGeneratorPreview imports the Supabase client, adding the vendor-supabase chunk (~52KB) to the landing page's critical path. Since this component is below the fold, lazy-loading it defers that evaluation until the user scrolls.

- [ ] **Step 1: Convert BriefGeneratorPreview to lazy import**

In `LandingPage.tsx`, replace the static import:
```tsx
import { BriefGeneratorPreview } from "@/components/landing/BriefGeneratorPreview";
```
with a lazy import:
```tsx
const BriefGeneratorPreview = lazy(() => import("@/components/landing/BriefGeneratorPreview").then(m => ({ default: m.BriefGeneratorPreview })));
```

Wrap its usage in a `<Suspense>` boundary:
```tsx
<Suspense fallback={null}><BriefGeneratorPreview /></Suspense>
```

(The `lazy` and `Suspense` imports already exist in the file from the PortfolioStrip lazy load.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. BriefGeneratorPreview now appears in its own async chunk.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "perf: lazy-load BriefGeneratorPreview below the fold"
```
