# Creator Unified Campaign Experience — Design Spec

**Date:** 2026-05-11
**Status:** Approved
**Scope:** Creator-side frontend only (no database changes, no business-side changes)

## Problem

Creators must navigate 3–4 separate pages to get the full picture of a single campaign:

1. **My Applications** (`/creator/applications`) — application status, no campaign brief
2. **My Projects** (`/creator/projects`) — earnings + project cards, only title/price
3. **Project Details** (`/projects/:id`) — stepper, upload, deliverables, messages — but no campaign brief
4. **Campaign Details** (`/creator/campaigns/:id`) — full brief, but designed as pre-apply view and disconnected from the project workflow

The Campaign Marketplace also has Applied/Active/Done tabs that duplicate data from My Applications and My Projects.

After being hired, the creator loses access to the full campaign brief (goals, style, references, content requirements) — the exact information they need while producing content.

## Solution

Replace the scattered pages with two new pages:

- **My Campaigns** — a single list page with status-based tabs (Applied, Active, Done)
- **My Campaign Detail** — a phase-dependent detail view that adapts to the campaign lifecycle

Strip the Campaign Marketplace down to discovery only (no more Applied/Active/Done tabs).

## Design Decisions

### Phase-dependent detail view

The detail page renders differently based on the creator's relationship to the campaign:

| Phase | Primary View | Tabs | Data Source |
|-------|-------------|------|-------------|
| Applied (pending/counter-offered) | Campaign brief with application status card pinned at top | None | `useCreatorApplications()` + `useCampaign()` |
| Active (hired, in-progress) | Project workspace (stepper, deliverables, upload, messages) | Project \| Brief | `useCreatorCollaborations('active')` + `useCampaign()` |
| Completed | Summary (delivered items, payment breakdown) | Summary \| Brief | `useCreatorCollaborations('completed')` + `useCampaign()` |

The Brief tab reuses the existing `CreatorCampaignDetails` component unchanged. This is the core fix: the campaign brief is always one tap away at every lifecycle stage.

### Navigation consolidation

**Sidebar changes:**
- Remove "My Applications" link
- Remove "My Projects" link
- Add "My Campaigns" link (position: after Browse Campaigns)

**Mobile bottom nav:** No changes. It never had direct links to Applications or Projects.

**Campaign Marketplace:**
- Remove Applied, Active, Done tabs
- Keep Available tab (renamed to "All Campaigns")
- Add "Donny Picks" tab for AI-matched recommendations
- After applying: confirmation modal offers "View in My Campaigns" or "Keep Browsing"

### My Campaigns list page

Route: `/dashboard/creator/my-campaigns`

Layout:
- Page header with back button and "MY CAMPAIGNS" title with total count badge
- Earnings summary strip (migrated from My Projects): Earned / In Escrow / Available
- Three tabs: Applied (count) | Active (count) | Done (count)
- Tab content controlled by `?tab=` query param (default: active if any exist, otherwise applied)

Card design (compact, scannable):
- Campaign name, business name + location
- Status badge (Pending, Counter Offer, Active, Expedited, Completed)
- Status-colored left border: yellow = pending, orange = counter offer, teal = active, green = completed
- Price and time context (e.g., "Applied 2d ago", "Due in 2 days")
- Smart CTA that matches next action: "View →" (pending), "Respond →" (counter offer), "Upload →" (active), "Review →" (completed)

Active tab cards additionally show:
- Delivery tier badge (Express, Expedited, Standard)
- Deliverables progress bar (done/total)
- Deadline urgency (color-coded: red if ≤2 days, yellow if ≤5 days)

Data sources (all existing hooks, no new fetching):
- Applied tab: `useCreatorApplications()`
- Active tab: `useCreatorCollaborations('active')`
- Done tab: `useCreatorCollaborations('completed')`
- Earnings: `useCreatorEarnings()`

### My Campaign Detail page

Route: `/dashboard/creator/my-campaigns/:id`

The `:id` parameter is the campaign ID. The page fetches both application and collaboration data for this campaign, then renders the appropriate phase.

**Applied state:**
- Header: campaign title, status badges, delivery tier
- Application status card (pinned): proposed rate, applied date, timeline, waiting message
- Full campaign brief below (scrollable): goals, content type, style & tone, references gallery, compensation, deadline
- If counter-offered: card shows original vs counter amount with "Respond →" CTA

**Active state:**
- Header: campaign title, status badges, key stats row (value, deadline, days remaining)
- Two tabs: PROJECT | BRIEF
- Project tab contains:
  - Progress stepper (Brief → Started → Upload → Submit → Paid)
  - Deliverables list with per-item status (Not Started / In Progress / Submitted / Revision Requested / Approved)
  - "Upload Work" primary CTA button
  - "Open Messages" secondary CTA button
- Brief tab: `CreatorCampaignDetails` component (existing, reused as-is)

