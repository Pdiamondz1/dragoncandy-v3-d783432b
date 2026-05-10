# Campaign Content Visibility — Design Spec

> Make delivered content visible at every level of the campaign and project
> UI so neither businesses nor creators have to guess where content is or
> what state it's in.

## Problem

Today a business that pays for content has no visibility into what creators
have uploaded until they drill into each individual project. Campaign cards
and project cards show metadata (title, status, budget) but zero content
previews. Creators face the inverse: they submit content and have no
card-level signal that it was approved, is in review, or needs revision.
The result is unnecessary navigation, guesswork, and friction in the
content delivery workflow.

## Solution — Three Layers of Visibility

Content surfaces at three complementary levels, each serving a distinct
purpose:

1. **Card-level** — Thumbnail strip + delivery status badge on every
   campaign and project card. At-a-glance signal without navigating.
2. **Campaign-level gallery** — New "Content" tab on `CampaignDetailsPage`
   showing all delivered content across all creators in a filterable grid
   with inline approve/revise actions and bulk download.
3. **Project-level** — Existing `ProjectDetailsPage` deliverable workflow
   unchanged. Already handles per-deliverable upload, review, and approval.

## Scope

**In scope:**
- New reusable `ContentPreviewStrip` component for cards
- New `CampaignContentGallery` component (Content tab)
- New `useCampaignContentSummary` hook (lightweight, for cards)
- New `useCampaignContentGallery` hook (full data, for gallery)
- New `bulk-download-campaign-content` edge function
- Integration into 4 existing card components + `CampaignDetailsPage`

**Out of scope:**
- File comments/annotation UI (tables exist but deferred)
- File version history UI (deferred)
- File tagging/organization UI (deferred)
- Standalone content hub page across all campaigns (future consideration)
- Creator-side gallery page (unnecessary — creators see one project at a time)

---

## Section 1: ContentPreviewStrip Component

A reusable component that slots into campaign and project cards to show
uploaded content thumbnails and delivery status.

### Props

```typescript
interface ContentPreviewStripProps {
  campaignId: string;
  collaborationId?: string; // scopes to single collaboration when provided
  role: 'business' | 'creator';
}
```

When `collaborationId` is provided (creator cards, single-project business
cards), the strip shows files for that collaboration only. When omitted
(campaign cards), it aggregates across all collaborations for the campaign.

### Visual Specification

- **Container:** Light background (`bg-gray-50`), rounded-lg, 1px border
  (`border-gray-200`), padding 8–10px. Sits between the card description
  and the metrics/buttons section. Consistent with the white-card design
  system used by all existing card components.
- **Thumbnails:** Up to 3 tiles, 44×44px on campaign cards, 36×36px on
  project cards. Rounded-lg. Images show actual thumbnails via signed URLs
  from `get-watermarked-preview`. Videos show a play icon overlay. If more
  than 3 files, the last tile renders as a "+N" overflow count with dashed
  border.
- **Status text:** Primary line in teal (`text-dc-teal`), e.g., "2/3
  delivered". Secondary line with contextual status color:
  - Awaiting review → yellow (`text-yellow-400`)
  - Revision requested → amber (`text-amber-500`)
  - All approved → green (`text-emerald-400`)
  - Waiting on creators → gray (`text-gray-500`)

### Status Messages by Role

**Business-facing:**

| State | Primary | Secondary |
|-------|---------|-----------|
| No collaborations | — | Strip does not render |
| Collaborations, no uploads | 0/N delivered | Waiting on creators |
| Partial uploads, in review | X/N delivered | Y awaiting review |
| Some approved, some pending | X/N delivered | Y approved · Z in review |
| Revision requested | X/N delivered | Y needs revision |
| All approved | N/N delivered | All approved |

**Creator-facing:**

| State | Primary | Secondary |
|-------|---------|-----------|
| No uploads | 0/N submitted | Upload your first deliverable |
| Partial, in review | X/N submitted | Awaiting review |
| Some approved, some pending | X/N submitted | Y approved · Z in review |
| Revision requested | X/N submitted | Y needs revision |
| All approved | N/N submitted | All approved |

### Empty State

The strip does not render when there are no active collaborations for the
campaign. When collaborations exist but no files have been uploaded, it
renders with the "0/N" state and no thumbnails.

### Integration Points

The strip is added to these existing components:

1. **`CampaignCard.tsx`** — Below the description, above the metrics grid.
   Uses `campaignId` only (aggregated view).
