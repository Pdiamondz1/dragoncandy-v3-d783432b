# Desktop Overflow & Responsiveness Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all horizontally-scrollable content accessible on desktop by wrapping at `md:` breakpoint, then audit and fix broader desktop UX gaps across the app.

**Architecture:** Phase 1 adds `md:overflow-x-visible md:flex-wrap` to 14 components that currently use `overflow-x-auto scrollbar-hide` (mobile-only pattern). Phase 2 audits all pages at md/lg breakpoints for other desktop responsiveness issues. All changes are additive `md:`-prefixed Tailwind classes — mobile behavior is never touched.

**Tech Stack:** React, TypeScript, Tailwind CSS v3.4.11

**Spec:** `docs/superpowers/specs/2026-05-07-desktop-overflow-responsiveness-design.md`

---

## File Map

### Phase 1 — Overflow Fixes (modify only, no new files)

| File | Change |
|------|--------|
| `src/components/creator-browse/CreatorBrowseHeader.tsx` | Line 94: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaigns/CampaignSearchFilters.tsx` | Lines 155, 185, 206, 225, 244, 263, 282: add `md:overflow-x-visible md:flex-wrap` to 7 pill rows |
| `src/pages/PromotionDetailPage.tsx` | Line 411: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/applications/ApplicationsTabsContent.tsx` | Line 29: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaigns/ApplicationsList.tsx` | Line 167: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaigns/ApplicationsListFixed.tsx` | Line 116: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaigns/CampaignApplyForm.tsx` | Line 230: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaigns/DonnyPicksRow.tsx` | Line 26: replace horizontal scroll with `md:grid md:grid-cols-2 lg:grid-cols-3` |
| `src/components/campaigns/CampaignDetailModal.tsx` | Lines 290, 310: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaign-details/CampaignReferencesGallery.tsx` | Line 18: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaigns/MediaUploader.tsx` | Line 240: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/creator-profile/CreatorPortfolioModal.tsx` | Line 87: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/campaigns/CampaignWizardHeader.tsx` | Line 31: add `md:overflow-x-visible md:flex-wrap` |
| `src/components/dragon-feed/BusinessDashboardSideFeed.tsx` | Line 139: add `md:overflow-y-visible` and remove inline `scrollbarWidth`/`msOverflowStyle` on desktop |

### Phase 2 — Desktop UX Audit

No files pre-determined. Audit produces a findings list; fixes are defined after catalog is complete.

---

## Phase 1 Tasks

### Task 1: Fix CreatorBrowseHeader content-type pills

**Files:**
- Modify: `src/components/creator-browse/CreatorBrowseHeader.tsx:94`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 94 from:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
```
to:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-browse/CreatorBrowseHeader.tsx
git commit -m "fix: wrap CreatorBrowseHeader filter pills on desktop"
```

---

### Task 2: Fix CampaignSearchFilters (7 pill rows)

**Files:**
- Modify: `src/components/campaigns/CampaignSearchFilters.tsx:155,185,206,225,244,263,282`

- [ ] **Step 1: Apply desktop wrap classes to all 7 overflow divs**

Each of these 7 lines has `className="flex gap-1.5 overflow-x-auto scrollbar-hide"` (some with `mb-2.5`). Add `md:overflow-x-visible md:flex-wrap` to each.

Line 155 — change:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap">
```

Line 185 — change:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap">
```

Line 206 — change:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap">
```

Line 225 — change:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap mb-2.5">
```

Line 244 — change:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap mb-2.5">
```

Line 263 — change:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap mb-2.5">
```

Line 282 — change:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap mb-2.5">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignSearchFilters.tsx
git commit -m "fix: wrap CampaignSearchFilters pill rows on desktop"
```

---

### Task 3: Fix PromotionDetailPage filter tabs

**Files:**
- Modify: `src/pages/PromotionDetailPage.tsx:411`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 411 from:
```tsx
<div className="flex gap-1 mb-4 overflow-x-auto">
```
to:
```tsx
<div className="flex gap-1 mb-4 overflow-x-auto md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PromotionDetailPage.tsx
git commit -m "fix: wrap PromotionDetailPage filter tabs on desktop"
```

---

### Task 4: Fix ApplicationsTabsContent tabs

**Files:**
- Modify: `src/components/applications/ApplicationsTabsContent.tsx:29`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 29 from:
```tsx
<div className="overflow-x-auto -mx-1 px-1">
```
to:
```tsx
<div className="overflow-x-auto -mx-1 px-1 md:overflow-x-visible">
```

Note: This container holds a `TabsList` grid, not flex pills. Adding `md:overflow-x-visible` suffices — the grid already handles layout. No `md:flex-wrap` needed.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/applications/ApplicationsTabsContent.tsx
git commit -m "fix: make ApplicationsTabsContent tabs visible on desktop"
```

