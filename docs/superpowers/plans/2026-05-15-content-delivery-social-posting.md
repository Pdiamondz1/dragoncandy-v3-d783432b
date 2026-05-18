# Content Delivery & Social Posting System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken content delivery flows between Restaurant, Creator, and Brand roles — then wire up post-approval social posting so every role gets a one-tap path from "content approved" to "posted on social."

**Architecture:** Per-deliverable upload slots replace the bulk upload dialog, giving creators and restaurants clear progress tracking. Post-approval, each role gets inline social prompts (Restaurant → schedule drafts, Creator → cross-post, Brand → amplify with real media). Two independent bug fixes (message badges, invite UX) are included as separate phases.

**Tech Stack:** React 18, TypeScript strict, React Query, Supabase (Postgres + Edge Functions), Outstand SDK (social posting proxy), shadcn/ui, Tailwind with `dc-*` tokens.

**Source spec:** `docs/Content_Delivery_Social_Posting_System.md`

---

## Scope & Phasing

Three independent subsystems, executable in any order:

| Phase | Steps | Scope | Est. Tasks |
|-------|-------|-------|------------|
| A — Content Delivery + Social Posting | 1–8 | Core flow across all 3 roles | 8 tasks |
| B — Message Badge Fix | 9 | Standalone bug fix | 1 task |
| C — Creator Invite UX | 10 | Standalone redesign | 1 task |

Dependencies within Phase A:

```
Task 1 (upload infra) → Task 2 (submit for review)
Task 2 → Task 3 (restaurant social prompt)
Task 2 → Task 4 (creator CrossPost)
Tasks 3,4 → Task 5 (brand content + media URLs)
Task 5 → Task 6 (brand schedule fix)
Task 5 → Task 7 (SocialPostStatus)
Task 7 → Task 8 (SocialNudgeBanner)
```

## File Structure — New Components

| File | Responsibility |
|------|---------------|
| `src/components/campaigns/SubmitForReviewButton.tsx` | Creator's submit CTA — checks deliverable progress, confirms, mutates `content_status` |
| `src/components/campaigns/SocialPostStatus.tsx` | Compact card showing draft/scheduled/published counts per campaign per user |
| `src/components/campaigns/SocialNudgeBanner.tsx` | Dismissible inline nudge banner after content approval, all roles |

## File Structure — Modified Files

| File | What Changes |
|------|-------------|
| `src/hooks/useProjectFileUpload.ts` | Accept `deliverableId`, write it to `file_uploads.metadata` |
| `src/components/projects/ProjectFileUpload.tsx` | Accept `deliverableId` + `deliverableLabel`, support controlled open/close |
| `src/components/projects/upload/FileUploadDropzone.tsx` | Accept `accept` override for content-type filtering, fix gray colors |
| `src/components/projects/DeliverableCard.tsx` | Fix gray `bg-gray-100` → teal-light |
| `src/components/my-campaigns/ActivePhaseView.tsx` | Per-deliverable upload wiring, progress counter, submit button, CrossPostPrompt |
| `src/components/my-campaigns/CompletedPhaseView.tsx` | Social share CTA, SocialPostStatus |
| `src/components/campaigns/detail/ContentReviewSection.tsx` | Replace static approved banner → actionable social prompt card |
| `src/pages/BrandCampaignDetails.tsx` | Mount CampaignContentGallery (read-only), pass real mediaUrls to SponsorshipAmplificationPrompt |
| `src/components/outstand/SponsorshipAmplificationPrompt.tsx` | Replace "coming soon" toast → navigate to compose tab |
| `src/pages/CampaignDetailsPage.tsx` | Mount SocialNudgeBanner in business view |
| `src/components/messages/ConversationMessageThread.tsx` | Fix markedRef to track message count |
| `src/components/messages/MessageThread.tsx` | Same markedRef fix |
| `src/hooks/useMessageMutations.ts` | Invalidate `['unread-counts']` on mark-as-read |
| `src/hooks/useConversations.ts` | Reduce staleTime 120s → 30s |
| `src/components/campaigns/InviteToCampaignModal.tsx` | Visual campaign cards, Donny-generated note, already-invited badge |
| `src/components/campaign-details/InvitationBanner.tsx` | Replace amber bar → card with Quick Apply + Decline CTAs |

## Existing Code to Reuse

| Component/Hook | Location | Reuse |
|---------------|----------|-------|
| `CampaignContentGallery` | `src/components/campaigns/CampaignContentGallery.tsx` | Brand content visibility — already has approve/revise/download/bulk-download, filter chips, preview dialog |
| `useCampaignContentGallery` | `src/hooks/useCampaignContentGallery.ts` | Query for `GalleryFile[]` by campaignId + status filter |
| `CrossPostPrompt` | `src/components/outstand/CrossPostPrompt.tsx` | Creator cross-posting — built, just never mounted post-approval |
| `SponsorshipAmplificationPrompt` | `src/components/outstand/SponsorshipAmplificationPrompt.tsx` | Brand amplification — works, needs real media URLs |
| `DragonCandyOutstandProvider` | `src/integrations/outstand/Provider.tsx` | Required wrapper for Outstand hooks — `SponsorshipAmplificationPrompt` self-wraps, `CrossPostPrompt` does NOT |
| `useDraftPosts` | `src/hooks/useDraftPosts.ts` | Query key `['draft-posts', userId]`, returns drafts + scheduleDraft mutation |
| `useDonnyNudges` | `src/hooks/useDonnyNudges.ts` | Full CRUD + Realtime for `donny_nudges` table |
| `useFileUploads` | `src/hooks/useFileQuery.ts` | Query key `['file-uploads', campaignId, category, uploadedBy]` |
| `useCampaignDeliverables` | `src/hooks/useCampaignDeliverables.ts` | Query key `['campaign_deliverables', campaignId]` |
| `useDeclineInvitation` | `src/hooks/useCampaignInvitations.ts` | Mutation for declining invitations |
| `OneTapApplySheet` | `src/components/campaigns/OneTapApplySheet.tsx` | Donny-powered quick apply — reuse for invitation accept |

