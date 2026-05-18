# Fix Portfolio Content Display & Nav Avatar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken portfolio content display (videos show broken image icons, images lose thumbnail optimization) caused by file extension parsing failing on Supabase signed URLs, and investigate the missing nav avatar.

**Architecture:** Extract a shared `getMediaType()` utility that parses file extensions from the URL pathname (not the raw string), avoiding JWT token dots in signed URLs. Each component's portfolio resolution step will pre-compute content types from raw storage paths before signing, then carry the type alongside the signed URL to the rendering layer.

**Tech Stack:** React 18, TypeScript, Supabase Storage signed URLs, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/mediaUtils.ts` | Create | Shared `getMediaType` function + `ResolvedPortfolioItem` type |
| `src/lib/mediaUtils.test.ts` | Create | Unit tests for `getMediaType` |
| `src/components/creator-browse/CreatorProfileModal.tsx` | Modify | Pre-compute content types, use shared util, fix `toThumbnailUrl` |
| `src/pages/PublicCreatorProfile.tsx` | Modify | Pre-compute content types, use shared util, fix hero image |
| `src/components/creator-browse/CreatorCard.tsx` | Modify | Video thumbnail support, remove dead code, use shared util |

---

### Task 1: Create shared `getMediaType` utility with tests

**Files:**
- Create: `src/lib/mediaUtils.ts`
- Create: `src/lib/mediaUtils.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/lib/mediaUtils.test.ts
import { describe, it, expect } from 'vitest';
import { getMediaType } from './mediaUtils';

