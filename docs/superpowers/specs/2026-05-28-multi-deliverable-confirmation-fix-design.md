# Multi-Deliverable Scheduling Confirmation Fix

## Context

After scheduling 2+ deliverables through the DeliverableScheduleReview flow
(multi-review), the ScheduleConfirmation dialog shows a single card with
"2 files" instead of separate cards per deliverable. The "2 files" pattern
comes exclusively from the single-post path in `handleScheduleForBestTime`
(line 320), where `fileCount: mediaUrls.length` combines all files into one
entry. The multi-review path correctly uses `fileCount: 1` per slot, but its
state is being overwritten.

## Root Cause

Three bugs in `src/components/outstand/SocialPostPrompt.tsx`:

**Bug 1 — Confirmed state can be set by stale or unexpected callbacks.**
The single-post path uses `crossPost.mutate()` with a per-call `onSuccess`
that sets `confirmedPosts` and `schedulingState`. While the multi-review
branch returns early before calling `crossPost.mutate()`, there is no guard
preventing the confirmed state from being set by a callback that fires
outside the expected flow (e.g., rapid re-renders, React Query observer
resolution). Adding a defensive flow guard ensures only the active path
can set confirmation state. This is defensive programming rather than a
confirmed race condition.

**Bug 2 — `syncScheduledPost` uses all media URLs per slot.**
`handleScheduleAllDeliverables` correctly sends `[slot.mediaUrl]` to the
Outstand API, but `syncScheduledPost` writes `media_urls: mediaUrls` (the
full component-level array) to every DB row. Each `donny_scheduled_posts`
row ends up with all URLs instead of the slot's single URL.

**Bug 3 — `syncScheduledPost` overwrites the first draft.**
The function queries for a single `status='draft'` row. On the first
iteration it finds and updates the draft to `'scheduled'`. On the second
iteration no draft exists, so it inserts a new row. Result: two DB rows
both containing all media URLs, with inconsistent provenance. Additionally,
existing draft rows are never cleaned up before multi-slot inserts.

## Fix Design

All changes in `src/components/outstand/SocialPostPrompt.tsx` and
`src/hooks/outstand/useCrossPost.ts`.

### Change 1 — Add scheduling flow ref guard

Add a `useRef` to track which scheduling flow is active:

```typescript
const schedulingFlowRef = useRef<'single' | 'multi' | null>(null);
```

In `handleScheduleForBestTime`:
- Multi-review branch: set `schedulingFlowRef.current = 'multi'`
- Single-post branch: set `schedulingFlowRef.current = 'single'`

In the single-post `onSuccess` callback, check
`schedulingFlowRef.current === 'single'` before setting `confirmedPosts`
and `schedulingState`. If the flow changed, the callback is a no-op.

In `handleScheduleAllDeliverables`, check
`schedulingFlowRef.current === 'multi'` before setting confirmed state.

Reset the ref when the modal closes (in the `open` effect cleanup).

### Change 2 — Per-slot DB inserts with draft cleanup

Replace the `syncScheduledPost(slot.scheduledAt, ...)` call inside the
multi-deliverable loop with:

1. **Before the loop:** Delete any existing draft rows for this campaign/user
   to prevent orphan drafts:

```typescript
await supabase
  .from('donny_scheduled_posts')
  .delete()
  .eq('campaign_id', campaignId)
  .eq('user_id', user.id)
  .eq('status', 'draft');
```

2. **In the loop:** Direct `supabase.from('donny_scheduled_posts').insert()`
   per slot. Each insert uses `media_urls: [slot.mediaUrl]` instead of the
   full `mediaUrls` array. Do not set `ai_suggested_time: true` — the user
   manually confirmed or edited times via the DeliverableScheduleReview
   date pickers:

```typescript
await supabase.from('donny_scheduled_posts').insert({
  user_id: user.id,
  campaign_id: campaignId,
  platform: platforms[0] ?? 'instagram',
  content_type: 'video_reel',
  caption,
  hashtags,
  media_urls: [slot.mediaUrl],
  scheduled_at: slot.scheduledAt,
  status: 'scheduled',
  ai_suggested_time: false,
  metadata: {
    outstand_post_id: result?._outstandPostId ?? null,
    social_account_ids: selectedAccountIds,
  },
});
```

`syncScheduledPost` remains for the single-post path, where the
draft-lookup behavior is appropriate (one file, one draft row).

### Change 3 — Suppress toast spam during multi-deliverable scheduling

The `useCrossPost` hook's global `onSuccess` fires a toast per mutation.
During multi-deliverable scheduling, this produces N toasts.

Fix: Add an optional `silent` flag to `CrossPostInput`. When set, the
hook's `onSuccess` skips the toast. `handleScheduleAllDeliverables` passes
`silent: true` in each `mutateAsync` call. The calling code can show a
single toast after the loop completes if needed (the `ScheduleConfirmation`
component already serves as the success signal).

