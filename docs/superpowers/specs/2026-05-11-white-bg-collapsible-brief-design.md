# White Backgrounds & Collapsible Brief Sections — Design Spec

**Date:** 2026-05-11
**Status:** Approved
**Scope:** Creator-side frontend only (no database changes)

## Problem

1. `MyCampaignDetailPage` uses `bg-gray-300` as its page background. DragonCandy's design system prohibits gray page backgrounds — the palette uses white, pink gradients, or the branded `#A8A8A0` only on specific legacy pages being migrated away.

2. The campaign brief rendered by `CreatorCampaignDetails` shows 4 sections in a flat vertical stack (Campaign Overview, Content Requirements, Compensation & Terms, Logistics & Targeting). On active campaigns the creator references the brief repeatedly — usually for one specific section. Scrolling through all sections every time is friction.

## Solution

### Change 1: White page backgrounds

Replace all `bg-gray-300` in `MyCampaignDetailPage.tsx` with `bg-white`. Three occurrences: loading skeleton, not-found fallback, and main page wrapper.

The progress bar track in `MyCampaignCard.tsx` (`bg-gray-200`) is a UI element contrast color inside a white card — it stays as-is.

**Project rule going forward:** No gray page backgrounds (`bg-gray-*` as full-page or section-level container backgrounds). Gray is acceptable for UI element contrast (progress bar tracks, dividers, badge backgrounds, input borders).

### Change 2: Collapsible brief sections

Create a `CollapsibleBriefSection` wrapper component used in `CreatorCampaignDetails.tsx`.

**Behavior:**
- Each section has a tappable header row: section title (left) + chevron icon (right)
- Chevron rotates 180° when open vs closed (CSS transition)
- Content animates open/close via Radix Collapsible
- Campaign Overview starts expanded (`defaultOpen: true`)
- Content Requirements, Compensation & Terms, Logistics & Targeting start collapsed (`defaultOpen: false`)

**Implementation:**
- New file: `src/components/campaign-details/CollapsibleBriefSection.tsx`
- Uses existing `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@/components/ui/collapsible`
- Props: `title: string`, `defaultOpen?: boolean`, `children: React.ReactNode`
- The trigger renders the section heading (`text-sm font-bold text-gray-900 uppercase tracking-wider`) matching the existing heading style, plus a `ChevronDown` icon from lucide-react

**Parent changes in `CreatorCampaignDetails.tsx`:**
- Wrap each section component in `<CollapsibleBriefSection title="..." defaultOpen={...}>` 
- Remove the `<h3>` heading from each of the 4 section components since the collapsible trigger becomes the heading

## File Changes

### New files
| File | Purpose |
|------|---------|
| `src/components/campaign-details/CollapsibleBriefSection.tsx` | Reusable collapsible wrapper with animated chevron |

### Modified files
| File | Change |
|------|--------|
| `src/pages/MyCampaignDetailPage.tsx` | Replace 3× `bg-gray-300` with `bg-white` |
| `src/components/campaign-details/CreatorCampaignDetails.tsx` | Wrap each section in `CollapsibleBriefSection` |
| `src/components/campaign-details/sections/CampaignOverviewSection.tsx` | Remove `<h3>` heading (moved to collapsible trigger) |
| `src/components/campaign-details/sections/ContentRequirementsSection.tsx` | Remove `<h3>` heading |
| `src/components/campaign-details/sections/CompensationSection.tsx` | Remove `<h3>` heading |
| `src/components/campaign-details/sections/LogisticsSection.tsx` | Remove `<h3>` heading |

## Risk Mitigations

- **CreatorCampaignDetails is reused** in CampaignDetailsPage (pre-apply view from Marketplace) and the Brief tab of MyCampaignDetailPage. The collapsible behavior applies everywhere — this is intentional since the brief is long in all contexts.
- **No database changes.** Purely CSS and component composition.
- **Business side untouched.** CompensationSection accepts a `role` prop for business vs creator rendering — the collapsible wrapper doesn't affect this.
- **Radix Collapsible already installed** and wrapped in shadcn at `src/components/ui/collapsible.tsx`.
