# Unified Creator UX Design Spec

**Date:** 2026-04-06
**Goal:** Eliminate visual inconsistencies between Creator, Business, and Brand dashboards by fixing the ~15% of UI that diverges from the shared design system.

## Context

The dashboards already share ~85% of their UI through common components: `DashboardHero`, `DashboardStatsGrid`, `DonnyAIBar`, `QuickActionButtons`, and `ActivityFeedCard`. All use the pink gradient header (`from-dc-pink-bg to-pink-50`) and teal accent (`#4DD9C0`).

The remaining divergences are:
- Gray backgrounds (`#A8A8A0`) on 8+ pages
- Off-brand message bubble colors (blue/muted instead of teal/pink)
- Bottom nav icon count varies by role (7/5/6)
- Donny mascot icon on center nav button (creator/brand)
- Brand dashboard uses different Donny components

## Protected (NOT modified)

- Campaign creation wizard
- Messaging layout/structure (only colors change)
- Desktop `lg:` Tailwind classes
- Auth logic
- Shared dashboard components (already unified)
- Sidebar navigation (desktop)
- Message bubble shape (`rounded-lg`) — noted divergence from design system pill shape, but out of scope for this task

---

## Change 1: Gray Background Removal

Replace all `bg-dc-gray` / `bg-[#A8A8A0]` page backgrounds. Use `bg-teal-50` for messaging/chat pages, `bg-gray-50` for all others.

### General pages → `bg-gray-50`

| File | Occurrences | Notes |
|------|-------------|-------|
| `src/pages/CreatorCampaignMarketplace.tsx` | 1 | **Also requires text color fixes** (see below) |
| `src/pages/CampaignDetailsPage.tsx` | 3 | |
| `src/pages/ProjectDetailsPage.tsx` | 3 | |
| `src/pages/PublicBusinessProfile.tsx` | 3 | |
| `src/pages/PublicCreatorProfile.tsx` | 3 | |
| `src/pages/BrandCampaignDetails.tsx` | 4 | |
| `src/pages/NotFound.tsx` | 1 | |

### Messaging/chat pages → `bg-teal-50`

| File | Occurrences | Notes |
|------|-------------|-------|
| `src/pages/BrandMessages.tsx` | 2 | |
| `src/pages/CampaignMessagesPage.tsx` | 4 | |
| `src/components/donny/DonnyChatSheet.tsx` | 1 (`bg-[#A8A8A0]`) | |

### Text color fixes for CreatorCampaignMarketplace.tsx

The campaign marketplace has white text (`text-white`, `text-white/50`, `text-white/60`, `text-white/70`) designed for the dark gray background. These must be updated when switching to `bg-gray-50`:

| Current | New | Elements |
|---------|-----|----------|
| `text-white` | `text-gray-900` | Empty state headings |
| `text-white/50` | `text-gray-400` | Swipe hints |
| `text-white/60` | `text-gray-500` | Empty state body text |
| `text-white/70` | `text-gray-500` | No applications text |

Any other page with `text-white` that depends on `bg-dc-gray` must be similarly updated during implementation. The implementer should grep for `text-white` in each affected file before committing.

## Change 2: Message Bubble Brand Colors

**File:** `src/components/messages/MessageBubble.tsx`

| Bubble | Current | New |
|--------|---------|-----|
| Sent (own message) | `bg-blue-600 text-white` | `bg-dc-teal text-white` |
| Received (other) | `bg-muted text-foreground` | `bg-dc-pink text-foreground` |

This aligns with the design system documented in CLAUDE.md: "Outbound Message Teal: `#4DD9C0`" and "Inbound Message Pink: `#F9A8D4`".

## Change 3: Unified Bottom Nav (5 icons + role slot)

**Files:** `src/lib/navConfig.ts`, `src/components/MobileBottomNav.tsx`

### New layout (all roles):

```
Home | [Role Slot] | + | Messages | Profile
```

### Role slot (position 2):

| Role | Icon | Label | Href |
|------|------|-------|------|
| Creator | `DollarSign` | Earnings | `/dashboard/creator/earnings` |
| Business | `Megaphone` | Campaigns | `/dashboard/business/campaigns` |
| Brand | `BarChart3` | Analytics | `/dashboard/brand/analytics` |

### Center "+" button (position 3):

| Role | Label | Href |
|------|-------|------|
| Creator | Browse | `/dashboard/creator/campaigns` |
| Business | Create | `/dashboard/business/campaigns/create` |
| Brand | Discover | `/dashboard/brand/discover-campaigns` |

