# Scheduling Confirmation Multi-Post Display and Date/Time Editing Fixes

**Date:** 2026-05-27
**Status:** Draft
**Author:** Dame Williams + Claude
**Parent spec:** `2026-05-26-auto-cross-scheduling-design.md`

## Context

Two bugs prevent the auto cross-scheduling feature from delivering a polished UX:

1. **Confirmation shows only one post.** When multiple deliverables are scheduled separately on different dates, the "Post Scheduled" confirmation screen shows a single card with the first post's time and combines all files into one count. The user expects to see each scheduled post as its own card with its own date.

2. **Date/time editing broken across two flows.** Editing a scheduled post's date/time produces "The string did not match the expected pattern" in the Manage Post panel, and shows the wrong time (UTC instead of local) in the AI plan review. Both stem from inconsistent `datetime-local` value formatting — some code uses UTC-based `toISOString().slice(0, 16)` while the browser expects local time format.

## Goal

After scheduling multiple deliverables, the confirmation screen shows one card per post with its correct date, platform, and file count. Date/time editing works correctly in both the pre-scheduling review and the post-scheduling management panel. All `datetime-local` inputs use a shared timezone-aware helper.

## Fix 1: Multi-Post Confirmation UI

### Root cause

`ScheduleConfirmation.tsx` accepts a single `scheduledAt: string` prop. Both callers pass only the first post:
- `SocialPostPrompt.tsx` line 352: `setConfirmedAt(deliverableSlots[0].scheduledAt)`
- `PostingPlanReview.tsx` line 296: `scheduledAt={firstPost?.scheduled_at}`

### Change

**Update `ScheduleConfirmation` props:**

Replace:
```typescript
interface ScheduleConfirmationProps {
  scheduledAt: string;
  platformNames: string[];
  campaignTitle: string;
  fileCount: number;
  onDone: () => void;
}
```

With:
```typescript
interface ScheduledPostInfo {
  scheduledAt: string;
  platformNames: string[];
  fileCount: number;
}

interface ScheduleConfirmationProps {
  posts: ScheduledPostInfo[];
  campaignTitle: string;
  onDone: () => void;
}
```

**Update the component render:**

The header ("Scheduled!", checkmark, subtitle) stays as a single instance. The teal card section renders one card per post in a `space-y-2` stack using `posts.map()`. Each card shows its own `formatScheduledTime(post.scheduledAt)`, "Donny picked peak engagement time" subtitle, file count, and platform badges.

The "View on Calendar" button navigates to the earliest post's date: `posts.reduce((earliest, p) => new Date(p.scheduledAt) < new Date(earliest.scheduledAt) ? p : earliest).scheduledAt`.

**Update `SocialPostPrompt.tsx`:**

Replace `setConfirmedAt(deliverableSlots[0].scheduledAt)` with building the full posts array:

```typescript
const confirmedPosts = deliverableSlots.map(slot => ({
  scheduledAt: slot.scheduledAt,
  platformNames: platforms,
  fileCount: slot.mediaUrl ? 1 : 0,
}));
```

Store this array instead of a single `confirmedAt` string. Pass it to `ScheduleConfirmation` as the `posts` prop.

**State changes in `SocialPostPrompt.tsx`:**

- Replace `confirmedAt: string | null` (line 100) with `confirmedPosts: ScheduledPostInfo[]` initialized to `[]`
- Remove `confirmedPlatforms: string[]` state (line 101) — platform info is now per-post in the `confirmedPosts` array
- Update the single-post success handler (line 322) to build a single-element array:
  ```typescript
  setConfirmedPosts([{
    scheduledAt: scheduleTime,
    platformNames: platforms,
    fileCount: mediaUrls.length,
  }]);
  ```
- Remove `setConfirmedPlatforms(platforms)` calls (lines 323, 353)
- Update the reset in the `useEffect` (line 142): `setConfirmedAt(null)` → `setConfirmedPosts([])`; remove `setConfirmedPlatforms([])`
- Update the guard condition (line 374): `schedulingState === 'confirmed' && confirmedAt` → `schedulingState === 'confirmed' && confirmedPosts.length > 0`
- Update the confirmation render (line 375-381) to pass `posts={confirmedPosts}` instead of individual props

