# Fix Portfolio Content Display & Nav Avatar

## Context

Creator portfolio content (both images and videos) shows broken image icons when viewed from the Business Dashboard Browse Creators page. The root cause is that `getContentType()` — used to differentiate images from videos — fails on Supabase signed URLs because JWT tokens contain dots that break the file extension parser. This has never worked reliably. Additionally, the Restaurant account's nav avatar may be missing due to no uploaded logo or a similar signed URL issue.

## Root Cause

`getContentType()` extracts file extensions via `url.split('.').pop()?.toLowerCase().split('?')[0]`. Supabase signed URLs contain JWT tokens with dots (e.g., `eyJhbG.eyJleH.signature`), so `.split('.').pop()` returns a JWT fragment instead of the actual file extension. This causes:

1. **All content types detected as `null`** — videos render as `<img>` tags (broken), images lose thumbnail optimization
2. **Video-only creator cards show no thumbnail** — `CreatorCard` skips videos in its fallback chain and shows initials
3. **`PublicCreatorProfile` hero image** — picks the first portfolio URL (possibly video) and renders it in an `<img>` tag

The same bug exists in `isVideoPath()` in `CreatorCard.tsx` (line 34-37), which uses the identical `url.split('.').pop()` pattern.

## Approach

Detect media type from the **original storage path** (before URL signing) rather than from the signed URL. The raw storage paths from `creator_profiles.portfolio_urls` always have clean extensions (e.g., `users/uuid/portfolio/video.mp4`). Carry the pre-computed type alongside the signed URL through the rendering pipeline.

## Changes

### 1. Shared utility: robust `getMediaType` function

Extract a single shared `getMediaType` function that works on both raw storage paths and full URLs by parsing the URL pathname:

```typescript
function getMediaType(url: string): 'Photo' | 'Reel' | null {
  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (!ext) return null;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Photo';
    if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'Reel';
    return null;
  } catch {
    // Fallback for non-URL strings (raw storage paths like "users/uuid/file.mp4").
    // Safe because raw paths have no JWT dots. Do NOT use for signed URLs.
    const ext = url.split('.').pop()?.toLowerCase();
    if (!ext) return null;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Photo';
    if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'Reel';
    return null;
  }
}
```

This replaces all three local copies: `getContentType()` in `CreatorProfileModal` and `PublicCreatorProfile`, and `isVideoPath()` in `CreatorCard`.

### 2. Portfolio item type

Define a shared interface for resolved portfolio items:

```typescript
interface ResolvedPortfolioItem {
  url: string;                        // signed URL for rendering
  type: 'Photo' | 'Reel' | null;     // pre-computed from raw storage path
}
```

### 3. `CreatorProfileModal.tsx`

**Current:** Resolves `portfolio_urls` to signed URLs (`string[]`), then calls `getContentType()` on signed URLs during render.

**Fix:** During the signing step (lines 142-153), call `getMediaType(rawPath)` on each raw storage path BEFORE calling `getSignedProfileUrl(rawPath)`. Produce `ResolvedPortfolioItem[]`. Update `portfolioUrls` state type from `string[]` to `ResolvedPortfolioItem[]`. The rendering grid (lines 448-497) already has `isVideo` branching — wire it to `item.type === 'Reel'`.

Note: `CreatorProfileModal` has a branching path where some URLs may already be full HTTP URLs (line 146). For these, `getMediaType` still works because it uses `new URL(url).pathname` to extract the path before parsing extensions.

Update `toThumbnailUrl()` to accept the pre-computed type rather than re-deriving it:

```typescript
const toThumbnailUrl = (url: string, type: 'Photo' | 'Reel' | null, width = 540): string => {
  if (type !== 'Photo') return url;
  // ... existing transform logic unchanged
};
```

Remove the local `getContentType()` function (lines 75-81).

### 4. `PublicCreatorProfile.tsx`

**Fix:** Same approach — replace local `getContentType()` (lines 59-65) and local `toThumbnailUrl()` (lines 69-76) with the shared `getMediaType` utility and the updated `toThumbnailUrl` that accepts pre-computed type. During URL resolution (lines 210-230), produce `ResolvedPortfolioItem[]`.

