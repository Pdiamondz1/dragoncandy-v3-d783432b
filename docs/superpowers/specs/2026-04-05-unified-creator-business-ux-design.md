# Unified Creator & Business UX Design

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Unify Creator dashboard and pages with Business/Restaurant design system

---

## Problem

The Creator and Business dashboards look like different apps. Key inconsistencies:

- Creator has a pink gradient header; Business is flat white
- Card borders: Creator uses `border-2 border-dc-teal`; Business uses `border-gray-200` or none
- Button shapes: Creator uses `rounded-full` (pill); Business uses `rounded-xl`
- Stats grid: Creator is 2x2; Business is 4-column with smaller cards
- Donny AI bar: different border colors, different border-radius between roles
- Section labels: Creator uses `text-dc-teal`; Business uses `text-gray-900`

The platform should feel like one cohesive product regardless of which role is logged in.

## Decision

**Lift Business UP to match Creator.** The Creator experience is the more polished, branded version. The pink gradient header, teal-bordered cards, and pill-shaped buttons ARE the DragonCandy identity. Business pages adopt these patterns rather than stripping them from Creator.

## Design Tokens (existing, no changes needed)

All tokens already exist in `tailwind.config.ts`:

| Token | Value | Usage |
|-------|-------|-------|
| `dc-teal` | `#4DD9C0` | Primary accent, borders, buttons, active nav |
| `dc-pink` | `#F9A8D4` | Secondary accent |
| `dc-pink-bg` | `#F9C8E0` | Gradient header start color |
| `dc-dark` | `#1A1A2A` | Text headings |
| `dc-gray` | `#A8A8A0` | Neutral text |

## Unified Dashboard Structure

Both Creator and Business dashboards follow this identical layout:

### 1. Pink Gradient Header (`DashboardHero`)

```
Background: bg-gradient-to-b from-dc-pink-bg to-pink-50
Contains: welcome message �� Donny AI bar → stats → quick actions
Padding: px-4 pt-6 pb-8
```

**Note:** The top bar (logo, notification bell, avatar) is already rendered by `MobileTopNav` inside `DashboardLayout`. `DashboardHero` does NOT include the top bar — it only owns the content below it (welcome message, Donny bar). The `DashboardHero` provides the pink gradient background that wraps this content.

**Welcome message:**
- Label: "[Role] Dashboard" — `text-sm font-bold uppercase tracking-wide text-dc-teal`
- H1: "Welcome back, [Name]!" — `text-2xl font-bold text-gray-900`
- Subtitle: "Here's what's happening with your account today." — `text-sm text-gray-500`

**Donny AI bar:**
- Container: `bg-white border-2 border-dc-teal rounded-full px-4 py-3`
- Robot emoji + placeholder text
- Creator placeholder: `Ask Donny... "Find campaigns near me"`
- Business placeholder: `Ask Donny... "Find creators near me"`

**Donny component consolidation:** The codebase currently has three Donny bar components:
- `src/components/donny/DonnyCard.tsx` — used by CreatorDashboard (card with quick chips)
- `src/components/donny/DonnyAskBar.tsx` — used by BusinessDashboard (simple search bar)
- `src/components/ai-assistant/AskBar.tsx` — also used by CreatorDashboard

The new `DonnyAIBar` replaces all three in the dashboard context. It is a simple search bar (like `DonnyAskBar`) with role-specific placeholder text. The existing `DonnyCard` and `AskBar` components are NOT deleted — they may be used elsewhere — but neither dashboard page imports them after this change.

### 2. Stats Grid (`DashboardStatsGrid`)

```
Mobile: grid-cols-2 gap-3
Tablet+: md:grid-cols-4 gap-3  (md = 768px, i.e. tablet and above)
Card: border-2 border-dc-teal rounded-2xl p-4 text-center bg-white
```

