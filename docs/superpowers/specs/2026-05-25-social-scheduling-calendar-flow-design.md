---
title: Social Media Scheduling & Calendar Flow
type: design
created: 2026-05-25
updated: 2026-05-25
status: draft
---

# Social Media Scheduling & Calendar Flow

## Problem

The "Ready to Share" dialog in the campaign detail page has three broken experiences:

1. **Video hero frames are invisible.** Media is rendered as plain `<img>` tags (`SocialPostPrompt.tsx:172`), which can't display video content. Videos appear as broken/empty images instead of showing first-frame thumbnails like the deliverables gallery and Instagram grid do.

2. **Caption shows campaign objective, not a social media caption.** `DeliverablesArchive.tsx` passes `originalCaption={campaignDescription}`, which is the campaign's internal objective text (e.g., "A some-weekend hype push that floods Instagram..."). Restaurants shouldn't have to rewrite this — Donny should generate a real caption.

3. **"Schedule for Best Time" provides no feedback.** After scheduling, `useCrossPost.ts` shows a toast saying "Cross-post scheduled!" with no indication of when, where, or how to manage it. There's no connection to the existing `CalendarTab` component, which lives only on the Outstand Manager page.

## Design

### 1. Featured Media Preview in "Ready to Share" Dialog

**Replace** the broken `<img>` thumbnail row with a featured hero frame layout:

- **Hero frame (desktop):** Square 1:1 aspect ratio at ~200px, centered in the dialog. Uses `VideoFrameThumbnail` component for videos (extracts first frame + play button overlay + duration badge). Photos render as standard `<img>` with `object-cover`.
- **Hero frame (mobile):** Full-width square, same treatment.
- **Thumbnail row below:** Smaller thumbnails (~44px) for multi-file content. Tapping a thumbnail swaps it into the hero position. Active thumbnail gets a teal border (`border-2 border-dc-teal`).
- **Content type badge:** Small label on the hero frame in a semi-transparent overlay (`bg-black/45`). Derived from MIME type: `video/mp4` → "Video", `video/*` → "Video", `image/jpeg` or `image/png` → "Photo". If the file metadata includes a content_type from the campaign deliverables (e.g., "video_reel", "tiktok", "story"), prefer that over MIME mapping.

**Key component change:** `SocialPostPrompt.tsx` lines 169-175 — replace the `<img>` map with a new `MediaPreviewGrid` sub-component that manages hero/thumbnail selection and delegates to `VideoFrameThumbnail` for video files.

**Reuse:** `VideoFrameThumbnail` from `src/components/content/VideoFrameThumbnail.tsx` — already handles frame capture, stored thumbnail lookup, play button overlay, and loading states. Also reuse `useVideoFrameCapture` hook and `persistVideoThumbnail` utility.

### 2. AI Caption with Pre-Generation and Refresh

**Pre-generation (existing, ensure reliability):** The `fire-campaign-social-hook` edge function already generates AI captions via the `social-caption` edge function at Stage 4 (content approval) and stores them in `donny_scheduled_posts` as drafts. Ensure this fires reliably for all three roles (restaurant, creator, brand).

**Dialog caption loading (existing, fix fallback):** `SocialPostPrompt.tsx` already queries `donny_scheduled_posts` for cached drafts (the `campaignId && user?.id` block). When a draft exists, its AI caption loads instantly. **Change the fallback:** when no draft exists, trigger an on-the-fly caption generation call to `social-caption` via `supabase.functions.invoke('social-caption', { body: { ... } })` instead of falling back to `campaignDescription`.

**On-the-fly generation parameters:** The `social-caption` edge function requires: `campaign_title` (string), `campaign_description` (string), `content_type` (string, e.g. "video_reel"), `party_role` (string, e.g. "restaurant"), `platform` (string, e.g. "instagram"), and `user_id` (string). In the dialog context: `campaign_title` and `campaign_description` come from the `campaignTitle` and `originalCaption` props; `content_type` is derived from the media MIME types (video → "video_reel", image → "photo"); `party_role` maps from the `userRole` prop; `platform` uses the first selected account's network; `user_id` from `useAuth().user.id`.

**On-the-fly loading/error states:** While generating, show a skeleton pulse in the caption area with "Donny is writing your caption..." text. If the AI call fails (network error, timeout), fall back to a generic default caption: `"Check out what we've been cooking up! #DragonDashed"` for restaurants, `"Loved creating this content! #DragonDashed"` for creators. Show a subtle inline error: "Caption generation unavailable — edit to customize."