### Center button changes:

- **Remove:** Donny mascot icon (`Donny_icon.png`) from center button
- **Replace with:** Lucide `Plus` icon (white on teal circle)
- **Remove:** `isDonny` flag from `BottomNavItem` interface and all nav configs
- **Remove:** `DonnyNavButton` import and conditional rendering from `MobileBottomNav.tsx`
- **Remove:** `donnyIcon` import (no longer needed in MobileBottomNav)
- **Keep:** `DonnyChatSheet` — still triggered via `DonnyAIBar` on dashboards and the `donny-open-chat` custom event

**Behavioral change:** Currently, the creator and brand center buttons have both `isCenter: true` and `isDonny: true`. Because `isDonny` is checked first in `MobileBottomNav.tsx`, these buttons open the Donny chat sheet instead of navigating. The business center button (only `isCenter: true`) navigates to the create page. After this change, ALL center buttons will navigate to their `href` — none will open Donny chat. This is intentional: Donny remains accessible through the `DonnyAIBar` on every dashboard, and the center button should be a navigation action, not a chat trigger.

### Nav items removed (moved to sidebar-only):

- Creator: Applied, Projects, Campaigns (redundant with Browse center button)
- Brand: Creators, Sponsors

These remain accessible via the desktop sidebar nav (unchanged).

### Import cleanup:

Remove unused Lucide icon imports from `navConfig.ts` after reducing nav items (e.g., `Heart`, `Play`, `List` if no longer referenced).

## Change 4: Brand Dashboard DonnyAIBar Alignment

**File:** `src/pages/BrandDashboard.tsx`

- **Remove:** `DonnyCard` import from `@/components/donny/DonnyCard` and its usage
- **Remove:** `AskBar` import from `@/components/ai-assistant` and its usage (`AskBar` is only used in `BrandDashboard.tsx` — safe to remove)
- **Add:** Shared `DonnyAIBar` component (from `@/components/dashboard/DonnyAIBar`) with Brand-specific placeholder: `"Ask Donny... 'Show me campaign ROI' or 'Find top creators'"`

This makes all three dashboards use the same Donny interaction pattern.

---

## Files Changed Summary

| # | File | Change |
|---|------|--------|
| 1 | `src/pages/CreatorCampaignMarketplace.tsx` | `bg-dc-gray` → `bg-gray-50` + text color fixes |
| 2 | `src/pages/CampaignDetailsPage.tsx` | `bg-dc-gray` → `bg-gray-50` |
| 3 | `src/pages/ProjectDetailsPage.tsx` | `bg-dc-gray` → `bg-gray-50` |
| 4 | `src/pages/PublicBusinessProfile.tsx` | `bg-dc-gray` → `bg-gray-50` |
| 5 | `src/pages/PublicCreatorProfile.tsx` | `bg-dc-gray` → `bg-gray-50` |
| 6 | `src/pages/BrandCampaignDetails.tsx` | `bg-dc-gray` → `bg-gray-50` |
| 7 | `src/pages/NotFound.tsx` | `bg-dc-gray` → `bg-gray-50` |
| 8 | `src/pages/BrandMessages.tsx` | `bg-dc-gray` → `bg-teal-50` |
| 9 | `src/pages/CampaignMessagesPage.tsx` | `bg-dc-gray` → `bg-teal-50` |
| 10 | `src/components/donny/DonnyChatSheet.tsx` | `bg-[#A8A8A0]` → `bg-teal-50` |
| 11 | `src/components/messages/MessageBubble.tsx` | Sent: blue → teal. Received: muted → pink |
| 12 | `src/lib/navConfig.ts` | All 3 roles → 5 items, remove `isDonny`, clean imports |
| 13 | `src/components/MobileBottomNav.tsx` | Remove Donny icon/button, use Plus icon for center |
| 14 | `src/pages/BrandDashboard.tsx` | DonnyCard/AskBar → DonnyAIBar |

## Verification

- `npm run build` succeeds
- Creator and Business dashboards use identical header, card, and nav patterns
- All messaging pages use `bg-teal-50` background with teal/pink bubbles
- No `bg-dc-gray` or `#A8A8A0` remains anywhere in `src/`
- No `text-white` on light backgrounds (grep each changed file)
- Bottom nav shows exactly 5 icons for all roles
- Center nav button shows Plus icon, navigates (does not open Donny chat)
- Brand dashboard uses shared DonnyAIBar
- Desktop `lg:` layout unchanged
- Unused Lucide icon imports removed