**Update `PostingPlanReview.tsx`:**

Replace the single-post confirmation (lines 291-302) with:

```typescript
const confirmedPosts = posts.map(p => ({
  scheduledAt: p.scheduled_at,
  platformNames: [p.platform],
  fileCount: p.media_urls.length,
}));
return (
  <ScheduleConfirmation
    posts={confirmedPosts}
    campaignTitle={campaignTitle}
    onDone={() => onOpenChange(false)}
  />
);
```

### Files changed

| File | Change |
|------|--------|
| `src/components/outstand/ScheduleConfirmation.tsx` | New `posts` array prop, render stacked cards |
| `src/components/outstand/SocialPostPrompt.tsx` | Replace `confirmedAt` state with `confirmedPosts` array, build from all slots |
| `src/components/outstand/PostingPlanReview.tsx` | Build `confirmedPosts` array from all posts |

### Behavior

- 2 deliverables scheduled on different dates → confirmation shows 2 stacked teal cards, each with its own date, platform badges, and file count
- 1 deliverable → confirmation shows 1 card (same as current behavior)
- "View on Calendar" navigates to the earliest post's date

## Fix 2: Date/Time Editing Across All Flows

### Root cause

Three separate implementations of `datetime-local` value formatting exist in the codebase, two of which are broken:

| File | Function | Issue |
|------|----------|-------|
| `PostManagementPanel.tsx:128-131` | Inline in useEffect | Value correct (timezone-adjusted), but `min` on line 331 uses raw UTC `toISOString().slice(0, 16)` — mismatch causes browser validation error |
| `PostingPlanReview.tsx:424` | Inline in JSX | Uses `new Date(post.scheduled_at).toISOString().slice(0, 16)` — displays UTC time, not local |
| `SocialPostEditor.tsx:187` | Inline in JSX | Uses `(scheduledAt \|\| suggestedTime).slice(0, 16)` — if values are ISO strings, slices UTC portion |
| `DeliverableScheduleReview.tsx:33-37` | `toDatetimeLocal()` | Correct — uses Date's local getters. But defined inline, not reusable |
| `CustomComposeForm.tsx:25-35` | `toDatetimeLocalValue()` + `fromDatetimeLocalValue()` | Correct — uses timezone offset adjustment. But defined inline, not reusable |

### Change

**Create shared utility `src/lib/dateUtils.ts`:**

```typescript
export function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
```

Uses Date's built-in local time getters — no manual timezone offset math, no `toISOString()` dependency. Matches the approach from `DeliverableScheduleReview.tsx` which is the only one that works correctly today.

**Fix `PostManagementPanel.tsx`:**

Replace the `useEffect` (lines 127-132):
```typescript
// Before:
const d = new Date(post.scheduledAt);
const offset = d.getTimezoneOffset();
const local = new Date(d.getTime() - offset * 60000);
setNewDateTime(local.toISOString().slice(0, 16));

// After:
setNewDateTime(toDatetimeLocal(new Date(post.scheduledAt)));
```

Replace the `min` attribute (line 331):
```typescript
// Before:
min={new Date().toISOString().slice(0, 16)}

// After:
min={toDatetimeLocal(new Date())}
```

**Fix `PostingPlanReview.tsx`:**

Replace the time picker value (line 424):
```typescript
// Before:
value={new Date(post.scheduled_at).toISOString().slice(0, 16)}

// After:
value={toDatetimeLocal(new Date(post.scheduled_at))}
```

**Consolidate `DeliverableScheduleReview.tsx`:**

Remove inline `toDatetimeLocal` function (lines 33-37). Import from `@/lib/dateUtils`.

**Consolidate `CustomComposeForm.tsx`:**

