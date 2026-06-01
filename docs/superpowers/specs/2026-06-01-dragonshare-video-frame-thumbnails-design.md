# DragonShare Content Thumbnails — Design Spec

**Date:** 2026-06-01
**Author:** Dame (with Claude Code)
**Status:** Approved for planning

## Problem

DragonShare content does not display its real visual frame for all roles. Two
distinct defects combine to produce this:

1. **Video never renders a frame.** When a creator uploads or views *video*
   content, they see a placeholder instead of the actual visual — a generic 🎬
   emoji in the upload previews, and (in the post cards) nothing.
2. **Post cards re-sign an already-public URL and render nothing.** The
   `dragonshare-content` bucket is **public** (migration
   `20260526200000_dragonshare_optimization.sql`), and `useDragonShareUpload`
   stores the **full public URL** in `dragonshare_posts.content_file_path`. But
   both post cards feed that full URL into
   `useSignedUrl('dragonshare-content', content_file_path)`, which calls
   `supabase.storage.createSignedUrl(path)` expecting a **storage key**. A full
   URL is not a valid key, so the call returns nothing, `contentImageUrl` stays
   `undefined`, and the `{contentImageUrl && …}` guard renders **no thumbnail
   at all — photos or videos** — in either post card.

The desired behavior — already implemented for creator portfolios — is to show
the actual hero frame of the content as a poster image, for all roles.

### Affected surfaces (4)

| # | Surface | File | Current behavior |
|---|---------|------|------------------|
| 1 | Upload preview — desktop | `src/components/dragonshare/DragonShareInlineForm.tsx` | Photo shows; video → 🎬 emoji |
| 2 | Upload preview — mobile sheet | `src/components/dragonshare/DragonShareSubmitSheet.tsx` | Photo shows; video → 🎬 emoji |
| 3 | Post card — restaurant/brand boosting view | `src/components/dragonshare/DragonSharePostCard.tsx` | Nothing renders (broken signed-URL) |
| 4 | Post card — creator's own submitted list | `src/pages/CreatorDragonShare.tsx` (`CreatorPostCard`) | Nothing renders (broken signed-URL) |

The upload previews (1 & 2) already render photos correctly because they use
the valid `form.uploadedUrl` directly — only the video path is broken there.
The post cards (3 & 4) render nothing because of the URL-handling bug.

## Decisions

Settled during brainstorming; fixed for this work:

1. **Video approach: native poster frame.** Reuse the existing
   `src/components/shared/VideoThumbnail.tsx` — the same component creator
   portfolios use (`CurrentPortfolioDisplay.tsx`). It renders the frame via a
   native `<video src="…#t=0.5" preload="metadata" muted playsInline>` and
   falls back to a teal gradient + play icon on error. **No new component. No
   database changes.**
   - Rejected: the campaign-style `VideoFrameThumbnail` (canvas capture +
     persisted thumbnail). It is keyed to `file_uploads` and would require a new
     `dragonshare_posts.thumbnail_url` column + ledger-first review. Out of scope.

2. **Playback: static frame only.** Post cards show the frame as a poster image
   with a small play-icon badge to signal it is a video. No inline click-to-play.

3. **Scope: all four surfaces.** Both upload previews and both post cards.

4. **Post-card URL fix is included.** Both post cards use
   `post.content_file_path` directly as the media source (it is already a usable
   public URL) instead of re-signing it through `useSignedUrl`. This repairs
   photo thumbnails and is what makes the video-frame fix actually work.

## Solution

### Shared helper

Add a small pure helper colocated with the DragonShare types so both post cards
share one definition (avoids duplicating the video-detection logic):

```ts
// src/types/dragonshare.ts
export function isVideoPost(
  post: Pick<DragonSharePost, 'content_type' | 'content_file_path'>,
): boolean {
  if (post.content_type === 'video') return true;
  const path = post.content_file_path ?? '';
  return /\.(mp4|webm|mov)$/i.test(path);
}
```

`content_type` is the primary signal (the submit form sets it to `'video'` for
any `video/*` upload — `useDragonShareSubmitForm.ts` lines 23–25). The extension
fallback is defensive. The `Pick<…>` parameter is intentional so the helper
accepts the wider `DragonSharePostWithRelations` the cards hold without
requiring the caller to destructure — call it as `isVideoPost(post)`.

### Surface 1 & 2 — Upload previews

In both `DragonShareInlineForm.tsx` and `DragonShareSubmitSheet.tsx`, the upload
preview branches on `form.uploadedFileType?.startsWith('video/')` and renders a
fixed-height (`h-32`) `🎬` block for video. Replace **only that video block**
with a fixed-height wrapper holding `VideoThumbnail`:

```tsx
<div className="h-32 w-full overflow-hidden">
  <VideoThumbnail src={form.uploadedUrl} className="w-full h-full object-cover" />
</div>
```

- Import: `import { VideoThumbnail } from '@/components/shared/VideoThumbnail';`
- The `h-32` lives on the **wrapper** so `VideoThumbnail`'s error fallback
  (which is `w-full h-full`) fills the box instead of collapsing to 0px.