---

# Phase A — Content Delivery & Social Posting

## Task 1: Per-Deliverable Upload Infrastructure

Wire `deliverableId` through the upload stack so files are tagged with which deliverable they fulfill.

**Files:**
- Modify: `src/hooks/useProjectFileUpload.ts` (line 86: metadata object)
- Modify: `src/components/projects/ProjectFileUpload.tsx` (props interface, dialog title)
- Modify: `src/components/projects/upload/FileUploadDropzone.tsx` (accept filter, gray colors)
- Modify: `src/components/projects/DeliverableCard.tsx` (gray color fix)

- [ ] **Step 1: Add `deliverableId` to upload hook metadata**

In `src/hooks/useProjectFileUpload.ts`, add optional `deliverableId` to the props interface and include it in the metadata written to `file_uploads`:

```typescript
// Props interface (~line 9)
interface UseProjectFileUploadProps {
  campaignId: string;
  campaignTitle: string;
  deliverableId?: string;
  onUploadComplete?: () => void;
}

// In handleUpload (~line 86), add to metadata:
metadata: {
  campaign_title: campaignTitle,
  upload_type: 'deliverable',
  campaign_id: campaignId,
  uploaded_at: new Date().toISOString(),
  ...(deliverableId && { deliverable_id: deliverableId }),
},
```

- [ ] **Step 2: Make `ProjectFileUpload` accept deliverable props and support controlled open**

In `src/components/projects/ProjectFileUpload.tsx`, update props:

```typescript
interface ProjectFileUploadProps {
  campaignId: string;
  campaignTitle: string;
  deliverableId?: string;
  deliverableLabel?: string;
  acceptFilter?: string;        // e.g. "video/*" or "image/*"
  open?: boolean;               // controlled mode
  onOpenChange?: (open: boolean) => void;
  onUploadComplete?: () => void;
}
```

- Pass `deliverableId` to `useProjectFileUpload`.
- When `deliverableLabel` is set, change dialog title from `"Upload Deliverables for {campaignTitle}"` to `"Upload: {deliverableLabel}"`.
- Pass `acceptFilter` to `FileUploadDropzone` as `accept` override.
- Support controlled mode: when `open` and `onOpenChange` are provided, use them instead of internal Dialog state. When not provided, render the existing trigger button (backward compat).

- [ ] **Step 3: Add `accept` override to `FileUploadDropzone` and fix gray colors**

In `src/components/projects/upload/FileUploadDropzone.tsx`:

```typescript
interface FileUploadDropzoneProps {
  onDrop: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
  fileRejections: FileRejection[];
  acceptOverride?: Record<string, string[]>;  // e.g. { 'video/*': [] }
}
```

- Use `acceptOverride` in `useDropzone({ accept: acceptOverride ?? defaultAccept })`.
- Replace `border-gray-300 hover:border-gray-400` → `border-teal-300 hover:border-teal-400`.
- Replace `bg-blue-50` → `bg-teal-50/30`.
- Replace `text-gray-400`, `text-gray-700`, `text-gray-500` → `text-dc-text-muted` and `text-dc-text`.
- Remove unused `acceptedFiles` prop.

- [ ] **Step 4: Fix gray color in `DeliverableCard`**

In `src/components/projects/DeliverableCard.tsx` (~line 44), replace `'bg-gray-100'` in the pending state icon background → `'bg-teal-50'`.

- [ ] **Step 5: Build and verify**

```bash
npm run build && npm run typecheck
```

Expected: clean build. No behavior change yet — just plumbing.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useProjectFileUpload.ts src/components/projects/ProjectFileUpload.tsx src/components/projects/upload/FileUploadDropzone.tsx src/components/projects/DeliverableCard.tsx
git commit -m "feat: add per-deliverable upload infrastructure with deliverableId metadata"
```

---

## Task 2: Per-Deliverable Upload UX + Submit for Review

Wire per-deliverable upload slots in `ActivePhaseView` and add the "Submit for Review" CTA.

**Files:**
- Modify: `src/components/my-campaigns/ActivePhaseView.tsx`
- Create: `src/components/campaigns/SubmitForReviewButton.tsx`

- [ ] **Step 1: Create `SubmitForReviewButton` component**

```typescript
// src/components/campaigns/SubmitForReviewButton.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SubmitForReviewButtonProps {
  collaborationId: string;
  campaignId: string;
  uploadedCount: number;
  totalCount: number;
  contentStatus: string;
  disabled?: boolean;
}

