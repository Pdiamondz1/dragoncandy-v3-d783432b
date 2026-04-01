# Business Dashboard Command Center — Design Spec

**Date:** 2026-04-01
**Scope:** Rebuild the business/restaurant dashboard as a professional, data-forward command center.
**Protected:** Landing page, login page, creator-side pages, brand dashboard pages — no changes.

---

## Overview

Replace the current pink-header, DragonDash-CTA dashboard with a clean, white, metrics-driven command center. The dashboard should feel like a professional tool, not a marketing page. Key additions: stats row, hybrid Donny AI bar, active campaigns feed. Key removals: pink header, 3-column quick actions, 7-icon bottom nav.

---

## 1. Header

**Current:** Pink gradient background, large DragonCandy logo, script-font welcome text, hamburger menu.
**New:** White/light background, compact layout.

| Position | Element | Details |
|----------|---------|---------|
| Left | DragonCandy logo | 40px circle, uses existing `dragon-emblem.png` asset |
| Center | Welcome text | "Welcome back, [Business Name]" in dark (`text-gray-900`), subtitle "Create content and drive revenue" in gray (`text-gray-500`) |
| Right | Bell + Avatar | Notification bell icon (lucide `Bell`), profile avatar circle with teal ring |

**Implementation:** This header replaces content inside the `BusinessDashboard` page component, not the `DashboardLayout` top bar. The DashboardLayout top bar (which handles desktop nav, theme toggle, etc.) remains untouched. On mobile, this header renders as the first section inside the scrollable content area.

---

## 2. Donny AI Bar (Hybrid)

**Current:** `AskBar.tsx` — a simple button that dispatches `donny-open-chat` event to open `DonnyChatSheet`. Plus `DonnyCard.tsx` — a teal gradient suggestion card.
**New:** A single enhanced `DonnyAskBar` component that replaces both.

### Behavior

1. **Default state:** Full-width teal-bordered pill input. Left icon: sparkle/AI icon (lucide `Sparkles`). Placeholder: "Ask Donny anything... 'Create a campaign for our new brunch menu'"
2. **On focus/tap:** Bar stays in place. Quick-action chips appear below with a subtle expand animation:
   - "Generate Campaign" → navigates to `/dashboard/business/campaigns/create`
   - "Find Creators" → navigates to `/dashboard/business/creators`
   - "Check Analytics" → navigates to `/dashboard/analytics`
3. **On typing + submit:** Opens `DonnyChatSheet` (existing component) with the typed query pre-filled via the existing `donny-open-chat` custom event with `{ detail: { message } }`.
4. **Click outside / blur:** Chips collapse back.

### Component

- New file: `src/components/donny/DonnyAskBar.tsx`
- Props: `userRole: string` (for future role-specific chips)
- Replaces: `AskBar.tsx` usage in BusinessDashboard and `DonnyCard` usage in BusinessDashboard
- `AskBar.tsx` and `DonnyCard.tsx` remain in the codebase (used elsewhere), just no longer rendered in BusinessDashboard.

### Sticky behavior

The Donny bar is NOT sticky on mobile (it scrolls with content). It sits at the top of the content area, below the header. Making it sticky would eat vertical space on small screens.

---

## 3. Stats Row

**Current:** No stats on business dashboard.
**New:** 4 metric cards in a horizontal row.

| Metric | Source | Empty State |
|--------|--------|-------------|
| Active Campaigns | `campaigns` table: `status = 'active'` AND `user_id = currentUser` | "0" with "Launch your first campaign" link |
| Pending Content | `campaign_collaborations` table: `status = 'in_progress'` AND linked to user's campaigns | "0" with "No content pending" |
| Total Spend | `campaign_collaborations` table: sum of `agreed_rate` for `status = 'completed'` | "$0" with "Track your investment" |
| Avg. Engagement | `analytics_events` table or hardcoded "—" if no analytics pipeline exists yet | "—" with "Coming soon" |

### Trend indicators

- Compare current period (this month) vs previous period (last month)
- Show `↑ N` in green or `↓ N` in red
- If no previous data, show no trend arrow

### Component

- New file: `src/components/dashboard/BusinessStatsRow.tsx`
- New hook: `src/hooks/useBusinessDashboardMetrics.ts` — React Query hook that fetches the 4 metrics from Supabase
- Cards use `bg-white rounded-xl p-3 shadow-sm` styling
- Grid: `grid grid-cols-4 gap-2` on mobile, `gap-3` on desktop

### Empty state (Option A — confirmed)

All 4 cards always render. Zeros shown with a small text nudge below the label. No collapsing, no layout shift.

---

## 4. Quick Actions (Simplified)

**Current:** 3-column grid — View Campaigns, Browse Creators, View Analytics. Plus a large DragonDash CTA card above.
**New:** 2-card grid replacing both the DragonDash card and the 3-column quick actions.

