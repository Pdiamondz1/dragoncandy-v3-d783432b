# Unified Campaign Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Restaurant/Brand campaign management from 4 pages (My Campaigns, Campaign Details, My Projects, Project Status) into 2 pages (Campaign List + Unified Campaign Detail) with phase-dependent content and upgraded list cards.

**Architecture:** The campaign detail page becomes a single scrollable view. A shared `deriveCampaignPhase` utility determines which sections render (Pre-Hire, Active Delivery, Completed, Cancelled). The campaigns list hook is enriched with collaboration/creator data so cards can show workflow progress without a separate query. Old pages (BusinessProjects, CampaignProjectPage) are deleted; their functionality is absorbed into the unified detail page.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase JS Client v2, React Query (TanStack Query), shadcn/ui components

**Spec:** `docs/superpowers/specs/2026-05-11-unified-campaign-detail-design.md`

---

## File Map

### New Files
- `src/lib/campaignPhase.ts` — Phase derivation utility + types
- `src/components/campaigns/CampaignProgressBar.tsx` — Reusable 5-segment progress bar
- `src/components/campaigns/detail/CampaignDetailHeader.tsx` — Campaign header with status/escrow badges + overflow menu
- `src/components/campaigns/detail/EscrowPaymentAlert.tsx` — Escrow payment alert + Stripe checkout
- `src/components/campaigns/detail/ProgressTimeline.tsx` — Full vertical stepper for detail page
- `src/components/campaigns/detail/AssignedCreatorCard.tsx` — Creator identity + Message/Portfolio buttons
- `src/components/campaigns/detail/ContentReviewSection.tsx` — Content approval/revision actions
- `src/components/campaigns/detail/DeliverablesArchive.tsx` — Completed campaign file gallery
- `src/components/campaigns/detail/PaymentSummary.tsx` — Read-only payment receipt
- `src/components/campaigns/detail/CollapsibleCampaignDetails.tsx` — Campaign brief with phase-aware collapse

### Modified Files
- `src/hooks/useCampaignQueries.ts` — Enrich `useCampaignsList` with collaboration + creator joins; update `Campaign` type
- `src/components/campaigns/CampaignCard.tsx` — Rewrite to show progress bar, creator, single CTA
- `src/pages/CampaignDetailsPage.tsx` — Rewrite from 4-tab layout to phase-dependent scroll
- `src/App.tsx` — Replace removed routes with `<Navigate>` redirects, remove lazy imports
- `src/lib/navConfig.ts` — Remove "Projects" sidebar/drawer entries
- `src/hooks/useProjectComplete.ts` — Update notification `actionUrl` paths
- `src/pages/CampaignMessagesPage.tsx` — Update hardcoded `/dashboard/business/projects` reference
- `src/pages/ProjectDetailsPage.tsx` — Update hardcoded `/dashboard/business/projects` reference
- `supabase/functions/create-campaign-escrow/index.ts` — Update Stripe checkout redirect URLs to campaign detail page

### Deleted Files
- `src/pages/BusinessProjects.tsx` (~700 lines)
- `src/pages/CampaignProjectPage.tsx` (~260 lines)

---

## Task 1: Campaign Phase Utilities

**Files:**
- Create: `src/lib/campaignPhase.ts`

This is the foundation — both the card and detail page depend on these types and functions.

- [ ] **Step 1: Create the phase utility file**