**Completed state:**
- Header: campaign title, completed badge, stats row (earned, completed date, rating)
- Green gradient header background
- Two tabs: SUMMARY | BRIEF
- Summary tab contains:
  - Delivered items list with approval status
  - Payment breakdown (campaign fee, platform fee, net earnings)
  - Review section (if not yet reviewed)
- Brief tab: `CreatorCampaignDetails` component (existing, reused as-is)

### Dashboard links update

The Creator Dashboard's existing widgets get updated navigation targets:
- Recent Activity items → `/dashboard/creator/my-campaigns/:id`
- Upcoming Deadlines items → `/dashboard/creator/my-campaigns/:id`
- Stats card "Applied" count → `/dashboard/creator/my-campaigns?tab=applied`
- Quick Action "Browse Campaigns" → stays `/dashboard/creator/campaigns`

## File Changes

### New files
| File | Purpose |
|------|---------|
| `src/pages/MyCampaignsPage.tsx` | Unified list page with Applied/Active/Done tabs |
| `src/pages/MyCampaignDetailPage.tsx` | Phase-dependent detail view |

### Deleted files
| File | Replaced by |
|------|------------|
| `src/pages/CreatorApplications.tsx` | MyCampaignsPage (Applied tab) |
| `src/pages/CreatorProjects.tsx` | MyCampaignsPage (Active/Done tabs) |
| `src/pages/ProjectDetailsPage.tsx` | MyCampaignDetailPage |

### Modified files
| File | Change |
|------|--------|
| `src/App.tsx` | Add new routes, add redirects for old routes |
| `src/lib/navConfig.ts` | Replace 2 sidebar items with 1 "My Campaigns" item |
| `src/pages/CreatorCampaignMarketplace.tsx` | Remove Applied/Active/Done tabs, rename Available to "All Campaigns", add "Donny Picks" tab |
| `src/pages/CreatorDashboard.tsx` | Update navigation targets for activity/deadline links |

### Reused components (no changes needed)
| Component | Used in |
|-----------|---------|
| `CreatorCampaignDetails` | Brief tab of MyCampaignDetailPage |
| `EarningsSummary` | Top of MyCampaignsPage |
| Progress stepper | Project tab of MyCampaignDetailPage (active state) |
| Deliverable cards | Project tab of MyCampaignDetailPage (active state) |
| File upload components | Project tab of MyCampaignDetailPage (active state) |

### Reused hooks (no changes needed)
| Hook | Used by |
|------|---------|
| `useCreatorApplications()` | MyCampaignsPage (Applied tab), MyCampaignDetailPage (phase detection) |
| `useCreatorCollaborations()` | MyCampaignsPage (Active/Done tabs), MyCampaignDetailPage (phase detection) |
| `useCreatorEarnings()` | MyCampaignsPage (earnings summary) |
| `useCampaign()` | MyCampaignDetailPage (brief data) |
| `useCampaignDetailEnriched()` | MyCampaignDetailPage (Brief tab enriched data) |

## Route Architecture

```
NEW ROUTES:
/dashboard/creator/my-campaigns              → MyCampaignsPage
/dashboard/creator/my-campaigns/:id          → MyCampaignDetailPage

REDIRECTS (old → new):
/dashboard/creator/applications              → /dashboard/creator/my-campaigns?tab=applied
/dashboard/creator/projects                  → /dashboard/creator/my-campaigns?tab=active
/projects/:id                                → /dashboard/creator/my-campaigns/:campaignId
```

The `/projects/:id` redirect requires mapping collaboration ID to campaign ID. This can be done with a lightweight lookup component that fetches the collaboration, extracts the campaign_id, and redirects.

## Risk Mitigations

- **Old URLs don't break:** React Router redirect components handle all legacy routes with correct tab/campaign context.
- **Business side untouched:** All changes scoped to creator routes, components, and nav config. Business dashboard, business campaign views, and the business branch of CampaignDetailsPage are not affected.
- **No database changes:** Purely frontend restructuring. No schema changes, no new tables, no RLS modifications.
- **Existing components reused:** CreatorCampaignDetails, stepper, deliverable cards, file upload, EarningsSummary are composed into new pages, not rebuilt.
- **Existing hooks reused:** All data fetching uses existing React Query hooks. No new Supabase queries needed.
- **CampaignDetailsPage preserved:** Still used for pre-apply campaign viewing from the Marketplace. Its business-side view is also untouched.

## What This Deletes, Simplifies, Accelerates, and Automates

**Deletes:** 3 redundant pages, 2 sidebar nav items, 3 marketplace tabs, the "where do I find my campaign?" confusion.

**Simplifies:** 1 page for all post-apply campaigns, 1 detail view that adapts to lifecycle, campaign brief always 1 tap away, marketplace = discovery only.

**Accelerates:** 0 page-hops to see campaign status, 0 page-hops to reference brief while working, smart CTAs surface next action without hunting.

**Automates:** Phase detection (correct view rendered automatically based on application/collaboration status), smart CTA per card (next action surfaced without creator choosing), old URL redirects (no broken bookmarks or links).
