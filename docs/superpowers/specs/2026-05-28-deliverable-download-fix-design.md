# Fix: Restaurant Users Cannot Download Content Deliverables

## Context

Restaurant users see "Download Failed — Could not download file" when pressing the "Download All" button on a completed campaign collaboration detail page. Tapping a deliverable thumbnail to view in the lightbox works fine. Social Share for auto-posting and auto-scheduling also works fine. The bug affects both desktop and mobile and is a regression — downloads used to work.

**Root cause:** The `downloadBlob` utility in `src/lib/downloadUtils.ts` uses `fetch(signedUrl)` to download files from Supabase Storage. The `fetch()` API enforces strict CORS, and Supabase Storage signed URLs for the private `campaign-deliverables` bucket do not return the required `Access-Control-Allow-Origin` header. The lightbox works because `<img src>` and `<video src>` tags load resources without CORS enforcement. The Share flow works because it uses `getPublicUrl()` passed directly to external APIs.

**Secondary issue:** The `get-watermarked-preview` edge function uses `auth.getClaims(token)` — a non-standard auth method used in only 1 of 52 edge functions. All others use `auth.getUser()`. This is a latent risk.

## Changes

### 1. `src/lib/downloadUtils.ts` — Replace fetch-based download

Replace the `fetch()` → `blob()` → object URL → anchor click pipeline with direct anchor tag navigation to the signed URL. The signed URL already includes `download=true` (set by the edge function via `createSignedUrl(path, expiry, { download: true })`), which causes Supabase Storage to set the `Content-Disposition: attachment` response header. This triggers a browser-native download without any JavaScript fetch — no CORS dependency.

Note: The `a.download` attribute is ignored by browsers for cross-origin URLs (Supabase Storage is a different origin). The actual download filename comes from the server's `Content-Disposition` header, which Supabase populates from the original filename when `download: true` is passed to `createSignedUrl`. The `filename` parameter to this function is kept for same-origin compatibility but is effectively decorative for Supabase Storage URLs.

**Before:**
```typescript
export async function downloadBlob(url: string, filename: string): Promise<void> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
```

**After:**
```typescript
export async function downloadBlob(url: string, filename: string): Promise<void> {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

### 2. `supabase/functions/get-watermarked-preview/index.ts` — Fix auth method

Replace `auth.getClaims(token)` with `auth.getUser()` to align with the pattern used by all other edge functions. The `userClient` is already constructed with the `Authorization` header (line 24-26), so `getUser()` uses that token automatically. The `token` variable extraction on line 27 becomes dead code and should be removed along with the `getClaims` call.

**Before:**
```typescript
const token = authHeader.replace('Bearer ', '');
const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
if (claimsError || !claimsData?.claims) { ... }
const userId = claimsData.claims.sub;
```

**After:**
```typescript
const { data: { user }, error: authError } = await userClient.auth.getUser();
if (authError || !user) { ... }
const userId = user.id;
```

### 3. `src/components/campaigns/detail/DeliverablesArchive.tsx` — Sequential download + fallback

Two changes:

**a) Sequential "Download All" with delays.** The current `downloadAll` uses `Promise.allSettled(files.map(downloadFile))` which fires all downloads simultaneously. With the new anchor-click approach, browsers will block rapid-fire cross-origin navigations as popup spam. Change to sequential downloads with a 500ms delay between each file to avoid popup blockers.

**Before:**
```typescript
const downloadAll = async () => {
  if (!files || files.length === 0) return;
  setDownloadingAll(true);
  try {
    await Promise.allSettled(files.map(downloadFile));
  } finally {
    setDownloadingAll(false);
  }
};
```

**After:**
```typescript
const downloadAll = async () => {
  if (!files || files.length === 0) return;
  setDownloadingAll(true);
  try {
    for (const file of files) {
      await downloadFile(file);
      await new Promise(r => setTimeout(r, 500));
    }
  } finally {
    setDownloadingAll(false);
  }
};
```

**b) Add `window.open` fallback to `downloadFile` catch block,** matching the pattern already used by the lightbox (`WatermarkedLightbox.tsx:102-103`). Requires hoisting the `signedUrl` variable declaration outside the try block.

**Before:**
```typescript
} catch {
  toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not download file.' });
}
```

**After:**
```typescript
} catch {
  if (signedUrl) {
    window.open(signedUrl, '_blank');
  } else {
    toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not download file.' });
  }
}
```

## Verification

1. Build: `npm run build` — verify no TypeScript or build errors
2. Login as restaurant user (dwilliams@harbormill.net) on dragoncandy.io
3. Navigate to a completed campaign with approved deliverables
4. Tap "Download All" — files should download (no error toast)
5. Open lightbox → tap Download button — file should download
6. Test on both desktop Chrome and mobile Safari
7. Verify Share button still works (unchanged code path)
8. Check Chrome DevTools console for errors