| Card | Style | Action |
|------|-------|--------|
| Create Campaign | Teal fill (`bg-dc-teal`), white text, rocket icon | Navigate to `/dashboard/business/campaigns/create` |
| Browse Creators | White fill, gray border (`border-2 border-gray-200`), dark text, users icon | Navigate to `/dashboard/business/creators` |

- Grid: `grid grid-cols-2 gap-3`
- Cards: `rounded-xl p-4 text-center` with icon + title + short description
- "View Analytics" removed from quick actions (accessible via stats row tap)
- DragonDash CTA card removed (Create Campaign absorbs this purpose)

---

## 5. Active Campaigns Feed

**Current:** No campaign feed. Sponsorship proposals shown if pending.
**New:** List of the user's campaigns with status.

### Data

- Query `campaigns` table where `user_id = currentUser`, ordered by `created_at DESC`, limit 5
- Join `campaign_collaborations` to get assigned creator name
- Fields displayed: campaign name, creator handle (or "Unassigned"), due date, status badge

### Status badges

| Status | Badge Style |
|--------|------------|
| active | Green bg, green text (`bg-emerald-50 text-emerald-700`) |
| pending | Yellow bg, amber text (`bg-amber-50 text-amber-700`) |
| completed | Gray bg, gray text (`bg-gray-100 text-gray-600`) |
| draft | Blue bg, blue text (`bg-blue-50 text-blue-700`) |

### Empty state

"No active campaigns yet. Let Donny help you create one." with a teal "Create Campaign" link.

### Component

- New file: `src/components/dashboard/ActiveCampaignsFeed.tsx`
- New hook: `src/hooks/useBusinessActiveCampaigns.ts`
- White card container with dividers between items (`divide-y`)

### Sponsorship proposals

Sponsorship proposals section (currently lines 108-144 in BusinessDashboard.tsx) moves BELOW the campaigns feed. Same component (`SponsorshipProposalCard`), same conditional rendering — only shown if `pendingProposals.length > 0`.

---

## 6. Bottom Nav (Business Only)

**Current:** 7 icons — Home, Heart/Feed, Play/Inspire, +Create (center), Campaigns, Promos, Profile.
**New:** 5 icons.

| Position | Icon | Label | Route |
|----------|------|-------|-------|
| 1 | `LayoutDashboard` | Home | `/dashboard/business` |
| 2 | `Megaphone` | Campaigns | `/dashboard/business/campaigns` |
| 3 (center) | `Plus` | Create | `/dashboard/business/campaigns/create` |
| 4 | `MessageSquare` | Messages | `/dashboard/business/messages` |
| 5 | `User` | Profile | `/dashboard/business/settings` |

### Implementation

- Modify `businessBottomNav` array in `src/lib/navConfig.ts` — replace the 7-item array with 5 items
- The center `+` button keeps `isCenter: true` but loses `isDonny: true` (Donny is now in the ask bar, not the nav)
- `MobileBottomNav.tsx` needs no structural changes — it already maps over the array. The `isDonny` conditional for `DonnyNavButton` will simply not trigger.
- Creator and brand bottom nav arrays: **unchanged**.

---

## 7. Desktop Side Feed (Preserved)

The desktop side feed (`BusinessDashboardSideFeed`) and lightbox remain exactly as-is:
- `hidden lg:block w-80` — only visible on desktop
- Sits to the right of the main content area
- No changes needed

---

## 8. Files Changed Summary

| File | Change |
|------|--------|
| `src/pages/BusinessDashboard.tsx` | Major rewrite — new layout with all 6 sections |
| `src/lib/navConfig.ts` | `businessBottomNav` reduced from 7 to 5 items |
| `src/components/donny/DonnyAskBar.tsx` | **New** — hybrid Donny bar with chips |
| `src/components/dashboard/BusinessStatsRow.tsx` | **New** — 4-metric stats row |
| `src/components/dashboard/ActiveCampaignsFeed.tsx` | **New** — campaign list with status badges |
| `src/hooks/useBusinessDashboardMetrics.ts` | **New** — React Query hook for stats |
| `src/hooks/useBusinessActiveCampaigns.ts` | **New** — React Query hook for campaign feed |

### Files NOT changed

- `src/components/MobileBottomNav.tsx` — no structural changes needed
- `src/components/DashboardLayout.tsx` — untouched
- `src/components/ai-assistant/AskBar.tsx` — kept (used by creator dashboard)
- `src/components/donny/DonnyCard.tsx` — kept (may be used elsewhere)
- All creator/brand pages and components
- All routing in `App.tsx`

---

## 9. Verification

- `npm run build` succeeds with no TypeScript errors
- Dashboard renders correctly at 375px (mobile) and 1440px (desktop with side feed)
- Bottom nav shows 5 icons for business role, 7 for creator/brand
- Stats row shows zeros gracefully for new users
- Donny bar chips navigate correctly; typing opens chat sheet
- Desktop side feed still visible and functional