```typescript
// src/lib/campaignPhase.ts

export type CampaignPhase = 'pre_hire' | 'active_delivery' | 'completed' | 'cancelled';

export type ProjectStep = 'hired' | 'submitted' | 'review' | 'payment' | 'review_left';

export const PROJECT_STEPS: { key: ProjectStep; label: string }[] = [
  { key: 'hired', label: 'Creator hired & escrow held' },
  { key: 'submitted', label: 'Content submitted by creator' },
  { key: 'review', label: 'Review & approve content' },
  { key: 'payment', label: 'Release payment' },
  { key: 'review_left', label: 'Leave review' },
];

export function deriveCampaignPhase(
  campaignStatus: string,
  collaboration?: { status: string } | null
): CampaignPhase {
  if (campaignStatus === 'cancelled') return 'cancelled';
  if (!collaboration) return 'pre_hire';
  if (collaboration.status === 'completed') return 'completed';
  if (collaboration.status === 'active') return 'active_delivery';
  return 'pre_hire';
}

export function deriveCurrentStep(collaboration: {
  status: string;
  content_status?: string | null;
  business_completion_status?: string | null;
  creator_completion_status?: string | null;
}): ProjectStep {
  if (collaboration.status === 'completed') return 'review_left';
  if (
    collaboration.business_completion_status === 'requested' ||
    collaboration.creator_completion_status === 'requested'
  ) return 'payment';
  if (collaboration.content_status === 'submitted') return 'review';
  if (collaboration.content_status === 'approved') return 'payment';
  return collaboration.content_status ? 'review' : 'hired';
}

export function getStepIndex(step: ProjectStep): number {
  return PROJECT_STEPS.findIndex(s => s.key === step);
}

export function needsBusinessAction(step: ProjectStep): boolean {
  return step === 'review' || step === 'payment' || step === 'review_left';
}
```

- [ ] **Step 2: Update useCampaignProject.ts to re-export from campaignPhase**

The existing `deriveCurrentStep` in `src/hooks/useCampaignProject.ts` (line 40) takes a `CampaignProject` wrapper object and accesses `project.collaboration`. Replace it with a thin wrapper that delegates to the new canonical utility:

```typescript
// In src/hooks/useCampaignProject.ts, replace the old deriveCurrentStep (lines 38-50) with:
import { deriveCurrentStep as deriveStep, type ProjectStep } from '@/lib/campaignPhase';
export type { ProjectStep };

export function deriveCurrentStep(project: CampaignProject): ProjectStep {
  return deriveStep(project.collaboration);
}
```

This preserves backward compatibility for any existing callers of the old signature while making `campaignPhase.ts` the single source of truth.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors — new file has no dependencies on modified files yet.

- [ ] **Step 4: Commit**

```bash
git add src/lib/campaignPhase.ts src/hooks/useCampaignProject.ts
git commit -m "feat: add campaign phase derivation utilities"
```

---

## Task 2: Enrich Campaigns List Hook

**Files:**
- Modify: `src/hooks/useCampaignQueries.ts` (lines 78-108 for `useCampaignsList`, lines 1-30 for `Campaign` type)

Add collaboration + creator data to the campaigns list query so cards can show workflow progress.

- [ ] **Step 1: Update the Campaign type to include optional collaboration data**

In `src/hooks/useCampaignQueries.ts`, find the exported `Campaign` type/interface. Add optional collaboration fields at the end:

```typescript
// Add these fields to the Campaign type:
collaboration_id?: string | null;
collaboration_status?: string | null;
collaboration_content_status?: string | null;
collaboration_business_completion_status?: string | null;
collaboration_creator_completion_status?: string | null;
collaboration_creator_id?: string | null;
creator_name?: string | null;
creator_avatar_url?: string | null;
```

- [ ] **Step 2: Update the useCampaignsList query to include collaboration + creator joins**

In `src/hooks/useCampaignQueries.ts`, modify the `useCampaignsList` function (lines 78-108). Replace the existing `.select(...)` with a query that joins `campaign_collaborations` and `creator_profiles`:

```typescript
// Replace the .select() call in useCampaignsList:
let query = supabase
  .from('campaigns')
  .select(`
    id, user_id, org_unit_id, title, description, goals, deliverables, platforms,
    budget_min, budget_max, deadline, status, style, tone, open_for_sponsorship,
    delivery_type, delivery_fee, pricing_type, fixed_price, escrow_status,
    escrow_payment_intent_id, ai_analysis, ai_preview_status, created_at, updated_at,
    campaign_collaborations (
      id, status, content_status, creator_id,
      business_completion_status, creator_completion_status
    )
  `)
```

