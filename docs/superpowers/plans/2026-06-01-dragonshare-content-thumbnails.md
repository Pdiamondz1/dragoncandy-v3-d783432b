# DragonShare Content Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the real visual frame of DragonShare content (photo thumbnails and video poster frames) across all four DragonShare surfaces for every role.

**Architecture:** Reuse the existing `VideoThumbnail` component (the creator-portfolio pattern) for video frames; add one pure `isVideoPost` helper to decide photo-vs-video; and fix a URL bug in the two post cards where an already-public URL is wrongly re-signed through `useSignedUrl` (which renders nothing). No new components, no database/schema changes.

**Tech Stack:** React 18 + TypeScript (strict, `noUnusedLocals`), Vite, Tailwind (`dc-*` tokens), Vitest + @testing-library, Supabase Storage (public `dragonshare-content` bucket).

**Spec:** `docs/superpowers/specs/2026-06-01-dragonshare-video-frame-thumbnails-design.md`

---

## Background the engineer needs

- `dragonshare_posts.content_file_path` stores a **full public URL** (written by `useDragonShareUpload`, which calls `getPublicUrl`). It is NOT a storage key.
- `useSignedUrl(bucket, path)` calls `supabase.storage.createSignedUrl(path)`, which expects a **storage key**. Passing a full URL fails silently → returns `undefined` → the post cards' `{contentImageUrl && …}` guard renders nothing. So today **both post cards show no content thumbnail at all** (photo or video).
- The bucket `dragonshare-content` is **public** (`supabase/migrations/20260526200000_dragonshare_optimization.sql`), so the stored public URL can be used directly as an `<img src>` / `<video src>`.
- `VideoThumbnail` (`src/components/shared/VideoThumbnail.tsx`) renders `<video src="{src}#t=0.5" preload="metadata" muted playsInline>` and, on error, a teal-gradient + play-icon fallback that is `w-full h-full`. Because the fallback ignores any height in the passed `className`, the **caller must provide a fixed-height wrapper** or the fallback collapses to 0px.
- `tsconfig.app.json` has `noUnusedLocals: true` — removing the last use of an import means the import must also be removed, or `npm run build`/`typecheck` will fail.

## File Structure

- **Modify** `src/types/dragonshare.ts` — add the pure `isVideoPost` helper.
- **Create** `src/types/dragonshare.test.ts` — unit tests for `isVideoPost`.
- **Modify** `src/components/dragonshare/DragonShareInlineForm.tsx` — desktop upload preview, video branch.
- **Modify** `src/components/dragonshare/DragonShareSubmitSheet.tsx` — mobile upload preview, video branch.
- **Modify** `src/components/dragonshare/DragonSharePostCard.tsx` — restaurant/brand boosting card: URL fix + photo/video branch.
- **Modify** `src/pages/CreatorDragonShare.tsx` — `CreatorPostCard`: URL fix + photo/video branch.

---

## Task 1: `isVideoPost` helper (TDD)

**Files:**
- Modify: `src/types/dragonshare.ts` (append after the existing interfaces)
- Test: `src/types/dragonshare.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/types/dragonshare.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isVideoPost } from './dragonshare';

describe('isVideoPost', () => {
  it('returns true when content_type is video, regardless of path', () => {
    expect(isVideoPost({ content_type: 'video', content_file_path: null })).toBe(true);
    expect(isVideoPost({ content_type: 'video', content_file_path: 'https://x/a.jpg' })).toBe(true);
  });

  it('returns true for a non-video content_type with a video file extension', () => {
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/clip.mp4' })).toBe(true);
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/clip.MOV' })).toBe(true);
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/clip.webm' })).toBe(true);
  });

  it('returns false for a photo with an image path', () => {
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/pic.jpg' })).toBe(false);
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/pic.png' })).toBe(false);
  });

  it('returns false when path is null and content_type is not video', () => {
    expect(isVideoPost({ content_type: 'photo', content_file_path: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/types/dragonshare.test.ts`
Expected: FAIL — `isVideoPost` is not exported / not a function.

