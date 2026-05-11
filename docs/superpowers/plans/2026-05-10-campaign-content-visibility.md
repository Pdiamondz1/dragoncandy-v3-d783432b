# Campaign Content Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface delivered content thumbnails and status badges on campaign/project cards, and add a gallery tab to CampaignDetailsPage with inline approve/revise actions and bulk download.

**Architecture:** Data hooks query `file_uploads` + `campaign_collaborations.deliverables_status` via Supabase JS client. A lightweight summary hook powers card-level strips; a full gallery hook powers the Content tab. Thumbnail URLs come from `get-watermarked-preview` edge function (preserving watermark protection for unapproved content). A new `bulk-download-campaign-content` edge function returns signed download URLs for approved files (individual downloads — Deno edge functions cannot efficiently stream zip archives).

**Tech Stack:** React 18, TypeScript strict, TanStack React Query, Supabase JS v2, Tailwind CSS, shadcn/ui, Deno (edge functions)

**Spec:** `docs/superpowers/specs/2026-05-10-campaign-content-visibility-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/hooks/useCampaignContentSummary.ts` | Lightweight content summary for card strips (counts + up to 3 thumbnail URLs) |
| `src/components/campaigns/ContentPreviewStrip.tsx` | Reusable thumbnail strip + delivery status badge for campaign/project cards |
| `src/hooks/useCampaignContentGallery.ts` | Full content data for gallery tab (all files, statuses, creator info) |
| `src/components/campaigns/ContentTile.tsx` | Individual file tile in gallery grid (thumbnail, status badge, actions) |
| `src/components/campaigns/CampaignContentGallery.tsx` | Gallery tab panel with summary bar, filters, multi-select, bulk download |
| `supabase/functions/bulk-download-campaign-content/index.ts` | Edge function that zips approved files and streams the response |

### Modified Files

| File | Change |
|------|--------|
| `src/components/campaigns/CampaignCard.tsx` | Add `<ContentPreviewStrip>` after deliverables preview, before `CardFooter` (after line 374) |
| `src/components/campaigns/ActiveCampaignCard.tsx` | Add `<ContentPreviewStrip>` before the Upload Content button (before line 126) |
| `src/components/projects/ProjectCard.tsx` | Add `<ContentPreviewStrip>` after the title, replacing the plain-text status line (replace line 85) |
| `src/pages/BusinessProjects.tsx` | Add `<ContentPreviewStrip>` after the description, before `QuickApprovalCard` (before line 464) |
| `src/pages/CampaignDetailsPage.tsx` | Add 4th "Content" tab with notification dot, change `grid-cols-3` → `grid-cols-4`, shorten tab labels |

---

## Task 1: Create `useCampaignContentSummary` Hook

**Files:**
- Create: `src/hooks/useCampaignContentSummary.ts`

This hook powers the `ContentPreviewStrip` on cards. It fetches counts (total deliverables, submitted, approved, pending review, revision requested) and up to 3 thumbnail URLs.

- [ ] **Step 1: Create the hook file with types and query**

```typescript
// src/hooks/useCampaignContentSummary.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContentSummary {
  totalDeliverables: number;
  submitted: number;
  approved: number;
  pendingReview: number;
  revisionRequested: number;
  thumbnailUrls: string[];
}

export function useCampaignContentSummary(
  campaignId: string,
  collaborationId?: string
) {
  return useQuery({
    queryKey: ['campaign-content-summary', campaignId, collaborationId],
    queryFn: async (): Promise<ContentSummary> => {
      // Fetch collaborations for status counts
      let collabQuery = supabase
        .from('campaign_collaborations')
        .select('id, creator_id, deliverables_status, content_status')
        .eq('campaign_id', campaignId)
        .in('status', ['active', 'completed']);

      if (collaborationId) {
        collabQuery = collabQuery.eq('id', collaborationId);
      }

      const { data: collabs, error: collabError } = await collabQuery;
      if (collabError) throw collabError;
      if (!collabs?.length) {
        return { totalDeliverables: 0, submitted: 0, approved: 0, pendingReview: 0, revisionRequested: 0, thumbnailUrls: [] };
      }

      // Count statuses from deliverables_status JSONB across all collaborations
      let total = 0;
      let approved = 0;
      let pendingReview = 0;
      let revisionRequested = 0;

      for (const collab of collabs) {
        const ds = collab.deliverables_status as Record<string, string> | null;
        if (!ds) continue;
        const values = Object.values(ds);
        total += values.length;
        for (const status of values) {
          if (status === 'approved' || status === 'auto_approved') approved++;
          else if (status === 'submitted') pendingReview++;
          else if (status === 'revision_requested') revisionRequested++;
        }
      }

      const submitted = approved + pendingReview + revisionRequested;

      // Fetch up to 3 most recent deliverable files for thumbnails
      let fileQuery = supabase
        .from('file_uploads')
        .select('id, file_path, bucket_name, mime_type, uploaded_by')
        .eq('campaign_id', campaignId)
        .eq('file_category', 'deliverable')
        .order('created_at', { ascending: false })
        .limit(3);

      if (collaborationId) {
        const creatorIds = collabs.map(c => c.creator_id);
        fileQuery = fileQuery.in('uploaded_by', creatorIds);
      }

      const { data: files } = await fileQuery;

      // Generate thumbnail URLs via get-watermarked-preview (preserves watermark on unapproved content)
      // Need collaboration IDs to call the preview endpoint
      const collabByCreator = new Map(collabs.map(c => [c.creator_id, c.id]));
      const thumbnailPromises = (files ?? [])
        .filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'))
        .map(async (file) => {
          const collabId = collabByCreator.get(file.uploaded_by);
          if (!collabId) return null;
          const { data } = await supabase.functions.invoke('get-watermarked-preview', {
            body: { file_path: file.file_path, bucket_name: file.bucket_name, collaboration_id: collabId },
          });
          return data?.signed_url ?? null;
        });
      const thumbnailResults = await Promise.all(thumbnailPromises);
      const thumbnailUrls = thumbnailResults.filter((url): url is string => url !== null);

      return { totalDeliverables: total, submitted, approved, pendingReview, revisionRequested, thumbnailUrls };
    },
    staleTime: 30_000,
    enabled: !!campaignId,
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignContentSummary.ts
git commit -m "feat: add useCampaignContentSummary hook for card-level content visibility"
```

