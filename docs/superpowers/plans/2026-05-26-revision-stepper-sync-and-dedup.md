# Revision Stepper Sync & Campaign Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix business-side stepper stuck at step 1 after revision, remove confusing post-revision message, hide action buttons while awaiting resubmission, and eliminate duplicate campaigns across Active/Done tabs.

**Architecture:** Three surgical fixes in existing files. Fix 1 adds two missing status mappings to a pure function (`deriveCurrentStep`). Fix 2 adds a revision-awaiting state to the `ContentReviewSection` component. Fix 3 broadens a `useMemo` filter to exclude completed collaborations.

**Tech Stack:** React 18, TypeScript (strict), Vitest, Tailwind CSS, shadcn/ui

---

### Task 1: Fix `deriveCurrentStep()` — Handle `revision_requested` and `auto_approved`

**Files:**
- Create: `src/lib/campaignPhase.test.ts`
- Modify: `src/lib/campaignPhase.ts:38-49`

This is a pure function with no dependencies — ideal for TDD. The fix adds two missing `content_status` mappings so the business-side stepper and campaign card show the correct step.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/campaignPhase.test.ts
import { describe, it, expect } from 'vitest';
import { deriveCurrentStep } from './campaignPhase';

describe('deriveCurrentStep', () => {
  it('returns "submitted" for revision_requested status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'revision_requested' })
    ).toBe('submitted');
  });

  it('returns "payment" for auto_approved status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'auto_approved' })
    ).toBe('payment');
  });

  it('returns "review" for submitted status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'submitted' })
    ).toBe('review');
  });

  it('returns "payment" for approved status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'approved' })
    ).toBe('payment');
  });

  it('returns "hired" for pending status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'pending' })
    ).toBe('hired');
  });

  it('returns "hired" for in_progress status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'in_progress' })
    ).toBe('hired');
  });

  it('returns "review_left" for completed collaboration', () => {
    expect(
      deriveCurrentStep({ status: 'completed', content_status: 'approved' })
    ).toBe('review_left');
  });

  it('returns "payment" when business_completion_status is requested', () => {
    expect(
      deriveCurrentStep({
        status: 'active',
        content_status: 'approved',
        business_completion_status: 'requested',
      })
    ).toBe('payment');
  });

  it('returns "hired" for null content_status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: null })
    ).toBe('hired');
  });
});
```

- [ ] **Step 2: Run tests to verify the two new cases fail**

Run: `npx vitest run src/lib/campaignPhase.test.ts`
Expected: 7 PASS, 2 FAIL (`revision_requested` → returns `'hired'` instead of `'submitted'`; `auto_approved` → returns `'hired'` instead of `'payment'`).

- [ ] **Step 3: Add the two missing mappings**

In `src/lib/campaignPhase.ts`, change the `deriveCurrentStep` function body. The current lines 44-48 are:

```ts
  if (collaboration.content_status === 'submitted') return 'review';
  if (collaboration.content_status === 'approved') return 'payment';
  if (collaboration.content_status === 'rejected') return 'payment';
  // pending, in_progress, revision_requested, or null → creator is still working
  return 'hired';
```

Replace with:

```ts
  if (collaboration.content_status === 'submitted') return 'review';
  if (collaboration.content_status === 'approved') return 'payment';
  if (collaboration.content_status === 'auto_approved') return 'payment';
  if (collaboration.content_status === 'rejected') return 'payment';
  if (collaboration.content_status === 'revision_requested') return 'submitted';
  return 'hired';
```

Remove the comment on the old line 47 — the fall-through cases are now only `pending`, `in_progress`, and `null`.

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/campaignPhase.test.ts`
Expected: 9 PASS.

- [ ] **Step 5: Run build to verify no type errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/campaignPhase.ts src/lib/campaignPhase.test.ts
git commit -m "fix: deriveCurrentStep handles revision_requested and auto_approved statuses"
```

---

### Task 2: ContentReviewSection — Revision-Awaiting State

**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx:279-281,314-319,443-523`

Three changes in this file: (1) add `isRevisionRequested` flag, (2) update header text, (3) replace confusing message and hide action buttons when revision is pending.

- [ ] **Step 1: Add `isRevisionRequested` flag**

In `src/components/campaigns/detail/ContentReviewSection.tsx`, after line 280 (`const isApproved = contentStatus === 'approved';`), add:

```ts
  const isRevisionRequested = contentStatus === 'revision_requested';
```

- [ ] **Step 2: Update the early-exit guard to include `isRevisionRequested`**

Line 283 currently reads:

```ts
  if (!isSubmitted && !isApproved && !hasFiles && !filesLoading) return null;
```

Change to:

```ts
  if (!isSubmitted && !isApproved && !isRevisionRequested && !hasFiles && !filesLoading) return null;
```

This ensures the component renders when `contentStatus === 'revision_requested'` even if other conditions are false.

- [ ] **Step 3: Update the container border color**

Line 314 currently reads:

```ts
    <div className={`bg-white border-2 ${isSubmitted ? 'border-pink-400' : 'border-dc-teal'} rounded-2xl p-4 space-y-3`}>
```

Change to:

```ts
    <div className={`bg-white border-2 ${isSubmitted ? 'border-pink-400' : isRevisionRequested ? 'border-amber-300' : 'border-dc-teal'} rounded-2xl p-4 space-y-3`}>
```

- [ ] **Step 4: Update the header icon color and text**

Line 317 currently reads:

```ts
        <FileCheck className={`h-4 w-4 ${isSubmitted ? 'text-pink-500' : 'text-dc-teal'}`} />
```

Change to:

```ts
        <FileCheck className={`h-4 w-4 ${isSubmitted ? 'text-pink-500' : isRevisionRequested ? 'text-amber-500' : 'text-dc-teal'}`} />
```

Line 319 currently reads:

```ts
          {isSubmitted ? `Content ready for review from ${creatorName}` : `Content uploaded by ${creatorName}`}
```

Change to:

```ts
          {isSubmitted ? `Content ready for review from ${creatorName}` : isRevisionRequested ? `Content under revision from ${creatorName}` : `Content uploaded by ${creatorName}`}
```

- [ ] **Step 5: Replace the confusing message and hide buttons for revision_requested**

Replace lines 443-449 (the `!isSubmitted` message block):

```tsx
          {!isSubmitted && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs text-gray-600">
                Files uploaded but not yet formally submitted for review. You can preview them above and provide early feedback.
              </p>
            </div>
          )}
```

With:

```tsx
          {isRevisionRequested ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">Revision Requested</span>
                <Badge variant="outline" className="text-xs rounded-full border-amber-300 text-amber-700">
                  {safeRevisionCount}/{MAX_REVISIONS} revisions used
                </Badge>
              </div>
              <p className="text-xs text-amber-700">
                Waiting for {creatorName} to update and resubmit revised content.
              </p>
            </div>
          ) : !isSubmitted ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs text-gray-600">
                Files uploaded but not yet formally submitted for review. You can preview them above and provide early feedback.
              </p>
            </div>
          ) : null}
```

- [ ] **Step 6: Hide action buttons when revision is requested**

Line 451 currently reads:

```tsx
          {!showRevisionInput ? (
```

Change to:

```tsx
          {isRevisionRequested ? null : !showRevisionInput ? (
```

This adds a `null` branch for `isRevisionRequested`, hiding all action buttons (Approve, Request Revision, Message Creator) and the revision form. They reappear when the creator resubmits and status changes back to `submitted`.

No additional closing parens are needed — the existing `)` on line 623 closes the inner `!showRevisionInput` ternary, and the existing `}` closes the outer `{isRevisionRequested ? null : ...}` expression. The change is only to line 451.

- [ ] **Step 7: Run build to verify no type errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "fix: show revision-awaiting state and hide action buttons in ContentReviewSection"
```

---

### Task 3: Campaign Deduplication — Filter Against Completed Collaborations

**Files:**
- Modify: `src/pages/MyCampaignsPage.tsx:31-36`

One-line change: broaden the `acceptedApps` filter to exclude campaigns that have completed collaborations.

- [ ] **Step 1: Update the filter**

In `src/pages/MyCampaignsPage.tsx`, lines 31-36 currently read:

```ts
  const acceptedApps = useMemo(
    () => applications.filter(
      (a) => a.status === 'accepted' && !activeCollabs.some((c) => c.campaign_id === a.campaign_id)
    ),
    [applications, activeCollabs],
  );
```

Change to:

```ts
  const acceptedApps = useMemo(
    () => applications.filter(
      (a) => a.status === 'accepted' &&
        !activeCollabs.some((c) => c.campaign_id === a.campaign_id) &&
        !completedCollabs.some((c) => c.campaign_id === a.campaign_id)
    ),
    [applications, activeCollabs, completedCollabs],
  );
```

- [ ] **Step 2: Run build to verify no type errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyCampaignsPage.tsx
git commit -m "fix: exclude completed collaborations from accepted apps in Active tab"
```

---

## Execution Order

| # | Task | Independent? |
|---|------|-------------|
| 1 | `deriveCurrentStep()` fix + tests | Yes |
| 2 | ContentReviewSection revision-awaiting state | Yes |
| 3 | Campaign deduplication filter | Yes |

All three tasks are independent — no task depends on another. They can be executed in any order.

## Verification (Post-Deploy)

After all changes pushed and deployed via Lovable.dev:

1. **Business stepper:** Log in as Harbormill → "Edgewater's Most-Watched TikTok Drop" → Project Progress shows step 1 ✅, step 2 🟡. Campaign list card shows "Step 2 of 5".
2. **ContentReviewSection:** Same page → amber banner shows "Revision Requested — Waiting for Ricky Ricardo to update and resubmit" with "1/2 revisions used" badge. No Approve/Revision/Message buttons visible.
3. **Creator side (verify existing):** Log in as Ricky Ricardo → same campaign → amber revision banner with per-item feedback, flagged deliverables show "Needs revision" badge and "Re-upload" button.
4. **Deduplication:** Ricky Ricardo's My Campaigns → Active tab does NOT show JC Burger Weekend Blitz, Buzz Builder UGC Drop, or Opening Night Takeover (they appear only in Done tab).
5. **Desktop + Mobile:** All changes render correctly on both viewports.
6. **Console errors:** No new errors in Chrome DevTools.
