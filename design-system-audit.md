# DragonCandy Design System Audit

**Date:** 2026-04-27
**Scope:** All 3 role experiences (Restaurant/Business, Creator, Brand) — mobile (375px) + desktop (1440px)
**Status:** Audit complete. Awaiting approval on top 10 fix list.

---

## Token Canonical Values (Source of Truth)

| Token | Value | Tailwind Class |
|-------|-------|----------------|
| Primary | `#4DD9C0` | `bg-dc-teal`, `text-dc-teal`, `border-dc-teal` |
| Primary Dark | `#00E5CC` | `bg-dc-teal-dark` |
| Secondary | `#F9A8D4` | `bg-dc-pink`, `text-dc-pink` |
| Accent Pink | `#EC4899` | `text-dc-pink-accent` |
| Pink Background | `#F9C8E0` | `bg-dc-pink-bg` |
| Gray | `#A8A8A0` | `bg-dc-gray` |
| Dark | `#1A1A2A` | `bg-dc-dark`, `text-dc-dark` |
| Card Radius | 16px | `rounded-2xl` |
| Button Radius | 9999px | `rounded-full` |
| Small Container Radius | 12px | `rounded-xl` |
| Modal/Sheet Radius | 24px | `rounded-t-3xl` (bottom sheet) |
| Card Shadow (rest) | `--shadow-sm` | `shadow-dc-sm` |
| Card Shadow (hover) | `--shadow-md` | `shadow-dc-md` |
| Card Shadow (elevated) | `--shadow-lg` | `shadow-dc-lg` |
| Button Height (default) | 48px | `h-12` |
| Button Height (small) | 40px | `h-10` |
| Button Height (large) | 56px | `h-14` |
| Touch Target Minimum | 44x44px | `min-h-[44px] min-w-[44px]` |
| Section Label | `text-sm font-bold uppercase tracking-wide text-dc-teal` | — |
| Body Text | `text-sm text-gray-600` | — |
| Muted Text | `text-xs text-gray-500` | — |

---

## Divergence List (sorted by visibility)

### HIGH VISIBILITY (Dashboard / Primary Flows)

| # | Component | Role | Actual | Should Be | Files |
|---|-----------|------|--------|-----------|-------|
| 1 | **Teal color** — raw Tailwind instead of dc-token | Brand | `bg-teal-400`, `hover:bg-teal-500`, `text-teal-600`, `ring-teal-400` | `bg-dc-teal`, `hover:bg-dc-teal/90`, `text-dc-teal`, `ring-dc-teal` | BrandCreators.tsx, EmptyStateNoCampaigns.tsx, ShortlistDrawer.tsx, BrandCampaignPreviewStep.tsx, CampaignContextSelector.tsx, BrandCreatorCard.tsx |
| 2 | **Hardcoded hex `#4DD9C0`** | All | `border-[#4DD9C0]`, `text-[#4DD9C0]`, `bg-[#4DD9C0]` | `border-dc-teal`, `text-dc-teal`, `bg-dc-teal` | FileUploadSection.tsx (5x), AvatarUpload.tsx (4x), PortfolioUpload.tsx (2x), ErrorBoundary.tsx (1x), DonnyAvatar.tsx, DonnyChatHeader.tsx |
| 3 | **Stats component split** | Business vs Creator/Brand | `BusinessStatsRow`: `rounded-xl p-3 shadow-sm` | `DashboardStatsGrid`: `rounded-2xl p-4 border-2 border-dc-teal` | BusinessStatsRow.tsx vs DashboardStatsGrid.tsx |
| 4 | **Business Dashboard hero** | Business | Custom inline hero (no shared component, `max-w-5xl`) | Should use `DashboardHero` like Creator/Brand (`max-w-4xl`) | BusinessDashboard.tsx |
| 5 | **Section header pattern** | All | 3 different patterns across roles | Single canonical: `text-sm font-bold uppercase tracking-wide text-dc-teal` | DashboardLayout.tsx (`text-[10px]`), MobileTopNav.tsx (`text-xs tracking-wider`), DashboardHero.tsx (canonical) |
| 6 | **MobileBottomNav inactive color** | All | `text-[#888888]` (hardcoded) | `text-gray-400` or define `text-dc-nav-inactive` | MobileBottomNav.tsx |
| 7 | **DragonShare active tab** | Creator | `bg-teal-500 text-white` | `bg-dc-teal text-white` | CreatorDragonShare.tsx |
| 8 | **QuickActionButtons** bypasses Button variants | Creator/Brand | Inline className duplicates `dc-primary`/`dc-outline` styles | Use `<Button variant="dc-primary">` / `<Button variant="dc-outline">` | QuickActionButtons.tsx |