Each stat card:
- Icon: Lucide icon, `h-4 w-4 text-dc-teal` (top-right of card)
- Label: `text-xs text-gray-500 uppercase tracking-wide font-semibold`
- Value: `text-3xl font-extrabold text-gray-900`
- Subtitle: `text-xs text-gray-500` (optional context line)
- Loading state: `<Skeleton />` placeholder for value

**Creator stats** (from `useCreatorDashboardStats` hook):
| Label | Hook field | Icon |
|-------|-----------|------|
| Revenue | `totalRevenue` (formatted as currency) | DollarSign |
| Applied | `campaignsApplied` | Target |
| Completed | `projectsCompleted` | Clock |
| Rating | `averageRating` (1 decimal) | Star |

**Business stats** (from `useBusinessDashboardMetrics` hook):
| Label | Hook field | Icon |
|-------|-----------|------|
| Active Campaigns | `activeCampaigns` | Rocket |
| Pending Content | `pendingContent` | Clock |
| Total Spend | `totalSpend` (formatted as currency) | DollarSign |
| Avg Engagement | `avgEngagement` | Target |

### 3. Quick Action Buttons (`QuickActionButtons`)

```
Container: flex gap-3 px-4
```

Two buttons, each `flex-1`:
- **Primary:** `bg-dc-teal text-white rounded-full py-3 font-semibold`
- **Secondary:** `bg-white border-2 border-dc-teal text-dc-dark rounded-full py-3 font-semibold`

**Creator:** "Browse Campaigns" (primary) | "Update Portfolio" (secondary)
**Business:** "Create Campaign" (primary) | "Browse Creators" (secondary)

### 4. Activity Feed Section

**Section label:** `text-xs font-bold text-dc-teal uppercase tracking-wide`
- Creator: "Active Gigs"
- Business: "Active Campaigns"

**Feed cards (`ActivityFeedCard`):**
```
border-2 border-dc-teal rounded-2xl p-4 bg-white
```
- Title: `text-sm font-bold text-dc-dark`
- Subtitle: `text-xs text-gray-500` (Creator: "Due [date] · $[amount]", Business: "[n] creators · $[budget] budget")
- Status badge: pill shape (`rounded-full px-2 py-0.5 text-xs font-semibold`)
  - Active/In Progress: `bg-emerald-100 text-emerald-700`
  - Review/Reviewing: `bg-amber-100 text-amber-800`
  - Completed: `bg-gray-100 text-gray-600`

### 5. Bottom Navigation (already shared via `MobileBottomNav`)

5 icons, identical for both roles:
1. Home (house icon) — active: `text-dc-teal`, inactive: `text-gray-400`
2. Campaigns (list icon)
3. **+ button** (center) — `bg-dc-teal rounded-full w-12 h-12 text-white shadow-lg`
   - Creator: navigates to Quick Apply or campaign browse
   - Business: navigates to Create Campaign wizard
4. Messages (chat icon)
5. Profile (user icon)

## Shared Components to Create/Refactor

| Component | Location | New/Replaces | Purpose |
|-----------|----------|-------------|---------|
| `DashboardHero` | `src/components/dashboard/DashboardHero.tsx` | New | Pink gradient wrapper with welcome message |
| `DonnyAIBar` | `src/components/dashboard/DonnyAIBar.tsx` | Replaces `DonnyCard`, `DonnyAskBar`, `AskBar` in dashboard context | AI search bar with role-specific placeholder |
| `DashboardStatsGrid` | `src/components/dashboard/DashboardStatsGrid.tsx` | Replaces `BusinessStatsRow` and Creator's inline stats | Responsive 2x2/4-col stats grid |
| `QuickActionButtons` | `src/components/dashboard/QuickActionButtons.tsx` | New (replaces inline buttons in both dashboards) | Primary + outlined button pair |
| `ActivityFeedCard` | `src/components/dashboard/ActivityFeedCard.tsx` | Replaces `ActiveCampaignsFeed` card rendering | Teal-bordered feed item card |

Each component accepts role-specific content via props (labels, values, placeholder text, navigation targets). No role-specific styling — the visual treatment is identical.

