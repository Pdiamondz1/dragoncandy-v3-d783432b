# Unified Campaign Detail — Design Spec

**Date:** 2026-05-11
**Status:** Approved
**Problem:** Restaurant/Brand users navigate 4 separate pages (My Campaigns, Campaign Details, My Projects, Project Status) to manage a single campaign. This fragments the experience and makes it hard to answer "where is this campaign at" and "do I need to act."

## Decision

Consolidate to 2 pages: Campaign List + Unified Campaign Detail. Kill My Projects and Project Status as separate destinations. The campaign detail page becomes a single scrollable view with phase-dependent content sections. Campaign details are always accessible.

## Design Principles

- One campaign = one place. No data model leakage (campaign vs project) into the UX.
- "Where is it" and "do I need to act" are answerable from the list page without drilling in.
- Phase-dependent content: show what's relevant to the current lifecycle stage, not everything at once.
- Campaign details always accessible — the brief never disappears, it just moves down the page when other content is more urgent.
- Mobile-first scrollable layout. No tabs hiding content behind clicks.

## Campaign List Cards

Current cards show campaign metadata but no workflow status, no assigned creator, and split actions across "View Details" and "Project Status" buttons going to different pages.

### Proposed Card Structure

```
┌──────────────────────────────────────┐
│ Launch Hype Video            [Active]│
│ $300–$600 · Due May 4 · Instagram    │
│                                      │
│ ████████░░░░░░░  (progress bar)      │
│ Step 3 of 5 · Review & approve       │
│                                      │
│ ──────────────────────────────────── │
│ (avatar) Ricky Ricardo · assigned    │
│                                      │
│ [ ====== Review Content → ======== ] │
└──────────────────────────────────────┘
```

### Card Elements

- **Title + status badge** (top-right): campaign name and lifecycle status (Draft, Published, Active, Completed, Cancelled)
- **Key stats line:** budget range, deadline, platform(s) — one line, no vertical list
- **Mini progress bar:** 5 segments corresponding to workflow steps, color-coded (teal = done, yellow = current, gray = pending)
- **Step label:** "Step N of 5 · [current step name]" or phase-appropriate text ("Awaiting creator · 3 applications", "✓ All steps complete")
- **Creator row** (when assigned): avatar + name + status. Hidden pre-hire.
- **Single CTA button:** reflects the next action. Routes to the unified detail page.
  - Escrow pending: "Pay & Publish →" (amber) — highest priority, blocks all other progress
  - Pre-hire with applications: "Review Applications →" (teal)
  - Pre-hire no applications: "View Campaign" (outline)
  - Active delivery needing action: "Review Content →" (pink)
  - Active delivery waiting: "View Progress" (teal)
  - Completed: "View Deliverables" (outline)
  - Cancelled: "View Campaign" (outline)

### Data Requirements

Cards need data from both `campaigns` and `campaign_collaborations` tables to show workflow status and creator info. The existing `useCampaignsList` hook (`src/hooks/useCampaignQueries.ts::useCampaignsList`) fetches only from `campaigns`. It needs to be enriched with a left join to `campaign_collaborations` (status, content_status, creator_id) and `creator_profiles` (creator_name, avatar_url). The campaign's `escrow_status` field is already available and drives the Pay & Publish CTA.

## Unified Campaign Detail Page

Single scrollable page replacing the old 4-tab Campaign Details, My Projects, and Project Status pages. The page renders a campaign header (always visible) followed by phase-dependent content sections.

### Page Layout

```
┌──────────────────────────────────────┐
│ [Campaign Header - always visible]   │
│ Title, status, budget, deadline,     │
│ platform, action badge               │
├──────────────────────────────────────┤
│ [Progress Timeline - always visible] │
│ 5-step workflow with current state   │
├──────────────────────────────────────┤
│ [Phase-Dependent Sections]           │
│ Content changes based on lifecycle   │
├──────────────────────────────────────┤
│ [Campaign Details - always visible]  │
│ Brief, requirements, logistics       │
│ Expanded pre-hire, collapsible after │
└──────────────────────────────────────┘
```

### Phase Definitions

A campaign's phase is derived from existing data:

| Phase | Condition |
|-------|-----------|
| Pre-Hire | No `campaign_collaboration` exists, or campaign status is `draft`/`published` |
| Active Delivery | `campaign_collaboration` exists with `status = 'active'` |
| Completed | `campaign_collaboration` exists with `status = 'completed'` |
| Cancelled | Campaign status is `cancelled` |

**Assumption:** Each campaign has at most one active collaboration (1:1 campaign-to-creator). The data model allows multiple collaborations, but the product currently operates as one creator per campaign. If a campaign somehow has multiple collaborations, use the most recently updated one to determine phase.

### Section Map by Phase

