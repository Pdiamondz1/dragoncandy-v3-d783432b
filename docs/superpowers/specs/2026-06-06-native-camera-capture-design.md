# Native Camera Capture for DragonShare — Design Spec

> **Status:** Draft (pending spec review) · **Created:** 2026-06-06
> **Phase:** Apple App Store roadmap → Phase 2 (native value-adds), Slice B.
> **Roadmap:** `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`

## Context

DragonCandy is wrapping its existing web app in a Capacitor iOS shell for the
Apple App Store. Apple rejects bare website wrappers under **guideline 4.2**, so
the iOS app must expose genuine native functionality. Native camera capture is
one of the strongest 4.2 signals and directly advances the product North Star
("less typing": voice → **camera** → paste → tap → type).

This is the first Phase 2 slice because it is self-contained, has **zero Apple
Developer-account dependency**, and is buildable/testable in the iOS simulator
today (unlike push notifications and deep links, which are blocked on
enrollment).

The DragonShare submission flow is the natural home: creators upload a photo or
video of a restaurant's food, tag the restaurant, and get paid when the
restaurant boosts it. Letting a creator snap a photo with the native camera —
rather than only picking from the library — is the camera-first ideal for the
common case.

## Problem

Today the only way to add content in DragonShare is the HTML file picker
(`<input type="file" accept="image/*,video/*">`). In the native app this is
adequate but unremarkable, and it does not register as native functionality for
Apple. There is no direct native camera-capture path, and the iOS project has no
camera permission strings (which would cause a crash on first permission
request).

## Goals

1. On iOS, let a creator capture a photo with the **native camera** and submit
   it through the existing DragonShare upload pipeline.
2. Preserve the existing file-picker path for **video and library selection**
   (and for all web users) unchanged.
3. Add the required iOS permission strings so the camera prompt works and Apple
   review passes.
4. Keep the change small, additive, and well-isolated.

## Non-goals (YAGNI)

- **Video capture.** `@capacitor/camera` captures photos only; video stays on
  the existing file picker (which on iOS opens Photos/camera-roll, including
  video). Not building native video recording.
- No image cropping, filters, or editing.
- No multi-photo capture.
- No saving captured photos back to the device library.
- No camera capture on other upload surfaces (promotions `VideoUploader`,
  generic `file_uploads`). DragonShare only, this slice.

## Key constraint: photo-only native capture

`@capacitor/camera`'s `Camera.getPhoto()` returns a still image. DragonShare
accepts both photo and video. Therefore the iOS UI presents **two** actions:

- **"Take photo"** → native `@capacitor/camera` capture (this slice's new path).
- **"Choose photo or video"** → the existing `<input type="file">` picker, which
  in the Capacitor WKWebView opens the iOS Photos library and supports video.

On web, the UI is unchanged: a single "Tap to upload photo or video" button.

## Architecture & components

All components are small and independently understandable.

### 1. Dependency
Add `@capacitor/camera` (Capacitor 6-compatible, `^6.x`) to `package.json`.
Run `npx cap sync ios` to install the pod (Mac/Codemagic step; documented, not
run from Windows).

### 2. `captureCameraPhoto` — `src/lib/nativeCamera.ts` (plain async function, NOT a hook)
Single purpose: capture one photo and return it as a `File`. It holds **no
React state or effects**, so it is a plain module function — making it a `use*`
hook would violate `react-hooks/rules-of-hooks` when called from an event
handler (the rule is enforced here via eslint-plugin-react-hooks 5.x). A plain
function can be legally called from anywhere.

- Signature: `export async function captureCameraPhoto(): Promise<File | null>`.
- Internally: calls
  `Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 80 })`.
- Converts the result's `webPath` → `Blob` via `fetch(webPath)` → `File`. Note
  `@capacitor/camera` reports `photo.format` as `'jpeg'` (not `'jpg'`), with a
  `'jpeg'` fallback if absent:
  `const fmt = photo.format ?? 'jpeg';`
  `new File([blob], `dragonshare-capture.${fmt}`, { type: blob.type || `image/${fmt}` })`.
  A real filename + MIME type matter because the upload pipeline derives the
  storage extension from `file.name` and sets `contentType` from `file.type`
  (see `useDragonShareUpload.ts:18,23`).
- Returns `null` on user cancel (no error surfaced).
- On permission-denied / other error: surfaces a friendly `sonner` toast
  ("Camera access is off — enable it in Settings, or choose from your library")
  and returns `null`.
- Depends only on `@capacitor/camera` and `sonner`. The UI decides whether to
  call it (gated by `isNative`), keeping the function platform-agnostic and
  trivially testable.

### 3. Extend `useDragonShareSubmitForm` — `src/hooks/useDragonShareSubmitForm.ts`
Additive, no behavior change to the existing path.

- Extract the shared body of `handleFileSelect` into `ingestFile(file: File)`
  (calls `upload(file)`, sets `uploadedUrl`/`uploadedFileName`/`uploadedFileType`).
- `handleFileSelect` becomes a thin wrapper that reads the input event, calls
  `ingestFile`, **and keeps the existing input-value reset**
  (`if (fileInputRef.current) fileInputRef.current.value = '';`). The reset stays
  in the wrapper, NOT in `ingestFile` — the camera path has no input to clear.
- Add `captureFromCamera()`: a plain async handler that calls
  `captureCameraPhoto()` (the module function from §2), and if it returns a
  `File`, calls `ingestFile(file)`. (No hook is invoked inside the handler.)
- Export `captureFromCamera` alongside the existing actions.

### 4. UI — `DragonShareInlineForm.tsx` + `DragonShareSubmitSheet.tsx`
Both render the same upload area; both consume `useDragonShareSubmitForm`.

- Read `const { isNative } = useNativePlatform();`.
- When `!form.uploadedUrl`:
  - **Web (`!isNative`):** current single "Tap to upload photo or video" button —
    unchanged.
  - **iOS (`isNative`):** two brand-styled buttons in the teal dashed area —
    "Take photo" (calls `form.captureFromCamera`) and "Choose photo or video"
    (clicks the existing hidden file input). Reuse existing `dc-teal` styling and
    `lucide-react` icons (`Camera`, `Upload`).
- The uploaded-preview state and everything after are unchanged.
- **Factor the whole upload block into one component `DragonShareUploadArea`**
  (`src/components/dragonshare/`) consumed by both forms. It owns: the hidden
  `<input type="file">`, the empty-state capture UI (single button on web; "Take
  photo" + "Choose photo or video" on iOS), the uploading spinner, and the
  uploaded-preview (`img` / `VideoThumbnail` + filename + remove `X`). It takes
  the form object (or the specific fields/actions it needs) as props.
  - Reconcile the one cosmetic divergence between the two current forms: the
    inline form uses `bg-dc-teal/[0.03]` and the sheet uses `bg-dc-teal/5` on the
    dashed area. Standardize the shared component on `bg-dc-teal/5` (the
    difference is visually negligible). Submit buttons live outside the upload
    area and are unchanged.

### 5. iOS permission strings — `ios/App/App/Info.plist`
Add usage descriptions:
- `NSCameraUsageDescription` — "DragonCandy uses your camera so you can capture
  photos of food and content to share with restaurants."
- `NSPhotoLibraryUsageDescription` — "DragonCandy needs access to your photos so
  you can upload content to share with restaurants."

Only `NSCameraUsageDescription` is strictly required for `CameraSource.Camera`.
`NSPhotoLibraryUsageDescription` is included intentionally to future-proof the
"Choose photo or video" library path and avoid a later crash; harmless to add now.

## Data flow

```
Tap "Take photo"  (iOS only)
  → captureFromCamera()  →  captureCameraPhoto()   [src/lib/nativeCamera.ts]
      → Camera.getPhoto({ source: Camera, resultType: Uri })   [native camera UI]
      → fetch(photo.webPath) → Blob → File(name, type)
  → ingestFile(file)
      → upload(file)                 [existing useDragonShareUpload]
      → Supabase storage 'dragonshare-content' → publicUrl
  → setUploadedUrl / FileName / FileType   [existing state]
  → preview + Submit                 [existing path]
      → dragonshare_posts.content_file_path = publicUrl
```

Downstream is byte-for-byte identical to the file-picker path; only the *source*
of the `File` differs.

## Error handling

| Case | Behavior |
|---|---|
| User cancels capture | `captureCameraPhoto()` returns `null`; no toast, no state change |
| Camera permission denied | Friendly toast; returns `null`; user can still use the file picker |
| `fetch(webPath)` / conversion fails | Toast ("Couldn't read the photo — try again"); returns `null` |
| Upload fails | Existing toast in `upload()` (`useDragonShareUpload.ts`) |
| Web / non-iOS | "Take photo" button is not rendered; only the file picker shows |

## Testing

- **Unit — `captureCameraPhoto`** (`src/lib/nativeCamera.test.ts`): mock
  `@capacitor/camera` `Camera.getPhoto` and global `fetch`; assert (a) success
  returns a `File` with correct `name` extension (`.jpeg`) and `type`; (b) cancel
  returns `null` with no toast; (c) error path returns `null` and toasts. Mirrors
  the Capacitor-mock pattern in `src/lib/platform.test.ts`.
- **Unit — form hook**: assert `captureFromCamera` feeds a captured `File` into a
  mocked `upload` and sets the uploaded state; assert `handleFileSelect` still
  works via the shared `ingestFile` and still resets the input value.
- **Component (optional)** — `DragonShareUploadArea`: with `useNativePlatform`
  mocked, assert two capture buttons render when `isNative` and one when not.
- **Web regression**: `npm run build` + `npm run typecheck`; manually confirm the
  DragonShare file picker is unchanged on web (single button, upload works).
- **Native (deferred to TestFlight)**: the iOS simulator has no real camera, so
  end-to-end capture is verified on a real device once the build pipeline and
  Apple account exist (Phases 4–5). The code path, conversion, and web behavior
  are fully verifiable now.

## Verification (end-to-end)

1. `npm run typecheck` and `npm run build` pass.
2. New unit tests pass (`npx vitest run src/lib/nativeCamera.test.ts`).
3. On web (`npm run dev`): DragonShare upload still shows the single picker and
   uploads a photo/video successfully — no regression.
4. (Later, on device via TestFlight) "Take photo" opens the native camera,
   captures, uploads, previews, and submits; permission denial shows the
   fallback toast.

## Risks

- **Capacitor Camera version drift.** Pin to the Capacitor 6-compatible major
  (`@capacitor/camera@^6`) to match `@capacitor/core@6.2.1`.
- **File naming.** `photo.format` is `'jpeg'`; if missing, default to `'jpeg'`
  (`image/jpeg`) so the upload extension/content-type stay valid (the bucket
  upload falls back to `bin` otherwise — `useDragonShareUpload.ts:18`).
- **WKWebView `webPath` fetch.** `fetch(webPath)` must run inside the WebView
  context where the blob URL is valid; this is the standard Capacitor pattern and
  works in the `capacitor://localhost` origin already allowed by CSP.
- **Duplication.** Two forms share the upload area — factor the two-button area
  into one component to avoid divergence.

## Out of scope / follow-ups

- Other Phase 2 slices: native share sheet (Slice C), push notifications
  (Slice A), deep links (Slice D).
- Camera capture on non-DragonShare upload surfaces.
- Native video recording (would require a different plugin; revisit only if the
  product needs it).