export function SubmitForReviewButton({
  collaborationId,
  campaignId,
  uploadedCount,
  totalCount,
  contentStatus,
  disabled,
}: SubmitForReviewButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('campaign_collaborations')
        .update({
          content_status: 'submitted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', collaborationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Content submitted for review!');
      queryClient.invalidateQueries({ queryKey: ['collaboration', collaborationId] });
      queryClient.invalidateQueries({ queryKey: ['file-uploads', campaignId] });
    },
    onError: (err: Error) => toast.error(`Submit failed: ${err.message}`),
  });

  const alreadySubmitted = contentStatus === 'submitted' || contentStatus === 'approved';
  const noFiles = uploadedCount === 0;
  const isPartial = uploadedCount > 0 && uploadedCount < totalCount;

  if (alreadySubmitted) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
        <p className="text-sm font-medium text-teal-700">
          {contentStatus === 'submitted' ? 'Submitted — waiting for review' : 'Content approved!'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <p className="text-xs text-dc-text-muted text-center">
          {uploadedCount} of {totalCount} deliverables uploaded
        </p>
        <Button
          className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold"
          disabled={noFiles || disabled || submitMutation.isPending}
          onClick={() => {
            if (isPartial) {
              setShowConfirm(true);
            } else {
              submitMutation.mutate();
            }
          }}
        >
          <Send className="h-4 w-4 mr-2" />
          {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
        </Button>
        {noFiles && (
          <p className="text-xs text-dc-text-muted text-center">
            Upload your deliverables above, then submit for review
          </p>
        )}
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Not all deliverables uploaded
            </AlertDialogTitle>
            <AlertDialogDescription>
              You've uploaded {uploadedCount} of {totalCount} deliverables.
              Submit anyway? You can upload more later if the client requests revisions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white"
              onClick={() => submitMutation.mutate()}
            >
              Submit Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Wire per-deliverable uploads and submit button in `ActivePhaseView`**

In `src/components/my-campaigns/ActivePhaseView.tsx`:

1. Add state for per-deliverable upload dialog:
```typescript
const [activeDeliverableUpload, setActiveDeliverableUpload] = useState<{
  id: string;
  label: string;
  contentType: string;
} | null>(null);
```

2. Import `useCampaignDeliverables` and compute progress:
```typescript
const { data: deliverables } = useCampaignDeliverables(campaign.id);
const totalDeliverables = deliverables?.length ?? 0;
const uploadedCount = deliverables?.filter(d => {
  const match = files?.find(f =>
    (f.metadata as Record<string, unknown>)?.deliverable_id === d.id
  );
  return !!match;
}).length ?? 0;
```

3. Wire each `DeliverableCard`'s `onUpload` to open a per-deliverable dialog:
```typescript
<DeliverableCard
  key={d.id}
  deliverable={d}
  status={deliverablesStatus[d.id] ?? 'pending'}
  uploadedFile={matchedFile}
  onUpload={() => setActiveDeliverableUpload({
    id: d.id,
    label: `${d.platform ?? ''} ${d.content_type}`.trim(),
    contentType: d.content_type,
  })}
/>
```

4. Render one controlled `ProjectFileUpload` dialog:
```typescript
<ProjectFileUpload
  campaignId={campaign.id}
  campaignTitle={campaign.title}
  deliverableId={activeDeliverableUpload?.id}
  deliverableLabel={activeDeliverableUpload?.label}
  acceptFilter={activeDeliverableUpload?.contentType === 'video' ? 'video/*' : undefined}
  open={!!activeDeliverableUpload}
  onOpenChange={(open) => { if (!open) setActiveDeliverableUpload(null); }}
  onUploadComplete={() => setActiveDeliverableUpload(null)}
/>
```

5. Add `SubmitForReviewButton` after the deliverables list, before Messages CTA:
```typescript
<SubmitForReviewButton
  collaborationId={collaborationId}
  campaignId={campaign.id}
  uploadedCount={uploadedCount}
  totalCount={totalDeliverables}
  contentStatus={collaboration?.content_status ?? 'pending'}
/>
```

6. Keep the existing "Upload Work" button as fallback for non-deliverable files.

- [ ] **Step 3: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 4: Manual verification**

Open dev server (`npm run dev`), navigate to a creator's active campaign. Verify:
- Each deliverable card has its own "Upload" button
- Clicking opens a focused dialog with deliverable-specific title
- Progress counter shows "X of Y deliverables uploaded"
- "Submit for Review" button appears, disabled when no files uploaded
- Partial upload shows confirmation dialog before submitting

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/SubmitForReviewButton.tsx src/components/my-campaigns/ActivePhaseView.tsx
git commit -m "feat: per-deliverable upload slots and Submit for Review button"
```

---

## Task 3: Restaurant — Inline Social Prompt After Content Approval

Replace the static "Head to your Outstand drafts" text with an actionable card.

**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx` (lines 296-306)

- [ ] **Step 1: Replace static approved banner with actionable social prompt**

In `ContentReviewSection.tsx`, find the approved state block (~lines 296-306) and replace with:

```typescript
// Add import at top:
import { useDraftPosts } from '@/hooks/useDraftPosts';
import { useNavigate } from 'react-router-dom';
import { Calendar, Eye } from 'lucide-react';

// Inside the approved state render:
const { draftCount } = useDraftPosts();
const navigate = useNavigate();

// Replace the static <p> tag with:
<div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 space-y-3">
  <div className="flex items-center gap-2">
    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    <p className="font-semibold text-dc-text">Content Approved!</p>
  </div>
  {draftCount > 0 && (
    <p className="text-sm text-dc-text-muted">
      Donny prepared {draftCount} draft {draftCount === 1 ? 'post' : 'posts'} for you
    </p>
  )}
  <div className="flex gap-2">
    <Button
      className="flex-1 rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold text-sm"
      onClick={() => navigate('/dashboard/business/social?tab=drafts')}
    >
      <Eye className="h-4 w-4 mr-1" />
      Review & Schedule
    </Button>
    <Button
      variant="outline"
      className="flex-1 rounded-full border-dc-teal text-dc-teal font-semibold text-sm"
      onClick={() => {/* dismiss — no action needed */}}
    >
      Skip for Now
    </Button>
  </div>
</div>
```

- [ ] **Step 2: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "feat: restaurant post-approval social prompt with Review & Schedule CTA"
```

---

## Task 4: Creator — Mount CrossPostPrompt After Approval

Show `CrossPostPrompt` inline when content is approved, both in active and completed views.

**Files:**
- Modify: `src/components/my-campaigns/ActivePhaseView.tsx`
- Modify: `src/components/my-campaigns/CompletedPhaseView.tsx`

- [ ] **Step 1: Mount CrossPostPrompt in ActivePhaseView when approved**

Add to `ActivePhaseView.tsx`:

```typescript
import { CrossPostPrompt } from '@/components/outstand/CrossPostPrompt';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';

// Inside the component, after existing state:
const [showCrossPost, setShowCrossPost] = useState(
  collaboration?.content_status === 'approved'
);

// After SubmitForReviewButton, conditionally render:
{collaboration?.content_status === 'approved' && (
  <DragonCandyOutstandProvider>
    <CrossPostPrompt
      open={showCrossPost}
      onOpenChange={setShowCrossPost}
      campaignId={campaign.id}
      campaignTitle={campaign.title}
      creatorName={collaboration?.creator_name ?? ''}
      mediaUrls={files?.map(f => f.signed_url).filter(Boolean) as string[] ?? []}
      originalCaption=""
    />
  </DragonCandyOutstandProvider>
)}

{collaboration?.content_status === 'approved' && !showCrossPost && (
  <Button
    variant="outline"
    className="w-full rounded-full border-dc-pink-accent text-dc-pink-accent font-semibold"
    onClick={() => setShowCrossPost(true)}
  >
    Share to Your Socials
  </Button>
)}
```

Note: `CrossPostPrompt` does not self-wrap in `DragonCandyOutstandProvider` (unlike `SponsorshipAmplificationPrompt`), so we must wrap it.

- [ ] **Step 2: Add social share CTA to CompletedPhaseView**

Add to `CompletedPhaseView.tsx`:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { CrossPostPrompt } from '@/components/outstand/CrossPostPrompt';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { useFileUploads } from '@/hooks/useFileQuery';

// Inside component:
const [showCrossPost, setShowCrossPost] = useState(false);
const { data: files } = useFileUploads(campaign.id, 'deliverable');

// After the payment breakdown section:
<Button
  variant="outline"
  className="w-full rounded-full border-dc-pink-accent text-dc-pink-accent font-semibold"
  onClick={() => setShowCrossPost(true)}
>
  <Share2 className="h-4 w-4 mr-2" />
  Share to Your Socials
</Button>

<DragonCandyOutstandProvider>
  <CrossPostPrompt
    open={showCrossPost}
    onOpenChange={setShowCrossPost}
    campaignId={campaign.id}
    campaignTitle={campaign.title}
    creatorName=""
    mediaUrls={files?.map(f => f.signed_url).filter(Boolean) as string[] ?? []}
    originalCaption=""
  />
</DragonCandyOutstandProvider>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/my-campaigns/ActivePhaseView.tsx src/components/my-campaigns/CompletedPhaseView.tsx
git commit -m "feat: mount CrossPostPrompt for creators after content approval"
```

---

## Task 5: Brand — Content Visibility + Real Media URLs

Give brands a read-only content gallery and wire real media URLs to `SponsorshipAmplificationPrompt`.

**Files:**
- Modify: `src/pages/BrandCampaignDetails.tsx`

- [ ] **Step 1: Add content gallery and fix media URLs**

In `BrandCampaignDetails.tsx`:

```typescript
import { CampaignContentGallery } from '@/components/campaigns/CampaignContentGallery';
import { useCampaignContentGallery } from '@/hooks/useCampaignContentGallery';

// Inside component, add query for approved content:
const { data: galleryFiles } = useCampaignContentGallery(campaignId, 'approved');

// Compute media URLs from gallery files for SponsorshipAmplificationPrompt:
const mediaUrls = (galleryFiles ?? [])
  .filter(f => f.fileId && f.signedUrl)
  .map(f => f.signedUrl!);
```

Add the `CampaignContentGallery` section between the `CreatorApplicationsCard` and `SponsorshipStatusCard`:

```typescript
{/* Content Delivery Section */}
{sponsorshipStatus?.status === 'accepted' && (
  <div className="space-y-3">
    <h3 className="font-bold text-dc-text">Content Delivery</h3>
    <CampaignContentGallery campaignId={campaignId} />
  </div>
)}
```

Fix the `SponsorshipAmplificationPrompt` props (currently hardcoded empty):

```typescript
<SponsorshipAmplificationPrompt
  open={showAmplify}
  onOpenChange={setShowAmplify}
  campaignId={campaignId}
  campaignTitle={campaign?.title ?? ''}
  restaurantName={restaurantProfile?.business_name ?? ''}
  creatorName={/* get from accepted application */}
  mediaUrls={mediaUrls}          // was: []
  originalCaption=""
/>
```

For `creatorName`: query the accepted application's creator name from `campaign_applications` or the collaboration, or derive from `galleryFiles[0]?.creatorName` if the hook exposes it. Check what `GalleryFile` type contains.

- [ ] **Step 2: Build and verify**

```bash
npm run build && npm run typecheck
```

Check that `GalleryFile` has `signedUrl` (or `signed_url`) — adjust property name to match actual type from `useCampaignContentGallery`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BrandCampaignDetails.tsx
git commit -m "feat: brand content gallery with real media URLs for amplification"
```

---

## Task 6: Brand — Fix Schedule Button Dead End

Replace the "coming soon" toast in `SponsorshipAmplificationPrompt` with navigation to the social compose tab.

**Files:**
- Modify: `src/components/outstand/SponsorshipAmplificationPrompt.tsx` (line 177)

- [ ] **Step 1: Replace toast with navigation**

In `SponsorshipAmplificationPrompt.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';

// Inside component:
const navigate = useNavigate();

// Replace line 177 (the Schedule button onClick):
// Was: onClick={() => toast.info('Scheduling coming soon')}
// Now:
onClick={() => {
  onOpenChange(false);
  navigate('/dashboard/brand/social?tab=compose');
}}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/SponsorshipAmplificationPrompt.tsx
git commit -m "fix: brand Schedule button navigates to social compose instead of toast"
```

---

## Task 7: SocialPostStatus Component — All Roles

Create a compact card showing social post status (draft/scheduled/published) per campaign.

**Files:**
- Create: `src/components/campaigns/SocialPostStatus.tsx`
- Modify: `src/components/my-campaigns/CompletedPhaseView.tsx`
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx`
- Modify: `src/pages/BrandCampaignDetails.tsx`

- [ ] **Step 1: Create SocialPostStatus component**

```typescript
// src/components/campaigns/SocialPostStatus.tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, FileEdit } from 'lucide-react';

interface SocialPostStatusProps {
  campaignId: string;
  socialManagerPath: string; // e.g. '/dashboard/business/social' or '/dashboard/creator/social'
}

export function SocialPostStatus({ campaignId, socialManagerPath }: SocialPostStatusProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: posts } = useQuery({
    queryKey: ['social-post-status', campaignId, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('donny_scheduled_posts')
        .select('id, status, platform, scheduled_for')
        .eq('user_id', user.id)
        .eq('campaign_id', campaignId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!campaignId,
    staleTime: 30_000,
  });

  if (!posts || posts.length === 0) return null;

  const draftCount = posts.filter(p => p.status === 'draft').length;
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const allPosted = draftCount === 0 && scheduledCount === 0 && publishedCount > 0;

  return (
    <div className="bg-white border border-teal-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-dc-text">Social Posts</p>
      <div className="flex items-center gap-4 text-xs">
        {publishedCount > 0 && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> {publishedCount} posted
          </span>
        )}
        {scheduledCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-600">
            <Clock className="h-3.5 w-3.5" /> {scheduledCount} scheduled
          </span>
        )}
        {draftCount > 0 && (
          <span className="flex items-center gap-1 text-dc-text-muted">
            <FileEdit className="h-3.5 w-3.5" /> {draftCount} drafts
          </span>
        )}
      </div>
      {allPosted ? (
        <p className="text-xs text-emerald-600 font-medium">All posted!</p>
      ) : draftCount > 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full text-xs border-dc-teal text-dc-teal"
          onClick={() => navigate(`${socialManagerPath}?tab=drafts`)}
        >
          Review Drafts
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Mount in CompletedPhaseView (creator)**

In `src/components/my-campaigns/CompletedPhaseView.tsx`, after the social share button:

```typescript
import { SocialPostStatus } from '@/components/campaigns/SocialPostStatus';

// After the payment breakdown:
<SocialPostStatus
  campaignId={campaign.id}
  socialManagerPath="/dashboard/creator/social"
/>
```

- [ ] **Step 3: Mount in ContentReviewSection (restaurant, approved state)**

In the approved block of `ContentReviewSection.tsx`, below the social prompt card from Task 3:

```typescript
import { SocialPostStatus } from '@/components/campaigns/SocialPostStatus';

<SocialPostStatus
  campaignId={campaignId}
  socialManagerPath="/dashboard/business/social"
/>
```

- [ ] **Step 4: Mount in BrandCampaignDetails (brand)**

In `BrandCampaignDetails.tsx`, below the amplification section:

```typescript
import { SocialPostStatus } from '@/components/campaigns/SocialPostStatus';

{sponsorshipStatus?.status === 'accepted' && (
  <SocialPostStatus
    campaignId={campaignId}
    socialManagerPath="/dashboard/brand/social"
  />
)}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/SocialPostStatus.tsx src/components/my-campaigns/CompletedPhaseView.tsx src/components/campaigns/detail/ContentReviewSection.tsx src/pages/BrandCampaignDetails.tsx
git commit -m "feat: SocialPostStatus component showing draft/scheduled/published counts for all roles"
```

---

## Task 8: SocialNudgeBanner — Unified Post-Approval Nudge

Surface `donny_nudges` inline on campaign detail pages for all roles.

**Files:**
- Create: `src/components/campaigns/SocialNudgeBanner.tsx`
- Modify: `src/pages/CampaignDetailsPage.tsx`
- Modify: `src/components/my-campaigns/ActivePhaseView.tsx`
- Modify: `src/components/my-campaigns/CompletedPhaseView.tsx`
- Modify: `src/pages/BrandCampaignDetails.tsx`

- [ ] **Step 1: Create SocialNudgeBanner component**

```typescript
// src/components/campaigns/SocialNudgeBanner.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Share2, Eye } from 'lucide-react';

interface SocialNudgeBannerProps {
  campaignId: string;
  socialManagerPath: string;
}

export function SocialNudgeBanner({ campaignId, socialManagerPath }: SocialNudgeBannerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: nudge } = useQuery({
    queryKey: ['social-nudge', campaignId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('donny_nudges')
        .select('id, nudge_type, source_table, metadata')
        .eq('user_id', user.id)
        .eq('source_table', 'campaign_social_hooks')
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      // Check if this nudge relates to our campaign via metadata
      if (data?.metadata && (data.metadata as Record<string, unknown>).campaign_id === campaignId) {
        return data;
      }
      return null;
    },
    enabled: !!user && !!campaignId,
    staleTime: 30_000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (nudgeId: string) => {
      const { error } = await supabase
        .from('donny_nudges')
        .update({ status: 'dismissed' })
        .eq('id', nudgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-nudge', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['donny-nudges'] });
    },
  });

  if (!nudge) return null;

  return (
    <div className="bg-gradient-to-r from-teal-50 to-pink-50 border border-teal-200 rounded-2xl p-4 relative">
      <button
        className="absolute top-2 right-2 text-dc-text-muted hover:text-dc-text"
        onClick={() => dismissMutation.mutate(nudge.id)}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="font-semibold text-dc-text text-sm mb-2">
        Your content is ready to share!
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white text-xs font-bold flex-1"
          onClick={() => navigate(`${socialManagerPath}?tab=compose`)}
        >
          <Share2 className="h-3 w-3 mr-1" /> Post Now
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-dc-teal text-dc-teal text-xs font-semibold flex-1"
          onClick={() => navigate(`${socialManagerPath}?tab=drafts`)}
        >
          <Eye className="h-3 w-3 mr-1" /> Review Draft
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in business campaign detail view**

In `src/pages/CampaignDetailsPage.tsx`, add inside the campaign detail layout where appropriate (within the delivery/completed phase sections):

```typescript
import { SocialNudgeBanner } from '@/components/campaigns/SocialNudgeBanner';

// In the rendered layout:
<SocialNudgeBanner
  campaignId={campaignId}
  socialManagerPath="/dashboard/business/social"
/>
```

- [ ] **Step 3: Mount in creator views**

In `ActivePhaseView.tsx` (after approval state rendering) and `CompletedPhaseView.tsx`:

```typescript
import { SocialNudgeBanner } from '@/components/campaigns/SocialNudgeBanner';

<SocialNudgeBanner
  campaignId={campaign.id}
  socialManagerPath="/dashboard/creator/social"
/>
```

- [ ] **Step 4: Mount in brand view**

In `BrandCampaignDetails.tsx`, within the accepted sponsorship section:

```typescript
import { SocialNudgeBanner } from '@/components/campaigns/SocialNudgeBanner';

{sponsorshipStatus?.status === 'accepted' && (
  <SocialNudgeBanner
    campaignId={campaignId}
    socialManagerPath="/dashboard/brand/social"
  />
)}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/SocialNudgeBanner.tsx src/pages/CampaignDetailsPage.tsx src/components/my-campaigns/ActivePhaseView.tsx src/components/my-campaigns/CompletedPhaseView.tsx src/pages/BrandCampaignDetails.tsx
git commit -m "feat: SocialNudgeBanner with dismiss, mounted in all three role views"
```

---

# Phase B — Message Badge Fix (Independent)

## Task 9: Fix Message Read Receipts and Badge Clearing

Two bugs: (1) `markedRef` prevents re-marking new messages in open conversations, (2) `['unread-counts']` query never invalidated on mark-as-read.

**Files:**
- Modify: `src/components/messages/ConversationMessageThread.tsx` (lines 23-30)
- Modify: `src/components/messages/MessageThread.tsx` (lines 32-37)
- Modify: `src/hooks/useMessageMutations.ts` (line 216)
- Modify: `src/hooks/useConversations.ts` (staleTime)

- [ ] **Step 1: Fix markedRef in ConversationMessageThread**

In `src/components/messages/ConversationMessageThread.tsx`, replace the `markedRef` pattern (~lines 23-30):

```typescript
// Before:
const markedRef = useRef<string | null>(null);
useEffect(() => {
  if (conversationId && user && !isLoading && messages.length > 0) {
    if (markedRef.current !== conversationId) {
      markedRef.current = conversationId;
      markAsRead.mutate({ conversationId });
    }
  }
}, [conversationId, user, isLoading, messages.length]);

// After:
const lastMarkedRef = useRef<{ id: string; count: number } | null>(null);
useEffect(() => {
  if (conversationId && user && !isLoading && messages.length > 0) {
    const current = { id: conversationId, count: messages.length };
    if (
      lastMarkedRef.current?.id !== current.id ||
      lastMarkedRef.current?.count !== current.count
    ) {
      lastMarkedRef.current = current;
      markAsRead.mutate({ conversationId });
    }
  }
}, [conversationId, user, isLoading, messages.length]);
```

- [ ] **Step 2: Apply same fix to MessageThread**

In `src/components/messages/MessageThread.tsx`, replace the same `markedRef` pattern (~lines 32-37):

```typescript
const lastMarkedRef = useRef<{ id: string; count: number } | null>(null);
useEffect(() => {
  if (campaignId && user && !isLoading && messages.length > 0) {
    const current = { id: campaignId, count: messages.length };
    if (
      lastMarkedRef.current?.id !== current.id ||
      lastMarkedRef.current?.count !== current.count
    ) {
      lastMarkedRef.current = current;
      markAsRead.mutate({ campaignId });
    }
  }
}, [campaignId, user, isLoading, messages.length]);
```

- [ ] **Step 3: Invalidate `['unread-counts']` on mark-as-read**

In `src/hooks/useMessageMutations.ts`, find `useMarkMessagesAsRead` `onSuccess` (~line 216) and add the invalidation:

```typescript
// Before:
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
},

// After:
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
  queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
},
```

- [ ] **Step 4: Reduce staleTime for conversations**

In `src/hooks/useConversations.ts`, in the `useConversations` hook options:

```typescript
// Before:
staleTime: 120_000,

// After:
staleTime: 30_000,
```

- [ ] **Step 5: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 6: Manual verification**

1. Open a conversation with unread messages → badge should clear immediately
2. Keep conversation open → have another user send a message → new message should auto-mark as read (badge stays at 0)
3. Navigate away and back → badge should not reappear for already-read messages

- [ ] **Step 7: Commit**

```bash
git add src/components/messages/ConversationMessageThread.tsx src/components/messages/MessageThread.tsx src/hooks/useMessageMutations.ts src/hooks/useConversations.ts
git commit -m "fix: message badges clear on read and re-mark on new messages in open conversations"
```

---

# Phase C — Creator Invite UX Redesign (Independent)

## Task 10: Redesign InviteToCampaignModal + InvitationBanner

Replace minimal dropdown with visual campaign cards and add action CTAs to the invitation banner.

**Files:**
- Modify: `src/components/campaigns/InviteToCampaignModal.tsx`
- Modify: `src/components/campaign-details/InvitationBanner.tsx`

- [ ] **Step 1: Redesign InviteToCampaignModal with visual campaign cards**

Rewrite `src/components/campaigns/InviteToCampaignModal.tsx`:

```typescript
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaignInvitations, useInviteCreator } from '@/hooks/useCampaignInvitations';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Send, CheckCircle2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InviteToCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorId: string;
  creatorName: string;
}

export function InviteToCampaignModal({
  open,
  onOpenChange,
  creatorId,
  creatorName,
}: InviteToCampaignModalProps) {
  const { user } = useAuth();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [personalNote, setPersonalNote] = useState('');
  const inviteCreator = useInviteCreator();

  const { data: campaigns } = useQuery({
    queryKey: ['my-published-campaigns-for-invite', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, title, status, budget, deadline, ai_analysis, delivery_type')
        .eq('user_id', user.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!user,
  });

  // Get existing invitations to show "Already invited" badge
  const campaignIds = campaigns?.map(c => c.id) ?? [];
  const { data: existingInvitations } = useQuery({
    queryKey: ['invitations-for-creator', creatorId, campaignIds],
    queryFn: async () => {
      if (campaignIds.length === 0) return [];
      const { data, error } = await supabase
        .from('campaign_invitations')
        .select('campaign_id')
        .eq('creator_id', creatorId)
        .in('campaign_id', campaignIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && campaignIds.length > 0,
  });

  const invitedCampaignIds = useMemo(
    () => new Set(existingInvitations?.map(i => i.campaign_id) ?? []),
    [existingInvitations]
  );

  const handleSend = () => {
    if (!selectedCampaignId) return;
    inviteCreator.mutate(
      { campaignId: selectedCampaignId, creatorId, message: personalNote || undefined },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${creatorName}!`);
          setSelectedCampaignId(null);
          setPersonalNote('');
          onOpenChange(false);
        },
        onError: (err: Error) => toast.error(err.message),
      }
    );
  };

  const selectedCampaign = campaigns?.find(c => c.id === selectedCampaignId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
        <SheetHeader>
          <SheetTitle className="text-dc-text">
            Invite {creatorName} to a Campaign
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="mt-4 max-h-[50vh]">
          <div className="space-y-2 pr-4">
            {campaigns?.map(campaign => {
              const isInvited = invitedCampaignIds.has(campaign.id);
              const isSelected = selectedCampaignId === campaign.id;
              const emoji = (campaign.ai_analysis as Record<string, unknown>)?.emoji as string ?? '📋';
              const spotsInfo = (campaign.ai_analysis as Record<string, unknown>)?.creator_count as number;

              return (
                <button
                  key={campaign.id}
                  disabled={isInvited}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  className={`w-full text-left p-3 rounded-2xl border-2 transition-colors ${
                    isSelected
                      ? 'border-dc-teal bg-teal-50'
                      : isInvited
                      ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-transparent bg-white hover:border-teal-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-dc-text text-sm truncate">
                          {campaign.title}
                        </p>
                        {isInvited && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Invited
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-dc-text-muted">
                        {campaign.budget && <span>${campaign.budget}</span>}
                        {campaign.delivery_type && (
                          <span className="capitalize">{campaign.delivery_type}</span>
                        )}
                        {spotsInfo && <span>{spotsInfo} creators</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {selectedCampaign && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-dc-text-muted">Personal note (optional)</label>
              <Textarea
                placeholder={`Hey ${creatorName}, I think you'd be a great fit for ${selectedCampaign.title}...`}
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                className="mt-1 rounded-xl resize-none"
                rows={3}
              />
            </div>
            <Button
              className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold"
              disabled={inviteCreator.isPending}
              onClick={handleSend}
            >
              <Send className="h-4 w-4 mr-2" />
              {inviteCreator.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Redesign InvitationBanner with action CTAs**

Rewrite `src/components/campaign-details/InvitationBanner.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { CheckCircle2, X, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface InvitationBannerProps {
  businessName?: string;
  campaignId?: string;
  campaignTitle?: string;
  invitationId?: string;
  onQuickApply?: () => void;
  onDecline?: () => void;
}

export function InvitationBanner({
  businessName,
  campaignId,
  campaignTitle,
  onQuickApply,
  onDecline,
}: InvitationBannerProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-gradient-to-r from-teal-50 to-pink-50 border border-teal-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-dc-text text-sm">You're invited!</p>
          {businessName && (
            <p className="text-xs text-dc-text-muted mt-0.5">
              {businessName} wants to work with you
              {campaignTitle ? ` on "${campaignTitle}"` : ''}
            </p>
          )}
        </div>
        {onDecline && (
          <button
            onClick={onDecline}
            className="text-dc-text-muted hover:text-dc-text p-1"
            aria-label="Decline invitation"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex gap-2">
        {campaignId && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full text-xs border-dc-teal text-dc-teal font-semibold flex-1"
            onClick={() => navigate(`/campaigns/${campaignId}`)}
          >
            <Eye className="h-3 w-3 mr-1" /> View Campaign
          </Button>
        )}
        {onQuickApply && (
          <Button
            size="sm"
            className="rounded-full text-xs bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold flex-1"
            onClick={onQuickApply}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" /> Quick Apply
          </Button>
        )}
      </div>
    </div>
  );
}
```

Note: This is a breaking change to `InvitationBanner` props. Find all callsites and update them to pass the new props. Currently the banner is likely rendered in campaign detail views where `campaignId` and `businessName` are available.

- [ ] **Step 3: Update InvitationBanner callsites**

Search for all imports of `InvitationBanner` and update to pass the new props (`campaignId`, `campaignTitle`, `onQuickApply`, `onDecline`). Wire `onQuickApply` to open `OneTapApplySheet` and `onDecline` to `useDeclineInvitation`.

- [ ] **Step 4: Build and verify**

```bash
npm run build && npm run typecheck
```

- [ ] **Step 5: Manual verification**

1. Browse Creators → click "Invite" on a creator card → modal shows visual campaign cards with budget/delivery type
2. Campaigns already invited to show "Invited" badge and are disabled
3. Select a campaign → personal note textarea appears with placeholder
4. Send → toast confirms, modal closes
5. As creator → invitation banner shows campaign name, business name, "View Campaign" and "Quick Apply" buttons
6. "Quick Apply" opens OneTapApplySheet
7. Decline (X) removes the invitation

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/InviteToCampaignModal.tsx src/components/campaign-details/InvitationBanner.tsx
git commit -m "feat: redesign invite modal with visual campaign cards and banner with Quick Apply/Decline"
```

---

## Verification Checklist (All Phases)

After all tasks complete, verify end-to-end:

- [ ] **Upload flow**: Campaign requests 3 deliverables → Creator sees 3 upload slots → Upload to slot 1 → Progress shows "1 of 3" → File tagged with `deliverable_id` in metadata
- [ ] **Submit flow**: All uploaded → "Submit for Review" enabled → Tap → `content_status = 'submitted'` → Restaurant sees content in review
- [ ] **Restaurant social**: Approve content → Inline card "Donny prepared N draft posts" → "Review & Schedule" → navigates to drafts
- [ ] **Creator social**: Content approved → CrossPostPrompt opens → Post/schedule/skip
- [ ] **Brand flow**: Sponsorship accepted → Content gallery visible (read-only) → "Amplify" passes real media URLs → Schedule navigates to compose
- [ ] **Completed state**: All roles see `SocialPostStatus` with draft/scheduled/published counts
- [ ] **Nudge banner**: All roles see dismissible nudge after approval, links to post/review-draft
- [ ] **Message badges**: Open conversation → badges clear → new message arrives → auto-marked → badge stays 0
- [ ] **Invite flow**: Visual campaign cards, "Already invited" badge, Quick Apply + Decline on banner
- [ ] `npm run build` passes
- [ ] `npm run typecheck` passes
- [ ] Mobile viewport (375px) — all new CTAs are full-width pills
