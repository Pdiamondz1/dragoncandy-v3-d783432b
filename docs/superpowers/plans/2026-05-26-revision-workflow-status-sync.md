# Revision Workflow & Campaign Status Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four interrelated issues with the revision workflow — card deduplication, per-item revision requests, creator revision awareness, and content-status-aware campaign cards.

**Architecture:** Five surgical file edits, no new files, no migrations, no edge functions. All changes are frontend React components/hooks. The existing `revision_feedback` JSONB on `campaign_collaborations` and `DeliverableCard` feedback rendering are reused without modification.

**Tech Stack:** React 18, TypeScript (strict), Tailwind CSS, React Query, Supabase JS client, Lucide icons, shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-05-26-revision-workflow-status-sync-design.md`

---

## Task 1: Card Deduplication (MyCampaignsPage)

**Files:**
- Modify: `src/pages/MyCampaignsPage.tsx:31-46` (accepted apps memo + tab count)

**Context:** When both an accepted application and an active collaboration exist for the same campaign, the Active tab renders two cards — a stale "Accepted / Awaiting project start" card above the real "Active" card. The fix filters out accepted applications that already have a collaboration.

- [ ] **Step 1: Add deduplication filter**

In `src/pages/MyCampaignsPage.tsx`, find the `acceptedApps` memo (line 31-34):

```ts
const acceptedApps = useMemo(
  () => applications.filter((a) => a.status === 'accepted'),
  [applications],
);
```

Replace with a memo that also excludes apps with an active collab for the same campaign:

```ts
const acceptedApps = useMemo(
  () => applications.filter(
    (a) => a.status === 'accepted' && !activeCollabs.some((c) => c.campaign_id === a.campaign_id)
  ),
  [applications, activeCollabs],
);
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyCampaignsPage.tsx
git commit -m "fix: deduplicate accepted apps with existing active collaborations"
```

---

## Task 2: ProjectStepper Fix for revision_requested

**Files:**
- Modify: `src/components/projects/ProjectStepper.tsx:15-27` (getCreatorStep function)

**Context:** `getCreatorStep()` has a `switch` on `contentStatus`. The `'revision_requested'` value falls through to `default`, returning 0 ("Brief"). This is wrong — a revision means the creator needs to re-upload, so the stepper should show step 2 ("Upload").

- [ ] **Step 1: Add revision_requested case**

In `src/components/projects/ProjectStepper.tsx`, find the `getCreatorStep` function (line 15-27):

```ts
export function getCreatorStep(contentStatus: string | null, hasUploadedFiles: boolean): number {
  switch (contentStatus) {
    case 'approved':
    case 'auto_approved':
      return 4;
    case 'submitted':
      return 3;
    case 'in_progress':
      return hasUploadedFiles ? 2 : 1;
    default:
      return 0;
  }
}
```

Add the `revision_requested` case before `default`:

```ts
export function getCreatorStep(contentStatus: string | null, hasUploadedFiles: boolean): number {
  switch (contentStatus) {
    case 'approved':
    case 'auto_approved':
      return 4;
    case 'submitted':
      return 3;
    case 'revision_requested':
      return 2;
    case 'in_progress':
      return hasUploadedFiles ? 2 : 1;
    default:
      return 0;
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectStepper.tsx
git commit -m "fix: getCreatorStep returns Upload step for revision_requested"
```

---

## Task 3: MyCampaignCard Content Status Awareness

**Files:**
- Modify: `src/components/my-campaigns/MyCampaignCard.tsx:27-41,78-102` (status/CTA config + active variant rendering)

**Context:** The `active` card variant always shows "Active" badge and "Upload →" CTA. It should reflect `collaboration.content_status`: submitted → "Submitted" badge, revision_requested → "Revision Needed" badge, approved → "Approved" badge.

The `CreatorCollaboration` type (from `useCreatorCollaborations.ts:26-41`) already includes `content_status: string | null`, and the card already receives `collaboration?: CreatorCollaboration` as a prop.

- [ ] **Step 1: Add content-status override logic**

In `src/components/my-campaigns/MyCampaignCard.tsx`, after the existing `statusConfig` and `ctaConfig` Record definitions (lines 27-41), add a helper function that computes overrides for the `active` variant:

```ts
function getActiveOverrides(contentStatus: string | null): {
  status?: { label: string; className: string };
  cta?: { label: string; className: string };
  hint?: string;
} {
  switch (contentStatus) {
    case 'submitted':
      return {
        status: { label: '📤 Submitted', className: 'bg-blue-50 text-blue-800' },
        cta: { label: 'View →', className: 'text-dc-teal' },
        hint: 'Awaiting review',
      };
    case 'revision_requested':
      return {
        status: { label: '⚠️ Revision Needed', className: 'bg-amber-50 text-amber-800' },
        cta: { label: 'Revise →', className: 'text-white bg-amber-500 px-3 py-1.5 rounded-full text-xs' },
        hint: 'Revision requested',
      };
    case 'approved':
    case 'auto_approved':
      return {
        status: { label: '✅ Approved', className: 'bg-green-50 text-green-800' },
        cta: { label: 'View →', className: 'text-dc-teal' },
        hint: 'Content approved',
      };
    default:
      return {};
  }
}
```

- [ ] **Step 2: Apply overrides in the component body**

In the `MyCampaignCard` component body (around line 55-58), after the existing `const status = statusConfig[variant]` etc., apply the overrides when variant is `active`:

Replace:

```ts
const timeContext = getTimeContext(variant, application, collaboration);
const status = statusConfig[variant];
const cta = ctaConfig[variant];
const deliverableProgress = getDeliverableProgress(collaboration);
const deadlineUrgency = getDeadlineUrgency(collaboration);
```

With:

```ts
const timeContext = getTimeContext(variant, application, collaboration);
const activeOverrides: ReturnType<typeof getActiveOverrides> = variant === 'active'
  ? getActiveOverrides(collaboration?.content_status ?? null)
  : {};
const status = activeOverrides.status ?? statusConfig[variant];
const cta = activeOverrides.cta ?? ctaConfig[variant];
const deliverableProgress = getDeliverableProgress(collaboration);
const deadlineUrgency = getDeadlineUrgency(collaboration);
```

- [ ] **Step 3: Add hint text for content-status overrides**

Find the `{variant === 'accepted' && (` block (line 78-80):

```tsx
{variant === 'accepted' && (
  <p className="text-xs text-amber-600 mb-2">Awaiting project start</p>
)}
```

Add a new block immediately after it for the active variant content-status hint:

```tsx
{variant === 'active' && activeOverrides.hint && (
  <p className="text-xs text-amber-600 mb-2">{activeOverrides.hint}</p>
)}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/my-campaigns/MyCampaignCard.tsx
git commit -m "feat: MyCampaignCard active variant reflects content_status"
```

---

## Task 4: Per-Item Revision Request Form (ContentReviewSection)

**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx:63-64,194-254,502-534` (state, mutation, form UI)

**Context:** The current "Request Revision" UI shows a single generic textarea. The spec requires per-item checkboxes with per-item feedback. The mutation must change from taking a `string` to a structured `RevisionPayload`. The `revision_feedback` JSONB field on `campaign_collaborations` already exists. Files are available from the `useFileUploads` hook (`files` variable, line 89).

Each file has `metadata: Record<string, unknown>` which may contain `deliverable_id`. Files are typed as `FileUpload` from `src/types/files.ts`.

- [ ] **Step 1: Add RevisionPayload interface and update state**

At the top of `ContentReviewSection.tsx`, after the imports (around line 37), add the interface:

```ts
interface RevisionPayload {
  items: Record<string, string>;
  general?: string;
}
```

Replace the existing state declarations at lines 63-64:

```ts
const [showRevisionInput, setShowRevisionInput] = useState(false);
const [feedback, setFeedback] = useState('');
```

With:

```ts
const [showRevisionInput, setShowRevisionInput] = useState(false);
const [feedback, setFeedback] = useState('');
const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
const [perItemFeedback, setPerItemFeedback] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Update requestRevision mutation**

Replace the entire `requestRevision` mutation (lines 194-254) with:

```ts
const requestRevision = useMutation({
  mutationFn: async (payload: RevisionPayload) => {
    const { error: updateError } = await supabase
      .from('campaign_collaborations')
      .update({
        content_status: 'revision_requested',
        revision_count: safeRevisionCount + 1,
        revision_feedback: payload.items,
        updated_at: new Date().toISOString(),
      })
      .eq('id', collaborationId);
    if (updateError) throw updateError;

    // Build structured message
    const itemLines = Object.entries(payload.items)
      .filter(([key]) => key !== 'general')
      .map(([key, text]) => {
        const file = files?.find(
          (f) => (f.metadata as Record<string, unknown>)?.deliverable_id === key || f.id === key
        );
        const label = file?.original_filename ?? key;
        return `• **${label}:** ${text}`;
      })
      .join('\n');
    const generalLine = payload.general ? `\n\n**General notes:** ${payload.general}` : '';
    const messageContent = `📝 **Revision Requested**\n\n${itemLines}${generalLine}`;

    const { data: authData } = await supabase.auth.getUser();
    const { error: messageError } = await supabase.from('messages').insert({
      sender_id: authData.user?.id,
      recipient_id: creatorId,
      campaign_id: campaignId,
      content: messageContent,
      category: 'revision_request',
    });
    if (messageError) throw messageError;

    supabase.rpc('insert_payment_event', {
      p_event_type: 'revision_requested',
      p_entity_type: 'collaboration',
      p_entity_id: collaborationId,
      p_campaign_id: campaignId,
      p_metadata: { notes: messageContent, revision_number: safeRevisionCount + 1, items: payload.items },
    }).then(() => {}, () => {});
  },
  onSuccess: async () => {
    toast({ title: 'Revision request sent to creator.' });
    setFeedback('');
    setCheckedFiles(new Set());
    setPerItemFeedback({});
    setShowRevisionInput(false);
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    queryClient.invalidateQueries({ queryKey: ['campaign-project', campaignId] });

    try {
      const { fetchRecipientEmail } = await import('@/lib/recipientEmail');
      const creatorProfile = await fetchRecipientEmail(creatorId);

      if (creatorProfile?.email) {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            to: creatorProfile.email,
            recipientName: creatorProfile.full_name,
            type: 'revision_requested',
            data: { campaignId, campaignTitle, creatorName, message: feedback },
          },
        });
      }
    } catch (e) {
      console.error('Failed to send revision request email:', e);
    }
  },
  onError: (err: Error) => {
    toast({ variant: 'destructive', title: 'Request Failed', description: err.message });
  },
});
```

- [ ] **Step 3: Replace the revision form UI**

Find the revision form section — the `else` branch of `{!showRevisionInput ? (` (lines 502-534):

```tsx
) : (
  <div className="space-y-2">
    <Textarea
      placeholder="Describe the changes you need…"
      value={feedback}
      onChange={e => setFeedback(e.target.value)}
      rows={2}
      className="text-sm rounded-xl"
    />
    <div className="flex gap-2">
      <Button
        onClick={() => requestRevision.mutate(feedback)}
        disabled={!feedback.trim() || requestRevision.isPending}
        size="sm"
        className="rounded-full bg-teal-400 hover:bg-teal-500 text-white"
      >
        {requestRevision.isPending ? (
          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending…</>
        ) : (
          <><Send className="h-3 w-3 mr-1" />Send</>
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() => { setShowRevisionInput(false); setFeedback(''); }}
      >
        Cancel
      </Button>
    </div>
  </div>
)}
```

Replace the entire `else` block (from `) : (` to the matching `)}`) with:

```tsx
) : (
  <div className="space-y-3">
    <p className="text-xs font-semibold text-gray-700">Select items that need revision:</p>

    {/* Per-file checkboxes */}
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {files?.map((file) => {
        const fileKey = (file.metadata as Record<string, unknown>)?.deliverable_id as string ?? file.id;
        const isChecked = checkedFiles.has(fileKey);
        const isImage = file.mime_type?.startsWith('image/');
        const isVideo = file.mime_type?.startsWith('video/');
        const thumbUrl = isImage
          ? supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl
          : null;
        return (
          <div key={file.id} className="space-y-1">
            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => {
                  setCheckedFiles((prev) => {
                    const next = new Set(prev);
                    if (next.has(fileKey)) next.delete(fileKey);
                    else next.add(fileKey);
                    return next;
                  });
                }}
                className="rounded border-gray-300 text-dc-teal focus:ring-dc-teal"
              />
              {thumbUrl ? (
                <img src={thumbUrl} alt="" className="w-10 h-10 rounded object-cover" />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                  {isVideo ? <Eye className="h-4 w-4 text-gray-400" /> : <FileCheck className="h-4 w-4 text-gray-400" />}
                </div>
              )}
              <span className="text-sm text-gray-700 truncate flex-1">{file.original_filename}</span>
            </label>
            {isChecked && (
              <Textarea
                placeholder="What needs to change?"
                value={perItemFeedback[fileKey] ?? ''}
                onChange={(e) => setPerItemFeedback((prev) => ({ ...prev, [fileKey]: e.target.value }))}
                rows={1}
                className="text-xs rounded-lg ml-8"
              />
            )}
          </div>
        );
      })}
    </div>

    {/* General notes */}
    <Textarea
      placeholder="General notes (optional)"
      value={feedback}
      onChange={(e) => setFeedback(e.target.value)}
      rows={2}
      className="text-sm rounded-xl"
    />

    {/* Actions */}
    <div className="flex gap-2">
      <Button
        onClick={() => {
          const items: Record<string, string> = {};
          checkedFiles.forEach((key) => {
            items[key] = perItemFeedback[key]?.trim() || 'Revision needed';
          });
          if (feedback.trim()) items['general'] = feedback.trim();
          requestRevision.mutate({ items, general: feedback.trim() || undefined });
        }}
        disabled={checkedFiles.size === 0 || requestRevision.isPending}
        size="sm"
        className="rounded-full bg-teal-400 hover:bg-teal-500 text-white"
      >
        {requestRevision.isPending ? (
          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending…</>
        ) : (
          <><Send className="h-3 w-3 mr-1" />Send Revision Request</>
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() => {
          setShowRevisionInput(false);
          setFeedback('');
          setCheckedFiles(new Set());
          setPerItemFeedback({});
        }}
      >
        Cancel
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build. No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "feat: per-item revision request with checkboxes and per-file feedback"
```

---

## Task 5: Creator Revision Banner (ActivePhaseView)

**Files:**
- Modify: `src/components/my-campaigns/ActivePhaseView.tsx:86-93` (add banner before stepper)

**Context:** When `collaboration.content_status === 'revision_requested'`, show a non-dismissible amber banner as the first element in the PROJECT tab content stack, before the stepper. The `collaboration` object from `useCollaboration` hook (line 39) includes `revision_feedback: Record<string, string> | null` and `revision_count: number`.

The banner lists each item in `revision_feedback` with its feedback text. The key `"general"` is displayed as "General Feedback". All other keys are deliverable IDs or file IDs — resolve their display names from the `campaignDeliverables` array or the `files` array.

- [ ] **Step 1: Add the revision banner**

In `src/components/my-campaigns/ActivePhaseView.tsx`, add the `AlertCircle` import. Find the existing import of `MessageSquare` from lucide-react (line 3):

```ts
import { MessageSquare } from 'lucide-react';
```

Replace with:

```ts
import { MessageSquare, AlertCircle } from 'lucide-react';
```

Then add the `Badge` import. Find the existing imports area (around lines 1-19) and add after the `Button` import:

```ts
import { Badge } from '@/components/ui/badge';
```

- [ ] **Step 2: Add the revision banner JSX**

Find the PROJECT tab content area. Locate the stepper block at line 91-93:

```tsx
{/* Stepper */}
<div className="bg-white rounded-2xl p-4 lg:bg-transparent lg:p-0">
  <ProjectStepper currentStep={currentStep} role="creator" tierColor={tierColor} />
</div>
```

Insert the revision banner **before** this stepper block:

```tsx
{/* Revision banner */}
{collaboration.content_status === 'revision_requested' && collaboration.revision_feedback && (
  <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-2">
    <div className="flex items-center gap-2">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <span className="text-sm font-bold text-amber-800">Revision Requested</span>
      <Badge variant="outline" className="text-xs rounded-full border-amber-300 text-amber-700">
        {collaboration.revision_count}/{2} revisions used
      </Badge>
    </div>
    <ul className="space-y-1.5">
      {Object.entries(collaboration.revision_feedback).map(([key, text]) => {
        let label: string;
        if (key === 'general') {
          label = 'General Feedback';
        } else {
          const deliverable = campaignDeliverables?.find((d) => d.id === key);
          const file = files?.find((f) => f.id === key);
          label = deliverable
            ? `${deliverable.platform ?? ''} ${deliverable.content_type}`.trim().replace(/_/g, ' ')
            : file?.original_filename ?? key;
        }
        return (
          <li key={key} className="text-xs text-amber-900">
            <span className="font-semibold capitalize">{label}:</span> {text}
          </li>
        );
      })}
    </ul>
    <p className="text-xs text-amber-700 italic">
      Address the feedback above, then resubmit for review.
    </p>
  </div>
)}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/my-campaigns/ActivePhaseView.tsx
git commit -m "feat: amber revision banner in creator ActivePhaseView"
```

---

## Verification Checklist

After all tasks are committed, verify end-to-end:

1. **Card deduplication:** Log in as creator. If a campaign has both an accepted app and an active collab, only the "Active" card appears in the Active tab. No "Awaiting project start" duplicate.

2. **Stepper accuracy:** On the creator campaign detail page, when `content_status = 'revision_requested'`, the stepper shows step 2 ("Upload") as current, with "Brief" and "Started" completed.

3. **Card badges:** Active tab cards show the correct badge per content_status:
   - Default → "Active"
   - `submitted` → "📤 Submitted"
   - `revision_requested` → "⚠️ Revision Needed"
   - `approved` → "✅ Approved"

4. **Per-item revision form:** On the business campaign detail page, click "Request Revision" → see file thumbnails with checkboxes → check items, add per-item feedback → submit → creator receives structured chat message. The `revision_feedback` JSONB on the collaboration is populated.

5. **Creator revision banner:** On the creator campaign detail page, an amber banner appears at the top of the PROJECT tab listing each flagged item and its feedback. The banner disappears after resubmitting.

6. **Desktop + mobile:** All changes render correctly on both viewports. No layout breaks.

Run: `npm run build` one final time to confirm everything compiles.
