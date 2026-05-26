---
title: Empty Campaigns, Publishing Spinner, and Hero Frame Fixes
type: design
created: 2026-05-26
updated: 2026-05-26
status: draft
---

# Empty Campaigns, Publishing Spinner, and Hero Frame Fixes

## Context

Three UX bugs affecting production (dragoncandy.io):

1. **Empty campaigns "0"** — Creator campaign marketplace shows a big standalone "0" below the DragonCandy logo and "0 campaigns available" text when no campaigns exist. Brand discover campaigns page shows "0 of 0 campaigns". All should display a friendly empty state message instead.

2. **Publishing spinner stuck** — After successfully cross-posting to Instagram via Outstand, the publishing icon and Instagram icon keep spinning indefinitely on the Published tab. The post actually publishes — refreshing the page resolves the spinner. Client-side cache isn't refetching aggressively enough.

3. **Hero frame broken** — In the Manage Post dialog (Content Calendar) and the Published tab, both video thumbnails and static images from Outstand fail to render. Shows broken image placeholders. No error handling or fallbacks exist on any Outstand media elements.

## Fix 1: Empty Campaigns Display

### Root Cause

Two bugs on the creator side, one on brand:

**Big standalone "0"** — `CampaignSwipeCard.tsx:154` uses `{skippedCount && skippedCount > 0 && ...}`. When `skippedCount` is `0`, the `&&` short-circuits to the number `0`, which React renders as literal text "0" in the DOM. Classic React falsy-number gotcha.

**"0 campaigns available" text** — `CampaignSearchFilters.tsx:321-323` always renders `{filteredCount} campaign(s) available` regardless of count.

**Brand "0 of 0 campaigns"** — `AdvancedCampaignFilters.tsx:96` always renders `{filteredCount} of {totalCount} campaigns`.

### Changes

**`src/components/campaigns/CampaignSwipeCard.tsx`**
- Line 150: The ternary `{skippedCount && skippedCount > 0 ? ... : ...}` also short-circuits to `0` when `skippedCount` is `0` (same React gotcha). This line is replaced wholesale by the new static message below.
- Line 154: Change `{skippedCount && skippedCount > 0 && onShowSkipped && (...)}` to `{skippedCount > 0 && onShowSkipped && (...)}`
- Lines 148-153: Replace "All caught up!" heading and the conditional subtitle ternary with a single static message: "Hey! There are no available campaigns to view at this time! Please check back later!"
- **Preserve the "Show Skipped" button** (lines 154-161) — it still renders when `skippedCount > 0` after the fix above.

**`src/components/campaigns/CampaignSearchFilters.tsx`**
- Lines 321-323: Conditionally hide count when `filteredCount === 0` and `!hasActiveFilters`. When filters are active and narrowing results, keep the count visible.

**`src/pages/CreatorCampaignMarketplace.tsx`**
- Lines 294-298 (desktop empty state): Replace "No campaigns available" heading and "You've reviewed all available campaigns" subtitle with the same friendly message.

**`src/pages/BrandDiscoverCampaigns.tsx`**
- Lines 174-176: When `campaigns.length === 0`, replace "No campaigns are currently open for sponsorship" with the friendly message.

**`src/components/campaigns/AdvancedCampaignFilters.tsx`**
- Line 96: Hide the count text when `filteredCount === 0 && totalCount === 0`.

### Empty State Message (all roles)

> Hey! There are no available campaigns to view at this time! Please check back later!

This message replaces existing empty state text in both Creator (mobile swipe card + desktop grid) and Brand (discover campaigns) views. The DragonCandy logo / Target / Search icons remain as visual anchors above the message. "Reset Filters" button still appears when filters are active.

## Fix 2: Publishing Spinner

### Root Cause

`useCrossPost.ts:53-58` calls `invalidateQueries({ queryKey: ['outstand'] })` on success, which marks the cache as stale but does not force an immediate refetch. The Published tab's post status stays on `'pending'`, keeping the `Loader2` spinner active in `AccountStatusPill` and `PostStatusBadge` components.

### Changes