**Refresh button (new):** Add a refresh icon next to the caption header. Clicking it calls `social-caption` with the same parameters as above. Shows the same loading skeleton while generating. Available for all roles (not just creators like `DonnyCaptionRewriter`).

**Caption display:** Label changes from "CAPTION PREVIEW" to "AI CAPTION". Shows the Refresh button (teal) and Edit link (pink) in the header row. Emoji usage in the label is intentional for UI — this matches DragonCandy's brand voice in user-facing elements.

**Existing reuse:**
- `DonnyCaptionRewriter` (`src/components/outstand/DonnyCaptionRewriter.tsx`) — existing pattern for AI caption rewriting (creator-only, uses `donny-orchestrator`). The new refresh button calls `social-caption` directly for broader role support.
- `fire-campaign-social-hook` (`supabase/functions/fire-campaign-social-hook/index.ts`) — existing Stage 4 caption pre-generation logic.
- `social-caption` edge function — existing caption generation API, currently called server-to-server but also invocable from frontend via `supabase.functions.invoke`.

### 3. Post-Schedule Confirmation State

After pressing "Schedule for Best Time," the dialog transforms in-place to a confirmation view instead of closing with a toast.

**Confirmation view contents:**
- Teal checkmark circle + "Scheduled!" heading + "Your content is queued and ready to go" subtitle
- Details card (teal-tinted background):
  - Content thumbnail (small, ~50px) + campaign title + file count
  - Calendar icon + scheduled date/time in bold (e.g., "Tomorrow, May 26 at 6:30 PM")
  - Donny reasoning line (e.g., "🧠 Donny picked peak engagement time") in teal
  - Platform badges (Instagram gradient, TikTok black, etc.)
- "Change time or remove" link in pink
- Two buttons: "View on Calendar" (primary, teal pill) and "Done" (secondary, outlined pill)

**State management:** Add a `schedulingState` to `SocialPostPromptInner`: `'composing' | 'scheduling' | 'confirmed'`. The component captures `scheduledAt` and the selected platform names from its own local state before calling `crossPost.mutate`. On success, transition to `'confirmed'` and render the `ScheduleConfirmation` sub-component using the captured values. This avoids modifying `useCrossPost` (which would break other consumers like `ComposeTab`). To suppress the default toast, use `crossPost.mutate({ ... }, { onSuccess: () => { /* transition state, no toast */ } })` — the per-call `onSuccess` overrides the hook-level one.

**"View on Calendar" action:** Navigates to `/calendar?highlight={postId}&date={scheduledDate}` using `useNavigate()`. Since the Outstand API response from the POST doesn't reliably return a post ID, use the `scheduledAt` date as the primary query param for the calendar to navigate to the correct date. The "Done" button simply closes the dialog (`onOpenChange(false)`).

**"Change time or remove" link:** Opens a date/time picker (reuse shadcn `Calendar` + time selector) inline in the confirmation view, or navigates to the calendar for full management.

### 4. Content Calendar Page (`/calendar`)

A standalone page accessible to all authenticated roles.

**Route:** `/calendar` — wrapped in `ProtectedRoute` (requires auth, any role). This is consistent with other shared routes in the app (`/messages/*`, `/reviews`, `/dashboard/analytics`, `/dashboard/payments`) which are all role-agnostic top-level paths.