Remove inline `toDatetimeLocalValue` and `fromDatetimeLocalValue` functions (lines 25-35). Import `toDatetimeLocal` and `fromDatetimeLocal` from `@/lib/dateUtils`. Update call sites from `toDatetimeLocalValue(date)` to `toDatetimeLocal(date)` and `fromDatetimeLocalValue(value)` to `fromDatetimeLocal(value)`.

**Fix `SocialPostEditor.tsx`:**

Replace line 187:
```typescript
// Before:
value={(scheduledAt || suggestedTime).slice(0, 16)}

// After:
value={toDatetimeLocal(new Date(scheduledAt || suggestedTime))}
```

Import `toDatetimeLocal` from `@/lib/dateUtils`.

**Note on `handleUpdateTime` / `handleReschedule` handlers:** The handlers in `PostingPlanReview.tsx` (line 198) and `PostManagementPanel.tsx` (line 170) correctly use `new Date(localValue).toISOString()` to convert local input back to UTC for storage/API submission. These do NOT need changes — only the `value` and `min` attributes on the inputs need fixing.

### Files changed

| File | Change |
|------|--------|
| `src/lib/dateUtils.ts` | **New file** — shared `toDatetimeLocal` and `fromDatetimeLocal` |
| `src/components/outstand/PostManagementPanel.tsx` | Import shared util, fix `value` and `min` |
| `src/components/outstand/PostingPlanReview.tsx` | Import shared util, fix time picker `value` |
| `src/components/outstand/DeliverableScheduleReview.tsx` | Remove inline, import shared util |
| `src/components/outstand/CustomComposeForm.tsx` | Remove inline, import shared util |
| `src/components/promotions/SocialPostEditor.tsx` | Import shared util, fix datetime value |

### Behavior

- Manage Post panel: changing date/time and clicking Confirm reschedules without error
- AI plan review: datetime-local input shows correct local time, edits persist correctly
- DeliverableScheduleReview: unchanged behavior, now using shared utility
- CustomComposeForm: unchanged behavior, now using shared utility

## Verification Plan

1. **Multi-post confirmation (Bug #1):**
   - Schedule 2 deliverables separately via the "Edgewater's Most-Watched TikTok" campaign as Dame Smooth (restaurant user)
   - Verify confirmation shows 2 stacked teal cards with distinct dates
   - Click "View on Calendar" — verify navigation to the earliest post's date
   - Test with 1 deliverable — verify single card still works

2. **Date editing in Manage Post (Bug #2a):**
   - Open a scheduled post from the calendar
   - Click "Reschedule" in the Manage Post panel
   - Change the date/time using the input
   - Click "Confirm" — verify no validation error, post reschedules successfully
   - Verify the new time shows correctly when re-opening the post

3. **Date editing in AI plan review (Bug #2b):**
   - Generate an AI posting plan for a campaign with multiple deliverables
   - Expand a post card and check the datetime-local input
   - Verify it shows the correct LOCAL time (not UTC)
   - Change the time and verify the update persists in the plan

4. **Cross-role testing:**
   - Test scheduling from restaurant, creator, and brand dashboards
   - Verify all flows show correct times and confirmation

5. **Viewport testing:**
   - Test confirmation and date editing on both mobile and desktop
   - Manage Post uses Sheet (mobile) and Dialog (desktop) — verify both

## Files Changed Summary

| File | Change |
|------|--------|
| `src/lib/dateUtils.ts` | **New** — shared `toDatetimeLocal`, `fromDatetimeLocal` |
| `src/components/outstand/ScheduleConfirmation.tsx` | Multi-post `posts[]` prop, stacked cards |
| `src/components/outstand/SocialPostPrompt.tsx` | `confirmedPosts` array state, pass all slots |
| `src/components/outstand/PostingPlanReview.tsx` | Build `confirmedPosts` array, fix time picker |
| `src/components/outstand/PostManagementPanel.tsx` | Fix `value` and `min` via shared util |
| `src/components/outstand/DeliverableScheduleReview.tsx` | Import shared util |
| `src/components/outstand/CustomComposeForm.tsx` | Import shared util |
| `src/components/promotions/SocialPostEditor.tsx` | Import shared util, fix datetime value |
