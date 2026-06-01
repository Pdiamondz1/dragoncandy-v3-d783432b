# DragonShare Video Frame Thumbnails — Design Spec

**Date:** 2026-06-01
**Author:** Dame (with Claude Code)
**Status:** Approved for planning

## Problem

DragonShare is the only content surface in DragonCandy that never renders a
real video frame. When a creator uploads or views **video** content, they see
a placeholder instead of the actual visual:

- During upload, a generic 🎬 emoji.
- After submission, a broken `<img>` (an `<img>` element cannot render a video
  file).

Photos already render correctly everywhere via a plain `<img>`. The gap is
specifically **video**. The desired behavior — already implemented for creator
portfolios and campaign content — is to show the actual hero frame of the
video as a poster image, for all roles.

### Affected surfaces (4)

| # | Surface | File | Current video behavior |
|---|---------|------|------------------------|
| 1 | Upload preview — desktop | `src/components/dragonshare/DragonShareInlineForm.tsx` | 🎬 emoji |
| 2 | Upload preview — mobile sheet | `src/components/dragonshare/DragonShareSubmitSheet.tsx` | 🎬 emoji |
| 3 | Post card — restaurant/brand boosting view | `src/components/dragonshare/DragonSharePostCard.tsx` | broken `<img>` |
| 4 | Post card — creator's own submitted list | `src/pages/CreatorDragonShare.tsx` (`CreatorPostCard`) | broken `<img>` |

Photos render fine on all four surfaces today; only the video path is broken.

## Decisions

These were settled during brainstorming and are fixed for this work:

1. **Approach: native poster frame.** Reuse the existing
   `src/components/shared/VideoThumbnail.tsx` component — the same one creator
   portfolios use (`CurrentPortfolioDisplay.tsx`). It renders the frame via a
   native `<video src="…#t=0.5" preload="metadata" muted playsInline>` element
   and falls back to a teal gradient + play icon on error. **No new component
   is created. No database changes are made.**
   - Rejected alternative: the campaign-style `VideoFrameThumbnail` (canvas
     capture + persisted thumbnail). It is keyed to the `file_uploads` table
     and would require a new nullable `thumbnail_url` column on
     `dragonshare_posts` plus a ledger-first schema review. Out of scope.

2. **Playback: static frame only.** The post cards show the frame as a poster
   image with a small play-icon badge to signal it is a video. No inline
   click-to-play. This matches the portfolio pattern and the stated goal
   ("see the content visual").

3. **Scope: all four surfaces.** Both upload previews and both post cards, so
   the frame is visible "once uploaded and seen for all roles."

## Solution

Reuse `<VideoThumbnail>` across all four surfaces, branching on whether the
content is a video. No changes to `VideoThumbnail.tsx` itself.

### Shared helper

Add a small, pure helper colocated with the DragonShare types so both post
cards share one definition (avoids duplicating the video-detection logic):

```ts
// src/types/dragonshare.ts
export function isVideoPost(post: Pick<DragonSharePost, 'content_type' | 'content_file_path'>): boolean {
  if (post.content_type === 'video') return true;
  const path = post.content_file_path ?? '';
  return /\.(mp4|webm|mov)$/i.test(path);
}
```

`content_type` is the primary signal (the submit form sets it to `'video'`
for any `video/*` upload — see `useDragonShareSubmitForm.ts`). The
extension fallback is defensive for any legacy/edge rows.

### Surface 1 & 2 — Upload previews

In both `DragonShareInlineForm.tsx` and `DragonShareSubmitSheet.tsx`, the
upload preview currently branches on `form.uploadedFileType?.startsWith('video/')`
and renders a `🎬` block for video. Replace that video block with:

```tsx
<VideoThumbnail src={form.uploadedUrl} className="h-32 w-full object-cover" />
```

The photo branch (`<img src={form.uploadedUrl} … />`) is unchanged. These two
files are edited independently. Only the inner render is swapped — no
responsive (`lg:`) classes are added, removed, or moved, so desktop and mobile
targets remain separate per project rules.

> Note: `form.uploadedUrl` is the storage public URL returned by
> `useDragonShareUpload`, a direct media URL that works as a `<video src>`.

### Surface 3 & 4 — Post cards

Both cards currently render:

```tsx
{contentImageUrl && (
  <img src={contentImageUrl} alt="…" className="w-full rounded-xl object-cover max-h-48" />
)}
```

Replace with a branch on `isVideoPost(post)`:

- **Video:** a relatively-positioned wrapper containing
  `<VideoThumbnail src={contentImageUrl} className="w-full object-cover max-h-48" />`
  plus a small translucent play-circle badge centered over it (mirroring the
  campaign thumbnail's `bg-black/50` play circle — a translucent overlay, not a
  gray surface, so it respects the no-gray design rule).
- **Photo:** the existing `<img>`, unchanged.

`contentImageUrl` comes from `useSignedUrl('dragonshare-content', post.content_file_path)`
— a direct media URL that works as a `<video src>`. The existing
`{contentImageUrl && …}` guard is preserved so nothing renders until the URL
resolves.

The rounded-corner / `overflow-hidden` framing currently on the `<img>` moves
to the video wrapper so the corners stay consistent with the card.

### Error & loading behavior

Inherited from `<VideoThumbnail>` with no extra code: a frame that fails to
load shows the teal gradient + play icon — never a broken image and never a
gray block. The native poster appears as the browser fetches video metadata,
so no separate spinner is needed.

## Out of Scope

- No schema/migration changes; `dragonshare_posts` is untouched.
- No persisted/cached thumbnails (the `VideoFrameThumbnail` approach).
- No inline video playback in post cards.
- No changes to photo rendering.
- No changes to `VideoThumbnail.tsx` itself.
- No changes to upload, submission, boosting, or payment logic.

## Testing

Add one lightweight Vitest test (co-located, e.g.
`src/components/dragonshare/DragonSharePostCard.test.tsx`) asserting:

- A post with `content_type: 'video'` renders a `<video>` element (poster
  frame), not a bare `<img>` for the content.
- A post with `content_type: 'photo'` renders an `<img>` for the content.

No existing test covers this card; this locks the fix. Mock `useSignedUrl`,
`useResolvedAvatarUrl`, and the flag mutation as needed.

## Verification (production, per standing instructions)

After pushing to `main` (Lovable auto-deploys the frontend) and confirming the
prod bundle hash has changed:

1. Via `/browser-use`, log in as the **creator** account, upload a short video:
   confirm the real frame shows in the upload preview, submit, and confirm the
   frame shows in the creator's submitted-posts list.
2. Log in as the **restaurant** account: confirm the same post shows the real
   frame in the boosting card.
3. Screenshot **desktop and mobile** viewports for each.
4. Open Chrome DevTools and confirm no console errors on the DragonShare pages.

Do not consider the task complete until video frames render on all four
surfaces in production with no console errors, on both viewports.

## Musk's Algorithm summary

- **Deletes:** the 🎬 emoji placeholder and the broken-image state.
- **Simplifies:** one shared `<VideoThumbnail>` + one `isVideoPost` helper
  replace bespoke per-surface rendering.
- **Automates:** nothing new.
- **Keystrokes removed:** 0 (display-only fix; no flow change).