describe('getMediaType', () => {
  // Raw storage paths (the primary use case — called before signing)
  it('detects jpg from raw path', () => {
    expect(getMediaType('users/abc/portfolio/photo.jpg')).toBe('Photo');
  });

  it('detects jpeg from raw path', () => {
    expect(getMediaType('users/abc/portfolio/photo.jpeg')).toBe('Photo');
  });

  it('detects png from raw path', () => {
    expect(getMediaType('users/abc/portfolio/shot.png')).toBe('Photo');
  });

  it('detects gif from raw path', () => {
    expect(getMediaType('users/abc/portfolio/anim.gif')).toBe('Photo');
  });

  it('detects webp from raw path', () => {
    expect(getMediaType('users/abc/portfolio/hero.webp')).toBe('Photo');
  });

  it('detects mp4 from raw path', () => {
    expect(getMediaType('users/abc/portfolio/reel.mp4')).toBe('Reel');
  });

  it('detects mov from raw path', () => {
    expect(getMediaType('users/abc/portfolio/clip.mov')).toBe('Reel');
  });

  it('detects webm from raw path', () => {
    expect(getMediaType('users/abc/portfolio/vid.webm')).toBe('Reel');
  });

  it('detects avi from raw path', () => {
    expect(getMediaType('users/abc/portfolio/old.avi')).toBe('Reel');
  });

  it('detects mkv from raw path', () => {
    expect(getMediaType('users/abc/portfolio/movie.mkv')).toBe('Reel');
  });

  it('returns null for unknown extension', () => {
    expect(getMediaType('users/abc/portfolio/readme.txt')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getMediaType('')).toBeNull();
  });

  it('returns null for path without extension', () => {
    expect(getMediaType('users/abc/portfolio/noext')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(getMediaType('users/abc/portfolio/PHOTO.JPG')).toBe('Photo');
    expect(getMediaType('users/abc/portfolio/VIDEO.MP4')).toBe('Reel');
  });

  // Full HTTP URLs (legacy data or already-resolved URLs)
  it('detects type from full Supabase public URL', () => {
    expect(getMediaType('https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/profile-assets/users/abc/photo.jpg')).toBe('Photo');
  });

  it('detects type from full Supabase public URL for video', () => {
    expect(getMediaType('https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/profile-assets/users/abc/reel.mp4')).toBe('Reel');
  });

  // Signed URLs (the bug case — JWT tokens have dots)
  it('detects type from Supabase signed URL with JWT token', () => {
    const signedUrl = 'https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/sign/profile-assets/users/abc/photo.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJwcm9maWxlLWFzc2V0cy91c2Vycy9hYmMvcGhvdG8uanBnIiwiaWF0IjoxNzE2MDQ5NjAwLCJleHAiOjE3MTYwNTMyMDB9.abc123signature';
    expect(getMediaType(signedUrl)).toBe('Photo');
  });

  it('detects video type from Supabase signed URL with JWT token', () => {
    const signedUrl = 'https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/sign/profile-assets/users/abc/reel.mp4?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJwcm9maWxlLWFzc2V0cy91c2Vycy9hYmMvcmVlbC5tcDQiLCJpYXQiOjE3MTYwNDk2MDAsImV4cCI6MTcxNjA1MzIwMH0.abc123signature';
    expect(getMediaType(signedUrl)).toBe('Reel');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mediaUtils.test.ts`
Expected: FAIL — module `./mediaUtils` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/mediaUtils.ts

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv'];

export type MediaType = 'Photo' | 'Reel' | null;

export interface ResolvedPortfolioItem {
  url: string;
  type: MediaType;
}

/**
 * Detect media type from a storage path or URL.
 * Uses URL pathname parsing for HTTP URLs to avoid JWT token dots in signed URLs.
 */
export function getMediaType(input: string): MediaType {
  if (!input) return null;

  let pathname: string;
  try {
    pathname = input.startsWith('http') ? new URL(input).pathname : input;
  } catch {
    // Not a valid URL — treat as raw storage path (no JWT dots to worry about)
    pathname = input;
  }

  const ext = pathname.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTENSIONS.includes(ext)) return 'Photo';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'Reel';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mediaUtils.test.ts`
Expected: All 18 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mediaUtils.ts src/lib/mediaUtils.test.ts
git commit -m "feat: add shared getMediaType utility for signed URL extension parsing"
```

---

### Task 2: Update `CreatorProfileModal` to pre-compute content types

**Files:**
- Modify: `src/components/creator-browse/CreatorProfileModal.tsx`

**Context:** This file has a local `getContentType()` (lines 75-81) and `toThumbnailUrl()` (lines 89-96). Portfolio URLs are resolved in lines 142-153, producing `string[]`. The rendering grid (lines 448-497) checks `getContentType(url)` on signed URLs, which fails.

- [ ] **Step 1: Add import and update state type**

Replace the import area and state. At the top of the file, add:

```typescript
import { getMediaType, type ResolvedPortfolioItem } from '@/lib/mediaUtils';
```

Change the state declaration from:

```typescript
const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
```

to:

```typescript
const [portfolioItems, setPortfolioItems] = useState<ResolvedPortfolioItem[]>([]);
```

- [ ] **Step 2: Remove local `getContentType` function**

Delete lines 75-81 (the local `getContentType` function):

```typescript
// DELETE THIS:
const getContentType = (url: string): 'Photo' | 'Reel' | null => {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  if (!ext) return null;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Photo';
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'Reel';
  return null;
};
```

- [ ] **Step 3: Update `toThumbnailUrl` to accept pre-computed type**

Change from:

```typescript
const toThumbnailUrl = (url: string, width = 540): string => {
  if (getContentType(url) !== 'Photo') return url;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const storagePath = url.substring(idx + marker.length);
  return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
};
```

to:

```typescript
const toThumbnailUrl = (url: string, type: 'Photo' | 'Reel' | null, width = 540): string => {
  if (type !== 'Photo') return url;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const storagePath = url.substring(idx + marker.length);
  return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
};
```

- [ ] **Step 4: Update portfolio URL resolution to produce `ResolvedPortfolioItem[]`**

Change the portfolio resolution effect (inside `fetchFullProfile`) from:

```typescript
          if (data.portfolio_urls && data.portfolio_urls.length > 0) {
            const urls = await Promise.all(
              data.portfolio_urls.map(async (url: string) => {
                if (!url) return null;
                if (url.startsWith('http://') || url.startsWith('https://')) {
                  return url;
                }
                return await getSignedProfileUrl(url);
              })
            );
            setPortfolioUrls(urls.filter((u): u is string => !!u));
          }
```

to:

```typescript
          if (data.portfolio_urls && data.portfolio_urls.length > 0) {
            const items = await Promise.all(
              data.portfolio_urls.map(async (rawPath: string) => {
                if (!rawPath) return null;
                const type = getMediaType(rawPath);
                let url: string | undefined;
                if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
                  url = rawPath;
                } else {
                  url = await getSignedProfileUrl(rawPath);
                }
                if (!url) return null;
                return { url, type } as ResolvedPortfolioItem;
              })
            );
            setPortfolioItems(items.filter((i): i is ResolvedPortfolioItem => i !== null));
          }
```

- [ ] **Step 5: Update the portfolio rendering grid**

In the Portfolio section, change the grid from iterating `portfolioUrls` to `portfolioItems`. Replace:

```typescript
            {portfolioUrls.length > 0 && (
```

with:

```typescript
            {portfolioItems.length > 0 && (
```

Update the `.map()` — change from:

```typescript
                  {portfolioUrls.map((url, index) => {
                    if (!url) return null;
                    const contentType = getContentType(url);
                    const isVideo = contentType === 'Reel';
```

to:

```typescript
                  {portfolioItems.map((item, index) => {
                    const { url, type: contentType } = item;
                    const isVideo = contentType === 'Reel';
```

Update the `<img>` tag's `src` from `toThumbnailUrl(url)` to `toThumbnailUrl(url, contentType)`:

```typescript
                          <img
                            src={toThumbnailUrl(url, contentType)}
```

- [ ] **Step 6: Update the `PortfolioLightbox` items prop**

Change from:

```typescript
                <PortfolioLightbox
                  items={portfolioUrls.map((url) => ({
                    url,
                    type: getContentType(url),
                  }))}
```

to:

```typescript
                <PortfolioLightbox
                  items={portfolioItems.map(({ url, type }) => ({
                    url,
                    type,
                  }))}
```

Also update the condition that guards the Portfolio section from `portfolioUrls.length > 0` to `portfolioItems.length > 0` (around line 444).

- [ ] **Step 7: Run build to check for type errors**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors referencing `CreatorProfileModal` or `portfolioUrls`.

- [ ] **Step 8: Commit**

```bash
git add src/components/creator-browse/CreatorProfileModal.tsx
git commit -m "fix: pre-compute portfolio content types from raw paths in CreatorProfileModal"
```

---

### Task 3: Update `PublicCreatorProfile` to pre-compute content types and fix hero

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

**Context:** This file has its own local copies of `getContentType()` (lines 59-65) and `toThumbnailUrl()` (lines 69-76). Portfolio URLs are resolved at lines 210-230 into `string[]`. The hero image at line 272 blindly uses `portfolioUrls[0]` in an `<img>` tag. The portfolio grid at lines 420-483 calls `getContentType(url)` on signed URLs.

- [ ] **Step 1: Add import and update state type**

Add at the top imports:

```typescript
import { getMediaType, type ResolvedPortfolioItem } from '@/lib/mediaUtils';
```

Change state from:

```typescript
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
```

to:

```typescript
  const [portfolioItems, setPortfolioItems] = useState<ResolvedPortfolioItem[]>([]);
```

- [ ] **Step 2: Remove local `getContentType` and update `toThumbnailUrl`**

Delete the local `getContentType` function (lines 59-65):

```typescript
// DELETE THIS:
const getContentType = (url: string): 'Photo' | 'Reel' | null => {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  if (!ext) return null;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Photo';
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'Reel';
  return null;
};
```

Update `toThumbnailUrl` to accept pre-computed type — change from:

```typescript
const toThumbnailUrl = (url: string, width = 540): string => {
  if (getContentType(url) !== 'Photo') return url;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const storagePath = url.substring(idx + marker.length);
  return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
};
```

to:

```typescript
const toThumbnailUrl = (url: string, type: 'Photo' | 'Reel' | null, width = 540): string => {
  if (type !== 'Photo') return url;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const storagePath = url.substring(idx + marker.length);
  return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
};
```

- [ ] **Step 3: Update portfolio URL resolution effect**

Change the `convertPortfolioUrls` effect (lines 210-230) from:

```typescript
  useEffect(() => {
    const convertPortfolioUrls = async () => {
      if (!profile?.portfolio_urls) return;

      const urls = await Promise.all(
        profile.portfolio_urls.map(async (path) => {
          if (!path) return null;
          try {
            return await getSignedProfileUrl(path);
          } catch (error) {
            console.error('Error converting portfolio URL:', error);
            return null;
          }
        })
      );

      setPortfolioUrls(urls.filter((u): u is string => u !== null));
    };

    convertPortfolioUrls();
  }, [profile?.portfolio_urls]);
```

to:

```typescript
  useEffect(() => {
    const convertPortfolioUrls = async () => {
      if (!profile?.portfolio_urls) return;

      const items = await Promise.all(
        profile.portfolio_urls.map(async (rawPath) => {
          if (!rawPath) return null;
          try {
            const type = getMediaType(rawPath);
            const url = await getSignedProfileUrl(rawPath);
            if (!url) return null;
            return { url, type } as ResolvedPortfolioItem;
          } catch (error) {
            console.error('Error converting portfolio URL:', error);
            return null;
          }
        })
      );

      setPortfolioItems(items.filter((i): i is ResolvedPortfolioItem => i !== null));
    };

    convertPortfolioUrls();
  }, [profile?.portfolio_urls]);
```

- [ ] **Step 4: Fix hero image to prefer photos**

Change line 272 from:

```typescript
  const heroImage = portfolioUrls[0] || avatarUrl;
```

to:

```typescript
  const heroImage = portfolioItems.find(item => item.type === 'Photo')?.url || avatarUrl;
```

- [ ] **Step 5: Update Stats Row portfolio count**

Change line 361 and line 375 from `portfolioUrls.length` to `portfolioItems.length`:

```typescript
      {projectsCount === 0 && portfolioItems.length === 0 && (profile.total_reviews ?? 0) === 0 ? (
```

and:

```typescript
            <p className="text-3xl font-extrabold text-gray-900">{portfolioItems.length}</p>
```

- [ ] **Step 6: Update the portfolio grid rendering**

Change the grid from iterating `portfolioUrls` to `portfolioItems`. Replace:

```typescript
        {portfolioUrls.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
            {portfolioUrls.map((url, index) => {
              if (!url) return null;
              const contentType = getContentType(url);
              const isVideo = contentType === 'Reel';
```

with:

```typescript
        {portfolioItems.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
            {portfolioItems.map((item, index) => {
              const { url, type: contentType } = item;
              const isVideo = contentType === 'Reel';
```

Update the `<img>` `src` from `toThumbnailUrl(url)` to `toThumbnailUrl(url, contentType)`:

```typescript
                    <img
                      src={toThumbnailUrl(url, contentType)}
```

- [ ] **Step 7: Update the `PortfolioLightbox` items prop and guard**

Change from:

```typescript
      {portfolioUrls.length > 0 && profile && (
        <PortfolioLightbox
          items={portfolioUrls.map((url) => ({
            url,
            type: getContentType(url),
          }))}
```

to:

```typescript
      {portfolioItems.length > 0 && profile && (
        <PortfolioLightbox
          items={portfolioItems.map(({ url, type }) => ({
            url,
            type,
          }))}
```

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "fix: pre-compute portfolio content types and fix hero image in PublicCreatorProfile"
```

---

### Task 4: Update `CreatorCard` — video thumbnails and dead code removal

**Files:**
- Modify: `src/components/creator-browse/CreatorCard.tsx`

**Context:** This file has a local `isVideoPath()` (lines 34-37) with the same dot-splitting bug. The thumbnail resolution (lines 51-67) skips video files entirely. Lines 41-42 declare `isPortfolioOpen`/`portfolioIndex` state that's never used. Lines 69-79 resolve portfolio URLs for the unused `CreatorPortfolioModal`. Lines 211-222 render the unused `CreatorPortfolioModal`.

- [ ] **Step 1: Replace import and remove dead imports**

Remove the `CreatorPortfolioModal` import:

```typescript
// DELETE THIS LINE:
import { CreatorPortfolioModal } from '@/components/creator-profile/CreatorPortfolioModal';
```

Add the shared utility import:

```typescript
import { getMediaType } from '@/lib/mediaUtils';
```

- [ ] **Step 2: Remove dead code**

Remove the local `isVideoPath` function (lines 33-37):

```typescript
// DELETE THIS:
/** Return true if the file extension looks like a video format. */
const isVideoPath = (url: string): boolean => {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  return !!ext && ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
};
```

Remove dead state declarations — change from:

```typescript
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [portfolioIndex, setPortfolioIndex] = useState(0);
  const [portfolioImgFailed, setPortfolioImgFailed] = useState(false);
```

to:

```typescript
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [portfolioImgFailed, setPortfolioImgFailed] = useState(false);
```

Remove the `resolvedPortfolioUrls` state and its effect (lines 49, 69-79):

```typescript
// DELETE THIS:
  const [resolvedPortfolioUrls, setResolvedPortfolioUrls] = useState<string[]>([]);

// AND DELETE THIS EFFECT:
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const first = creator.portfolio_urls?.[0];
      if (!first) { setResolvedPortfolioUrls([]); return; }
      const url = await getSignedProfileUrl(first);
      if (!cancelled) setResolvedPortfolioUrls(url ? [url] : []);
    };
    resolve();
    return () => { cancelled = true; };
  }, [creator.portfolio_urls]);
```

Remove the `CreatorPortfolioModal` JSX at the bottom (lines 211-222):

```typescript
// DELETE THIS:
      <CreatorPortfolioModal
        isOpen={isPortfolioOpen}
        onClose={() => setIsPortfolioOpen(false)}
        creatorName={creator.creator_name}
        images={resolvedPortfolioUrls.map((url) => ({
          url,
          artistName: creator.creator_name,
        }))}
        currentIndex={portfolioIndex}
        onIndexChange={setPortfolioIndex}
      />
```

- [ ] **Step 3: Add video thumbnail state and update thumbnail resolution**

Add a new state for tracking whether the thumbnail is a video:

```typescript
  const [isVideoThumbnail, setIsVideoThumbnail] = useState(false);
```

Update the thumbnail resolution effect — change from:

```typescript
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (creator.avatar_url && !avatarImgFailed) {
        const url = await getSignedProfileUrl(creator.avatar_url);
        if (!cancelled && url) { setThumbnailUrl(url); return; }
      }
      const firstPortfolio = creator.portfolio_urls?.[0];
      if (firstPortfolio && !isVideoPath(firstPortfolio) && !portfolioImgFailed) {
        const url = await getSignedProfileUrl(firstPortfolio);
        if (!cancelled && url) { setThumbnailUrl(url); return; }
      }
      if (!cancelled) setThumbnailUrl(null);
    };
    resolve();
    return () => { cancelled = true; };
  }, [creator.portfolio_urls, creator.avatar_url, portfolioImgFailed, avatarImgFailed]);
```

to:

```typescript
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (creator.avatar_url && !avatarImgFailed) {
        const url = await getSignedProfileUrl(creator.avatar_url);
        if (!cancelled && url) { setThumbnailUrl(url); setIsVideoThumbnail(false); return; }
      }
      const firstPortfolio = creator.portfolio_urls?.[0];
      if (firstPortfolio && !portfolioImgFailed) {
        const mediaType = getMediaType(firstPortfolio);
        const url = await getSignedProfileUrl(firstPortfolio);
        if (!cancelled && url) {
          setThumbnailUrl(url);
          setIsVideoThumbnail(mediaType === 'Reel');
          return;
        }
      }
      if (!cancelled) { setThumbnailUrl(null); setIsVideoThumbnail(false); }
    };
    resolve();
    return () => { cancelled = true; };
  }, [creator.portfolio_urls, creator.avatar_url, portfolioImgFailed, avatarImgFailed]);
```

- [ ] **Step 4: Add `Play` icon import**

Add `Play` to the lucide-react import:

```typescript
import { Heart, Play } from 'lucide-react';
```

- [ ] **Step 5: Update the avatar/thumbnail rendering**

Change the thumbnail rendering section from:

```typescript
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={creator.creator_name}
                className="block w-full h-auto max-h-32 object-contain"
                loading="lazy"
                onError={() => {
                  if (creator.avatar_url && !avatarImgFailed) {
                    setAvatarImgFailed(true);
                  } else {
                    setPortfolioImgFailed(true);
                  }
                }}
              />
            ) : (
              <div className="w-full h-24 bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                <span className="text-white text-xl font-bold">{initials}</span>
              </div>
            )}
```

to:

```typescript
            {thumbnailUrl && isVideoThumbnail ? (
              <div className="relative w-full h-24">
                <video
                  src={`${thumbnailUrl}#t=0.5`}
                  className="block w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  onError={() => setPortfolioImgFailed(true)}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                    <Play className="h-4 w-4 text-white ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
            ) : thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={creator.creator_name}
                className="block w-full h-auto max-h-32 object-contain"
                loading="lazy"
                onError={() => {
                  if (creator.avatar_url && !avatarImgFailed) {
                    setAvatarImgFailed(true);
                  } else {
                    setPortfolioImgFailed(true);
                  }
                }}
              />
            ) : (
              <div className="w-full h-24 bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                <span className="text-white text-xl font-bold">{initials}</span>
              </div>
            )}
```

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: Build succeeds. No references to `CreatorPortfolioModal`, `isVideoPath`, `isPortfolioOpen`, or `resolvedPortfolioUrls` remain.

- [ ] **Step 7: Commit**

```bash
git add src/components/creator-browse/CreatorCard.tsx
git commit -m "fix: add video thumbnail support and remove dead CreatorPortfolioModal code in CreatorCard"
```

---

### Task 5: Investigate nav avatar for Harbormill account

**Files:**
- No code changes expected (investigation only)

**Context:** `useProfileData.ts` (line 79) fetches `business_profiles.logo_url` for restaurant accounts. If null, the Avatar component shows a fallback initial letter — that's expected behavior.

- [ ] **Step 1: Check database for Harbormill's logo_url**

Run this via the Supabase client or SQL editor to check if the restaurant account has a logo uploaded:

```sql
SELECT bp.logo_url, bp.business_name, p.email
FROM business_profiles bp
JOIN profiles p ON p.id = bp.user_id
WHERE p.email = 'dwilliams@harbormill.net';
```

- [ ] **Step 2: Report findings**

If `logo_url` is `NULL`: The avatar fallback (initial letter) is correct behavior. Inform the user that no logo has been uploaded — they can upload one in Business Settings.

If `logo_url` has a value: Check that the file exists in the `profile-assets` bucket by attempting to generate a signed URL for the path. If the signed URL fails, the storage path may be stale or the file may have been deleted.

- [ ] **Step 3: Commit (only if code changes were needed)**

If a code fix was required, commit it. Otherwise, skip — this task produces a finding, not necessarily a code change.

---

### Task 6: Run full build, tests, and verification

**Files:** None (verification only)

- [ ] **Step 1: Run the test suite**

Run: `npx vitest run src/lib/mediaUtils.test.ts`
Expected: All tests pass.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 4: Start dev server and verify in browser**

Run: `npm run dev`

Verification checklist:
1. Log in as Restaurant (dwilliams@harbormill.net) → Browse Creators → click a creator with video content → portfolio grid should show video thumbnails with play icon
2. Click a video thumbnail → lightbox plays video with controls
3. Verify image-only portfolios still render correctly
4. Verify mixed-content portfolios show each type correctly
5. Check creator cards — video-only creators show video frame or play-icon thumbnail
6. Check nav avatar top-right
7. Open Chrome DevTools console → no media-related errors

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: verify portfolio content display and nav avatar fixes"
```