- The photo branch (`<img src={form.uploadedUrl} … className="h-32 w-full object-cover" />`)
  is unchanged.
- These two files are edited independently. Only the inner render is swapped —
  no responsive (`lg:`) classes are added, removed, or moved, so desktop and
  mobile targets remain separate per project rules.

> `form.uploadedUrl` is the storage public URL returned by
> `useDragonShareUpload`, a direct media URL that works as a `<video src>`.

### Surface 3 & 4 — Post cards

In both `DragonSharePostCard.tsx` and `CreatorDragonShare.tsx`'s
`CreatorPostCard`:

1. **Remove** the `useSignedUrl('dragonshare-content', post.content_file_path)`
   call and use the stored value directly:
   `const contentUrl = post.content_file_path;`
   (It is already a public URL on a public bucket. If a future writer ever
   stores a bare storage key instead of a URL, that would need re-signing — but
   the only current writer stores a public URL, so direct use is correct and
   removes a redundant network round-trip.)

2. **Replace** the current `{contentImageUrl && <img … className="w-full rounded-xl object-cover max-h-48" />}`
   block with a fixed-height, photo/video branch:

```tsx
{contentUrl && (
  <div className="relative h-48 w-full overflow-hidden rounded-xl">
    {isVideoPost(post) ? (
      <>
        <VideoThumbnail src={contentUrl} className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      </>
    ) : (
      <img src={contentUrl} alt="Submitted content" className="w-full h-full object-cover" />
    )}
  </div>
)}
```

- Imports: `VideoThumbnail` (named, from `@/components/shared/VideoThumbnail`),
  `isVideoPost` (from `@/types/dragonshare`), and `Play` (from `lucide-react`).
- The wrapper is `h-48` (a fixed height, replacing the old `max-h-48`) so both
  the poster and `VideoThumbnail`'s `h-full` error fallback fill the box and
  never collapse.
- The play-circle badge mirrors the campaign thumbnail's existing markup
  (`bg-black/50` translucent circle, `w-10 h-10`, white `Play` icon). It is a
  translucent black overlay, not a gray surface, so it is consistent with the
  no-gray design rule and with the existing `VideoFrameThumbnail` pattern.
- The photo path keeps the same visual framing it had (rounded corners, cover).

### Error & loading behavior

Inherited from `VideoThumbnail` with no extra code: a frame that fails to load
shows the teal gradient + play icon — never a broken image, never a gray block.
The native poster appears as the browser fetches video metadata, so no separate
spinner is needed. The fixed-height wrappers (above) guarantee the fallback
fills its box.

## Out of Scope

- No schema/migration changes; `dragonshare_posts` and the storage bucket are
  untouched.
- No persisted/cached thumbnails (the `VideoFrameThumbnail` approach).
- No inline video playback in post cards.
- No changes to `VideoThumbnail.tsx` itself.
- No changes to upload, submission, boosting, or payment logic.
- No change to how `content_file_path` is *written* (still a public URL).

## Testing

Add a co-located Vitest unit test for the pure helper:
`src/types/dragonshare.test.ts` (no React, no mocks):

- `content_type: 'video'` → `true` (regardless of path).
- `content_type: 'photo'` with a `.mp4`/`.mov`/`.webm` path → `true` (extension
  fallback).
- `content_type: 'photo'` with a `.jpg`/`.png` path → `false`.
- `content_file_path: null` and non-video `content_type` → `false`.

This locks the video-detection branch that drives all four surfaces, with no
component-mocking fragility (the cards pull in `AmplificationPreview`,
`BoostConfirmationSheet`, and several hooks, which would make a render test
heavy; the pure helper is the high-value, low-friction unit to test).

## Verification (production, per standing instructions)

After pushing to `main` (Lovable auto-deploys the frontend) and confirming the
prod bundle hash changed:

1. Via `/browser-use`, log in as the **creator** account, upload a short video:
   confirm the real frame shows in the upload preview, submit, then confirm the
   frame (with play badge) shows in the creator's submitted-posts list. Repeat
   with a photo to confirm photo thumbnails now render in the card too.
2. Log in as the **restaurant** account: confirm the same post shows the real
   frame in the boosting card.
3. Screenshot **desktop and mobile** viewports for each.
4. Open Chrome DevTools and confirm no console errors on the DragonShare pages.

Do not consider the task complete until content frames render on all four
surfaces in production (photo and video) with no console errors, on both
viewports.

## Musk's Algorithm summary

- **Deletes:** the 🎬 emoji placeholder, the broken-image/empty state, and a
  redundant `useSignedUrl` round-trip in both cards.
- **Simplifies:** one shared `VideoThumbnail` + one `isVideoPost` helper replace
  bespoke per-surface rendering; post cards use the stored URL directly.
- **Automates:** nothing new.
- **Keystrokes removed:** 0 (display-only fix; no flow change).