2. **`ActiveCampaignCard.tsx`** — Below the deadline row, above the upload
   button. Uses `collaborationId` (single collaboration).
3. **`ProjectCard.tsx`** — Below the title, replacing the plain-text status
   line. Uses `collaborationId`.
4. **`BusinessProjects.tsx` inline cards** — Below the description, above
   the QuickApprovalCard. Uses `collaborationId`.

### Loading and Error States

- **Loading:** Render a skeleton strip — 3 gray shimmer rectangles
  (44×44px) + a shimmer line for status text. Use the existing
  `Skeleton` component from shadcn/ui.
- **Error:** Strip renders nothing (fails silently). Content visibility
  is supplementary — a failed fetch should not break the card.
- **No data:** See Empty State section above.

### Data Hook: useCampaignContentSummary

```typescript
interface ContentSummary {
  totalDeliverables: number;
  submitted: number;
  approved: number;
  pendingReview: number;  // maps from 'submitted' in deliverables_status
  revisionRequested: number;
  thumbnailUrls: string[]; // up to 3 signed URLs
}

function useCampaignContentSummary(
  campaignId: string,
  collaborationId?: string
): UseQueryResult<ContentSummary>
```

**Query strategy:** The hook takes two paths depending on whether
`collaborationId` is provided:

- **Campaign-scoped** (no `collaborationId`): Fetches all `file_uploads`
  where `campaign_id` matches and `file_category = 'deliverable'`. Fetches
  all `campaign_collaborations` for the campaign to read
  `deliverables_status` JSONB for status counts.
- **Collaboration-scoped** (with `collaborationId`): Fetches
  `file_uploads` where `campaign_id` matches AND `uploaded_by` equals the
  collaboration's `creator_id`. The `creator_id` is read from
  `campaign_collaborations` in a single query that fetches the
  collaboration row alongside its files. This two-column join
  (`campaign_id` + `uploaded_by`) is the correct path because
  `file_uploads` has no `collaboration_id` foreign key.

**Status enum mapping:** The `deliverables_status` JSONB on
`campaign_collaborations` stores values like `'submitted'`, `'approved'`,
`'revision_requested'`, `'pending'`, `'in_progress'`. The hook maps
`'submitted'` → `pendingReview` in the summary (content has been
submitted and is awaiting business review). This mapping is the single
source of truth for translating database status to display status.

**Thumbnail URLs** are fetched via the existing `get-watermarked-preview`
edge function for the 3 most recently uploaded files.

React Query config: `staleTime: 30_000` (30 seconds) to avoid
over-fetching on list pages that may render many cards.

---

## Section 2: CampaignContentGallery Component

A new tab-panel component rendered within `CampaignDetailsPage` (business
view only) that displays all delivered content across all creators for a
campaign.

### Tab Integration

`CampaignDetailsPage` currently renders 3 tabs: Overview, Applications,
AI Match. A 4th tab — **Content** — is added. The tab grid changes from
`grid-cols-3` to `grid-cols-4`. Tab labels are shortened to fit mobile
(375px): "Overview" → "Info", "Applications" → "Apps", "AI Match" →
"Match", "Content" stays "Content". Each label is ≤7 characters, fitting
comfortably in a 4-column pill strip at mobile width.

The Content tab shows an orange notification dot when any content has
`'submitted'` status in `deliverables_status` (i.e., awaiting business
review), drawing the business owner's attention to files that need action.

### Layout

**Summary bar** (always visible at top of tab):
- Total deliverable count + approved count (teal) + pending count (yellow)

**Action bar:**
- **Download All Approved** button — primary teal, downloads a zip of all
  approved files. Disabled when no approved files exist.
- **Select** toggle button — enters multi-select mode. Selected files can
  be bulk-downloaded. Selection count shown in button label.
- **Filter chips** — horizontally scrollable: All, Pending Review, Approved,
  Revision Requested. Single-select, default "All".

**Content grid:**
- 2-column grid on mobile (`grid-cols-2 gap-3`), 3 columns on tablet+
  (`md:grid-cols-3`).
- Each tile is a `ContentTile` sub-component.

### ContentTile Sub-Component

Each tile represents one deliverable file (or a placeholder for an
unsubmitted deliverable).

**Visual structure:**
- Thumbnail area (120px tall, `rounded-t-xl`): actual image preview,
  video with play icon + duration badge, or placeholder icon for
  unsubmitted items.