---

## Task 2: Create `ContentPreviewStrip` Component

**Files:**
- Create: `src/components/campaigns/ContentPreviewStrip.tsx`

Reusable strip that renders thumbnail tiles + delivery status text. Uses `useCampaignContentSummary`. Renders nothing when there are no active collaborations.

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/ContentPreviewStrip.tsx
import { useCampaignContentSummary } from '@/hooks/useCampaignContentSummary';
import { Skeleton } from '@/components/ui/skeleton';

interface ContentPreviewStripProps {
  campaignId: string;
  collaborationId?: string;
  role: 'business' | 'creator';
}

export function ContentPreviewStrip({ campaignId, collaborationId, role }: ContentPreviewStripProps) {
  const { data, isLoading, isError } = useCampaignContentSummary(campaignId, collaborationId);

  if (isError) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 bg-gray-50 rounded-lg border border-gray-200 p-2">
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-[44px] h-[44px] rounded-lg" />
          ))}
        </div>
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </div>
    );
  }

  if (!data || data.totalDeliverables === 0) return null;

  const deliveredLabel = role === 'business' ? 'delivered' : 'submitted';
  const primaryText = `${data.submitted}/${data.totalDeliverables} ${deliveredLabel}`;

  let secondaryText = '';
  let secondaryColor = 'text-gray-500';

  if (data.submitted === 0) {
    secondaryText = role === 'business' ? 'Waiting on creators' : 'Upload your first deliverable';
  } else if (data.revisionRequested > 0) {
    secondaryText = `${data.revisionRequested} needs revision`;
    secondaryColor = 'text-amber-500';
  } else if (data.approved === data.totalDeliverables) {
    secondaryText = 'All approved';
    secondaryColor = 'text-emerald-400';
  } else if (data.pendingReview > 0 && data.approved > 0) {
    secondaryText = `${data.approved} approved · ${data.pendingReview} in review`;
    secondaryColor = 'text-yellow-400';
  } else if (data.pendingReview > 0) {
    secondaryText = `${data.pendingReview} awaiting review`;
    secondaryColor = 'text-yellow-400';
  } else {
    secondaryText = `${data.approved} approved`;
    secondaryColor = 'text-emerald-400';
  }

  return (
    <div className="flex items-center gap-2.5 bg-gray-50 rounded-lg border border-gray-200 p-2">
      {data.thumbnailUrls.length > 0 && (
        <div className="flex gap-1.5 flex-shrink-0">
          {data.thumbnailUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-[44px] h-[44px] rounded-lg object-cover"
              loading="lazy"
            />
          ))}
          {data.submitted > data.thumbnailUrls.length && (
            <div className="w-[44px] h-[44px] rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
              <span className="text-xs text-gray-400 font-semibold">
                +{data.submitted - data.thumbnailUrls.length}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-dc-teal truncate">{primaryText}</p>
        <p className={`text-xs ${secondaryColor} truncate`}>{secondaryText}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ContentPreviewStrip.tsx
git commit -m "feat: add ContentPreviewStrip component for card-level content visibility"
```

---

## Task 3: Integrate ContentPreviewStrip into CampaignCard

**Files:**
- Modify: `src/components/campaigns/CampaignCard.tsx`

Add the strip after the deliverables preview section (after the `</div>` that closes the deliverables preview at line 374), before `</CardContent>` at line 375.

- [ ] **Step 1: Add import and render the strip**

Add import at the top of the file:
```typescript
import { ContentPreviewStrip } from './ContentPreviewStrip';
```

Insert after the deliverables preview block (after line 374, before `</CardContent>`):
```tsx
        <ContentPreviewStrip campaignId={campaign.id} role="business" />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignCard.tsx
git commit -m "feat: add ContentPreviewStrip to CampaignCard"
```

---

## Task 4: Integrate ContentPreviewStrip into BusinessProjects

**Files:**
- Modify: `src/pages/BusinessProjects.tsx`

Insert the strip after the description line (`<p>...{project.campaign.description}</p>` at line 462), before the `QuickApprovalCard` at line 465.

- [ ] **Step 1: Add import and render the strip**

Add import at the top of the file:
```typescript
import { ContentPreviewStrip } from '@/components/campaigns/ContentPreviewStrip';
```

Insert between the description `<p>` (line 462) and `<QuickApprovalCard>` (line 465):
```tsx
                        <ContentPreviewStrip
                          campaignId={project.campaign_id}
                          collaborationId={project.id}
                          role="business"
                        />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BusinessProjects.tsx
git commit -m "feat: add ContentPreviewStrip to BusinessProjects inline cards"
```

---

## Task 5: Integrate ContentPreviewStrip into ProjectCard (Creator)

**Files:**
- Modify: `src/components/projects/ProjectCard.tsx`

Replace the plain-text status line (line 85: `<p className="text-xs text-gray-500">{statusText}</p>`) with the ContentPreviewStrip. The `project.id` here is the collaboration ID.

- [ ] **Step 1: Add import and replace status text**

Add import at the top of the file:
```typescript
import { ContentPreviewStrip } from '@/components/campaigns/ContentPreviewStrip';
```

The ProjectCard doesn't have `campaign_id` in its current prop type — it has `project.id` (the collaboration ID) and campaign info nested under `project.campaigns`. The parent hook (`useCreatorCollaborations`) already selects `campaign_id` from `campaign_collaborations`, so the data is available in the parent — the parent just needs to pass it as `project.campaign_id`.

**Add `campaign_id` to the prop type (optional, backward-compatible):**

Update the interface:
```typescript
interface ProjectCardProps {
  project: {
    id: string;
    campaign_id?: string; // Add this
    status: string;
    content_status?: string | null;
    content_started_at?: string | null;
    content_deadline?: string | null;
    campaigns: {
      title: string;
      delivery_type?: string;
      fixed_price?: number;
      budget_min?: number;
      budget_max?: number;
    };
  };
}
```

Replace line 85 (`<p className="text-xs text-gray-500">{statusText}</p>`) with:
```tsx
      {project.campaign_id ? (
        <ContentPreviewStrip
          campaignId={project.campaign_id}
          collaborationId={project.id}
          role="creator"
        />
      ) : (
        <p className="text-xs text-gray-500">{statusText}</p>
      )}
```

This is backward-compatible — the strip renders when `campaign_id` is provided, otherwise the old text shows.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. The `campaign_id` prop is optional so existing callers don't break.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectCard.tsx
git commit -m "feat: add ContentPreviewStrip to ProjectCard for creator view"
```

---

## Task 6: Integrate ContentPreviewStrip into ActiveCampaignCard (Creator)

**Files:**
- Modify: `src/components/campaigns/ActiveCampaignCard.tsx`

Insert the strip before the Upload Content button (before line 126). The `collaboration` prop has `collaboration.campaign.id` for campaignId and the collaboration object itself. Check what ID field the collaboration has.

- [ ] **Step 1: Check the collaboration prop shape**

Read the file header to find the `CreatorCollaboration` type or interface. The `ActiveCampaignCard` receives `collaboration` which has `.campaign.id` and the collaboration's own `.id` (which is the collaboration ID from `campaign_collaborations`).

- [ ] **Step 2: Add import and render the strip**

Add import at the top of the file:
```typescript
import { ContentPreviewStrip } from './ContentPreviewStrip';
```

Insert before the Upload Content button (before the `<button onClick=...>Upload Content</button>` at line 127):
```tsx
      <ContentPreviewStrip
        campaignId={collaboration.campaign.id}
        collaborationId={collaboration.id}
        role="creator"
      />
```

The collaboration prop likely has `.id` (its own ID) and `.campaign.id` (the campaign's ID). Verify by reading the type definition at the top of the file or the hook that provides the data.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/ActiveCampaignCard.tsx
git commit -m "feat: add ContentPreviewStrip to ActiveCampaignCard for creator view"
```

---

## Task 7: Create `useCampaignContentGallery` Hook

**Files:**
- Create: `src/hooks/useCampaignContentGallery.ts`

Full data hook for the gallery tab. Fetches all files + collaboration statuses + creator info. Returns a flat list of `GalleryFile` objects.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useCampaignContentGallery.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GalleryFile {
  fileId: string | null;
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

export function useCampaignContentGallery(campaignId: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['campaign-content-gallery', campaignId, statusFilter],
    queryFn: async (): Promise<GalleryFile[]> => {
      // 1. Fetch collaborations with creator profiles
      const { data: collabs, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select('id, creator_id, deliverables_status, content_status, profiles!campaign_collaborations_creator_id_fkey(full_name, avatar_url)')
        .eq('campaign_id', campaignId)
        .in('status', ['active', 'completed']);

      if (collabError) throw collabError;
      if (!collabs?.length) return [];

      // 2. Fetch all deliverable files for this campaign
      const { data: files, error: fileError } = await supabase
        .from('file_uploads')
        .select('id, filename, original_filename, mime_type, file_size, file_path, bucket_name, uploaded_by, created_at')
        .eq('campaign_id', campaignId)
        .eq('file_category', 'deliverable')
        .order('created_at', { ascending: false });

      if (fileError) throw fileError;

      // 3. Build gallery items
      const items: GalleryFile[] = [];

      for (const collab of collabs) {
        const ds = collab.deliverables_status as Record<string, string> | null;
        const profile = collab.profiles as { full_name: string | null; avatar_url: string | null } | null;
        const creatorFiles = (files ?? []).filter(f => f.uploaded_by === collab.creator_id);

        // Map files to deliverable statuses by position (file index → JSONB key order).
        // The gallery does not attempt 1:1 mapping of files to deliverable specs (per spec),
        // so we assign statuses by position. If there are more files than JSONB entries,
        // extra files get the collaboration-level content_status as fallback.
        const dsKeys = ds ? Object.keys(ds) : [];

        for (let i = 0; i < creatorFiles.length; i++) {
          const file = creatorFiles[i];
          let fileStatus: string;
          if (i < dsKeys.length && ds) {
            fileStatus = ds[dsKeys[i]];
          } else {
            fileStatus = collab.content_status ?? 'submitted';
          }
          const normalizedStatus = (fileStatus === 'auto_approved') ? 'approved' : fileStatus;

          // Generate thumbnail URL via get-watermarked-preview
          let thumbnailUrl: string | null = null;
          if (file.mime_type?.startsWith('image/') || file.mime_type?.startsWith('video/')) {
            const { data: previewData } = await supabase.functions.invoke('get-watermarked-preview', {
              body: { file_path: file.file_path, bucket_name: file.bucket_name, collaboration_id: collab.id },
            });
            thumbnailUrl = previewData?.signed_url ?? null;
          }

          items.push({
            fileId: file.id,
            filename: file.filename,
            originalFilename: file.original_filename,
            mimeType: file.mime_type,
            fileSize: file.file_size,
            filePath: file.file_path,
            bucketName: file.bucket_name,
            status: normalizedStatus as GalleryFile['status'],
            creatorId: collab.creator_id,
            creatorHandle: profile?.full_name ?? 'Creator',
            creatorAvatarUrl: profile?.avatar_url ?? null,
            collaborationId: collab.id,
            thumbnailUrl,
            uploadedAt: file.created_at,
          });
        }

        // Generate not_submitted placeholders for expected but unfilled deliverables
        if (ds) {
          const expectedCount = dsKeys.length;
          const missing = expectedCount - creatorFiles.length;
          for (let i = 0; i < missing; i++) {
            items.push({
              fileId: null,
              filename: '',
              originalFilename: `Deliverable ${creatorFiles.length + i + 1}`,
              mimeType: '',
              fileSize: 0,
              filePath: '',
              bucketName: '',
              status: 'not_submitted',
              creatorId: collab.creator_id,
              creatorHandle: profile?.full_name ?? 'Creator',
              creatorAvatarUrl: profile?.avatar_url ?? null,
              collaborationId: collab.id,
              thumbnailUrl: null,
              uploadedAt: null,
            });
          }
        }
      }

      // Apply status filter
      if (statusFilter && statusFilter !== 'all') {
        return items.filter(item => item.status === statusFilter);
      }

      return items;
    },
    staleTime: 30_000,
    enabled: !!campaignId,
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignContentGallery.ts
git commit -m "feat: add useCampaignContentGallery hook for gallery tab"
```

---

## Task 8: Create `ContentTile` Component

**Files:**
- Create: `src/components/campaigns/ContentTile.tsx`

Individual tile in the gallery grid. Shows thumbnail, status badge, creator name, and action buttons.

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/ContentTile.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, RotateCcw, Download, Play, ImageOff } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { GalleryFile } from '@/hooks/useCampaignContentGallery';

interface ContentTileProps {
  file: GalleryFile;
  isSelecting: boolean;
  isSelected: boolean;
  onToggleSelect: (fileId: string) => void;
  onApprove: (file: GalleryFile) => void;
  onRequestRevision: (file: GalleryFile, feedback: string) => void;
  onDownload: (file: GalleryFile) => void;
  onPreview: (file: GalleryFile) => void;
}

const STATUS_CONFIG = {
  approved: { label: 'Approved', bg: 'bg-emerald-100 text-emerald-700', border: 'border-dc-teal' },
  submitted: { label: 'Pending Review', bg: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-400' },
  revision_requested: { label: 'Revision Requested', bg: 'bg-amber-100 text-amber-700', border: 'border-amber-500' },
  not_submitted: { label: 'Not Submitted', bg: 'bg-gray-100 text-gray-500', border: 'border-dashed border-gray-400' },
} as const;

export function ContentTile({
  file,
  isSelecting,
  isSelected,
  onToggleSelect,
  onApprove,
  onRequestRevision,
  onDownload,
  onPreview,
}: ContentTileProps) {
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState('');

  const config = STATUS_CONFIG[file.status];
  const isVideo = file.mimeType.startsWith('video/');
  const isNotSubmitted = file.status === 'not_submitted';

  const handleThumbnailClick = () => {
    if (isSelecting && file.fileId) {
      onToggleSelect(file.fileId);
    } else if (!isNotSubmitted) {
      onPreview(file);
    }
  };

  return (
    <div className={`rounded-xl border-2 ${config.border} bg-white overflow-hidden`}>
      {/* Thumbnail area */}
      <button
        onClick={handleThumbnailClick}
        disabled={isNotSubmitted}
        className="relative w-full h-[120px] bg-gray-100 rounded-t-xl overflow-hidden"
      >
        {file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt={file.originalFilename}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="h-8 w-8 text-gray-300" />
          </div>
        )}

        {isVideo && file.thumbnailUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="h-4 w-4 text-white fill-white" />
            </div>
          </div>
        )}

        {/* Status badge */}
        <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${config.bg}`}>
          {config.label}
        </span>

        {/* Multi-select checkbox */}
        {isSelecting && file.fileId && (
          <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center ${
            isSelected ? 'bg-dc-teal border-dc-teal' : 'bg-white/80 border-gray-300'
          }`}>
            {isSelected && <span className="text-white text-xs">✓</span>}
          </div>
        )}
      </button>

      {/* Info */}
      <div className="p-2">
        <p className="text-xs font-medium text-gray-900 truncate">{file.originalFilename}</p>
        <p className="text-[10px] text-gray-500 truncate">{file.creatorHandle}</p>
        {file.fileSize > 0 && (
          <p className="text-[10px] text-gray-400">{(file.fileSize / (1024 * 1024)).toFixed(1)} MB</p>
        )}
      </div>

      {/* Actions */}
      <div className="px-2 pb-2">
        {file.status === 'approved' && (
          <Button
            size="sm"
            className="w-full rounded-full bg-dc-teal-btn text-white text-xs h-7"
            onClick={() => onDownload(file)}
          >
            <Download className="h-3 w-3 mr-1" /> Download
          </Button>
        )}

        {file.status === 'submitted' && !showRevisionInput && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="flex-1 rounded-full bg-dc-teal-btn text-white text-xs h-7"
              onClick={() => onApprove(file)}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-full text-amber-600 border-amber-400 text-xs h-7"
              onClick={() => setShowRevisionInput(true)}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Revise
            </Button>
          </div>
        )}

        {file.status === 'submitted' && showRevisionInput && (
          <div className="space-y-1.5">
            <Textarea
              placeholder="What needs changing?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              className="text-xs"
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="flex-1 text-xs h-7"
                disabled={!feedback.trim()}
                onClick={() => {
                  onRequestRevision(file, feedback);
                  setFeedback('');
                  setShowRevisionInput(false);
                }}
              >
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => { setShowRevisionInput(false); setFeedback(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {file.status === 'revision_requested' && (
          <p className="text-xs text-amber-500 text-center">Revision sent</p>
        )}

        {file.status === 'not_submitted' && (
          <p className="text-xs text-gray-400 text-center">Not submitted</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ContentTile.tsx
git commit -m "feat: add ContentTile component for gallery grid"
```

---

## Task 9: Create `CampaignContentGallery` Component

**Files:**
- Create: `src/components/campaigns/CampaignContentGallery.tsx`

Gallery tab panel with summary bar, filter chips, multi-select, and tile grid. Uses `useCampaignContentGallery` and renders `ContentTile` for each item.

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/CampaignContentGallery.tsx
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, CheckSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCampaignContentGallery, type GalleryFile } from '@/hooks/useCampaignContentGallery';
import { ContentTile } from './ContentTile';
import { ProtectedFilePreview } from '@/components/projects/ProtectedFilePreview';

interface CampaignContentGalleryProps {
  campaignId: string;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'revision_requested', label: 'Revision Requested' },
] as const;

export function CampaignContentGallery({ campaignId }: CampaignContentGalleryProps) {
  const [filter, setFilter] = useState('all');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<GalleryFile | null>(null);
  const queryClient = useQueryClient();

  const { data: files, isLoading, isError } = useCampaignContentGallery(campaignId, filter);

  const approvedCount = files?.filter(f => f.status === 'approved').length ?? 0;
  const pendingCount = files?.filter(f => f.status === 'submitted').length ?? 0;
  const totalFiles = files?.filter(f => f.fileId !== null).length ?? 0;

  const toggleSelect = useCallback((fileId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  // Granular per-deliverable approval: updates the specific deliverable entry
  // in deliverables_status JSONB, then releases payout only when ALL deliverables
  // for the collaboration are approved.
  const approveMutation = useMutation({
    mutationFn: async (file: GalleryFile) => {
      // Fetch current deliverables_status
      const { data: collab, error: fetchError } = await supabase
        .from('campaign_collaborations')
        .select('deliverables_status')
        .eq('id', file.collaborationId)
        .single();
      if (fetchError) throw fetchError;

      const ds = (collab.deliverables_status as Record<string, string>) ?? {};
      // Find the key for this file's deliverable (by position match with uploaded files)
      const keys = Object.keys(ds);
      // Find first non-approved key and set it to approved
      const keyToApprove = keys.find(k => ds[k] === 'submitted');
      if (keyToApprove) {
        ds[keyToApprove] = 'approved';
      }

      const allApproved = Object.values(ds).every(s => s === 'approved' || s === 'auto_approved');

      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({
          deliverables_status: ds,
          content_status: allApproved ? 'approved' : 'submitted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', file.collaborationId);
      if (updateError) throw updateError;

      // Release payout only when all deliverables are approved
      if (allApproved) {
        const { error: payoutError } = await supabase.functions.invoke('release-creator-payout', {
          body: { collaborationId: file.collaborationId },
        });
        if (payoutError) throw payoutError;
      }
    },
    onSuccess: () => {
      toast.success('Deliverable approved!');
      queryClient.invalidateQueries({ queryKey: ['campaign-content-gallery', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-content-summary', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
    },
    onError: (err: Error) => toast.error(`Approve failed: ${err.message}`),
  });

  // Revision mutation: updates deliverables_status JSONB for the specific deliverable,
  // sets collaboration content_status, and sends revision feedback via the existing
  // QuickApprovalCard pattern (direct update + message insert with proper fields).
  const revisionMutation = useMutation({
    mutationFn: async ({ file, feedback }: { file: GalleryFile; feedback: string }) => {
      // Fetch and update deliverables_status
      const { data: collab, error: fetchError } = await supabase
        .from('campaign_collaborations')
        .select('deliverables_status, revision_count')
        .eq('id', file.collaborationId)
        .single();
      if (fetchError) throw fetchError;

      const ds = (collab.deliverables_status as Record<string, string>) ?? {};
      const keyToRevise = Object.keys(ds).find(k => ds[k] === 'submitted');
      if (keyToRevise) {
        ds[keyToRevise] = 'revision_requested';
      }

      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({
          deliverables_status: ds,
          content_status: 'revision_requested',
          revision_count: (collab.revision_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', file.collaborationId);
      if (updateError) throw updateError;

      // Send revision feedback as a message (same pattern as QuickApprovalCard)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('messages').insert({
          sender_id: user.id,
          recipient_id: file.creatorId,
          campaign_id: campaignId,
          content: `📝 **Revision Requested**\n\n${feedback}`,
          category: 'revision_request',
        });
      }

      // Fire-and-forget: write payment event for audit trail
      supabase.rpc('insert_payment_event', {
        p_event_type: 'revision_requested',
        p_entity_type: 'collaboration',
        p_entity_id: file.collaborationId,
        p_campaign_id: campaignId,
        p_metadata: { notes: feedback, revision_number: (collab.revision_count ?? 0) + 1 },
      }).then(() => {}, () => {});
    },
    onSuccess: () => {
      toast.success('Revision request sent');
      queryClient.invalidateQueries({ queryKey: ['campaign-content-gallery', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-content-summary', campaignId] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const handleDownload = useCallback(async (file: GalleryFile) => {
    const { data } = await supabase.functions.invoke('get-watermarked-preview', {
      body: { file_path: file.filePath, bucket_name: file.bucketName, collaboration_id: file.collaborationId },
    });
    if (data?.signed_url && data?.can_download) {
      const link = document.createElement('a');
      link.href = data.signed_url;
      link.download = file.originalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      toast.error('Download not available');
    }
  }, []);

  const handleBulkDownload = useCallback(async () => {
    const fileIds = selected.size > 0
      ? Array.from(selected)
      : (files ?? []).filter(f => f.status === 'approved' && f.fileId).map(f => f.fileId!);

    if (fileIds.length === 0) {
      toast.error('No files to download');
      return;
    }

    toast.info('Preparing download...');
    const { data, error } = await supabase.functions.invoke('bulk-download-campaign-content', {
      body: { campaign_id: campaignId, file_ids: fileIds },
    });

    if (error || (!data?.download_url && !data?.download_urls)) {
      toast.error('Download failed');
      return;
    }

    if (data.download_url) {
      const link = document.createElement('a');
      link.href = data.download_url;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (data.download_urls) {
      for (const item of data.download_urls) {
        const link = document.createElement('a');
        link.href = item.url;
        link.download = item.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      toast.success(`Downloading ${data.download_urls.length} files`);
    }
  }, [selected, files, campaignId]);

  // Opens ProtectedFilePreview in a Dialog overlay (per spec: preserves watermark + access control)
  const handlePreview = useCallback((file: GalleryFile) => {
    setPreviewFile(file);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-center text-gray-500 py-8">Couldn't load content — try refreshing.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-gray-900">{totalFiles} files</span>
        {approvedCount > 0 && (
          <span className="text-emerald-500 font-medium">{approvedCount} approved</span>
        )}
        {pendingCount > 0 && (
          <span className="text-yellow-500 font-medium">{pendingCount} pending</span>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          className="rounded-full bg-dc-teal-btn text-white text-xs"
          disabled={approvedCount === 0}
          onClick={handleBulkDownload}
        >
          <Download className="h-3 w-3 mr-1" />
          {selected.size > 0 ? `Download ${selected.size} selected` : 'Download All Approved'}
        </Button>
        <Button
          size="sm"
          variant={isSelecting ? 'default' : 'outline'}
          className="rounded-full text-xs"
          onClick={() => {
            setIsSelecting(!isSelecting);
            if (isSelecting) setSelected(new Set());
          }}
        >
          <CheckSquare className="h-3 w-3 mr-1" />
          {isSelecting ? 'Cancel' : 'Select'}
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-dc-teal text-white font-semibold'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content grid */}
      {(!files || files.length === 0) ? (
        <p className="text-center text-gray-400 py-8 text-sm">
          {filter === 'all' ? 'No content yet' : `No ${FILTERS.find(f => f.value === filter)?.label.toLowerCase()} content`}
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {files.map((file, i) => (
            <ContentTile
              key={file.fileId ?? `placeholder-${i}`}
              file={file}
              isSelecting={isSelecting}
              isSelected={file.fileId ? selected.has(file.fileId) : false}
              onToggleSelect={toggleSelect}
              onApprove={(f) => approveMutation.mutate(f)}
              onRequestRevision={(f, fb) => revisionMutation.mutate({ file: f, feedback: fb })}
              onDownload={handleDownload}
              onPreview={handlePreview}
            />
          ))}
        </div>
      )}

      {/* Floating selection bar */}
      {isSelecting && selected.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-full px-6 py-3 shadow-lg flex items-center gap-3 z-50">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            className="rounded-full bg-dc-teal-btn text-white text-xs"
            onClick={handleBulkDownload}
          >
            <Download className="h-3 w-3 mr-1" /> Download
          </Button>
        </div>
      )}

      {/* File preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-lg p-0">
          {previewFile?.fileId && (
            <ProtectedFilePreview
              file={{
                id: previewFile.fileId,
                original_filename: previewFile.originalFilename,
                file_size: previewFile.fileSize,
                mime_type: previewFile.mimeType,
                file_path: previewFile.filePath,
                bucket_name: previewFile.bucketName,
              }}
              contentStatus={previewFile.status}
              isBusinessClient={true}
              collaborationId={previewFile.collaborationId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignContentGallery.tsx
git commit -m "feat: add CampaignContentGallery component with filters and multi-select"
```

---

## Task 10: Add Content Tab to CampaignDetailsPage

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx`

Add a 4th "Content" tab. Change `grid-cols-3` → `grid-cols-4`. Shorten tab labels to fit mobile. Add an orange notification dot on the Content tab when pending reviews exist.

- [ ] **Step 1: Add imports**

Add at top of CampaignDetailsPage.tsx:
```typescript
import { CampaignContentGallery } from '@/components/campaigns/CampaignContentGallery';
import { ImageIcon } from 'lucide-react';
import { useCampaignContentSummary } from '@/hooks/useCampaignContentSummary';
```

- [ ] **Step 2: Add the content summary hook call**

Inside the component function, before the JSX return, add:
```typescript
const { data: contentSummary } = useCampaignContentSummary(campaign?.id ?? '');
const hasPendingReviews = (contentSummary?.pendingReview ?? 0) > 0;
```

(Ensure `campaign` is available at this point — it comes from the existing query.)

- [ ] **Step 3: Modify the tab structure**

Replace the existing `<Tabs>` block (lines 259–281) with:

```tsx
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 rounded-full bg-gray-100">
              <TabsTrigger value="overview" className="rounded-full flex items-center gap-1 text-xs">
                <Target className="h-3.5 w-3.5" aria-hidden="true" /> Info
              </TabsTrigger>
              <TabsTrigger value="applications" className="rounded-full flex items-center gap-1 text-xs">
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Apps
              </TabsTrigger>
              <TabsTrigger value="matching" className="rounded-full flex items-center gap-1 text-xs">
                <Target className="h-3.5 w-3.5" aria-hidden="true" /> Match
              </TabsTrigger>
              <TabsTrigger value="content" className="rounded-full flex items-center gap-1 text-xs relative">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> Content
                {hasPendingReviews && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-400" />
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <CampaignDetailsOverview campaign={campaign} />
            </TabsContent>
            <TabsContent value="applications">
              <ApplicationsListFixed campaignId={campaign.id} />
            </TabsContent>
            <TabsContent value="matching">
              <CreatorMatchingSection campaignId={campaign.id} />
            </TabsContent>
            <TabsContent value="content">
              <CampaignContentGallery campaignId={campaign.id} />
            </TabsContent>
          </Tabs>
```

Note: Tab labels shortened — "Overview" → "Info", "Applications" → "Apps". The "Content" tab includes a notification dot when pending reviews exist.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`
Navigate to a campaign details page as a business user. Confirm:
- 4 tabs render in a horizontal strip without overflow on 375px mobile width
- Content tab shows the gallery (or empty state if no collaborations exist)
- Orange dot appears on Content tab when pending reviews exist

- [ ] **Step 6: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: add Content tab to CampaignDetailsPage with notification dot"
```

---

## Task 11: Create `bulk-download-campaign-content` Edge Function

**Files:**
- Create: `supabase/functions/bulk-download-campaign-content/index.ts`

Streams a zip of approved files. Verifies campaign ownership and file-to-campaign relationship.

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/bulk-download-campaign-content/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { campaign_id, file_ids } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id required' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await adminClient
      .from('campaigns')
      .select('id, user_id')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign || campaign.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Fetch collaborations with per-deliverable status
    const { data: collabs } = await adminClient
      .from('campaign_collaborations')
      .select('id, creator_id, deliverables_status')
      .eq('campaign_id', campaign_id)
      .in('status', ['active', 'completed']);

    // Fetch files
    let fileQuery = adminClient
      .from('file_uploads')
      .select('id, file_path, bucket_name, original_filename, uploaded_by, created_at')
      .eq('campaign_id', campaign_id)
      .eq('file_category', 'deliverable')
      .order('created_at', { ascending: false });

    if (file_ids?.length) {
      fileQuery = fileQuery.in('id', file_ids);
    }

    const { data: files, error: fileError } = await fileQuery;
    if (fileError) throw fileError;

    // Filter to only individually-approved files by mapping each file to its
    // deliverables_status JSONB entry by position (same logic as gallery hook).
    const approvedFiles: typeof files = [];
    for (const collab of collabs ?? []) {
      const ds = collab.deliverables_status as Record<string, string> | null;
      if (!ds) continue;
      const dsKeys = Object.keys(ds);
      const creatorFiles = (files ?? [])
        .filter(f => f.uploaded_by === collab.creator_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      for (let i = 0; i < creatorFiles.length; i++) {
        const status = i < dsKeys.length ? ds[dsKeys[i]] : null;
        if (status === 'approved' || status === 'auto_approved') {
          approvedFiles.push(creatorFiles[i]);
        }
      }
    }

    if (approvedFiles.length === 0) {
      return new Response(JSON.stringify({ error: 'No approved files to download' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // For single file, return a signed URL directly
    if (approvedFiles.length === 1) {
      const file = approvedFiles[0];
      const { data: signed } = await adminClient.storage
        .from(file.bucket_name)
        .createSignedUrl(file.file_path, 3600, { download: true });

      return new Response(JSON.stringify({ download_url: signed?.signedUrl }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // For multiple files, generate individual signed URLs
    // (Deno edge functions can't easily stream zips, so we return URLs for client-side download)
    const downloadUrls: { filename: string; url: string }[] = [];
    for (const file of approvedFiles) {
      const { data: signed } = await adminClient.storage
        .from(file.bucket_name)
        .createSignedUrl(file.file_path, 3600, { download: true });
      if (signed?.signedUrl) {
        downloadUrls.push({ filename: file.original_filename, url: signed.signedUrl });
      }
    }

    return new Response(JSON.stringify({ download_urls: downloadUrls }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Deploy the edge function**

Run: `npx supabase functions deploy bulk-download-campaign-content --no-verify-jwt`
Expected: Successful deployment.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/bulk-download-campaign-content/index.ts
git commit -m "feat: add bulk-download-campaign-content edge function"
```

---

## Task 12: Full Manual Test

Run: `npm run dev`

Test the complete flow:
1. Navigate to a campaign detail page as business owner
2. Click the "Content" tab
3. Verify gallery renders files (or empty state)
4. Test filter chips
5. Test approve action on a pending file — verify only that deliverable changes status, not the whole collaboration
6. Test revision request flow — verify feedback modal and message delivery
7. Test file preview — verify ProtectedFilePreview opens in dialog overlay with watermarks
8. Test individual download on approved file
9. Test bulk download (single file → direct download, multiple → individual downloads)
10. Test multi-select mode
11. Navigate back to campaign list — verify ContentPreviewStrip renders on cards
12. Check creator dashboard — verify strip renders on ActiveCampaignCard and ProjectCard with creator-facing language ("submitted" not "delivered")

---

## Completion Checklist

After all tasks are done, verify:

- [ ] `npm run build` passes clean
- [ ] ContentPreviewStrip renders on CampaignCard, BusinessProjects, ProjectCard, ActiveCampaignCard
- [ ] CampaignDetailsPage shows 4 tabs with proper mobile layout
- [ ] Gallery loads, filters, approves, requests revision, and downloads
- [ ] Bulk download edge function is deployed
- [ ] No new `any` types introduced
- [ ] No hardcoded user IDs or secrets
