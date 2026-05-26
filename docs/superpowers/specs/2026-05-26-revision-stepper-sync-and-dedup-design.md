# Revision Stepper Sync & Campaign Deduplication Design

## Problem

Four interrelated issues with the revision workflow and campaign status sync, observed on production across the Harbormill (restaurant) and Ricky Ricardo (creator) accounts on "Edgewater's Most-Watched TikTok Drop":

1. **Business-side stepper stuck at step 1 after revision request.** `deriveCurrentStep()` in `campaignPhase.ts` treats `revision_requested` the same as `pending`/`in_progress` — falls through to `return 'hired'`. Both the `ProgressTimeline` (campaign detail) and `CampaignCard` (campaign list) consume this, so the stepper and "Step 1 of 5" text never advance past step 1.

2. **Confusing post-revision message on business side.** `ContentReviewSection.tsx` defines `isSubmitted = contentStatus === 'submitted'`. After a revision request, status becomes `revision_requested` — so `isSubmitted` is false and line 443 renders "Files uploaded but not yet formally submitted for review." This message is irrelevant to the revision context. The Approve & Request Revision buttons also remain visible.

3. **Creator has no clear revision guidance.** The amber revision banner shows per-item feedback but doesn't tell the creator what to do — whether to delete old files, re-upload, or how to proceed. Each flagged deliverable needs a visual indicator that it requires a re-upload.

4. **Accepted applications appear in both Active and Done tabs.** `MyCampaignsPage.tsx` filters `acceptedApps` against `activeCollabs` only. When a collaboration completes, its accepted application resurfaces in the Active tab because it's no longer in `activeCollabs`.

## Design

### Fix 1: `deriveCurrentStep()` Handles `revision_requested`

**File:** `src/lib/campaignPhase.ts`

Add cases for `revision_requested` and `auto_approved` before the default return on line 48:

```ts
if (collaboration.content_status === 'revision_requested') return 'submitted';
if (collaboration.content_status === 'auto_approved') return 'payment';
```

`revision_requested` → step 2 ("Content submitted by creator"): step 1 shows ✅ complete and step 2 shows 🟡 current. This reflects reality: the business requested changes, and we're waiting for the creator to resubmit.

`auto_approved` → step 4 ("Release payment"): same mapping as `approved`. Without this, `auto_approved` falls through to `return 'hired'` — the same bug class as `revision_requested`.

**Consumers affected (no changes needed — they inherit the fix):**
- `ProgressTimeline` (business campaign detail page)
- `CampaignCard` via `getStepLabel()` (business campaign list)
- `CampaignStatusBanner` via `renderSubtext()` (business campaign detail)

**Cross-role sync note:** The restaurant/brand user sees the updated stepper immediately after their revision request mutation succeeds (React Query invalidation in `onSuccess`). The creator side uses a separate function (`getCreatorStep()` in `ProjectStepper.tsx`) which already handles `revision_requested` → step 2 (fixed in prior session, commit `515b23b`). When the creator navigates to their campaign detail or the page refetches on window focus, both sides show consistent state.

### Fix 2: ContentReviewSection Post-Revision State

**File:** `src/components/campaigns/detail/ContentReviewSection.tsx`

Add `isRevisionRequested` flag:

```ts
const isRevisionRequested = contentStatus === 'revision_requested';
```

When `isRevisionRequested` is true:

1. **Replace the "not formally submitted" message** (line 443-449) with a revision context message:
   - Amber background (`bg-amber-50 border-amber-200`)
   - Text: "Revision requested — waiting for **[Creator Name]** to update and resubmit."
   - Badge showing revision count: "1/2 revisions used"

2. **Hide action buttons** (Approve & Pay, Request Revision, Message Creator) — these reappear when the creator resubmits and status becomes `submitted` again. The ternary at line 451 (`!showRevisionInput ? <buttons> : <revision form>`) should be wrapped: render the revision-awaiting message when `isRevisionRequested`, otherwise fall through to the existing `!showRevisionInput` ternary. Specifically, add `isRevisionRequested ? <revision context banner> :` before the existing `!showRevisionInput ?` on line 451.

3. **Keep file previews visible** — the business can reference what was submitted. The content header changes from "Content uploaded by [Name]" to "Content under revision from [Name]".

### Fix 3: Creator Revision UX — Already Implemented (Verify Only)

The creator-side revision UX was implemented in the prior session (commits `9a28558` and earlier). On review, these features already exist:

- **Amber revision banner** in `ActivePhaseView.tsx` (lines 92-123): shows per-item feedback with guidance text "Address the feedback above, then resubmit for review."
- **DeliverableCard** already handles `revision_requested` status (lines 35-49, 78-82, 102-116): renders with amber border (`border-2 border-amber-300 bg-amber-50/50`), "Needs revision" badge, feedback quote, and "Re-upload" button.
- **SubmitForReviewButton** already shows "Resubmit for Review" for `revision_requested` status.

**No code changes needed.** Verify these render correctly in production.

### Fix 4: Campaign Deduplication — Include Completed Collaborations

**File:** `src/pages/MyCampaignsPage.tsx`

Change the `acceptedApps` filter (line 33) to exclude campaigns that have collaborations in either `activeCollabs` or `completedCollabs`:

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

This eliminates the scenario where completed campaigns resurface as "Accepted — Awaiting project start" in the Active tab.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/campaignPhase.ts` | Add `revision_requested` → `'submitted'` and `auto_approved` → `'payment'` mappings in `deriveCurrentStep()` |
| `src/components/campaigns/detail/ContentReviewSection.tsx` | Add `isRevisionRequested` state: revision context message, hide action buttons, update header |
| `src/pages/MyCampaignsPage.tsx` | Filter `acceptedApps` against `completedCollabs` too |

**No changes needed (already implemented):**
| File | Status |
|------|--------|
| `src/components/my-campaigns/ActivePhaseView.tsx` | Revision banner with guidance text already exists (commit `9a28558`) |
| `src/components/projects/DeliverableCard.tsx` | Amber border, "Needs revision" badge, feedback quote, "Re-upload" button already exist |

## Verification

After deployment to dragoncandy.io:

1. **Business stepper:** Log in as Harbormill → navigate to "Edgewater's Most-Watched TikTok Drop" → verify Project Progress shows step 1 ✅ complete and step 2 🟡 current. Campaign list card should show "Step 2 of 5 — Content submitted by creator".
2. **ContentReviewSection:** On the same page, verify the "Files uploaded but not yet formally submitted" message is replaced with "Revision requested — waiting for Ricky Ricardo to update and resubmit" with revision count badge. Approve & Request Revision buttons should be hidden.
3. **Creator revision UX (verify existing):** Log in as Ricky Ricardo → navigate to "Edgewater's Most-Watched TikTok Drop" → verify amber revision banner shows per-item feedback with guidance text. Flagged deliverables show amber border, "Needs revision" badge, and "Re-upload" button.
4. **Campaign deduplication:** On Ricky Ricardo's My Campaigns page → Active tab should NOT show JC Burger Weekend Blitz, Buzz Builder UGC Drop, or Opening Night Takeover if they also appear in the Done tab.
5. **Desktop + Mobile:** All changes render correctly on both viewports.
6. **Console errors:** No new errors in Chrome DevTools.