| Section | Pre-Hire | Active Delivery | Completed | Cancelled |
|---------|----------|-----------------|-----------|-----------|
| Campaign Header | ✅ | ✅ | ✅ | ✅ |
| Escrow Payment Alert | ✅ (if pending) | — | — | — |
| Progress Timeline | ✅ | ✅ | ✅ | — |
| Applications List | ✅ | — | — | — |
| Donny's Suggestions (AI Matching) | ✅ | — | — | — |
| Assigned Creator Card | — | ✅ | ✅ | — |
| Content Review | — | ✅ | — | — |
| Deliverables Archive | — | — | ✅ | — |
| Payment Summary | — | — | ✅ | — |
| Campaign Details | ✅ (expanded) | ✅ (collapsible) | ✅ (collapsed) | ✅ (expanded, read-only) |

### Campaign Header

Always visible at the top. Pink background consistent with existing design system.

- Campaign title (bold, large)
- Status badge (top-right): Draft, Published, Active, Completed, Cancelled
- Escrow status badge (next to status): "Escrow Held", "Paid Out", "Payment Pending" — shown when relevant
- Stats line: budget range, deadline, platform(s)
- Action badge (conditional): "⚡ Action Needed" in pink when the current workflow step requires Restaurant user input (content review, mark complete, leave review). Only shown during Active Delivery phase.
- Edit button (pre-hire only): navigates to `/dashboard/business/campaigns/:id/edit`
- Overflow menu (⋯): contains secondary actions based on phase:
  - Pre-hire: "Delete Campaign" (only if no accepted applications and no held escrow)
  - Completed: "Re-Launch Campaign" (duplicates the campaign via existing `useDuplicateCampaign` hook)

### Escrow Payment Alert (Pre-Hire, when `escrow_status = 'pending'`)

Renders above the Progress Timeline when the campaign needs escrow payment before publishing. Shows a prominent amber alert with "Payment Required to Publish" and a Stripe checkout button. Absorbs the existing payment flow from `CampaignCard.tsx` (lines 90-188).

After successful Stripe checkout, the redirect lands on the campaign detail page with `?payment=success` query parameter. The detail page handles this parameter to show a success toast and refresh campaign data. This absorbs the payment verification logic currently in `BusinessProjects.tsx` (lines 82-140).

### Progress Timeline

Always visible. Two presentation modes:

**Compact (list cards):** 5-segment horizontal bar with step label text below.

**Full (detail page):** Vertical stepper showing all 5 steps with status icons:
1. Creator hired & escrow held
2. Content submitted by creator
3. Review & approve content
4. Release payment
5. Leave review

Step status icons: ✅ (completed), 🟡 (current/action needed), ○ (pending)

The current step is derived from `campaign_collaboration` fields using the `deriveCurrentStep` function exported from `src/hooks/useCampaignProject.ts`.

### Applications List (Pre-Hire only)

Renders when no collaboration exists and campaign has applications. Shows a count badge and a list of applicant cards, each with:
- Creator avatar, name, rating, project count, specialty
- "View" button to expand application details

This replaces the `ApplicationsListFixed` component currently in the Apps tab. The component can be reused with minimal changes — it just renders in the scroll layout instead of a tab.

### Donny's Suggestions (Pre-Hire only)

AI creator matching section. Renders below applications when campaign is published and awaiting a creator. Reuses the existing `CreatorMatchingSection` component.

### Assigned Creator Card (Active + Completed)

Shows the hired creator's identity and quick actions:
- Avatar (circular, teal ring), name, project count
- Message button → navigates to campaign conversation
- View Portfolio button → navigates to creator portfolio

Data comes from the `creator_profiles` and `profiles` joins already present in `useCampaignProject`.

### Content Review (Active Delivery only)

The action center during active delivery. Shows when `content_status = 'submitted'` or content files exist.

- Content preview thumbnails (from `file_uploads`)
- Approve button → calls `release-creator-payout` edge function (existing logic from `QuickApprovalCard`)
- Request Revision button → increments `revision_count` on the collaboration (existing logic)
- Download All button → bulk download approved content

This absorbs functionality from both `CampaignContentGallery` (Content tab) and `QuickApprovalCard` (My Projects).

### Deliverables Archive (Completed only)

File gallery of all approved content from the campaign. Download All button for bulk export. Reuses file fetching logic from the existing Files tab in `BusinessProjects`.

### Payment Summary (Completed only)

Read-only summary: amount paid, date paid, payment method. Data from the collaboration record and Stripe payment records.

### Campaign Details (Always present)

The campaign brief — description, content requirements, compensation details, logistics. Uses the existing `CampaignDetailsOverview` component (which renders `CampaignOverviewSection`, `ContentRequirementsSection`, `CompensationSection`, `LogisticsSection`).