In `useCrossPost.ts`:

```typescript
interface CrossPostInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  scheduledAt?: string;
  silent?: boolean;
}

// In onSuccess:
onSuccess: (_data, variables) => {
  qc.invalidateQueries({ queryKey: ['outstand'] });
  if (!variables.scheduledAt) {
    setTimeout(() => {
      qc.refetchQueries({ queryKey: ['outstand'] });
      options?.onPublished?.();
    }, 3000);
  }
  if (!variables.silent) {
    toast({ title: variables.scheduledAt ? 'Cross-post scheduled!' : 'Cross-post published!' });
  }
},
```

### Change 4 — Handle partial failures in multi-deliverable loop

Track which slots succeeded via a `Set<string>` of media URLs. On failure,
only show failed slots in the review. Because succeeded slots already have
DB rows with `status: 'scheduled'`, the pre-loop draft cleanup
(Change 2, which deletes `status='draft'` only) will not touch them on
retry — so there is no duplicate-row risk on retry.

```typescript
const succeededUrls = new Set<string>();
try {
  for (const slot of deliverableSlots) {
    const result = await crossPost.mutateAsync({...});
    await supabase.from('donny_scheduled_posts').insert({...});
    succeededUrls.add(slot.mediaUrl);
  }
  // All succeeded
  setConfirmedPosts(deliverableSlots.map(slot => ({...})));
  setSchedulingState('confirmed');
} catch {
  if (succeededUrls.size > 0) {
    const remaining = deliverableSlots.filter(s => !succeededUrls.has(s.mediaUrl));
    setDeliverableSlots(remaining);
    toast({
      variant: 'destructive',
      title: 'Partial scheduling failure',
      description: `${succeededUrls.size} posted, ${remaining.length} failed. Retry the remaining.`,
    });
  }
  setSchedulingState('multi-review');
}
```

No duplicate-row risk: succeeded slots already have `status: 'scheduled'`
rows. The pre-loop draft cleanup only deletes `status='draft'`, so retrying
with the remaining slots inserts only the failed ones.

### Change 5 — Conditional "Donny picked" subtext in ScheduleConfirmation

The `ScheduleConfirmation` component hardcodes "Donny picked peak
engagement time" under every post card. For multi-deliverable posts where
the user reviewed and potentially edited each time, this is misleading.

Fix: Add an optional `aiSuggested` boolean to `ScheduledPostInfo`. The
single-post path sets `aiSuggested: true` (Donny chose the time). The
multi-review path sets `aiSuggested: false` (user confirmed/edited). The
subtext renders conditionally:

```typescript
export interface ScheduledPostInfo {
  scheduledAt: string;
  platformNames: string[];
  fileCount: number;
  aiSuggested?: boolean;
}

// In the card rendering:
{post.aiSuggested !== false && (
  <p className="text-[10px] text-dc-teal font-medium mt-0.5">
    Donny picked peak engagement time
  </p>
)}
```

Default behavior (`aiSuggested` omitted/undefined) preserves the subtext
for backward compatibility with the `PostingPlanReview` caller.

### Change 6 — Pluralize dialog title

In the JSX for both mobile (Sheet) and desktop (Dialog), update the
title when `schedulingState === 'confirmed'`:

```typescript
schedulingState === 'confirmed'
  ? confirmedPosts.length > 1 ? 'Posts Scheduled' : 'Post Scheduled'
  : ...
```

## Affected Files

- `src/components/outstand/SocialPostPrompt.tsx` — Changes 1, 2, 4, 6
- `src/hooks/outstand/useCrossPost.ts` — Change 3
- `src/components/outstand/ScheduleConfirmation.tsx` — Change 5

## Verification

1. Open a campaign with 2+ deliverable files
2. Click "Share" → "Schedule for Best Time"
3. Confirm the DeliverableScheduleReview shows both files with separate date pickers
4. Set different dates for each deliverable
5. Click "Schedule All"
6. Verify the confirmation shows 2 separate teal cards, each with its own date and "1 file"
7. Verify the dialog title says "Posts Scheduled" (plural)
8. Verify multi-path cards do NOT show "Donny picked peak engagement time"
9. Verify `donny_scheduled_posts` has 2 rows, each with only its slot's media URL
10. Verify no orphan draft rows exist after scheduling
11. Verify only one success signal (the confirmation dialog, no extra toasts)
12. Click "View on Calendar" → verify navigation to the earliest scheduled date
13. Test the single-post path (1 file): 1 card, "1 file", "Post Scheduled",
    with "Donny picked peak engagement time" subtext
14. Test partial failure: if the Outstand API rejects one slot, verify the
    remaining failed slots appear in the review, succeeded slots are removed,
    and retrying does not create duplicate DB rows
