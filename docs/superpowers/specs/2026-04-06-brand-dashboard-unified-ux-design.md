# Brand Dashboard — Unified UX with Design System

**Date:** 2026-04-06
**Approach:** Full rewrite of `BrandDashboard.tsx` using shared dashboard components

## Problem

The current Brand dashboard (`src/pages/BrandDashboard.tsx`, 278 lines) uses inline implementations for stats, quick actions, and layout — duplicating what shared components already provide. The Business and Creator dashboards both use the unified component set (`DashboardHero`, `DonnyAIBar`, `DashboardStatsGrid`, `QuickActionButtons`, `ActivityFeedCard`), but the Brand dashboard is the outlier.

This creates visual inconsistency across roles and maintenance burden from duplicated patterns.

## Decisions

1. **Brand role supports both creating sponsorship campaigns AND sponsoring existing campaigns.** "Create Sponsorship Campaign" is the primary CTA; "Browse & Sponsor" is the secondary CTA.

2. **Stats row uses hybrid metrics:** Active Campaigns (own + sponsored), Total Spend, Creators Connected, Avg. ROI. These cover both sides of the brand's activity.

3. **Single-column layout** (matches Creator dashboard). No side feed panel — brands are new to the platform and won't have enough content to populate a feed. Side feed is a phase 2 consideration.

4. **"How It Works" onboarding section removed.** Business and Creator dashboards don't have one; returning-user dashboards should show operational data, not tutorials.

5. **Budget Overview section preserved** as the one brand-specific body section below the campaign feed.

## Architecture

```
DashboardLayout (userRole="brand")
  └─ DashboardHero (roleLabel="Brand Dashboard", userName=profile.business_name)
       ├─ DonnyAIBar (placeholder: 'Ask Donny... "Create a sponsored campaign for 5 cities"')
       ├─ DashboardStatsGrid (4 hybrid stats, uses useBrandDashboardStats)
       └─ QuickActionButtons ([Create Sponsorship Campaign, Browse & Sponsor])
  └─ Body (white background, single-column, max-w-2xl lg:max-w-4xl)
       ├─ Active Campaigns section (ActivityFeedCard list)
       └─ Budget Overview card (brand-specific, 3-column grid: Monthly / Allocated / Available)
```

## Components Used (all existing, no modifications)

| Component | Source | Usage |
|-----------|--------|-------|
| `DashboardLayout` | `src/components/DashboardLayout.tsx` | Page wrapper with `userRole="brand"` |
| `DashboardHero` | `src/components/dashboard/DashboardHero.tsx` | Gradient header with role label + welcome |
| `DonnyAIBar` | `src/components/dashboard/DonnyAIBar.tsx` | AI bar with brand-specific placeholder |
| `DashboardStatsGrid` | `src/components/dashboard/DashboardStatsGrid.tsx` | 2x2/4-col stats grid with icons |
| `QuickActionButtons` | `src/components/dashboard/QuickActionButtons.tsx` | Exactly 2 buttons (primary + secondary) |
| `ActivityFeedCard` | `src/components/dashboard/ActivityFeedCard.tsx` | Campaign list items with status badges |

## Files Modified

### `src/pages/BrandDashboard.tsx` — Full rewrite

Replace the 278-line inline implementation with ~120 lines using shared components. Structure mirrors `CreatorDashboard.tsx` and `BusinessDashboard.tsx`.

**Header section** (inside `DashboardHero`):
- `DonnyAIBar` with placeholder: `'Ask Donny... "Create a sponsored campaign for 5 cities"'`
- `DashboardStatsGrid` with 4 stats from `useBrandDashboardStats`
- `QuickActionButtons` with:
  - Primary: "Create Sponsorship Campaign" → `/dashboard/business/campaigns/create` (reuses Business wizard with sponsorship flag)
  - Secondary: "Browse & Sponsor" → `/dashboard/brand/discover-campaigns`

**Body section** (white background):
- **Active Campaigns feed** using `ActivityFeedCard` components
  - Fetched via a new `useBrandActiveCampaigns` hook
  - Subtitle shows creator name + deadline for owned campaigns, or "Sponsored · $X budget" for sponsorships
  - Empty state: "No active campaigns yet" with link to create one
- **Budget Overview card** (preserved from current dashboard)
  - 3-column grid: Monthly budget, Allocated, Available
  - Loading and error states preserved
  - Uses existing `useBrandDashboardStats` data for budget fields

### `src/hooks/useBrandDashboardStats.ts` — Update return shape

Update the stats to match the hybrid metrics:
- `activeCampaigns`: count of own campaigns + active sponsorships (replaces `activeSponsorships` + `campaignsDiscovered`)
- `totalSpend`: sum of sponsorship amounts paid (new metric)
- `creatorsConnected`: unchanged
- `avgROI`: renamed from `marketingROI` for clarity
- Budget fields (`monthlyBudget`, `allocatedBudget`, `availableBudget`, `budgetPercentage`): unchanged

### `src/hooks/useBrandActiveCampaigns.ts` — New hook

Fetches the brand's active campaigns for the feed. Returns both:
1. Campaigns the brand created (from `campaigns` table where `business_id` matches)
2. Campaigns the brand is sponsoring (from `campaign_sponsorships` joined with `campaigns`)

Returns array of `{ id, title, subtitle, status }` sorted by most recent activity.

## Design Consistency Checklist

- [x] Same background: white body (`bg-white`), pink gradient header (via `DashboardHero`)
- [x] Same card component: `border-2 border-dc-teal rounded-2xl` pattern
- [x] Same typography scale: teal uppercase labels, 2xl bold headings, sm gray body
- [x] Same button styles: teal primary (`bg-dc-teal`), outlined secondary (`border-2 border-dc-teal`)
- [x] Same bottom nav: handled by `DashboardLayout`
- [x] Same Donny AI bar: `DonnyAIBar` component
- [x] Same header: `DashboardHero` component
- [x] Same stats grid: `DashboardStatsGrid` component
- [x] Same quick actions: `QuickActionButtons` component
- [x] Desktop `lg:` Tailwind classes preserved (max-w-4xl breakpoint)

## Constraints

- **PROTECT:** Do not modify `BusinessDashboard.tsx` or `CreatorDashboard.tsx`
- **PROTECT:** Do not modify any shared dashboard component — Brand adapts to them, not the other way around
- **PROTECT:** Desktop `lg:` Tailwind breakpoint classes must be preserved
- **Route reuse:** "Create Sponsorship Campaign" routes to the existing Business campaign wizard at `/dashboard/business/campaigns/create`. The wizard already exists; adding a sponsorship type flag is phase 2.

## Verification

- `npm run build` succeeds with no TypeScript errors
- Brand dashboard renders with all shared components
- Stats load from `useBrandDashboardStats` (loading + error states work)
- Campaign feed shows active campaigns (empty state works)
- Budget Overview shows budget data (loading + error states work)
- Quick action buttons navigate to correct routes
- Visual parity with Business and Creator dashboards at mobile and desktop breakpoints
