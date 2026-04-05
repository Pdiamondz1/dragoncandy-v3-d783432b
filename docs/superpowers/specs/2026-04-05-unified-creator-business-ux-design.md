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
Contains: top bar → welcome message → Donny AI bar
Padding: px-4 pt-6 pb-8
```

**Top bar:** Logo (left) | Notification bell + Avatar (right)
- Logo: 24px teal square with dragon icon + "DragonCandy" text
- Bell: 20px circle, gray background
- Avatar: 24px circle, `ring-2 ring-dc-teal`

**Welcome message:**
- H1: "Welcome back, [Name]!" — `text-lg font-bold text-dc-dark`
- Subtitle: "[Role] Dashboard" — `text-sm text-gray-500`

**Donny AI bar:**
- Container: `bg-white border-2 border-dc-teal rounded-full px-4 py-3`
- Robot emoji + placeholder text
- Creator placeholder: `Ask Donny... "Find campaigns near me"`
- Business placeholder: `Ask Donny... "Find creators near me"`

### 2. Stats Grid (`DashboardStatsGrid`)

```
Mobile: grid-cols-2 gap-3
Desktop: md:grid-cols-4 gap-3
Card: border-2 border-dc-teal rounded-2xl p-4 text-center bg-white
```

Each stat card:
- Value: `text-2xl font-extrabold text-dc-dark`
- Label: `text-xs text-gray-500`

**Creator stats:** Active Gigs | Pending Apps | Total Earned | Avg Rating
**Business stats:** Active Campaigns | Applications | Total Spent | Avg Rating

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

| Component | Location | Purpose |
|-----------|----------|---------|
| `DashboardHero` | `src/components/dashboard/DashboardHero.tsx` | Pink gradient header with welcome, Donny bar |
| `DonnyAIBar` | `src/components/dashboard/DonnyAIBar.tsx` | AI search bar with role-specific placeholder |
| `DashboardStatsGrid` | `src/components/dashboard/DashboardStatsGrid.tsx` | Responsive 2x2/4-col stats grid |
| `QuickActionButtons` | `src/components/dashboard/QuickActionButtons.tsx` | Primary + outlined button pair |
| `ActivityFeedCard` | `src/components/dashboard/ActivityFeedCard.tsx` | Teal-bordered feed item card |

Each component accepts role-specific content via props (labels, values, placeholder text, navigation targets). No role-specific styling — the visual treatment is identical.

## Pages to Update

### Primary (dashboard unification)
- `BusinessDashboard.tsx` — Replace current flat layout with shared components (DashboardHero, DashboardStatsGrid, QuickActionButtons, ActivityFeedCard)
- `CreatorDashboard.tsx` — Refactor to use same shared components (currently has inline styles that match the target)

### Secondary (consistency pass)
These pages need card borders updated from `border-gray-200` to `border-dc-teal`, and buttons from `rounded-xl` to `rounded-full`:
- `BusinessProjects.tsx`
- `BusinessActivity.tsx`
- `BusinessSettings.tsx` (header pattern only)
- `BusinessProposals.tsx`
- `BusinessSponsorships.tsx`

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
- No changes to data fetching / React Query hooks
- No changes to routing or navigation structure
- No changes to Supabase schema
- No dark mode considerations (not currently supported)

## Success Criteria

1. `npm run build` succeeds with no TypeScript errors
2. Creator and Business dashboards are visually indistinguishable in layout structure
3. Switching between Creator and Business accounts feels like the same app with different content
4. All 5 shared components are used by both dashboard pages
5. No `border-gray-200` remains on dashboard cards (all use `border-dc-teal`)
6. All buttons on dashboard pages use `rounded-full`
