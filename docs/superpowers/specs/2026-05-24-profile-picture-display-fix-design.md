# Profile Picture Display Fix — Design Spec

## Context

Profile pictures uploaded by users (all roles: creator, restaurant, brand) do not display across the DragonCandy app. A user can upload and crop an avatar on their settings page and see it in the preview immediately, but after a page refresh the picture disappears — even from the settings page. It never appears in the nav bar, campaign cards, creator browse, profile modals, or any other surface.

**Root causes identified:**

1. **No auto-save after upload.** The avatar upload writes the file to Supabase Storage and stores the storage path in form state, but the database is only updated on field blur — meaning users can upload an avatar and navigate away before it's persisted.

2. **17 display components pass raw storage paths as image src.** The database stores a relative storage path (e.g., `userId/avatar-1716569234567.jpg`), not a displayable URL. Components must convert this path to a signed URL via `getSignedProfileUrl()` or `useSignedUrl()` before rendering. 17 components skip this step and pass the raw path directly, which fails silently — the image never loads and the fallback (initials or placeholder icon) displays instead.

3. **`profiles.avatar_url` is never synced.** The upload only writes to `creator_profiles.avatar_url` or `business_profiles.logo_url`. The base `profiles.avatar_url` column is never updated. Any component or context reading from `profiles` gets `null`.

## Approach

### Part 1: Auto-save avatar to DB immediately after upload

**Files modified:**
- `src/components/creator-profile/AvatarUpload.tsx`
- `src/components/business-profile/FileUploadSection.tsx`

After `uploadProfileAsset()` succeeds and returns the storage path, immediately write that path to the database — a targeted update of just `avatar_url` (or `logo_url` for businesses). This happens before the user interacts with any other form field.

The existing `onAvatarUrlChange` callback still fires to keep form state in sync. A new direct DB write is added alongside it. After the write, clear the signed URL cache and profile cache to ensure the rest of the app picks up the change.

Also update `profiles.avatar_url` in the same operation (Part 4).

**RLS note:** The `profiles` table has RLS enabled. The authenticated user already has UPDATE permission on their own row (same policy that allows updating `full_name`, `org_id`, etc.), so writing `avatar_url` requires no policy changes.

### Part 2: Rename `useResolvedLogoUrl` to `useResolvedStorageUrl`

The existing `useResolvedLogoUrl` hook in `src/hooks/useSignedUrl.ts` already does exactly what's needed — it checks for HTTP prefix, and if not, calls `useSignedUrl('profile-assets', path)`. Rather than creating a duplicate hook, rename `useResolvedLogoUrl` to `useResolvedStorageUrl` and export an alias `useResolvedAvatarUrl` for semantic clarity.

```typescript
export function useResolvedStorageUrl(
  path: string | null | undefined
): string | undefined

// Aliases for semantic clarity
export const useResolvedAvatarUrl = useResolvedStorageUrl;
export const useResolvedLogoUrl = useResolvedStorageUrl;
```

- If `path` is null/undefined/empty, returns `undefined`
- If `path` starts with `http://` or `https://`, returns it unchanged
- Otherwise, calls `useSignedUrl('profile-assets', path)` and returns the signed URL

All existing `useResolvedLogoUrl` call sites continue to work unchanged. New avatar components use `useResolvedAvatarUrl`.

**File modified:** `src/hooks/useSignedUrl.ts`

### Part 3: Fix 17 broken display components

Each component listed below currently passes a raw storage path as `<AvatarImage src>` or `<img src>`. Each will be updated to resolve the path first.

**Direct hook call** (single avatar per component):

| # | File | Context |
|---|------|---------|
| 1 | `src/components/campaigns/ApplicationCard.tsx` | Campaign application avatar |
| 2 | `src/components/campaigns/CreatorMatchCard.tsx` | Campaign match avatar |
| 3 | `src/components/campaigns/CreatorProfileModal.tsx` | Campaign profile modal |
| 4 | `src/components/campaigns/CampaignCard.tsx` | Campaign card creator avatar |
| 5 | `src/components/creator-browse/CreatorMapView.tsx` | Map view avatar |
| 6 | `src/components/creator-profile/ContactCreatorModal.tsx` | Contact modal avatar |
| 7 | `src/components/donny/DonnyRichCard.tsx` | Donny AI card avatar |
| 8 | `src/components/dragonshare/DragonSharePostCard.tsx` | DragonShare post avatar |
| 9 | `src/components/reviews/ReviewCard.tsx` | Review card avatar |
| 10 | `src/components/settings/ProfileCompletionBar.tsx` | Profile completion avatar |