- Status badge overlay (top-right of thumbnail): "Approved" (green bg),
  "Pending Review" (yellow bg), "Revision Requested" (amber bg).
- Border color matches status: `border-dc-teal` (approved),
  `border-yellow-400` (pending), `border-amber-500` (revision),
  `border-dashed border-gray-600` (not submitted).
- Info section below thumbnail: filename (truncated), creator handle,
  file size.
- Action section: varies by status.

**Actions by status:**

| Status | Actions |
|--------|---------|
| Approved | Download button (full-width, teal) |
| Pending Review | Approve button (teal) + Request Revision button (amber outline), side by side |
| Revision Requested | Shows "Revision sent" text, no actions |
| Not Submitted | Disabled placeholder with "Not submitted" label |

**Tap behavior:** Tapping the thumbnail area opens the existing
`ProtectedFilePreview` component in a modal/sheet overlay, preserving the
watermark and access-control logic that already exists.

**Multi-select mode:** When Select is active, tapping a tile toggles a
checkbox overlay instead of opening preview. A floating action bar appears
at the bottom: "Download N selected" button.

### Quick Approve/Revise Flow

The approve and revise buttons on pending tiles trigger the same mutation
logic used by the existing `ContentApprovalPanel` and
`RevisionRequestModal` on `ProjectDetailsPage`. Approve updates
`deliverables_status` JSONB and `content_status` on the collaboration.
Request Revision opens a compact modal for feedback text, then updates
status and sends a notification.

This reuses existing mutation hooks — no new approval logic is written.

### Data Hook: useCampaignContentGallery

```typescript
interface GalleryFile {
  fileId: string | null;       // null for not-submitted placeholders
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  bucketName: string;
  status: 'approved' | 'submitted' | 'revision_requested' | 'not_submitted';
  creatorId: string;
  creatorHandle: string;
  creatorAvatarUrl: string | null;
  collaborationId: string;
  thumbnailUrl: string | null;
  uploadedAt: string | null;
}

function useCampaignContentGallery(
  campaignId: string,
  statusFilter?: string
): UseQueryResult<GalleryFile[]>
```

**Status values match the database:** The `status` field uses values
directly from `deliverables_status` JSONB (`'submitted'`, `'approved'`,
`'revision_requested'`) plus `'not_submitted'` for placeholders. The UI
layer maps `'submitted'` to the "Pending Review" display label — this
translation happens in the component, not the hook.

**Query strategy:**

1. Fetch all `campaign_collaborations` for the campaign, selecting
   `id`, `creator_id`, `deliverables_status`, plus the nested `profiles`
   join for creator name/avatar.
2. Fetch all `file_uploads` where `campaign_id` matches and
   `file_category = 'deliverable'`.
3. Client-side: match files to collaborations via `uploaded_by =
   creator_id` (same two-column join as `useCampaignContentSummary`).
   Derive each file's status from the collaboration's
   `deliverables_status` JSONB.
4. For collaborations that have fewer files than expected deliverables
   (based on the count of entries in `deliverables_status`), generate
   `not_submitted` placeholder entries.

**Deliverable-to-file mapping:** The gallery does **not** attempt to
map individual files to specific deliverable specs from
`ai_analysis.deliverables`. Files are displayed as a flat list per
creator, grouped by collaboration. The deliverable count comes from
the number of keys in `deliverables_status` JSONB, which the existing
upload flow already populates per deliverable.

**Thumbnail URLs** are fetched via the existing `get-watermarked-preview`
edge function. For files with `status = 'approved'`, thumbnails are
served without watermarks.

**Loading state:** The gallery shows a 2-column skeleton grid (6
shimmer tiles) while loading. Error state shows a centered message:
"Couldn't load content — try refreshing."

### Bulk Download Edge Function: bulk-download-campaign-content

```typescript
// Request
interface BulkDownloadRequest {
  campaign_id: string;
  file_ids: string[]; // specific files, or omit for all approved
}

// Response: streams a zip file
```

**Security:** Verifies the requesting user owns the campaign (via
`campaigns.user_id`). When `file_ids` are provided, validates each file
belongs to the specified `campaign_id` before including it — prevents
a user from downloading files from other campaigns by passing arbitrary
IDs. Only includes files with `status = 'approved'` in the
collaboration's `deliverables_status`. Uses Supabase Storage signed URLs
to fetch files server-side and streams them into a zip response.