**Collapse behavior by phase:**
- Pre-Hire: expanded by default (the brief is front and center when you're attracting creators)
- Active Delivery: collapsible, starts collapsed (the workflow is the focus, but the brief is one tap away)
- Completed: collapsed by default (reference material)

## Route Migration

### Routes Kept
- `GET /dashboard/business/campaigns` — campaign list (with upgraded cards)
- `GET /dashboard/business/campaigns/:id` — unified detail page (redesigned)
- `GET /dashboard/business/campaigns/:id/edit` — campaign editor (unchanged)

### Routes Removed with Redirects
- `GET /dashboard/business/projects` → redirects to `/dashboard/business/campaigns`
- `GET /dashboard/business/campaigns/:id/project` → redirects to `/dashboard/business/campaigns/:id`

### Stripe Redirect URLs
The `create-campaign-escrow` edge function currently redirects to paths under `/dashboard/business/projects`. These must be updated to redirect to `/dashboard/business/campaigns/:id?payment=success` (or `?payment=cancelled`). The detail page must handle these query parameters (success toast, data refresh).

### Bottom Navigation
The "Campaigns" nav icon becomes the single entry point for all campaign management. No separate "Projects" destination.

### Code References to Update
All hardcoded references to removed routes must be updated:

| File | Reference | Change to |
|------|-----------|-----------|
| `src/lib/navConfig.ts` (sidebar) | `/dashboard/business/projects` | Remove entry |
| `src/lib/navConfig.ts` (drawer) | `/dashboard/business/projects` | Remove entry |
| `src/pages/CampaignMessagesPage.tsx` | `/dashboard/business/projects` | `/dashboard/business/campaigns` |
| `src/pages/CampaignProjectPage.tsx` | `/dashboard/business/projects` | File deleted |
| `src/pages/ProjectDetailsPage.tsx` | `/dashboard/business/projects` | `/dashboard/business/campaigns` |
| `src/App.tsx` (route definition + lazy import) | `/dashboard/business/projects`, `BusinessProjects` import, `CampaignProjectPage` route | Replace with `<Navigate>` redirects, remove old lazy imports |
| `src/hooks/useProjectComplete.ts` (notification `actionUrl`) | `/dashboard/business/projects` | `/dashboard/business/campaigns/:id` |
| `create-campaign-escrow` edge function | Payment redirect URLs | `/dashboard/business/campaigns/:id?payment=...` |

**Note:** `useProjectComplete.ts` generates notification URLs stored in the database. Existing notification records with old URLs will still work because of the route-level redirects, but new notifications should use the updated paths.

## Components Affected

### New or Substantially Rewritten
- `CampaignDetailsPage.tsx` — rewritten from 4-tab layout to phase-dependent scroll layout
- `CampaignCard.tsx` — rewritten to include progress bar, creator info, single CTA

### Relocated (reused with minor changes)
- `ApplicationsListFixed` — moves from tab to scroll section, no functional changes
- `CreatorMatchingSection` — moves from tab to scroll section, no functional changes
- `QuickApprovalCard` — approval actions move into Content Review section of detail page
- `CampaignContentGallery` — file display moves into Content Review / Deliverables sections
- `CampaignDetailsOverview` — moves to bottom of scroll, gains collapse behavior
- `RatingModal` — triggered from Progress section step 5 instead of separate page

### Deleted
- `BusinessProjects.tsx` (~700 lines) — all functionality absorbed into detail page
- `CampaignProjectPage.tsx` (~260 lines) — all functionality absorbed into detail page

### Hooks
- `useCampaignsList` (`src/hooks/useCampaignQueries.ts`) — needs enrichment: left join to `campaign_collaborations` and `creator_profiles` for card-level workflow data
- `useCampaignProject` — logic absorbed into the detail page's data fetching, hook may be retained or inlined
- `useProjectComplete` — still needed, called from the Progress section instead of My Projects
- `useCampaignContentSummary` — still needed for action badge on header
- `useFileUploads` — still needed, called from Content Review / Deliverables sections

## Data Flow

### List Page Query
```
campaigns
  LEFT JOIN campaign_collaborations ON campaigns.id = collaborations.campaign_id
  LEFT JOIN creator_profiles ON collaborations.creator_id = creator_profiles.id
  LEFT JOIN profiles ON collaborations.creator_id = profiles.id
WHERE campaigns.user_id = current_user
  AND campaigns.org_unit_id = active_org_unit (if applicable)
ORDER BY campaigns.updated_at DESC
```

Returns: campaign metadata + collaboration status/content_status + creator name/avatar. Enough to render the upgraded card without a second query.

### Detail Page Query
Same data as the list query for the single campaign, plus:
- `campaign_applications` (pre-hire phase)
- `file_uploads` (active + completed phases)
- `project_reviews` (completed phase)

This consolidates queries currently split across `useCampaignById`, `useCampaignProject`, `useCampaignContentSummary`, and `useFileUploads`.

## What This Deletes

- 2 pages (~960 lines of page components)
- 2 routes
- The mental model split between "Campaign" and "Project"
- 3 navigation hops to see full campaign state (list → details → projects → project status)
- The "View Details" / "Project Status" button confusion on campaign cards

## What This Simplifies

- One list page + one detail page = complete campaign management
- Phase-dependent content means the user only sees what matters right now
- Single CTA on cards tells the user exactly what to do next
- Progress bar on cards answers "where is it" without clicking

## What This Automates

- Phase detection is automatic based on collaboration state — no user action needed to switch views
- Action badges surface automatically when the Restaurant user needs to act
- Campaign details collapse/expand behavior is phase-aware by default