**`<ResolvedAvatar>` wrapper** needed (rendered inside `.map()` loops — hooks can't be called in loops):

| # | File | Context |
|---|------|---------|
| 11 | `src/components/campaigns/CreatorApplicationsCard.tsx` | Creator application cards (`.map`) |
| 12 | `src/components/campaigns/CreatorMatchingSection.tsx` | Match section avatars (`.map`) |
| 13 | `src/components/campaigns/ReHireCreatorsModal.tsx` | Re-hire modal avatars (`.map`) |
| 14 | `src/pages/AdminDragonShareQueue.tsx` | Admin queue avatars (`.map`) |
| 15 | `src/pages/OrgBillingPage.tsx` | Org billing member avatars (`.map`) |
| 16 | `src/pages/TeamPage.tsx` | Team member avatars (`.map`) |
| 17 | `src/components/files/FileCommentsPanel.tsx` | File comment avatars (2 instances, rendered in list) |

The `<ResolvedAvatar>` wrapper is a small component placed in `src/components/ui/resolved-avatar.tsx` that accepts a `path` prop, calls `useResolvedAvatarUrl(path)` internally, and renders the shadcn `Avatar` / `AvatarImage` / `AvatarFallback` with the resolved URL.

**Note on `FileCommentsPanel.tsx` line ~122:** This instance uses `user?.user_metadata?.avatar_url` from Supabase Auth metadata, not a storage path. Auth metadata avatars are either full URLs (from OAuth providers like Google) or null. The `useResolvedStorageUrl` hook handles HTTP URLs correctly (passes through unchanged) and handles null (returns undefined), so applying the same pattern is safe. However, uploading a new avatar does NOT update `user_metadata.avatar_url` — that field reflects the OAuth provider's avatar. This is a separate issue outside this spec's scope.

### Part 4: Sync `profiles.avatar_url`

When `creator_profiles.avatar_url` or `business_profiles.logo_url` is updated (either via auto-save in Part 1 or full form submit), also write the same value to `profiles.avatar_url`. This is a single additional Supabase update call. Components reading from the `profiles` table (e.g., `OrgBillingPage`, `TeamPage` via `org_members` join) will then have the current avatar.

**Files modified:**
- `src/components/creator-profile/AvatarUpload.tsx` (auto-save path)
- `src/components/business-profile/FileUploadSection.tsx` (auto-save path)
- `src/hooks/useCreatorProfileSubmit.ts` (full form submit path)
- `src/hooks/useBusinessProfileSubmit.ts` (full form submit path)

### Follow-up (out of scope)

- `src/components/brand-browse/ShortlistDrawer.tsx` manually calls `createSignedUrl` inline instead of using the shared hook. Should be migrated to `useResolvedAvatarUrl` for consistency in a follow-up.
- Signed URLs expire after ~58 minutes. If a user leaves a tab open for over an hour, avatar images break silently. A background refresh mechanism is a future improvement.

## Verification

1. **Upload persistence:** Upload an avatar as creator (Ricky Ricardo), refresh the page — avatar should still show on settings page.
2. **Nav bar:** After upload, the nav bar avatar (top-right) should update from "R" initial to the actual photo. (The nav bar already uses `useProfileData` which resolves signed URLs — it will work once auto-save persists the path to DB.)
3. **Browse creators:** Log in as restaurant, go to Browse Creators — Ricky Ricardo's card and profile modal should show his avatar.
4. **Campaign cards:** Go to My Campaigns — assigned creator chips should show the creator's avatar, not initials.
5. **Campaign detail:** Open a campaign detail page — the assigned creator section should show the avatar.
6. **Business logo:** Upload a logo as restaurant, verify it displays across creator-facing views (campaign cards, profile strips).
7. **Brand logo:** Same test for brand role.
8. **Desktop and mobile:** Verify all above on both viewports. Avatar sizes and ring styles should match the design system.
9. **Console errors:** Open Chrome DevTools on production — no new console errors related to image loading or signed URLs.
10. **Build:** `npm run build` passes with no errors.