**Progress:** The client shows a toast with indeterminate progress while
the download streams. For large batches, the edge function sets a
`Content-Length` header when possible so the browser can show download
progress natively.

---

## Section 3: Creator-Side Improvements

Creator-side changes are limited to card-level visibility using the same
`ContentPreviewStrip` component from Section 1. No new pages or gallery
views are needed — creators only ever see their own submissions for one
project at a time, and the existing `ProjectDetailsPage` already handles
the per-deliverable workflow.

### Integration Points

1. **`ProjectCard.tsx`** — The strip replaces the current plain-text status
   line ("Content in progress"). It shows thumbnails of submitted files +
   status text ("2/3 submitted — 1 approved, 1 in review"). Uses
   `collaborationId` and `role='creator'`.

2. **`ActiveCampaignCard.tsx`** — The strip is inserted below the deadline
   row, above the "Upload Content" button. It shows submission progress
   and review status. Uses `collaborationId` and `role='creator'`.

### Creator Status Language

The strip uses "submitted" instead of "delivered" (creator perspective),
and surfaces actionable status: "Awaiting review" tells them to wait,
"1 needs revision" tells them to act. See the full status table in
Section 1.

---

## Architecture Summary

### New Files

| File | Type | Purpose |
|------|------|---------|
| `src/components/campaigns/ContentPreviewStrip.tsx` | Component | Reusable thumbnail + status strip for cards |
| `src/components/campaigns/CampaignContentGallery.tsx` | Component | Gallery tab for campaign detail page |
| `src/components/campaigns/ContentTile.tsx` | Component | Individual file tile in the gallery grid |
| `src/hooks/useCampaignContentSummary.ts` | Hook | Lightweight content summary for cards |
| `src/hooks/useCampaignContentGallery.ts` | Hook | Full content data for gallery |
| `supabase/functions/bulk-download-campaign-content/index.ts` | Edge Function | Zip download of approved files |

### Modified Files

| File | Change |
|------|--------|
| `src/components/campaigns/CampaignCard.tsx` | Add ContentPreviewStrip |
| `src/components/campaigns/ActiveCampaignCard.tsx` | Add ContentPreviewStrip |
| `src/components/projects/ProjectCard.tsx` | Add ContentPreviewStrip, remove plain status text |
| `src/pages/BusinessProjects.tsx` | Add ContentPreviewStrip to inline cards |
| `src/pages/CampaignDetailsPage.tsx` | Add Content tab, change grid-cols-3 to grid-cols-4 |

### Data Flow

```
file_uploads table
    ↓
useCampaignContentSummary (cards)     useCampaignContentGallery (gallery)
    ↓                                     ↓
ContentPreviewStrip                   CampaignContentGallery
  → CampaignCard                        → ContentTile (× N)
  → ActiveCampaignCard                     → ProtectedFilePreview (on tap)
  → ProjectCard                            → approve/revise mutations
  → BusinessProjects inline                → bulk-download-campaign-content
```

### No Database Changes

All data already exists in the `file_uploads`, `campaign_collaborations`
(`deliverables_status` JSONB), and `campaigns` (`ai_analysis.deliverables`
JSONB) tables. No new tables, columns, or migrations are needed.

The `file_uploads` table has no `collaboration_id` column. Collaboration
scoping uses a two-column match: `file_uploads.campaign_id` =
`campaign_collaborations.campaign_id` AND `file_uploads.uploaded_by` =
`campaign_collaborations.creator_id`. This is sufficient because a
creator can only have one active collaboration per campaign.

Existing RLS policies on `file_uploads` and `campaign_collaborations`
already enforce access control. The gallery hook queries through these
policies. The bulk download edge function verifies campaign ownership
independently.

---

## What This Deletes, Simplifies, and Automates

- **Deletes** the need to drill into each project to discover if content
  was uploaded. Removes N unnecessary navigation round-trips per campaign.
- **Simplifies** content review: approve or request revision directly from
  the gallery grid instead of navigating to the project detail page.
- **Automates** bulk download of approved content — one button instead of
  downloading files one at a time across multiple projects.
- **Keystroke reduction:** Business checking content status goes from
  ~8 taps (list → campaign → project → scroll to deliverables) to ~2 taps
  (list → campaign Content tab). Creator checking approval status goes
  from ~4 taps to 0 (visible on the card).