After the query returns, post-process to flatten the collaboration data. The Supabase join returns `campaign_collaborations` as an array. Take the most recently updated one (or null if empty):

```typescript
// After the query returns data, map to flatten:
const enriched = (data ?? []).map((campaign: any) => {
  const collab = campaign.campaign_collaborations?.[0] ?? null;
  return {
    ...campaign,
    campaign_collaborations: undefined,
    collaboration_id: collab?.id ?? null,
    collaboration_status: collab?.status ?? null,
    collaboration_content_status: collab?.content_status ?? null,
    collaboration_business_completion_status: collab?.business_completion_status ?? null,
    collaboration_creator_completion_status: collab?.creator_completion_status ?? null,
    collaboration_creator_id: collab?.creator_id ?? null,
  };
});
return enriched;
```

**Note:** We fetch creator name/avatar in a second query to avoid complex nested joins. After the main query, for campaigns that have a `collaboration_creator_id`, batch-fetch creator profiles:

```typescript
const creatorIds = enriched
  .map((c: any) => c.collaboration_creator_id)
  .filter(Boolean);

if (creatorIds.length > 0) {
  const { data: creators } = await supabase
    .from('creator_profiles')
    .select('user_id, creator_name, avatar_url')
    .in('user_id', creatorIds);

  const creatorMap = new Map(
    (creators ?? []).map((c: any) => [c.user_id, c])
  );

  enriched.forEach((campaign: any) => {
    const creator = creatorMap.get(campaign.collaboration_creator_id);
    campaign.creator_name = creator?.creator_name ?? null;
    campaign.creator_avatar_url = creator?.avatar_url ?? null;
  });
}
```

**Important:** The existing `useCampaignsList` function calls `.map(hydrateCampaignFromAnalysis)` on the query result (around line 104). The enrichment code must be inserted *before* this call, not replace it. The final return should be:

```typescript
return enriched.map(hydrateCampaignFromAnalysis);
```

This preserves AI analysis hydration on all campaign cards.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors. Existing card usage of Campaign type should still work because new fields are optional.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignQueries.ts
git commit -m "feat: enrich campaigns list with collaboration and creator data"
```

---

## Task 3: Campaign Progress Bar Component

**Files:**
- Create: `src/components/campaigns/CampaignProgressBar.tsx`

Reusable 5-segment horizontal bar used on both list cards and detail page.

- [ ] **Step 1: Create the progress bar component**

```typescript
// src/components/campaigns/CampaignProgressBar.tsx
import { PROJECT_STEPS, type ProjectStep, getStepIndex } from '@/lib/campaignPhase';

interface CampaignProgressBarProps {
  currentStep: ProjectStep;
  className?: string;
}

