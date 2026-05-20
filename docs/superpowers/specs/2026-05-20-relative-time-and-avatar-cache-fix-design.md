# Relative Time Display & Avatar Cache Invalidation Fix

**Date:** 2026-05-20
**Status:** Draft

## Context

Two bugs affect all three user roles (Restaurant, Creator, Brand):

1. **Dashboard activity banners show "0 days ago"** when a transactional notification (application, content submission) is less than 24 hours old. The `usePendingActions` hook computes `daysAgo` as a whole-day integer via `Math.floor`, so anything under 24 hours rounds to zero.

2. **Avatar/logo doesn't update after save.** Creator Ricky Ricardo updated his profile avatar and it did not display. Root cause: five cache layers block propagation — `useCreatorProfileSubmit` and `useBusinessProfileSubmit` don't invalidate React Query caches (unlike `useLocationProfileSubmit` which does), the signed URL cache holds stale URLs for up to 58 minutes, and the manual `profileCache` Map in `useProfileData` blocks refetch on navigation.

## Design

### Fix 1: Granular Relative Time

**Change:** Replace `PendingAction.daysAgo: number` with `PendingAction.occurredAt: string` (ISO timestamp). The field is named `occurredAt` because it maps to `campaign_applications.created_at` for application actions but `campaign_collaborations.updated_at` for content submission actions. Add a `formatRelativeTime(isoDate)` utility in `src/lib/campaignUtils.ts` alongside the existing `getRelativeTime`.

**Time tiers (singular for 1, plural for all other values):**
- < 60 seconds: "1 second ago" or "X seconds ago"
- < 60 minutes: "1 minute ago" or "X minutes ago"
- < 24 hours: "1 hour ago" or "X hours ago"
- >= 24 hours: "1 day ago" or "X days ago"

**Why not reuse `getRelativeTime`?** It uses abbreviated forms ("2h ago", "3d ago") which don't read well in the sentence context: "Roger applied to 'Summer Menu Drop' 2h ago." The banner needs full words.

**Why not `formatDistanceToNow` from date-fns?** It produces fuzzy output ("about 2 hours ago", "less than a minute ago") rather than exact numbers the user requested.

**Files:**
- Modify: `src/lib/campaignUtils.ts` — add `formatRelativeTime` export alongside existing `getRelativeTime`
- Modify: `src/hooks/usePendingActions.ts` — change interface `daysAgo: number` → `occurredAt: string`, map to `app.created_at` / `collab.updated_at`
- Modify: `src/components/dashboard/PendingActionBanners.tsx` — import `formatRelativeTime`, use in message string

### Fix 2: Avatar Cache Invalidation

**Change:** Add React Query invalidation + manual cache clearing in both creator and business profile submit hooks, matching the existing pattern in `useLocationProfileSubmit.ts`.

**Three actions after successful profile save:**
1. `clearSignedUrlCache()` — full wipe of the signed URL cache in `useSignedUrl.ts`. A full wipe is acceptable because signed URLs regenerate on next access (~one HTTP call each) and this only happens on profile save. Two other modules (`useBusinessDragonFeed.ts`, `useUniqueCreatorPortfolio.ts`) have their own independent `signedUrlCache` Maps, but those cache portfolio/feed content — not avatar/logo paths — so they don't need clearing.
2. `clearProfileCache(userId)` — clear the manual `profileCache` Map so dashboard header refetches. The `hasFetchedRef` in `useProfileData` gates re-fetching, but the Realtime subscription calls `fetchProfileData(true)` with `forceRefresh=true`, which bypasses that gate. So the refresh path is: `clearProfileCache` clears the Map → Realtime subscription fires on DB change → `fetchProfileData(true)` bypasses `hasFetchedRef` → fresh avatar loaded.
3. `queryClient.invalidateQueries(...)` — invalidate relevant React Query keys so dependent components refetch.

**Query keys to invalidate:**

Creator save:
- `['available-creators']` — Browse Creators page (`useCreatorBrowse.ts`, `CreatorMatchingSection.tsx`)

Business/Brand save:
- `['restaurant-profile', userId]` — restaurant profile data (`useRestaurantProfile.ts`)

Note: The creator dashboard header update does NOT flow through React Query — it uses the manual `profileCache` + Realtime subscription in `useProfileData.ts`. The `clearProfileCache` + Realtime path handles this case.

**New imports needed:**

`useCreatorProfileSubmit.ts`:
- `import { useQueryClient } from '@tanstack/react-query'`
- `import { clearSignedUrlCache } from '@/hooks/useSignedUrl'`
- `import { clearProfileCache } from '@/hooks/useProfileData'`

`useBusinessProfileSubmit.ts`:
- Same three imports. `userId` is already available as a function parameter.

**Files:**
- Modify: `src/hooks/useSignedUrl.ts` — export `clearSignedUrlCache()` (no args, full wipe)
- Modify: `src/hooks/useProfileData.ts` — export `clearProfileCache(userId?)`
- Modify: `src/hooks/useCreatorProfileSubmit.ts` — add `useQueryClient()` hook call + cache clearing after save
- Modify: `src/hooks/useBusinessProfileSubmit.ts` — add `useQueryClient()` hook call + cache clearing after save

## Verification

1. Log in as Restaurant (dwilliams@harbormill.net), verify the "0 days ago" banner now shows hours/minutes/seconds
2. Log in as Creator (damewillie@gmail.com), update avatar in Settings, verify it appears immediately on dashboard header and profile card
3. Log in as Business/Brand, update logo in Settings, verify it appears immediately across the app
4. Check console for errors after each change
5. Verify both desktop and mobile layouts
6. `npm run build` passes