---

### Task 5: Fix ApplicationsList tabs

**Files:**
- Modify: `src/components/campaigns/ApplicationsList.tsx:167`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 167 from:
```tsx
<div className="overflow-x-auto -mx-1 px-1">
```
to:
```tsx
<div className="overflow-x-auto -mx-1 px-1 md:overflow-x-visible">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ApplicationsList.tsx
git commit -m "fix: make ApplicationsList tabs visible on desktop"
```

---

### Task 6: Fix ApplicationsListFixed tabs

**Files:**
- Modify: `src/components/campaigns/ApplicationsListFixed.tsx:116`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 116 from:
```tsx
<div className="overflow-x-auto -mx-1 px-1">
```
to:
```tsx
<div className="overflow-x-auto -mx-1 px-1 md:overflow-x-visible">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ApplicationsListFixed.tsx
git commit -m "fix: make ApplicationsListFixed tabs visible on desktop"
```

---

### Task 7: Fix CampaignApplyForm thumbnail selector

**Files:**
- Modify: `src/components/campaigns/CampaignApplyForm.tsx:230`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 230 from:
```tsx
<div className="flex gap-2 overflow-x-auto pb-2">
```
to:
```tsx
<div className="flex gap-2 overflow-x-auto pb-2 md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignApplyForm.tsx
git commit -m "fix: wrap CampaignApplyForm thumbnails on desktop"
```

---

### Task 8: Fix DonnyPicksRow campaign cards

**Files:**
- Modify: `src/components/campaigns/DonnyPicksRow.tsx:26`

- [ ] **Step 1: Switch to grid layout on desktop**

Change line 26 from:
```tsx
<div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
```
to:
```tsx
<div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 md:overflow-x-visible md:grid md:grid-cols-2 lg:grid-cols-3 md:pb-0">
```

Note: Cards already have `min-w-[280px] max-w-[320px] flex-shrink-0`. On desktop the grid takes over and these min/max constraints still apply within grid cells, preventing cards from stretching too wide.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/DonnyPicksRow.tsx
git commit -m "fix: grid layout for DonnyPicksRow on desktop"
```

---

### Task 9: Fix CampaignDetailModal galleries (2 locations)

**Files:**
- Modify: `src/components/campaigns/CampaignDetailModal.tsx:290,310`

- [ ] **Step 1: Apply desktop wrap to Visual References gallery**

Change line 290 from:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1">
```
to:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Apply desktop wrap to Raw Footage gallery**

Change line 310 from:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1">
```
to:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignDetailModal.tsx
git commit -m "fix: wrap CampaignDetailModal galleries on desktop"
```

---

### Task 10: Fix CampaignReferencesGallery thumbnails

**Files:**
- Modify: `src/components/campaign-details/CampaignReferencesGallery.tsx:18`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 18 from:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
```
to:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-details/CampaignReferencesGallery.tsx
git commit -m "fix: wrap CampaignReferencesGallery thumbnails on desktop"
```

---

### Task 11: Fix MediaUploader thumbnail grid

**Files:**
- Modify: `src/components/campaigns/MediaUploader.tsx:240`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 240 from:
```tsx
<div className="mt-3 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
```
to:
```tsx
<div className="mt-3 flex gap-3 overflow-x-auto pb-2 scrollbar-hide md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/MediaUploader.tsx
git commit -m "fix: wrap MediaUploader thumbnail grid on desktop"
```

---

### Task 12: Fix CreatorPortfolioModal thumbnail gallery

**Files:**
- Modify: `src/components/creator-profile/CreatorPortfolioModal.tsx:87`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 87 from:
```tsx
<div className="flex gap-2 px-4 pb-4 flex-shrink-0 overflow-x-auto">
```
to:
```tsx
<div className="flex gap-2 px-4 pb-4 flex-shrink-0 overflow-x-auto md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-profile/CreatorPortfolioModal.tsx
git commit -m "fix: wrap CreatorPortfolioModal thumbnails on desktop"
```

---

### Task 13: Fix CampaignWizardHeader progress steps