**Role-differentiated data fetching:** The page component reads the current user's role from `useAuth()` and fetches role-appropriate context:
- **Restaurants:** Fetch `campaignDeadlines` from campaigns where `business_id = user.id`. No sponsorship events.
- **Creators:** Fetch `campaignDeadlines` from campaigns the creator has active collaborations with. No sponsorship events.
- **Brands:** Fetch both `campaignDeadlines` from brand-owned campaigns and `sponsorshipEvents` from `campaign_sponsorships`.
All roles fetch posts from the Outstand API via `useOutstandApi` (scoped to the user's connected accounts).

**Component structure:** Reuse the existing `CalendarTab` component from `src/components/outstand/CalendarTab.tsx` as the core view. It already has:
- Week/month view toggle
- Platform filtering (All, Instagram, TikTok, Facebook, X, YouTube)
- Week/month navigation with header labels
- `WeekGrid`, `MonthGrid`, `DayStrip` sub-components
- Reschedule via drag-and-drop (desktop) and click (mobile)
- Campaign deadline markers
- Sponsorship event markers
- Color-coded legend (Scheduled=teal, Published=amber, Failed=red, Deadline=pink)
- `DonnyWeeklyPlanner` integration

**New page wrapper:** Create `src/pages/ContentCalendar.tsx` that:
- Wraps content in `DragonCandyOutstandProvider` (required for Outstand API access)
- Fetches posts via `useOutstandApi` (same pattern as `OutstandManager`)
- Fetches role-appropriate campaign deadlines and sponsorship events
- Passes data to `CalendarTab`
- Handles `?date={isoDate}` query param to auto-navigate to a specific date
- Page header: "Content Calendar" title + "Manage your scheduled social media posts" subtitle

**Highlight behavior:** When `date` query param is present, pass it as the `initialDate` prop to `CalendarTab` (new optional prop — `CalendarTab` will use it to initialize its `currentDate` state instead of defaulting to today). Show a teal success banner at the top: "Post scheduled successfully!" that auto-dismisses after 5 seconds.

**`isScheduled` extraction:** Extract `isScheduled`, `isInPublishedFeed`, and `postOutcome` from `src/pages/OutstandManager.tsx` into `src/lib/outstandUtils.ts` to eliminate the circular dependency between pages and components. Update both `OutstandManager` and `CalendarTab` imports.

**Mobile behavior:** Uses `DayStrip` (already responsive in `CalendarTab`).

### 5. Post Management Panel

When a user taps a scheduled post on the calendar, a Sheet (mobile) or Dialog (desktop) opens with full management capabilities.

**Contents:**
- Content preview (hero frame using `VideoFrameThumbnail`, same 1:1 square treatment)
- Campaign link-back card (campaign title + type + "View →" link to campaign detail page)
- Schedule info with "Change" edit link (opens inline date/time picker)
- Platform badges with "+ Add" option to add more platforms
- Caption with "🔄 Donny Refresh" and "✏️ Edit" actions
- Two action buttons: "Reschedule" (teal) and "Remove" (outlined red)

**Component:** `PostManagementPanel` — new component in `src/components/outstand/PostManagementPanel.tsx`.

**API interactions (all via `useOutstandApi` hook from `@outstand-so/ui`):**
- Reschedule: `api.patch('/posts/${id}', { scheduledAt })` — same pattern as `CalendarTab.handleReschedule`, with fallback to delete+recreate if PATCH fails
- Remove: `api.delete('/posts/${id}')` — removes from Outstand queue
- Edit caption: `api.patch('/posts/${id}', { containers: [{ content: newCaption }] })`
- Change platforms: `api.delete('/posts/${id}')` then `api.post('/posts', { ...updatedPayload })` with new account list
- Donny refresh: Call `supabase.functions.invoke('social-caption', { body: { ... } })`, then PATCH caption via Outstand API

### 6. Dashboard "Upcoming Posts" Widget

A lightweight card on each role's dashboard showing the next 2-3 scheduled posts.

**Component:** `UpcomingPostsWidget` in `src/components/outstand/UpcomingPostsWidget.tsx`.

**Contents:**
- Header: calendar icon + "Upcoming Posts" title + "See Full Calendar →" link
- Post list (max 3): thumbnail (40px) + title + relative time ("Tomorrow 6:30 PM") + platform icon badges
- Footer: "[N] posts scheduled this week · Next: [relative time]"
- Empty state: "No posts scheduled. Share campaign content to get started."

**Data source:** Query `donny_scheduled_posts` where `user_id = currentUser` and `status IN ('scheduled', 'draft')` and `scheduled_at > now()`, ordered by `scheduled_at ASC`, limit 3.

**Syncing dialog scheduling to `donny_scheduled_posts`:** The `useCrossPost` hook only posts to the Outstand API — it does NOT write to `donny_scheduled_posts`. To ensure the widget and calendar reflect posts scheduled through the "Ready to Share" dialog, `SocialPostPromptInner` must update `donny_scheduled_posts` after `crossPost.mutate` succeeds:
- If a draft exists for this `campaign_id + user_id`: update its `status` to `'scheduled'`, set `scheduled_at` to the scheduled time, update `caption` and `media_urls`.
- If no draft exists: insert a new row with `status: 'scheduled'`, `campaign_id`, `user_id`, `caption`, `media_urls`, `scheduled_at`, `platform` (from selected accounts), `ai_suggested_time: !!suggestedTime`.
This write happens in the component's per-call `onSuccess` handler alongside the state transition to `'confirmed'`.

**Placement:** Added to each role's dashboard page as a card in the existing layout:
- `src/pages/BusinessDashboard.tsx` — after `ActivityFeedCard`
- `src/pages/CreatorDashboard.tsx` — replaces or augments the existing "Calendar widget" section
- `src/pages/BrandDashboard.tsx` — after the "Active Campaigns" feed

## Files to Modify

| File | Change |
|------|--------|
| `src/components/outstand/SocialPostPrompt.tsx` | Replace `<img>` row with `MediaPreviewGrid`; add confirmation state; add caption refresh; restructure dialog states |
| `src/components/campaigns/detail/DeliverablesArchive.tsx` | Stop passing `campaignDescription` as `originalCaption` — pass campaign title as context hint for AI generation |
| `src/components/my-campaigns/ActivePhaseView.tsx` | Pass campaign title context for AI caption generation |
| `src/components/my-campaigns/CompletedPhaseView.tsx` | Pass campaign title context for AI caption generation |
| `src/pages/OutstandManager.tsx` | Extract `isScheduled`, `isInPublishedFeed`, `postOutcome` to `src/lib/outstandUtils.ts`; update imports |
| `src/components/outstand/CalendarTab.tsx` | Update `isScheduled` import from new utility location; accept `onPostClick` handler for opening `PostManagementPanel`; add optional `initialDate?: Date` prop to allow the parent page to set the starting date (for `?date=` query param navigation) |
| `src/App.tsx` | Add `/calendar` route wrapped in `ProtectedRoute` |
| `src/pages/BusinessDashboard.tsx` | Add `UpcomingPostsWidget` card |
| `src/pages/CreatorDashboard.tsx` | Add/replace calendar section with `UpcomingPostsWidget` |
| `src/pages/BrandDashboard.tsx` | Add `UpcomingPostsWidget` card |

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/outstand/MediaPreviewGrid.tsx` | Featured hero frame + thumbnail row with selection |
| `src/components/outstand/PostManagementPanel.tsx` | Full post management dialog/sheet |
| `src/components/outstand/UpcomingPostsWidget.tsx` | Dashboard upcoming posts card |
| `src/components/outstand/ScheduleConfirmation.tsx` | Post-schedule confirmation view (extracted from SocialPostPrompt) |
| `src/pages/ContentCalendar.tsx` | Standalone calendar page with role-differentiated data fetching |
| `src/lib/outstandUtils.ts` | Extracted `isScheduled`, `isInPublishedFeed`, `postOutcome` utilities |

## Existing Components to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| `VideoFrameThumbnail` | `src/components/content/VideoFrameThumbnail.tsx` | Hero frame rendering for videos |
| `CalendarTab` | `src/components/outstand/CalendarTab.tsx` | Core calendar view (week/month/day) |
| `WeekGrid` / `MonthGrid` / `DayStrip` | `src/components/outstand/calendar/` | Calendar sub-views |
| `DonnyCaptionRewriter` | `src/components/outstand/DonnyCaptionRewriter.tsx` | Caption rewrite pattern for all roles |
| `useVideoFrameCapture` | `src/hooks/useVideoFrameCapture.ts` | Video first-frame extraction |
| `persistVideoThumbnail` | `src/lib/thumbnailBackfill.ts` | Thumbnail caching |
| `useDraftPosts` | `src/hooks/useDraftPosts.ts` | Draft post management |
| `Calendar` (shadcn) | `src/components/ui/calendar.tsx` | Date picker for rescheduling |

## Verification

1. **Video thumbnails:** Open "Ready to Share" on a campaign with video deliverables — hero frame should show the first frame with play button overlay, not a broken image.
2. **AI caption:** Open the dialog — caption should show AI-generated text (not campaign objective). Click refresh — caption should regenerate.
3. **Schedule confirmation:** Press "Schedule for Best Time" — dialog should transform to show scheduled time, platforms, and Donny's reasoning. "View on Calendar" should navigate to `/calendar` with the post highlighted.
4. **Calendar page:** Navigate to `/calendar` — should show week view with scheduled posts, platform filters, and navigation. Click a post to open the management panel.
5. **Post management:** Reschedule, remove, edit caption, change platforms, and Donny refresh should all work from the management panel.
6. **Dashboard widget:** Each role's dashboard should show "Upcoming Posts" card with scheduled posts and "See Full Calendar" link.
7. **Desktop/mobile:** All changes must work correctly on both viewports. Desktop uses Dialog, mobile uses Sheet. Calendar uses WeekGrid/MonthGrid on desktop, DayStrip on mobile.
