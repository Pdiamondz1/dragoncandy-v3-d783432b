# Revision Workflow & Campaign Status Sync — Design Spec

## Problem

After a business requests a content revision on a campaign, three issues break the creator experience and one creates visual confusion on the campaign list:

1. **Revision request is blind.** The "Request Revision" button opens a generic textarea. The business cannot specify which uploaded content items need revision, and the feedback isn't stored per-deliverable. The creator receives a chat message but has no structured understanding of what to fix.

2. **Creator has no in-app revision awareness.** Beyond a chat message, the creator's campaign detail page shows no banner, no per-item feedback, and the project stepper regresses to step 0 ("Brief") instead of indicating "revise and re-upload."

3. **MyCampaignCard doesn't reflect content status.** The `active` variant always shows "Active" badge and "Upload →" CTA regardless of whether content is submitted, under revision, or approved.

4. **Card deduplication bug.** Accepted applications and active collaborations for the same campaign both render in the Active tab, causing the stale "Awaiting project start" card to appear above the real "Active" card.

## Scope

Four surgical fixes. No new tables, no new edge functions, no schema migrations.

### Fix 1: Card Deduplication (MyCampaignsPage)

**File:** `src/pages/MyCampaignsPage.tsx`

Filter accepted applications whose `campaign_id` already has an active collaboration:

```ts
const deduplicatedAcceptedApps = acceptedApps.filter(
  (app) => !activeCollabs.some((c) => c.campaign_id === app.campaign_id)
);
```

Render `deduplicatedAcceptedApps` instead of `acceptedApps` in the Active tab. Update the tab count to `activeCollabs.length + deduplicatedAcceptedApps.length`.

### Fix 2: Per-Item Revision Request (Business Side)

**File:** `src/components/campaigns/detail/ContentReviewSection.tsx`

Replace the generic textarea revision form with a structured per-item form.

**Mutation signature change:** The current `requestRevision` mutation takes a single `string` parameter (`revisionFeedback: string`). Replace it with a structured payload:

```ts
interface RevisionPayload {
  items: Record<string, string>; // deliverable_id or file_id → feedback text
  general?: string;              // optional general notes
}
```

The mutation function signature becomes `mutationFn: async (payload: RevisionPayload)`.

**UI when "Request Revision" is clicked:**

1. Show each uploaded file as a compact thumbnail row with a checkbox. Files that have a `metadata.deliverable_id` are labeled with their deliverable type (e.g., "TikTok Video"). Files without a `deliverable_id` appear as individual items labeled by their filename — they are NOT grouped into a single "General uploads" bucket.
2. When a file is checked, expand a small textarea below it for per-item feedback (e.g., "Lighting too dark, reshoot with natural light").
3. Below the file list, show a "General notes" textarea for overall feedback (optional).
4. "Send" button is disabled until at least one file is checked.

**On submit:**

1. Build `revision_feedback` object: for files with `metadata.deliverable_id`, key by `deliverable_id`. For files without a `deliverable_id`, key by file ID. If general notes are provided, store under a `"general"` key.
2. Update `campaign_collaborations` via direct `.update()` (this continues the existing pattern — the current `requestRevision` mutation already does a direct update rather than routing through `transition_content_status` RPC):
   - `content_status = 'revision_requested'`
   - `revision_count = safeRevisionCount + 1`
   - `revision_feedback = <built object>`
   - `updated_at = now()`
3. Send a structured chat message listing each flagged item and its feedback.
4. Log `revision_requested` payment event (existing).
5. Send `revision_requested` email (existing).

**Revision feedback lifecycle:** `revision_feedback` is NOT cleared when the creator resubmits. On resubmission, `content_status` changes to `'submitted'` but `revision_feedback` persists for audit trail. The revision banner (Fix 3A) only renders when `content_status === 'revision_requested'`, so it naturally hides after resubmission. Individual `DeliverableCard` feedback display also keys off the deliverable's status in `deliverables_status` — which the `SubmitForReviewButton` already resets by transitioning content_status. No additional deliverables_status reset is needed because the business sees fresh content and can approve or re-request.

