# Desktop Overflow & Responsiveness Fix

**Date:** 2026-05-07
**Status:** Draft
**Author:** Dame + Claude

## Problem

DragonCandy was designed mobile-first. Horizontal scroll containers use `overflow-x-auto` with `scrollbar-hide` throughout the app — a pattern that works on mobile (touch-swipe) but leaves content inaccessible on desktop where users have no way to scroll hidden overflow.

13 components have this issue. 6 are critical (hidden scrollbar, no fallback). Additionally, the broader desktop experience has not been audited for other responsiveness gaps.

## Solution

Two-phase approach on a single feature branch:

1. **Fix 13 overflow components** using a wrapping pattern on desktop breakpoints
2. **Audit all pages for broader desktop UX issues** and fix what surfaces

## Phase 1: Overflow Fix Pattern

### Core Pattern

On mobile, preserve current horizontal scroll behavior. On desktop (`md:` breakpoint), switch to wrapping so all content is visible without scrolling.

**Before:**
```html
<div className="flex gap-2 overflow-x-auto scrollbar-hide">
```

**After:**
```html
<div className="flex gap-2 overflow-x-auto scrollbar-hide md:overflow-x-visible md:flex-wrap">
```

- Mobile (< 768px): `overflow-x-auto` + `scrollbar-hide` — unchanged
- Desktop (>= 768px): `md:overflow-x-visible` removes scroll container, `md:flex-wrap` flows items onto new rows

### Component Manifest

#### Filter pills and tabs — `md:overflow-x-visible md:flex-wrap`

| Component | File | Line | Content |
|-----------|------|------|---------|
| CreatorBrowseHeader | `src/components/creator-browse/CreatorBrowseHeader.tsx` | 94 | Content-type filter pills |
| CampaignSearchFilters | `src/components/campaign-search/CampaignSearchFilters.tsx` | 155, 185, 206, 225, 244, 263, 282 | 7 filter pill rows (content type, delivery tier, distance, budget, etc.) |
| PromotionDetailPage | `src/pages/PromotionDetailPage.tsx` | 411 | Status filter tabs |
| ApplicationsTabsContent | `src/components/applications/ApplicationsTabsContent.tsx` | 29 | Application status tabs |
| ApplicationsList | `src/components/applications/ApplicationsList.tsx` | 167 | Application status tabs |
| ApplicationsListFixed | `src/components/applications/ApplicationsListFixed.tsx` | 116 | Application status tabs |
| CampaignApplyForm | `src/components/campaigns/CampaignApplyForm.tsx` | 230 | Form selection pills |

#### Card carousels and galleries — `md:flex-wrap` or `md:grid`

| Component | File | Line | Content | Desktop Treatment |
|-----------|------|------|---------|-------------------|
| DonnyPicksRow | `src/components/campaigns/DonnyPicksRow.tsx` | 26 | Campaign cards | `md:grid md:grid-cols-2 lg:grid-cols-3` for predictable layout |
| CampaignDetailModal | `src/components/campaigns/CampaignDetailModal.tsx` | 290, 310 | Visual references + raw footage thumbnails | `md:flex-wrap` with constrained card widths |
| CampaignReferencesGallery | `src/components/campaigns/CampaignReferencesGallery.tsx` | 18 | Reference media thumbnails | `md:flex-wrap` with constrained card widths |
| MediaUploader | `src/components/media/MediaUploader.tsx` | 240 | Uploaded file preview thumbnails | `md:flex-wrap` with constrained card widths |

#### Progress indicators — `md:overflow-x-visible md:flex-wrap`

| Component | File | Line | Content |
|-----------|------|------|---------|
| CampaignWizardHeader | `src/components/campaigns/CampaignWizardHeader.tsx` | 31 | Wizard progress steps |

#### Vertical overflow — `md:overflow-y-visible` or `md:max-h-none`

| Component | File | Line | Content |
|-----------|------|------|---------|
| BusinessDashboardSideFeed | `src/components/dashboard/BusinessDashboardSideFeed.tsx` | 139 | Vertical feed content |

## Phase 2: Broad Desktop UX Audit

After overflow fixes land, audit every page in `src/pages/` at `md` (768px) and `lg` (1024px) breakpoints.

### Audit Checklist

- **Content width**: Pages rendering at full mobile width on wide screens (missing `max-w-*` or `md:` layout)
- **Grid layouts**: Single-column layouts that should expand to multi-column on desktop
- **Touch-only interactions**: Swipe gestures or mobile-only UI with no desktop equivalent
- **Bottom nav padding**: `pb-32` dead space on desktop where sidebar already exists
- **Text sizing**: Headings or body text stuck at mobile size on wide screens
- **Modals and drawers**: Full-screen mobile sheets that should be constrained dialogs on desktop

### Audit Boundaries

**In scope:** All pages rendered at `md` and `lg` breakpoints. Priority: dashboards, browse creators, campaigns, messaging.

**Out of scope:**
- Design system (colors, typography scale, brand identity)
- Auth flows
- Existing working `lg:` classes — protected per CLAUDE.md
- Mobile layout — zero changes to base (non-prefixed) Tailwind classes

### Audit Output

Each finding becomes a line item in the implementation plan. Small fixes land on the same branch. Complex findings get flagged for a follow-up effort.

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Wrapped pills look cluttered (10+ items on 3 rows) | Acceptable density — filter rows already have "Clear filters". Add `md:max-h-*` + "Show more" toggle only if visually needed during implementation. |
| Card carousels lose visual rhythm when wrapped | Use `md:grid md:grid-cols-2 lg:grid-cols-3` instead of `md:flex-wrap` for card-heavy components. Grid gives predictable columns. |
| Breaking existing `lg:` desktop styles | All fixes use `md:` additions only. Existing `lg:` overrides cascade normally. Never modify base (non-prefixed) classes. |
| Mobile regression | Only `md:`-prefixed classes added. Mobile behavior unchanged. Verify swipe still works at mobile viewport during testing. |

## Verification

- `npm run build` after every batch of changes
- Visual check at 3 breakpoints: 375px (mobile), 768px (tablet), 1280px (desktop)
- Confirm mobile swipe behavior preserved on all 13 components
- Each component fix is its own commit for easy revert

## Implementation Order

1. Fix 13 overflow components (known, surgical — one commit per component)
2. Run desktop audit across all pages at md/lg breakpoints
3. Catalog audit findings
4. Implement audit fixes (same branch if small, separate branch if large)