### MEDIUM VISIBILITY (Settings / Secondary Flows)

| # | Component | Role | Actual | Should Be | Files |
|---|-----------|------|--------|-----------|-------|
| 9 | **ProfileCompletionBar gradient** | Creator vs Business | Creator: `from-teal-400 to-emerald-400`, Business: `from-pink-300 to-pink-500` | Both should use brand tokens: Creator `from-dc-teal to-dc-teal-dark`, Business `from-dc-pink to-dc-pink-accent` | ProfileCompletionBar.tsx |
| 10 | **Card shadow inconsistency** | All | Some cards use `shadow-sm` (native), some `shadow-dc-sm` (token) | All cards should use `shadow-dc-sm` / `shadow-dc-md` | ActiveCampaignsFeed.tsx, BusinessStatsRow.tsx, CreatorApplicationCard.tsx, ActiveCampaignCard.tsx, CompletedCampaignCard.tsx |
| 11 | **Drawer border-radius** | All | `rounded-t-[10px]` (non-standard) | `rounded-t-3xl` (matches Sheet component) | src/components/ui/drawer.tsx |
| 12 | **Creator profile setup button** | Creator | `bg-pink-600 hover:bg-pink-700` | `bg-dc-pink-accent hover:bg-dc-pink-accent/90` or `variant="dc-primary"` | CreatorProfileSetupForm.tsx |
| 13 | **Upload area dashed borders** | All | `border-[#4DD9C0]` | `border-dc-teal` | FileUploadSection.tsx, AvatarUpload.tsx, PortfolioUpload.tsx |
| 14 | **Status badge patterns** | All | 4+ different size/padding combos across roles | Canonical: `text-[10px] font-semibold px-2 py-0.5 rounded-full` | ActivityFeedCard.tsx, ActiveCampaignsFeed.tsx, CreatorApplicationCard.tsx |

### LOW VISIBILITY (Admin / Rare Flows)

| # | Component | Role | Actual | Should Be | Files |
|---|-----------|------|--------|-----------|-------|
| 15 | **Donny component hardcoded colors** | All | `#111`, `#555`, `#F9A8D4`, `#EC4899` | `text-dc-dark`, `text-gray-600`, `bg-dc-pink`, `text-dc-pink-accent` | DonnyMessage.tsx, DonnyChatHeader.tsx, DonnyAvatar.tsx |

---

## Component Extraction Opportunities

| Pattern | Instances | Current State | Proposed |
|---------|-----------|---------------|----------|
| **Stat Card** | 4+ (BusinessStatsRow, DashboardStatsGrid, ROIDashboard, BrandAnalytics) | 2 separate components + inline patterns | Consolidate into `DashboardStatsGrid` everywhere |
| **Campaign Card** | 8+ variants (CampaignCard, ActiveCampaignCard, CompletedCampaignCard, BrandCampaignCard, etc.) | Each is standalone | Extract `CampaignCardBase` with composable sections |
| **Creator Card** | 4+ (CreatorCard, BrandCreatorCard, shortlist entries) | Duplicate avatar/tag/rate logic | Extract `CreatorCardBase` |
| **Section Header** | 5+ inline patterns | `font-bold uppercase tracking-wide text-dc-teal` repeated | Extract `<SectionLabel>` component |
| **Empty State** | 3 components + 10+ inline patterns | Inconsistent icon sizes, spacing, CTA styles | Extract `<DCEmptyState icon title subtitle cta />` |
| **Status Badge** | 15+ inline patterns | Different sizes/padding per file | Extract `<StatusBadge status={} />` with canonical sizes |

