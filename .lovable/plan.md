

# Content Protection: Watermark + Download Gating for Creator Deliverables

## Problem
Restaurants can currently download creator content files at any time, even before approving and paying. This means a restaurant could take the content and then deny/reject the creator, effectively stealing their work.

## Solution: Two-Layer Protection

### Layer 1: Download Gating (UI + Backend)
Disable file downloads until `content_status = 'approved'` on the collaboration. The restaurant can only preview files in-browser before approval.

### Layer 2: Watermarked Previews
For images, serve a watermarked version with "PREVIEW - DragonCandy" overlay. For videos, show an HTML overlay watermark during playback and disable right-click/download controls. After approval, serve original clean files.

---

## Changes

### 1. Update `src/pages/ProjectDetailsPage.tsx`
- Pass `contentStatus` to the files section
- Conditionally show "Preview" button (always available) vs "Download" button (only when `content_status === 'approved'`)
- For images: show inline preview with a CSS watermark overlay before approval
- For videos: show video player with watermark overlay div, no download attribute
- After approval: show clean preview + full download button

### 2. Create new Edge Function: `supabase/functions/get-watermarked-preview/index.ts`
- Accepts a `file_path`, `bucket_name`, and `collaboration_id`
- Verifies the requesting user is a participant in the collaboration
- If `content_status !== 'approved'`: returns the file with a watermark overlay (for images, use Canvas API to stamp text; for other files, just return metadata)
- If `content_status === 'approved'`: returns a signed URL to the original file
- This prevents direct URL access to unwatermarked files before approval

### 3. Create `src/components/projects/ProtectedFilePreview.tsx`
New component that handles the preview/download logic:
- **Before approval (preview mode)**:
  - Images: Displayed with a semi-transparent CSS overlay showing "PREVIEW ONLY - DRAGONCANDY" diagonally across the image. Right-click disabled.
  - Videos: Played in a custom player wrapper with an overlay watermark div. `controlsList="nodownload"` on the video element.
  - Other files: Show file metadata only (name, size, type) with no download option.
- **After approval (full access)**:
  - All files: Clean preview + prominent "Download" button
  - Uses Supabase signed URLs for secure download

### 4. Update storage bucket security
- The `project-deliverables` bucket is already private (not public), which is good
- Signed URLs are already used with short expiry (3600s)
- Add a check: only generate signed download URLs when content is approved

---

## File-by-File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/pages/ProjectDetailsPage.tsx` | Modify | Pass content status to files section, replace download button with ProtectedFilePreview |
| `src/components/projects/ProtectedFilePreview.tsx` | Create | New component with watermark overlay for previews, gated downloads |
| `supabase/functions/get-watermarked-preview/index.ts` | Create | Edge function that validates approval status before serving download URLs |

---

## How It Looks

### Before Approval (Restaurant View)

```text
+------------------------------------------+
| Deliverables                             |
|                                          |
| [photo-shoot.jpg]  2.4 MB               |
|   +-----------------------------+        |
|   |                             |        |
|   |    P R E V I E W  O N L Y  |        |
|   |      D R A G O N C A N D Y |        |
|   |        (image beneath)      |        |
|   +-----------------------------+        |
|   [Preview Only - Download after approval]|
|                                          |
| [video-reel.mp4]  45 MB                  |
|   [Play Preview] (with overlay)          |
|   "Download available after approval"    |
+------------------------------------------+
```

### After Approval (Restaurant View)

```text
+------------------------------------------+
| Deliverables                             |
|                                          |
| [photo-shoot.jpg]  2.4 MB               |
|   (clean image preview)                  |
|   [Download]                             |
|                                          |
| [video-reel.mp4]  45 MB                  |
|   (clean video player)                   |
|   [Download]                             |
+------------------------------------------+
```

## Security Notes
- CSS watermarks can be bypassed via screenshots, but this is acceptable for MVP. It's a strong deterrent for casual misuse.
- The real protection is the download gating on the backend (signed URLs only generated after approval).
- Video `controlsList="nodownload"` removes the browser download button, and the overlay prevents easy screen recording.
- Future enhancement: server-side image watermarking via Sharp/Canvas in the edge function for stronger protection.
