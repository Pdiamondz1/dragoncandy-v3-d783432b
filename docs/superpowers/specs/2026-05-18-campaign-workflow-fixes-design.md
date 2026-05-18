# Campaign Workflow Fixes — Design Spec

> 6 bugs in the campaign detail and dashboard views affecting both Creator and Restaurant roles.

## Context

After the campaign negotiation and assignment flow completes, several display and interaction bugs surface across the Creator and Restaurant views. These range from stale budget labels to missing action buttons, all blocking the smooth post-agreement workflow that DragonDash campaigns depend on.

## Issues and Fixes

### 1. Agreed Value Replacing Proposed Budget

**Problem**: After negotiation completes and value is agreed at $800, the campaign brief still shows the original range ("$800–$1,800") in the metrics bar and "Proposed Budget: $1,800" in the Compensation section. The header stat correctly shows "$800" because it uses `campaign.fixed_price ?? campaign.budget_min`.

**Root cause**: No component consults the accepted application's `proposed_rate` or counter-offer chain. They all read directly from `campaign.budget_min` / `budget_max`.

**Fix**: Create `src/hooks/useAgreedValue.ts` that resolves the agreed value through a fallback chain:

1. Last accepted `application_counter_offers.proposed_rate`
2. Accepted `campaign_applications.proposed_rate`
3. `campaign.fixed_price`
4. `campaign.budget_min`

Thread the result through:
- `MyCampaignDetailPage.tsx` — `buildStats()` uses agreed value for "Value" / "Earned" stats
- `CompensationSection.tsx` — label changes from "Proposed Budget" to "Agreed Value", amount shows agreed value
- `CampaignMetricsBar.tsx` — replaces range with single agreed amount
- `CreatorCampaignDetails.tsx` — passes agreed value to metrics bar and compensation section
- `ActivePhaseView.tsx` — calls the hook, passes to creator details
- `CollapsibleCampaignDetails.tsx` — passes agreed value to compensation section (business view)
- `CampaignDetailsPage.tsx` — calls the hook for business view

**Files**: NEW `src/hooks/useAgreedValue.ts`; MODIFY 7 components

### 2. Zero Deliverables Shown

**Problem**: The metrics bar shows "0 deliverables" and the Content Requirements section is empty, despite campaign having content specs in `ai_analysis.deliverables`.

**Root cause**: `campaign_deliverables` table returns `[]` (empty array). Code uses `??` (nullish coalescing) which doesn't catch `0` — only `null`/`undefined`. So `[].length ?? 1` evaluates to `0`, not `1`.

**Fix**: 
- Switch from `??` to `||` in deliverable count calculations so `0` falls through to next fallback
- Add 3-tier fallback in display: structured deliverables → `ai_analysis.deliverables` → `campaign.deliverables` string array
- Floor of 1 in all count displays

**Files**: `CreatorCampaignDetails.tsx`, `CompensationSection.tsx`, `ContentRequirementsSection.tsx`

### 3. Remove Target Creator Count

**Problem**: Campaign shows "TARGET CREATOR COUNT: 2" but DragonCandy always assigns exactly 1 creator per campaign.

**Fix**: Delete the Target Creator Count block (lines 78-86) from `LogisticsSection.tsx`. Clean up unused `Users` import.

**Files**: `LogisticsSection.tsx`

### 4. Wide Button Pills + Stepper Gap

**Problem**: "Upload Result", "Submit for Review", and "Open Messages" buttons are all full-width when they shouldn't be. Gap between "Brief" and "Started" steps in the progress stepper.

**Fix**:
- "Submit for Review" keeps `w-full` (primary CTA per design system)
- "Upload Result" fallback button: wrap in `flex justify-center`
- "Open Messages" button: remove `w-full`, wrap in `flex justify-center`
- Stepper connecting lines: change `flex-[0.5]` to `flex-1` so they stretch evenly between circles

**Files**: `ActivePhaseView.tsx`, `ProjectStepper.tsx`

### 5. Dashboard Shows "Unassigned" Incorrectly

**Problem**: Business dashboard shows campaign as "Unassigned" even though a creator was assigned via accepted application + collaboration.

**Root cause (backend)**: The Stripe webhook sets `status: 'published'` when processing escrow payment, never transitioning to `'active'` even when a collaboration exists.

**Root cause (frontend)**: `useBusinessActiveCampaigns.ts` only queries `campaign_collaborations` with `status='active'` — no fallback to accepted applications.

**Fix**:
1. **Stripe webhook** (`stripe-webhook/index.ts`): After setting `escrow_status: 'held'`, check for active collaborations and transition campaign to `'active'`. Stop overwriting status to `'published'` unconditionally.
2. **Dashboard hook** (`useBusinessActiveCampaigns.ts`): After collaboration query, for campaigns still without a creator name, fallback query `campaign_applications` with `status='accepted'` to get creator info.

**Files**: `stripe-webhook/index.ts`, `useBusinessActiveCampaigns.ts`

### 6. Restaurant Can't View/Proceed with Uploaded Content

**Problem**: When creator uploads content but hasn't submitted, restaurant sees "Files uploaded but not yet submitted for review" with no file gallery and no action buttons.

**Root cause**: `ContentReviewSection.tsx` line 341 — the `!isSubmitted && !isApproved && hasFiles` branch only renders a `<p>` tag. The file gallery at line 233 should render (it's conditional on `hasFiles`), but the action buttons are gated behind `isSubmitted`.

**Fix**: Replace the text-only block with:
- Info banner: "Files uploaded but not yet formally submitted. You can preview above and provide early feedback."
- "Approve & Pay" button with extra confirmation ("Content not yet formally submitted — are you sure?")
- "Request Revision" button
- "Message Creator" button (navigates to messages)
- Extract action buttons into shared render function to avoid duplicating the AlertDialog code across submitted and pre-submitted states

**Files**: `ContentReviewSection.tsx`

## Implementation Order

1. **Issue 3** — trivial deletion, no dependencies
2. **Issue 4** — CSS-only, no dependencies  
3. **Issue 2** — isolated data fallback
4. **Issue 1** — new hook + threading through components
5. **Issue 5** — backend webhook fix + frontend dashboard query
6. **Issue 6** — ContentReviewSection refactor

## Verification Plan

After each fix, run `npm run build` to verify no TypeScript errors.

After all fixes deployed:
- **Issue 1**: Log in as Creator, navigate to active campaign → header and compensation section both show agreed value, not range
- **Issue 2**: Navigate to campaign with AI-generated deliverables → metrics bar shows ≥1 deliverable, Content Requirements section populated
- **Issue 3**: Open campaign logistics section → no "Target Creator Count" displayed
- **Issue 4**: Creator active campaign → "Submit for Review" is full-width, "Upload Result" and "Open Messages" are auto-width centered. Stepper has even spacing.
- **Issue 5**: Restaurant dashboard → active campaign shows creator name, not "Unassigned"
- **Issue 6**: Restaurant campaign detail with uploaded (not submitted) content → file gallery visible, Approve/Revision/Message buttons available