**Hero image fix (line 272):** Currently `const heroImage = portfolioUrls[0] || avatarUrl` picks the first portfolio URL regardless of type, rendering it in an `<img>` tag. Change to prefer the first image-type portfolio item:

```typescript
const heroImage = portfolioItems.find(item => item.type === 'Photo')?.url || avatarUrl;
```

### 5. `CreatorCard.tsx` — Video thumbnail support

**Current:** Lines 54-66 try `avatar_url` first, then fall back to first non-video portfolio item. If avatar fails AND first portfolio is video, shows initials.

**Fix:** Replace `isVideoPath()` (lines 34-37) with the shared `getMediaType` function. When `avatar_url` is absent/failed AND the first portfolio item is a video, render a `<video>` element with `preload="metadata"` and `#t=0.5` as the card thumbnail, with a small play icon overlay. Add a state `isVideoThumbnail` to track this.

**Video frame fallback:** If `<video>` metadata fails to load (e.g., `.mov` in Chrome), fall back to a gradient background with a centered play icon — same visual weight as the initials fallback, but communicating "video content available."

### 6. Remove dead `CreatorPortfolioModal` usage from `CreatorCard`

`CreatorCard.tsx` renders `CreatorPortfolioModal` (lines 211-222) but `setIsPortfolioOpen(true)` is never called — this is dead code. The actual lightbox is `PortfolioLightbox` inside `CreatorProfileModal`, which already has full video support.

**Fix:** Remove the `CreatorPortfolioModal` import, the `isPortfolioOpen`/`portfolioIndex` state, and the `resolvedPortfolioUrls` state and its effect (lines 69-79) from `CreatorCard.tsx`. This deletes ~25 lines of dead code and removes the only caller of `CreatorPortfolioModal`.

`CreatorPortfolioModal.tsx` itself becomes unused but will be left in place (not deleted) to avoid risk. It can be cleaned up in a future pass.

### 7. Nav avatar investigation

`useProfileData.ts` line 79 fetches `business_profiles.logo_url` for restaurant accounts. If `logo_url` is null (no logo uploaded), the fallback initial letter is shown — that's expected behavior, not a bug. During implementation, check the database for the Harbormill account's `logo_url` value. If null, inform the user to upload a logo. If a value exists but doesn't render, debug signed URL generation.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/mediaUtils.ts` (new) | Shared `getMediaType` utility function |
| `src/components/creator-browse/CreatorProfileModal.tsx` | Replace `getContentType` with `getMediaType`, pre-compute types from raw paths, update `toThumbnailUrl` to accept type, update state to `ResolvedPortfolioItem[]` |
| `src/pages/PublicCreatorProfile.tsx` | Replace `getContentType`/`toThumbnailUrl` with shared util, pre-compute types, fix hero image to skip video items |
| `src/components/creator-browse/CreatorCard.tsx` | Replace `isVideoPath` with `getMediaType`, add `<video>` thumbnail support with fallback, remove dead `CreatorPortfolioModal` code |

## Out of Scope

- Schema changes (no new columns needed)
- Thumbnail generation infrastructure (FFmpeg, server-side frame extraction)
- Deleting `CreatorPortfolioModal.tsx` file (leave unused, clean up later)
- Adding video support to `CreatorPortfolioModal` (dead code, not worth investing in)

## Verification

1. **Video portfolio display:** Log in as Restaurant → Browse Creators → click a creator with video content → portfolio grid should show video thumbnails with play icon overlay
2. **Video lightbox:** Click a video thumbnail → lightbox should play the video with controls
3. **Image portfolio display (regression):** Verify image-only portfolios still render correctly with thumbnail optimization
4. **Mixed portfolio:** Verify a portfolio with both images and videos renders each type correctly in the grid
5. **Creator cards — video thumbnail:** Video-only creators should show a video frame or play-icon fallback on the Browse page
6. **Creator cards — image thumbnail (regression):** Image-portfolio creators still show their image thumbnail
7. **Public profile:** Visit a public creator profile → portfolio and hero image render correctly, hero prefers image over video
8. **Nav avatar:** Check the top-right avatar for the Restaurant account — verify database state
9. **Console errors:** Open Chrome DevTools → verify no media-related console errors
10. **Build:** Run `npm run build` to confirm no TypeScript errors
