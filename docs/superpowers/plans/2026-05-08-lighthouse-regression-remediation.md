# Lighthouse Regression Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Lighthouse regressions so mobile Performance hits 85+, desktop 95+, Best Practices returns to 100, and add CI guardrails to prevent future regressions.

**Architecture:** Seven independent surgical fixes, each a single commit verified with `npm run build`. No structural changes to auth, routing, or Supabase client initialization. Fixes target the specific audit failures identified in the May 8 fresh Lighthouse run.

**Tech Stack:** React/TypeScript, Vite, Tailwind CSS, Supabase Storage public render URLs, GitHub Actions (Lighthouse CI)

---

### Task 1: Reduce Main-Thread Work (Lazy DonnyDesktopPanel + Deferred PerformanceMonitor + GPU Marquee)

**Files:**
- Modify: `src/App.tsx:2,10,313`
- Modify: `src/components/analytics/PerformanceMonitor.tsx:36`
- Modify: `src/index.css` (add new rule after line 232)

This is the highest-impact fix. Mobile TBT went from 30ms to 320ms because DonnyDesktopPanel is eagerly imported (adds to Script Evaluation), PerformanceMonitor's 30s interval fires immediately competing with initial render, and the marquee animation forces main-thread repaints instead of GPU compositing.

- [ ] **Step 1: Lazy-load DonnyDesktopPanel in App.tsx**

Replace the eager import at line 10:

```typescript
// REMOVE this line:
import { DonnyDesktopPanel } from "@/components/donny/DonnyDesktopPanel";

// ADD this line (named export requires .then wrapper):
const DonnyDesktopPanel = lazy(() => import("@/components/donny/DonnyDesktopPanel").then(m => ({ default: m.DonnyDesktopPanel })));
```

Then wrap the usage at line 313 in Suspense:

```tsx
// REPLACE:
<ErrorBoundary level="widget" fallback={null}><DonnyDesktopPanel /></ErrorBoundary>

// WITH:
<ErrorBoundary level="widget" fallback={null}><Suspense fallback={null}><DonnyDesktopPanel /></Suspense></ErrorBoundary>
```

Note: `lazy` is already imported on line 2 of App.tsx. `Suspense` is also already imported on line 2.

- [ ] **Step 2: Defer PerformanceMonitor memory interval**

In `src/components/analytics/PerformanceMonitor.tsx`, wrap the `setInterval` call in `requestIdleCallback` so it doesn't compete with initial render.

Replace lines 35-36:

```typescript
// REPLACE:
    // Check memory every 30 seconds
    const memoryInterval = setInterval(checkMemoryUsage, 30000);

// WITH:
    let memoryInterval: ReturnType<typeof setInterval> | undefined;
    const startMemoryMonitoring = () => {
      memoryInterval = setInterval(checkMemoryUsage, 30000);
    };
    if ('requestIdleCallback' in window) {
      (window as Window).requestIdleCallback(startMemoryMonitoring);
    } else {
      setTimeout(startMemoryMonitoring, 2000);
    }
```

Update the cleanup on line 61 to handle the potentially-undefined interval:

```typescript
// REPLACE:
      clearInterval(memoryInterval);

// WITH:
      if (memoryInterval) clearInterval(memoryInterval);
```

- [ ] **Step 3: Add GPU compositing for marquee**

In `src/index.css`, add a `will-change` rule inside the `@layer utilities` block (before the closing `}` on line 232):