---

## Accessibility Issues

### Blocker (must fix before launch)

| Issue | Count | Files |
|-------|-------|-------|
| Images with empty `alt=""` that carry meaning | 9 | ShortlistDrawer, CampaignSearchFilters, CampaignSwipeCard (2x), DonnyPicksRow, DragonSharePostCard, DragonShareSubmitSheet, AdminDragonShareQueue, CreatorDragonShare |

### Major

| Issue | Count | Files |
|-------|-------|-------|
| `text-gray-400` on white bg (fails WCAG AA 4.5:1) | 20+ | AskBar, ApplicationsList, AuthForm, BrandCreatorCard, CampaignContextSelector, FileUploadSection, SettingsSection, many more |
| Missing `focus-visible` on interactive elements | Many | Icon buttons in modals, nav links, toggle buttons, clickable divs |
| Touch targets below 44x44px | 7+ | ThemeToggle (`h-8 w-8`), MessageInputEnhanced (`h-6 w-6`), PromotionCard (`h-8 w-8`) |

### Minor

| Issue | Count | Notes |
|-------|-------|-------|
| Form inputs without visible labels | ~5 | Some use placeholder as sole label |
| Icon-only buttons without `aria-label` | ~10 | Various close/action buttons |

---

## Recommended Fix Order: Top 10 Highest-Leverage Changes

These are sorted by impact (users affected x visual inconsistency x effort):

| # | Fix | Impact | Files Touched | Effort |
|---|-----|--------|---------------|--------|
| **1** | Replace all `bg-teal-400`/`hover:bg-teal-500`/`text-teal-600`/`ring-teal-400` with `bg-dc-teal`/`hover:bg-dc-teal/90`/`text-dc-teal`/`ring-dc-teal` in Brand pages | HIGH — Brand role looks like a different app | ~6 files | Small |
| **2** | Replace all hardcoded `#4DD9C0` hex with `dc-teal` Tailwind classes | HIGH — inconsistent with token system | ~12 files, ~20 replacements | Small |
| **3** | Replace `#888888` in MobileBottomNav with `text-gray-400` | HIGH — visible on every page | 1 file | Trivial |
| **4** | Migrate Business Dashboard to use `DashboardHero` + `DashboardStatsGrid` | HIGH — unifies all 3 role dashboards | BusinessDashboard.tsx, remove BusinessStatsRow.tsx | Medium |
| **5** | Unify section header pattern to canonical `text-sm font-bold uppercase tracking-wide text-dc-teal` | MEDIUM — visible on every dashboard | DashboardLayout.tsx, MobileTopNav.tsx | Small |
| **6** | Fix `text-gray-400` contrast: upgrade to `text-gray-500` minimum for body text on white | HIGH — accessibility compliance | ~20 files | Medium |
| **7** | Replace native `shadow-sm` with `shadow-dc-sm` on all cards | MEDIUM — visual consistency | ~8 files | Small |
| **8** | Fix `QuickActionButtons` to use `<Button variant="dc-primary">` / `<Button variant="dc-outline">` | MEDIUM — consistent component API | 1 file | Trivial |
| **9** | Add meaningful `alt` text to 9 images with empty `alt=""` | HIGH — accessibility blocker | 7 files | Small |
| **10** | Fix ProfileCompletionBar gradients to use dc-* tokens | LOW-MEDIUM — settings page polish | 1 file | Trivial |

---

## Notes

- All `lg:` classes MUST be preserved during fixes
- Brand color palette is FIXED: teal `#4DD9C0`, pink `#F9A8D4`, gray `#A8A8A0`, dark `#1A1A2E`
- No new dependencies
- Each fix gets its own commit: `design(<area>): <description>`
- Verify at both 375px (mobile) and 1440px (desktop) after each fix