**`src/hooks/outstand/useCrossPost.ts`**
- Keep the existing `invalidateQueries({ queryKey: ['outstand'] })` call for cache consistency.
- Additionally, use the `refetch` callback from `usePosts` (the third-party `@outstand-so/ui` hook) to force an immediate data refresh. Since `useCrossPost` doesn't have direct access to the `refetch` function, pass it as an option or accept a `onPublished` callback that the consuming component (e.g., `OutstandManager.tsx` which has `refetch: refetchPosts` at line 62) can wire up to trigger `refetchPosts()` after a 3-second delay via `setTimeout`.

**`src/pages/OutstandManager.tsx`**
- Wire the `useCrossPost` mutation's `onSuccess` to call `refetchPosts()` after a 3-second `setTimeout`. This uses the `refetch` callback already available from `usePosts` at line 62, bypassing any query key mismatch issues with the third-party library.

**`src/components/outstand/PublishedTab.tsx`**
- In `AccountStatusPill` (line 245) and `PostStatusBadge` (lines 205-227): Add a staleness check based on the post's `publishedAt` or `createdAt` timestamp (not a mount-time timer, which would be fragile across unmount/remount cycles). If `status === 'pending'` and the post was created more than 60 seconds ago, display a neutral "Status updating..." label instead of an infinite spinner. This prevents indefinite spinning for genuinely stale pending states.

## Fix 3: Branded Fallback for Broken Outstand Media

### Root Cause

All Outstand media rendering uses raw Outstand URLs directly with zero error handling. When these URLs are inaccessible (expired tokens, CORS, temporary outages), both `<img>` and `<video>` elements silently break. `DraftsTab.tsx:150` is the only component that handles this (via `onError` hiding the element), but even that doesn't show a visual fallback.

### Changes

**Branded fallback pattern** — When an Outstand media element fails to load, render a DragonCandy-branded placeholder: teal gradient background with the DragonCandy logo centered, no title text (unlike the `CampaignSwipeCard.tsx:234-241` pattern which includes `{campaign.title}`, the Outstand media context has no campaign title available — just show the logo). Each media element gets an `onError` handler that flips a local `useState` flag, conditionally rendering the fallback.

**`src/components/outstand/PostManagementPanel.tsx` (lines 195-212)**
- Wrap the hero media section with error state. Add `onError` to the `<img>` element. For `VideoFrameThumbnail`, wrap in an error boundary or add error detection via the component's existing timeout behavior. On failure, render the branded fallback.

**`src/components/outstand/postUtils.tsx` MediaPreviewStrip (lines 64-82)**
- Convert `MediaPreviewStrip` to use error-aware media items. Add `onError` handlers to both `<img>` (line 76) and `<video>` (line 74) elements. On failure, show the branded fallback scaled to the strip item size.

**`src/components/outstand/MediaPreviewGrid.tsx`**
- Add `onError` handlers to `<img>` elements at lines 54 and 92. On failure, render the branded fallback.

### Viewport Coverage

`PostManagementPanel` (modal) and `PublishedTab` already render responsively via existing Tailwind classes — a single code change covers both mobile and desktop viewports. No `lg:` / base class separation needed.

## Verification Plan

1. **Empty campaigns:** Log in as creator (damewillie@gmail.com), navigate to Campaigns. Verify no "0" appears, the friendly message displays, and the filter count is hidden. Repeat for brand (damesonpoint@gmail.com) on Discover Campaigns.

2. **Publishing spinner:** Cross-post content to Instagram from the Restaurant Dashboard Social Media Manager. After publishing, verify the spinner resolves within 5–10 seconds without manual refresh. Verify the Published tab naturally updates status on a 30-second interval.

3. **Hero frame:** Navigate to the Content Calendar, open a scheduled post in the Manage Post dialog. If the Outstand media URL fails, verify the branded fallback renders instead of a broken image. Check Published tab post cards for the same fallback behavior.

4. **Console errors:** Open Chrome DevTools on each page and verify no new console errors.

5. **Viewport check:** Test all fixes on both desktop (1440px) and mobile (375px) viewports.