```css
  /* Promote marquee to GPU compositor layer to avoid main-thread repaints */
  .animate-marquee {
    will-change: transform;
  }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build, no errors. DonnyDesktopPanel chunk appears as a separate file in `dist/assets/`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/analytics/PerformanceMonitor.tsx src/index.css
git commit -m "perf: lazy-load DonnyDesktopPanel, defer memory monitoring, GPU-promote marquee

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Fix Portfolio Signed URL 400 Errors

**Files:**
- Modify: `src/hooks/useCreatorPortfolioFeed.ts:109-111`

Best Practices dropped from 100 to 96 because 8 Supabase `object/sign` requests return 400 for unauthenticated landing page visitors. The portfolio feed images are publicly opted-in (`allow_portfolio_in_feed = true`), so signing is unnecessary. Construct public render URLs directly from storage paths instead.

- [ ] **Step 1: Add SUPABASE_URL constant at the top of the file**

In `src/hooks/useCreatorPortfolioFeed.ts`, add a constant after line 2 (after the `supabase` import), matching the pattern already used in `PortfolioStrip.tsx`:

```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';
```

- [ ] **Step 2: Replace signed URL logic with public render URL construction**

Replace lines 109-111 inside the `.map(async (url: string) => {` callback:

```typescript
// REPLACE:
              const isExternal = url.startsWith('http');
              const finalUrl = isExternal ? url : await getSignedUrl(url);
              if (!finalUrl) return null;

// WITH:
              const isExternal = url.startsWith('http');
              const finalUrl = isExternal ? url : `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${url}`;
```

This eliminates all 8 console 400 errors. The `getSignedUrl` function and `signedUrlCache` remain in the file for other callers — we only change the portfolio feed path.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCreatorPortfolioFeed.ts
git commit -m "fix: use public render URLs for portfolio feed, eliminate signed URL 400 errors

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Chunk lucide-react Icons

**Files:**
- Modify: `vite.config.ts:29-34`

The main bundle still contains ~22KB of unused icon code. Splitting lucide-react into its own vendor chunk allows parallel loading and reduces the main bundle's unused JS metric.

- [ ] **Step 1: Add vendor-icons manual chunk**

In `vite.config.ts`, add `'vendor-icons': ['lucide-react']` to the `manualChunks` object:

```typescript
// REPLACE:
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-motion': ['framer-motion'],
        },

// WITH:
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
        },
```

- [ ] **Step 2: Verify build and check chunk output**

Run: `npm run build`
Expected: Clean build. A new `vendor-icons-[hash].js` chunk appears in `dist/assets/`. The main bundle size decreases.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "perf: split lucide-react icons into separate vendor chunk

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add fetchpriority to Preload Link

**Files:**
- Modify: `index.html:19`

Lighthouse's "Largest Contentful Paint image was not lazily loaded" / LCP Discovery audit checks for `fetchpriority="high"` on the `<link rel="preload">` tag, not just on the `<img>`. The current preload link is missing this attribute.

- [ ] **Step 1: Add fetchpriority="high" to the logo preload**

In `index.html`, replace line 19:

```html
<!-- REPLACE: -->
    <link rel="preload" as="image" type="image/webp" href="/logo.webp">

<!-- WITH: -->
    <link rel="preload" as="image" type="image/webp" href="/logo.webp" fetchpriority="high">
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "perf: add fetchpriority=high to logo preload link for LCP discovery

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Add Image/Video Dimensions to PortfolioStrip

**Files:**
- Modify: `src/components/landing/PortfolioStrip.tsx:37-51`

The `<img>` and `<video>` elements in MarqueeItem are missing explicit `width` and `height` attributes. This causes a CLS warning and an "image elements do not have explicit width and height" audit failure. The display size is `md:w-40 md:h-40` = 160x160px.

- [ ] **Step 1: Add width/height to video element**

In `src/components/landing/PortfolioStrip.tsx`, replace lines 37-44:

```tsx
// REPLACE:
          <video
            src={item.url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="none"
          />

// WITH:
          <video
            src={item.url}
            className="w-full h-full object-cover"
            width={160}
            height={160}
            muted
            loop
            playsInline
            preload="none"
          />
```

- [ ] **Step 2: Add width/height to img element**

Replace lines 46-51:

```tsx
// REPLACE:
          <img
            src={toThumbnailUrl(item.url)}
            alt={`Portfolio work by ${item.creatorName}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />

// WITH:
          <img
            src={toThumbnailUrl(item.url)}
            alt={`Portfolio work by ${item.creatorName}`}
            className="w-full h-full object-cover"
            width={160}
            height={160}
            loading="lazy"
          />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/PortfolioStrip.tsx
git commit -m "perf: add explicit width/height to PortfolioStrip media elements for CLS

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: CSS Cleanup — Verify @layer Usage

**Files:**
- Modify: `src/index.css` (if dead rules found)

Verify all custom utility classes are inside `@layer utilities` blocks. Check for dead keyframe animations or unused CSS that survived the previous cleanup.

- [ ] **Step 1: Audit CSS structure**

Read `src/index.css` and confirm:
1. All custom utility classes are inside `@layer utilities { }` (lines 153-232) — confirmed.
2. All keyframe animations are used. Cross-reference each `@keyframes` name against the codebase.

Run these searches:
```
grep -r "ensureVisible" src/ --include="*.tsx" --include="*.ts" --include="*.css"
grep -r "slideInLeft\|slideInRight" src/ --include="*.tsx" --include="*.ts" --include="*.css"
grep -r "page-transition-fallback" src/ --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: Remove unused keyframes (if any)**

If `slideInLeft` or `slideInRight` keyframes (lines 266-286) are not referenced anywhere in the codebase, remove them. Same for `ensureVisible` / `page-transition-fallback` — verify usage before removing.

Only remove rules that have zero references outside of `index.css` itself.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no visual regressions.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add src/index.css
git commit -m "perf: remove unused CSS keyframes to reduce stylesheet size

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Lighthouse CI GitHub Action

**Files:**
- Create: `lighthouserc.js`
- Create: `.github/workflows/lighthouse-ci.yml`

Add a GitHub Action that runs Lighthouse on PRs targeting main, tests both desktop and mobile against `/landing`, and posts score comparisons as PR comments. This prevents the kind of regression we're fixing now.

- [ ] **Step 1: Create lighthouserc.js**

Create `lighthouserc.js` in the project root:

```javascript
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:8080/landing'],
      startServerCommand: 'npm run preview -- --port 8080',
      startServerReadyPattern: 'Local',
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1.0 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

- [ ] **Step 2: Create GitHub Actions workflow**

Create `.github/workflows/lighthouse-ci.yml`:

```yaml
name: Lighthouse CI

on:
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run build

      - name: Lighthouse CI — Desktop
        uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: ./lighthouserc.js
          uploadArtifacts: true

      - name: Lighthouse CI — Mobile
        uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: ./lighthouserc.js
          uploadArtifacts: true
        env:
          LHCI_COLLECT__SETTINGS__PRESET: mobile
          LHCI_ASSERT__ASSERTIONS__CATEGORIES_PERFORMANCE: 'error,minScore,0.85'
```

- [ ] **Step 3: Verify build (ensure new files don't break anything)**

Run: `npm run build`
Expected: Clean build. The new files are config-only and don't affect the build.

- [ ] **Step 4: Commit**

```bash
git add lighthouserc.js .github/workflows/lighthouse-ci.yml
git commit -m "ci: add Lighthouse CI GitHub Action to prevent performance regressions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Post-Implementation Verification

After all 7 commits:

1. Run `npm run build` — confirm clean build
2. Run Lighthouse audits via `node scripts/run-lighthouse.mjs https://dragoncandy.io/landing desktop` and `node scripts/run-lighthouse.mjs https://dragoncandy.io/landing mobile`
3. Verify targets: Performance >= 85 mobile / 95 desktop, Accessibility 100, Best Practices 100, SEO 100
4. Visual check: logo loads without flash, portfolio strip animates smoothly, no console 400 errors
5. If any target is missed, identify which audit still fails and apply targeted follow-up fix