**Existing infrastructure reused:**
- `revision_feedback` JSONB field on `campaign_collaborations` (already exists)
- `DeliverableCard` already renders `feedback` prop from `revision_feedback[d.id]`
- `file_uploads` query already available via `useFileUploads`

### Fix 3: Creator Revision Awareness

**A. Revision banner — `src/components/my-campaigns/ActivePhaseView.tsx`**

When `collaboration.content_status === 'revision_requested'`, render an amber banner as the first element inside the PROJECT tab's content stack (non-dismissible, statically positioned):

- Heading: "Revision Requested" with revision count badge (e.g., "1/2 revisions used")
- List each deliverable/file that has feedback in `revision_feedback`, showing the deliverable label and the business's notes
- For the `"general"` key, show it as "General Feedback"
- Footer text: "Address the feedback above, then resubmit for review"

The banner is non-dismissible — it disappears naturally when the creator resubmits (content_status transitions to `'submitted'`).

Uses existing `collaboration.revision_feedback` and `collaboration.revision_count` data from `useCollaboration`.

**B. Stepper fix — `src/components/projects/ProjectStepper.tsx`**

`getCreatorStep()` currently falls to `default` for `'revision_requested'` → returns 0. Fix:

```ts
case 'revision_requested':
  return 2; // "Upload" step — creator needs to revise and re-upload
```

This puts the stepper at the "Upload" step with "Brief" and "Started" completed, accurately reflecting that the creator needs to revise content.

**C. DeliverableCard feedback** — Already wired via `feedback={collaboration.revision_feedback?.[d.id]}`. No change needed; it will display per-deliverable feedback once Fix 2 populates `revision_feedback`.

### Fix 4: MyCampaignCard Content Status

**File:** `src/components/my-campaigns/MyCampaignCard.tsx`

Enhance the `active` variant to reflect `collaboration.content_status`:

| `content_status` | Status badge | Hint text | CTA |
|---|---|---|---|
| `pending` / `in_progress` / `null` | Active | (current: delivery badge + progress bar) | Upload → |
| `submitted` | 📤 Submitted | Awaiting review | View → |
| `revision_requested` | ⚠️ Revision Needed | Revision requested | Revise → |
| `approved` | ✅ Approved | Content approved | View → |

The `CreatorCollaboration` type from `useCreatorCollaborations` already includes `content_status`, so no hook changes needed. The card component reads `collaboration.content_status` and overrides `statusConfig` and `ctaConfig` for the `active` variant based on the content status value.

## Files Changed

| # | File | Change |
|---|---|---|
| 1 | `src/pages/MyCampaignsPage.tsx` | Filter accepted apps with existing collabs |
| 2 | `src/components/campaigns/detail/ContentReviewSection.tsx` | Per-item revision form with checkboxes |
| 3 | `src/components/my-campaigns/ActivePhaseView.tsx` | Revision alert banner |
| 4 | `src/components/projects/ProjectStepper.tsx` | Fix `getCreatorStep()` for `revision_requested` |
| 5 | `src/components/my-campaigns/MyCampaignCard.tsx` | Content-status-aware badges/CTAs for active variant |

## What This Does NOT Change

- No new database tables or columns
- No schema migrations
- No new edge functions
- No changes to the state machine (`transition_content_status` RPC)
- No changes to email templates
- No changes to the `DeliverableCard` component (already wired)
- No changes to `SubmitForReviewButton` (already handles `revision_requested` with "Resubmit for Review" label)

## Verification

1. **Business requests revision:** Click "Request Revision" → see file thumbnails with checkboxes → check items, add per-item feedback → submit → creator receives structured message and email.
2. **Creator sees revision:** Campaign detail page shows amber revision banner with per-item feedback. Stepper shows "Upload" step (not "Brief"). DeliverableCards show individual feedback.
3. **Creator resubmits:** Click "Resubmit for Review" → content_status back to `submitted` → banner disappears, stepper advances to "Submit."
4. **Card accuracy:** Active tab shows single card per campaign (no duplicates). Card badge reflects content status (Submitted / Revision Needed / Approved).
5. **Desktop + mobile:** All changes render correctly on both viewports.