**Loading/error/empty states:** All shared components must handle:
- **Loading:** Skeleton placeholders (match existing pattern in `BusinessStatsRow` and Creator stats)
- **Error:** Graceful fallback (return null or show subtle error text, never crash)
- **Empty:** CTA to relevant action (e.g., "No active gigs yet — Browse Campaigns")

## Pages to Update

### Primary (dashboard unification)
- `BusinessDashboard.tsx` — Replace current flat layout with shared components (DashboardHero, DashboardStatsGrid, QuickActionButtons, ActivityFeedCard)
- `CreatorDashboard.tsx` — Refactor to use same shared components (currently has inline styles that match the target)

### Creator-specific content migration

The current CreatorDashboard has sections below the stats that don't exist on Business. These are **preserved below the unified sections** in the white body area:

| Section | Decision | Rationale |
|---------|----------|-----------|
| Recent Activity | **Keep** — render below quick actions using `ActivityFeedCard` | Core dashboard content |
| Quick Actions card (3 buttons) | **Remove** — replaced by `QuickActionButtons` in the header area | Redundant with new unified quick actions |
| Upcoming Deadlines | **Keep** — render below activity feed | Creator-specific, valuable |
| Calendar | **Keep** — render at bottom of page | Creator-specific, valuable |
| `RatingPromptManager` | **Keep** — render between welcome and stats in the header | Already used by both roles |

### Business-specific content migration

The current BusinessDashboard has sections that don't exist on Creator. These are **preserved**:

| Section | Decision | Rationale |
|---------|----------|-----------|
| Sponsorship Proposals | **Keep** — render below activity feed (conditionally, same as current) | Business-specific, functional |
| Dragon Feed side panel | **Keep** — desktop `lg:` only sidebar, no changes | Protected by desktop lg: rule |
| Feed Lightbox modal | **Keep** — no changes | Triggered by side panel |
| `RatingPromptManager` | **Keep** — render between welcome and stats in the header | Already used by both roles |

### Secondary (consistency pass)
These pages need card borders updated from `border-gray-200` to `border-dc-teal`, and buttons from `rounded-xl` to `rounded-full`:
- `BusinessProjects.tsx`
- `BusinessActivity.tsx`
- `BusinessSettings.tsx` (header pattern only)
- `BusinessProposals.tsx`
- `BusinessSponsorships.tsx`

**Out of scope** (no dashboard-style cards to unify):
- `BusinessDragonFeed.tsx` — feed page, not dashboard pattern
- `BusinessProfileSetup.tsx` — onboarding flow, different pattern
- `BusinessPromotionalTools.tsx` — if it exists, separate concern

### Existing shared components to audit
- `BusinessStatsRow.tsx` — Replace with `DashboardStatsGrid`
- `ActiveCampaignsFeed.tsx` — Replace with `ActivityFeedCard` usage

## Protected (DO NOT modify)

- Campaign creation wizard (`CampaignWizard`, all wizard step components)
- Messaging UI (`conversations`, `messages`, chat components)
- Desktop `lg:` Tailwind classes in `DashboardLayout`, `AppSidebar`
- Auth logic and Supabase config
- Stripe integration

## Non-Goals

- No new Tailwind tokens — all needed tokens already exist
- No changes to data fetching / React Query hooks (stats labels must match existing hook fields)
- No changes to routing or navigation structure
- No changes to Supabase schema
- No dark mode considerations (not currently supported)

## Success Criteria

1. `npm run build` succeeds with no TypeScript errors
2. Creator and Business dashboards are visually indistinguishable in layout structure
3. Switching between Creator and Business accounts feels like the same app with different content
4. All 5 shared components are used by both dashboard pages
5. No `border-gray-200` remains on dashboard page cards or listed secondary pages (all use `border-dc-teal`)
6. All buttons on dashboard pages use `rounded-full`
7. Creator-specific sections (Deadlines, Calendar) and Business-specific sections (Sponsorship Proposals, Side Feed) are preserved and functional