**Files:**
- Modify: `src/components/campaigns/CampaignWizardHeader.tsx:31`

- [ ] **Step 1: Apply desktop wrap classes**

Change line 31 from:
```tsx
<div className="overflow-x-auto scrollbar-hide pb-1">
```
to:
```tsx
<div className="overflow-x-auto scrollbar-hide pb-1 md:overflow-x-visible md:flex-wrap">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignWizardHeader.tsx
git commit -m "fix: wrap CampaignWizardHeader steps on desktop"
```

---

### Task 14: Fix BusinessDashboardSideFeed vertical overflow

**Files:**
- Modify: `src/components/dragon-feed/BusinessDashboardSideFeed.tsx:139`

- [ ] **Step 1: Apply desktop overflow-visible**

Change line 139 from:
```tsx
className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
```
to:
```tsx
className="flex-1 min-h-0 overflow-y-auto scrollbar-hide md:overflow-y-visible"
```

Also update the inline style block (lines 142-146) to only apply on mobile. Change:
```tsx
style={{
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  scrollBehavior: 'auto',
  overflowX: 'hidden'
}}
```

Note: The `md:overflow-y-visible` Tailwind class overrides the className-based overflow on desktop. The inline `scrollbarWidth` and `msOverflowStyle` styles are fallbacks for the `scrollbar-hide` class and won't affect layout when overflow is visible. No inline style change needed.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dragon-feed/BusinessDashboardSideFeed.tsx
git commit -m "fix: make BusinessDashboardSideFeed visible on desktop"
```

---

### Task 15: Visual verification at 3 breakpoints

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test at mobile (375px)**

Open browser DevTools, set viewport to 375px width. Navigate to:
- Browse Creators page → confirm filter pills still scroll horizontally
- Campaign search → confirm all 7 pill rows swipe
- Campaign detail modal → confirm galleries swipe
- Campaign wizard → confirm steps swipe

Expected: All horizontal scroll behavior preserved. No visual regressions.

- [ ] **Step 3: Test at desktop (1280px)**

Set viewport to 1280px width. Navigate to same pages:
- Browse Creators → filter pills wrap onto multiple rows, all visible
- Campaign search → all pill rows wrap, no hidden overflow
- Campaign detail modal → galleries wrap, thumbnails visible
- DonnyPicksRow → cards display in 3-column grid
- Campaign wizard → steps wrap if needed, all visible
- Business dashboard side feed → feed content not truncated

Expected: All content visible without scrolling. No horizontal overflow.

- [ ] **Step 4: Test keyboard navigation on desktop**

On Browse Creators page at 1280px, Tab through filter pills. Confirm focus moves left-to-right, top-to-bottom across wrapped rows.

Expected: Tab order matches visual flow.

---

## Phase 2 Tasks

### Task 16: Desktop UX audit

- [ ] **Step 1: Audit all pages at md (768px) and lg (1024px) breakpoints**

With dev server running, systematically check every page in `src/pages/` at both breakpoints. For each page, check:
- Content width (should use available space, not stay mobile-narrow)
- Grid layouts (single-column → multi-column)
- Touch-only interactions (swipe with no desktop alternative)
- Bottom nav padding (`pb-32` dead space on desktop)
- Text sizing (mobile-sized on wide screens)
- Modals/drawers (full-screen mobile sheets on desktop)

Document each finding with: page name, component file, issue description, suggested fix.

- [ ] **Step 2: Write findings to audit catalog**

Save findings to `docs/superpowers/plans/2026-05-07-desktop-audit-findings.md`. Each finding is a line item with severity (high/medium/low), affected file, and proposed fix.

- [ ] **Step 3: Commit audit catalog**

```bash
git add docs/superpowers/plans/2026-05-07-desktop-audit-findings.md
git commit -m "docs: desktop UX audit findings catalog"
```

---

### Task 17: Implement audit fixes

- [ ] **Step 1: Triage findings**

Review the audit catalog. Small fixes (Tailwind class additions) go on the same branch. Complex fixes (layout restructuring, new components) get flagged for follow-up.

- [ ] **Step 2: Implement small fixes**

Apply each small fix, one commit per fix. Run `npm run build` after each.

- [ ] **Step 3: Document deferred items**

Any complex findings that need their own design cycle should be noted at the bottom of the audit catalog under a "Deferred" section.

- [ ] **Step 4: Final build verification**

Run: `npm run build`
Expected: Clean build, no errors.