- [ ] **Step 3: Add the helper**

Append to `src/types/dragonshare.ts` (after the last interface, end of file):

```ts
export function isVideoPost(
  post: Pick<DragonSharePost, 'content_type' | 'content_file_path'>,
): boolean {
  if (post.content_type === 'video') return true;
  const path = post.content_file_path ?? '';
  return /\.(mp4|webm|mov)$/i.test(path);
}
```

(The `Pick<…>` parameter is intentional so callers can pass the wider `DragonSharePostWithRelations` without destructuring.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/types/dragonshare.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/dragonshare.ts src/types/dragonshare.test.ts
git commit -m "feat(dragonshare): add isVideoPost helper with tests"
```

---

## Task 2: Desktop upload preview video frame

**Files:**
- Modify: `src/components/dragonshare/DragonShareInlineForm.tsx`

- [ ] **Step 1: Add the import**

At the top of the file, add (after the existing component imports):

```tsx
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';
```

- [ ] **Step 2: Replace the video branch of the preview**

Find this block (inside the `form.uploadedUrl` truthy branch):

```tsx
{form.uploadedFileType?.startsWith('video/') ? (
  <div className="h-32 bg-dc-dark/10 flex items-center justify-center">
    <span className="text-3xl">🎬</span>
  </div>
) : (
  <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
)}
```

Replace the **video branch only** so it becomes:

```tsx
{form.uploadedFileType?.startsWith('video/') ? (
  <div className="h-32 w-full overflow-hidden">
    <VideoThumbnail src={form.uploadedUrl} className="w-full h-full object-cover" />
  </div>
) : (
  <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
)}
```

The photo branch is unchanged. No `lg:` classes are touched (desktop target stays isolated).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dragonshare/DragonShareInlineForm.tsx
git commit -m "fix(dragonshare): show real video frame in desktop upload preview"
```

---

## Task 3: Mobile upload preview video frame

**Files:**
- Modify: `src/components/dragonshare/DragonShareSubmitSheet.tsx`

- [ ] **Step 1: Add the import**

At the top of the file add:

```tsx
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';
```

- [ ] **Step 2: Replace the video branch of the preview**

Find this block:

```tsx
{form.uploadedFileType?.startsWith('video/') ? (
  <div className="h-32 bg-dc-dark/10 flex items-center justify-center">
    <span className="text-3xl">🎬</span>
  </div>
) : (
  <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
)}
```

Replace the **video branch only**:

```tsx
{form.uploadedFileType?.startsWith('video/') ? (
  <div className="h-32 w-full overflow-hidden">
    <VideoThumbnail src={form.uploadedUrl} className="w-full h-full object-cover" />
  </div>
) : (
  <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
)}
```

This is the mobile bottom-sheet surface (base classes); leave it as the mobile target.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dragonshare/DragonShareSubmitSheet.tsx
git commit -m "fix(dragonshare): show real video frame in mobile upload sheet"
```

---

## Task 4: Boosting post card — URL fix + photo/video frame

**Files:**
- Modify: `src/components/dragonshare/DragonSharePostCard.tsx`

- [ ] **Step 1: Fix imports**

The current import line is:

```tsx
import { useResolvedAvatarUrl, useSignedUrl } from '@/hooks/useSignedUrl';
```

Change it to drop `useSignedUrl` (it becomes unused — `noUnusedLocals` would otherwise fail):

```tsx
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
```

Update the lucide-react import to add `Play`:

```tsx
import { ExternalLink, Flag, Play } from 'lucide-react';
```

Add the two new imports (with the other component/type imports):

```tsx
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';
```

And add `isVideoPost` to the existing dragonshare types import. The current line:

```tsx
import { BOOST_TIERS } from '@/types/dragonshare';
```

becomes:

```tsx
import { BOOST_TIERS, isVideoPost } from '@/types/dragonshare';
```

- [ ] **Step 2: Replace the signed-URL call with direct use**

Find:

```tsx
const contentImageUrl = useSignedUrl('dragonshare-content', post.content_file_path);
```

Replace with:

```tsx
const contentUrl = post.content_file_path;
```

- [ ] **Step 3: Replace the content preview block**

Find:

```tsx
{/* Content image preview */}
{contentImageUrl && (
  <div className="px-4 pb-3">
    <img
      src={contentImageUrl}
      alt="Content preview"
      className="w-full rounded-xl object-cover max-h-48"
    />
  </div>
)}
```

Replace with:

```tsx
{/* Content preview */}
{contentUrl && (
  <div className="px-4 pb-3">
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
        <img src={contentUrl} alt="Content preview" className="w-full h-full object-cover" />
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (confirms no leftover unused `useSignedUrl`/`contentImageUrl`).

- [ ] **Step 5: Commit**

```bash
git add src/components/dragonshare/DragonSharePostCard.tsx
git commit -m "fix(dragonshare): render content thumbnail in boosting card via public URL"
```

---

## Task 5: Creator's submitted-posts card — URL fix + photo/video frame

**Files:**
- Modify: `src/pages/CreatorDragonShare.tsx`

- [ ] **Step 1: Fix imports**

Current line:

```tsx
import { useResolvedLogoUrl, useSignedUrl } from '@/hooks/useSignedUrl';
```

Drop `useSignedUrl`:

```tsx
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
```

Update lucide import to add `Play`:

```tsx
import { ExternalLink, Clock, CheckCircle, Play } from 'lucide-react';
```

Add `isVideoPost` to the dragonshare types import. Current:

```tsx
import type { DragonSharePostWithRelations } from '@/types/dragonshare';
```

Add a value import alongside it (keep the existing `type` import):

```tsx
import { isVideoPost } from '@/types/dragonshare';
```

Add the VideoThumbnail import (with the other component imports):

```tsx
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';
```

- [ ] **Step 2: Replace the signed-URL call (inside `CreatorPostCard`)**

Find:

```tsx
const contentImageUrl = useSignedUrl('dragonshare-content', post.content_file_path);
```

Replace with:

```tsx
const contentUrl = post.content_file_path;
```

- [ ] **Step 3: Replace the content preview block (inside `CreatorPostCard`)**

Find:

```tsx
{contentImageUrl && (
  <img
    src={contentImageUrl}
    alt="Submitted content"
    className="w-full rounded-xl object-cover max-h-48"
  />
)}
```

Replace with:

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

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreatorDragonShare.tsx
git commit -m "fix(dragonshare): render content thumbnail in creator card via public URL"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the test suite**

Run: `npm run test`
Expected: PASS (including the new `isVideoPost` tests). No regressions.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors (warnings tolerated only if pre-existing).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Push**

```bash
git push
```

(Lovable auto-deploys the frontend from `main`. This branch is `worktree-dragondash2`; follow the project's normal merge-to-`main` process before expecting a prod deploy.)

- [ ] **Step 5: Production verification (per standing instructions)**

After confirming the prod bundle hash changed at dragoncandy.io:
1. Via `/browser-use`, log in as the **creator** (`damewillie@gmail.com`): upload a short video → confirm the real frame appears in the upload preview; submit → confirm the frame (with play badge) appears in the submitted-posts list. Repeat with a photo to confirm photo thumbnails now render in the card.
2. Log in as the **restaurant** (`dwilliams@harbormill.net`): confirm the same post shows the real frame in the boosting card.
3. Screenshot **desktop and mobile** viewports for each.
4. Open Chrome DevTools and confirm **no console errors** on the DragonShare pages.

Do not mark complete until content frames render (photo + video) on all four surfaces in production, on both viewports, with a clean console.

---

## Notes

- DRY: the play-badge markup appears in exactly two cards (Tasks 4 & 5). Two occurrences is within the project's "duplicated more than twice" threshold; do not pre-extract a component.
- YAGNI: no inline playback, no persisted thumbnails, no schema change — all explicitly out of scope per the spec.
- Desktop/mobile isolation: the desktop inline form (Task 2) and mobile sheet (Task 3) are edited separately; only inner render is swapped, no responsive classes are added or moved.