export function CampaignProgressBar({ currentStep, className = '' }: CampaignProgressBarProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className={`flex gap-1 ${className}`}>
      {PROJECT_STEPS.map((step, i) => {
        let color = 'bg-gray-200';
        if (i < currentIndex) color = 'bg-teal-400';
        else if (i === currentIndex) color = 'bg-yellow-400';
        return (
          <div key={step.key} className={`flex-1 h-1 rounded-full ${color}`} />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignProgressBar.tsx
git commit -m "feat: add reusable campaign progress bar component"
```

---

## Task 4: Rewrite CampaignCard

**Files:**
- Modify: `src/components/campaigns/CampaignCard.tsx` (full rewrite, ~475 lines → ~200 lines)

Replace the current multi-button card with the new design: progress bar, creator row, single CTA.

- [ ] **Step 1: Read the current CampaignCard.tsx to confirm current state**

Read: `src/components/campaigns/CampaignCard.tsx`

Confirm the component signature (props interface). The new card must accept the same props from `CampaignsList.tsx` which passes individual `Campaign` objects.

- [ ] **Step 2: Rewrite CampaignCard with new design**

Replace the full contents of `src/components/campaigns/CampaignCard.tsx`. Key design elements:

- Import `deriveCampaignPhase`, `deriveCurrentStep`, `needsBusinessAction`, `PROJECT_STEPS`, `getStepIndex` from `@/lib/campaignPhase`
- Import `CampaignProgressBar` from `./CampaignProgressBar`
- The card should:
  1. Derive the phase from `campaign.status` and `campaign.collaboration_status`
  2. If phase is `active_delivery` or `completed`, derive the current step from collaboration fields
  3. Render: title + status badge, stats line, progress bar + step label, creator row (if assigned), single CTA button
- The escrow payment flow (Stripe checkout) stays on the card for the "Pay & Publish" CTA. Keep the existing `handlePayEscrow` logic but simplify — no need for the verify flow on the card, that moves to the detail page.
- The CTA button navigates to `/dashboard/business/campaigns/${campaign.id}` for all cases. The escrow pending case opens Stripe checkout directly.
- Status badge colors: Draft (gray), Published (yellow), Active (teal), Completed (green), Cancelled (red)
- CTA label logic:
  ```typescript
  function getCtaLabel(phase: CampaignPhase, step: ProjectStep | null, escrowStatus: string, applicationCount: number): string {
    if (escrowStatus === 'pending') return 'Pay & Publish →';
    if (phase === 'cancelled') return 'View Campaign';
    if (phase === 'completed') return 'View Deliverables';
    if (phase === 'active_delivery' && step && needsBusinessAction(step)) return 'Review Content →';
    if (phase === 'active_delivery') return 'View Progress';
    if (applicationCount > 0) return 'Review Applications →';
    return 'View Campaign';
  }
  ```
- CTA button style: teal for most cases, pink for "Review Content →" (action needed), amber for "Pay & Publish →", outline for "View Campaign" and "View Deliverables"

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors. The card now uses enriched fields from the Campaign type.

- [ ] **Step 4: Test in browser**

Run: `npm run dev`
Navigate to `/dashboard/business/campaigns`. Verify:
- Cards show progress bar with correct step highlighting
- Creator name/avatar appears on cards with active collaborations
- Single CTA button with correct label per campaign state
- Clicking CTA navigates to campaign detail page (or opens Stripe for escrow pending)

- [ ] **Step 5: Clean up CampaignsList.tsx**

`src/components/campaigns/CampaignsList.tsx` currently passes `onViewDetails` and `onEdit` callback props to CampaignCard. Since the new card handles navigation internally, remove these now-unused props from CampaignsList.tsx to avoid dead code.

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/CampaignCard.tsx src/components/campaigns/CampaignsList.tsx
git commit -m "feat: rewrite campaign card with progress bar and single CTA"
```

---

## Task 5: Campaign Detail Section Components

**Files:**
- Create: `src/components/campaigns/detail/CampaignDetailHeader.tsx`
- Create: `src/components/campaigns/detail/EscrowPaymentAlert.tsx`
- Create: `src/components/campaigns/detail/ProgressTimeline.tsx`
- Create: `src/components/campaigns/detail/AssignedCreatorCard.tsx`
- Create: `src/components/campaigns/detail/ContentReviewSection.tsx`
- Create: `src/components/campaigns/detail/DeliverablesArchive.tsx`
- Create: `src/components/campaigns/detail/PaymentSummary.tsx`
- Create: `src/components/campaigns/detail/CollapsibleCampaignDetails.tsx`

Build each section component the detail page will compose. Each is self-contained with its own data needs passed as props.

- [ ] **Step 1: Create CampaignDetailHeader**

```typescript
// src/components/campaigns/detail/CampaignDetailHeader.tsx
// Props: campaign (title, status, escrow_status, budget_min, budget_max, deadline, platforms)
//        phase (CampaignPhase), currentStep (ProjectStep | null), onDelete, onRelaunch, onEdit
// Renders: pink bg header with title, status badge, escrow badge, stats line,
//          action-needed badge (if needsBusinessAction), overflow menu (⋯)
// Overflow menu items:
//   Pre-hire + no escrow held + no accepted apps: "Delete Campaign" → calls onDelete
//   Completed: "Re-Launch Campaign" → calls onRelaunch
//   Pre-hire: "Edit Campaign" → calls onEdit
```

- [ ] **Step 2: Create EscrowPaymentAlert**

```typescript
// src/components/campaigns/detail/EscrowPaymentAlert.tsx
// Props: campaignId, escrowStatus, escrowPaymentIntentId
// Renders: amber alert with "Payment Required to Publish" + Stripe checkout button
// Logic: absorbs handlePayEscrow from old CampaignCard.tsx (lines 118-188)
//        and payment verification useEffect from BusinessProjects.tsx (lines 82-140)
// Handles ?payment=success and ?payment=cancelled query params via useSearchParams
```

- [ ] **Step 3: Create ProgressTimeline**

```typescript
// src/components/campaigns/detail/ProgressTimeline.tsx
// Props: currentStep (ProjectStep), phase (CampaignPhase), onLeaveReview (callback),
//        onMarkComplete (callback), campaignId (string)
// Renders: vertical stepper with 5 steps, status icons (✅ 🟡 ○)
// Uses PROJECT_STEPS from campaignPhase.ts
// Hidden when phase === 'cancelled'
// Step 5 ("Leave review"): when current, shows "Leave a Review →" button that calls onLeaveReview
// Step 4 ("Release payment"): when current, shows "Mark Complete →" button that calls onMarkComplete
```

- [ ] **Step 4: Create AssignedCreatorCard**

```typescript
// src/components/campaigns/detail/AssignedCreatorCard.tsx
// Props: creatorName, avatarUrl, projectCount, campaignId, creatorId
// Renders: avatar + name + project count, Message button, View Portfolio button
// Message button navigates to: /dashboard/business/messages/campaign/${campaignId}
// Portfolio button navigates to: /creator/${creatorId}
```

- [ ] **Step 5: Create ContentReviewSection**

```typescript
// src/components/campaigns/detail/ContentReviewSection.tsx
// Props: collaborationId, campaignId, creatorId, creatorName, contentStatus, revisionCount
// Renders: content thumbnails (from useFileUploads), Approve/Revise/Download buttons
// Absorbs logic from QuickApprovalCard.tsx (approval mutation, revision mutation)
// Only renders when contentStatus === 'submitted' or files exist
```

- [ ] **Step 6: Create DeliverablesArchive**

```typescript
// src/components/campaigns/detail/DeliverablesArchive.tsx
// Props: campaignId, collaborationId
// Renders: file gallery with thumbnails + Download All button
// Uses useFileUploads hook for data
```

- [ ] **Step 7: Create PaymentSummary**

```typescript
// src/components/campaigns/detail/PaymentSummary.tsx
// Props: completedAt, budgetMin, budgetMax
// Renders: read-only payment summary card (amount, date)
```

- [ ] **Step 8: Create CollapsibleCampaignDetails**

```typescript
// src/components/campaigns/detail/CollapsibleCampaignDetails.tsx
// Props: campaign (Campaign type), phase (CampaignPhase)
// Renders: CampaignDetailsOverview wrapped in a Collapsible (shadcn/ui)
// Collapse behavior: expanded for pre_hire, collapsed for active_delivery/completed, expanded+read-only for cancelled
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: No errors. Components are self-contained.

- [ ] **Step 10: Commit**

```bash
git add src/components/campaigns/detail/
git commit -m "feat: add campaign detail section components for unified view"
```

**Note on RatingModal:** The existing `RatingModal` component (used in both `BusinessProjects.tsx` and `CampaignProjectPage.tsx`) is triggered from the ProgressTimeline's "Leave review" step via the `onLeaveReview` callback. In Task 6 (CampaignDetailsPage rewrite), the detail page will manage the `showRatingModal` state and render `<RatingModal>` at the page level, passing the open/close handler to ProgressTimeline.

---

## Task 6: Rewrite CampaignDetailsPage

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx` (full rewrite for business view, preserve creator view)

Replace the 4-tab business view with the phase-dependent scroll layout. The creator view (lines 173-237) is unchanged.

- [ ] **Step 1: Read current CampaignDetailsPage.tsx to confirm state**

Read: `src/pages/CampaignDetailsPage.tsx`

Confirm the creator view rendering logic and data fetching hooks that must be preserved.

- [ ] **Step 2: Rewrite the business view section**

Keep all existing imports and data fetching. Add new imports for the detail section components and phase utilities. Replace the tab-based business rendering (lines 241-310) with:

```tsx
// Business view — phase-dependent scroll layout
const phase = deriveCampaignPhase(
  campaign.status,
  collaborationData // from useCampaignProject or enriched detail
);
const currentStep = collaborationData
  ? deriveCurrentStep(collaborationData)
  : null;

return (
  <DashboardLayout userRole="business_client">
    <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
      <CampaignDetailHeader
        campaign={campaign}
        phase={phase}
        currentStep={currentStep}
        onDelete={handleDelete}
        onRelaunch={handleRelaunch}
        onEdit={() => navigate(`/dashboard/business/campaigns/${id}/edit`)}
      />

      {phase === 'pre_hire' && campaign.escrow_status === 'pending' && (
        <EscrowPaymentAlert
          campaignId={campaign.id}
          escrowStatus={campaign.escrow_status}
          escrowPaymentIntentId={campaign.escrow_payment_intent_id}
        />
      )}

      {phase !== 'cancelled' && (
        <ProgressTimeline currentStep={currentStep} phase={phase} />
      )}

      {phase === 'pre_hire' && (
        <>
          <ApplicationsListFixed campaignId={campaign.id} />
          <CreatorMatchingSection campaignId={campaign.id} />
        </>
      )}

      {(phase === 'active_delivery' || phase === 'completed') && creatorData && (
        <AssignedCreatorCard
          creatorName={creatorData.creator_name}
          avatarUrl={creatorData.avatar_url}
          projectCount={creatorData.project_count}
          campaignId={campaign.id}
          creatorId={creatorData.id}
        />
      )}

      {phase === 'active_delivery' && collaborationData && (
        <ContentReviewSection
          collaborationId={collaborationData.id}
          campaignId={campaign.id}
          creatorId={collaborationData.creator_id}
          creatorName={creatorData?.creator_name ?? 'Creator'}
          contentStatus={collaborationData.content_status}
          revisionCount={collaborationData.revision_count}
        />
      )}

      {phase === 'completed' && (
        <>
          <DeliverablesArchive
            campaignId={campaign.id}
            collaborationId={collaborationData?.id}
          />
          <PaymentSummary
            completedAt={collaborationData?.completed_at}
            budgetMin={campaign.budget_min}
            budgetMax={campaign.budget_max}
          />
        </>
      )}

      <CollapsibleCampaignDetails campaign={campaign} phase={phase} />
    </div>
  </DashboardLayout>
);
```

- [ ] **Step 3: Add data fetching for collaboration data**

The detail page needs collaboration + creator data. Add a query using `useCampaignProject` (from `src/hooks/useCampaignProject.ts`) which already fetches this data. The hook takes a campaign ID and returns the collaboration, creator profile, and project metadata.

If the campaign has no collaboration (pre-hire), the hook returns null — handle this gracefully.

Also add the `useDuplicateCampaign` hook for the Re-Launch action and the delete mutation for the overflow menu.

- [ ] **Step 4: Add payment verification handler**

Add the `useEffect` for handling `?payment=success` / `?payment=cancelled` query parameters. This logic is absorbed from `BusinessProjects.tsx` (lines 82-140):

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const paymentStatus = searchParams.get('payment');

useEffect(() => {
  if (!paymentStatus || !id) return;
  if (paymentStatus === 'success') {
    supabase.functions.invoke('verify-campaign-escrow', {
      body: { campaignId: id },
    }).then(({ data, error }) => {
      if (!error && data?.success) {
        toast({ title: 'Payment Confirmed!', description: 'Your campaign is now published.' });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      }
    });
  } else if (paymentStatus === 'cancelled') {
    toast({ title: 'Payment Cancelled', description: 'Your campaign was saved as a draft.' });
  }
  setSearchParams({}, { replace: true });
}, [paymentStatus, id]);
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 6: Test in browser**

Run: `npm run dev`
Navigate to a campaign detail page for each phase:
- Pre-hire campaign (draft or published): verify applications list, Donny suggestions, expanded campaign details
- Active delivery campaign: verify progress timeline, creator card, content review section, collapsed campaign details
- Completed campaign: verify deliverables archive, payment summary, collapsed campaign details
- Test overflow menu actions (delete, re-launch, edit)

- [ ] **Step 7: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: rewrite campaign detail page with phase-dependent scroll layout"
```

---

## Task 7: Route Migration & Reference Cleanup

**Files:**
- Modify: `src/App.tsx` (lines 54, 188-189)
- Modify: `src/lib/navConfig.ts` (lines 54, 183)
- Modify: `src/hooks/useProjectComplete.ts` (lines 125, 141, 164, 177)
- Modify: `src/pages/CampaignMessagesPage.tsx` (line 26)
- Modify: `src/pages/ProjectDetailsPage.tsx` (line 125)
- Delete: `src/pages/BusinessProjects.tsx`
- Delete: `src/pages/CampaignProjectPage.tsx`

- [ ] **Step 1: Update App.tsx routes**

In `src/App.tsx`:
- Remove the lazy import for `BusinessProjects` (around line 54)
- Remove the lazy import for `CampaignProjectPage`
- Add: `import { Navigate } from 'react-router-dom';` (if not already imported)
- Replace route at line 188:
  ```tsx
  // Old:
  <Route path="/dashboard/business/projects" element={<ProtectedRoute><BusinessRoute><BusinessProjects /></BusinessRoute></ProtectedRoute>} />
  // New:
  <Route path="/dashboard/business/projects" element={<Navigate to="/dashboard/business/campaigns" replace />} />
  ```
- Replace route at line 189:
  ```tsx
  // Old:
  <Route path="/dashboard/business/campaigns/:id/project" element={<ProtectedRoute><BusinessRoute><CampaignProjectPage /></BusinessRoute></ProtectedRoute>} />
  // New:
  <Route path="/dashboard/business/campaigns/:id/project" element={<Navigate to="/dashboard/business/campaigns/:id" replace />} />
  ```

**Note:** The `:id` redirect needs a wrapper component to read the param:
```tsx
function ProjectRedirect() {
  const { id } = useParams();
  return <Navigate to={`/dashboard/business/campaigns/${id}`} replace />;
}
// Then use: <Route path="/dashboard/business/campaigns/:id/project" element={<ProjectRedirect />} />
```

- [ ] **Step 2: Update navConfig.ts**

In `src/lib/navConfig.ts`:
- Remove line 54: `{ icon: Briefcase, label: 'Projects', href: '/dashboard/business/projects' },`
- Remove line 183 (drawer menu): `{ icon: Briefcase, label: 'Projects', href: '/dashboard/business/projects' },`

- [ ] **Step 3: Update useProjectComplete.ts notification URLs**

In `src/hooks/useProjectComplete.ts`, update all 4 `actionUrl` references:
- Line 125: change `/dashboard/business/projects?highlight=${collaborationId}` → `/dashboard/business/campaigns/${campaignId}`
- Line 141: leave creator URL as-is (creator side is not changing)
- Line 164: change `/dashboard/business/projects?highlight=${collaborationId}` → `/dashboard/business/campaigns/${campaignId}`
- Line 177: leave creator URL as-is

The hook needs access to `campaignId`. Check if it's already available in the hook's scope (it should be passed as a parameter or available from the collaboration data).

- [ ] **Step 4: Update CampaignMessagesPage.tsx**

In `src/pages/CampaignMessagesPage.tsx`, update the hardcoded reference at line 26:
- Change `/dashboard/business/projects` → `/dashboard/business/campaigns`

- [ ] **Step 5: Update ProjectDetailsPage.tsx**

In `src/pages/ProjectDetailsPage.tsx`, update the reference at line 125:
- Change `/dashboard/business/projects` → `/dashboard/business/campaigns`

- [ ] **Step 6: Update create-campaign-escrow edge function redirect URLs**

In `supabase/functions/create-campaign-escrow/index.ts` (around lines 140-141), the Stripe checkout session's `success_url` and `cancel_url` currently redirect to the campaigns list page. Update them to redirect to the campaign detail page:

```typescript
// Old: success_url: `${origin}/dashboard/business/campaigns?payment=success&campaign_id=${campaignId}`
// New: success_url: `${origin}/dashboard/business/campaigns/${campaignId}?payment=success&session_id={CHECKOUT_SESSION_ID}`
// Old: cancel_url: `${origin}/dashboard/business/campaigns?payment=cancelled&campaign_id=${campaignId}`
// New: cancel_url: `${origin}/dashboard/business/campaigns/${campaignId}?payment=cancelled`
```

Without this change, after Stripe checkout the user lands on the list page instead of the detail page, and the detail page's payment verification `useEffect` never fires.

- [ ] **Step 7: Delete old page files**

Delete `src/pages/BusinessProjects.tsx` and `src/pages/CampaignProjectPage.tsx`.

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: No errors. No remaining imports of deleted files.

- [ ] **Step 9: Test redirects in browser**

Run: `npm run dev`
- Navigate to `/dashboard/business/projects` → should redirect to `/dashboard/business/campaigns`
- Navigate to `/dashboard/business/campaigns/{any-id}/project` → should redirect to `/dashboard/business/campaigns/{any-id}`
- Verify sidebar/drawer no longer shows "Projects" link
- Verify bottom nav still works

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: migrate routes and remove old project pages

Remove BusinessProjects and CampaignProjectPage. Add redirects for
old routes. Update all hardcoded path references. Update edge function
redirect URLs for Stripe checkout."
```

---

## Task 8: Final Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors, no warnings about missing imports.

- [ ] **Step 2: End-to-end browser testing**

Run: `npm run dev`

Test each user flow:
1. **Campaign list page:** Cards show progress bar, creator info, correct CTA labels
2. **Pre-hire detail:** Header + escrow alert (if pending) + progress timeline + applications + AI matching + expanded campaign details
3. **Active delivery detail:** Header with action badge + progress timeline + creator card + content review + collapsed campaign details
4. **Completed detail:** Header + completed progress + creator card + deliverables + payment summary + collapsed campaign details
5. **Cancelled detail:** Header + expanded campaign details (read-only)
6. **Overflow menu:** Delete works on eligible campaigns, Re-Launch works on completed
7. **Content approval flow:** Approve and Request Revision buttons work from the detail page
8. **Mark Complete flow:** Works from the progress timeline section
9. **Route redirects:** Old URLs redirect correctly
10. **Navigation:** Sidebar/drawer no longer shows Projects, Campaigns link works

- [ ] **Step 3: Commit any remaining fixes**

If any issues were found in testing, fix and commit.
