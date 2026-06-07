# Native Camera Capture (DragonShare) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native iOS photo capture to the DragonShare upload flow so creators can snap a photo with the device camera (in addition to picking a file), feeding the existing upload pipeline unchanged.

**Architecture:** A plain async helper (`captureCameraPhoto`) wraps `@capacitor/camera` and returns a `File`. The existing `useDragonShareSubmitForm` gains a `captureFromCamera()` action that runs the same `ingestFile → upload` path. A new shared `DragonShareUploadArea` component renders the upload UI for both forms and, on iOS only, shows a "Take photo" button alongside the existing picker. Web behavior is unchanged. Photo-only — video/library stay on the file picker (Capacitor Camera captures stills only).

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` tokens), Supabase Storage, `@capacitor/camera` (Capacitor 6), Vitest + `@testing-library/react`, `sonner` toasts.

**Spec:** `docs/superpowers/specs/2026-06-06-native-camera-capture-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `package.json` | Declare `@capacitor/camera` | Modify |
| `src/lib/nativeCamera.ts` | `captureCameraPhoto(): Promise<File\|null>` — wrap Camera plugin, convert to File, handle cancel/permission/error | Create |
| `src/lib/nativeCamera.test.ts` | Unit tests for the above | Create |
| `src/hooks/useDragonShareSubmitForm.ts` | Add `ingestFile` + `captureFromCamera`; keep input reset in `handleFileSelect` | Modify |
| `src/hooks/useDragonShareSubmitForm.test.ts` | Unit tests for capture/select paths | Create |
| `src/components/dragonshare/DragonShareUploadArea.tsx` | Shared upload block (input + capture UI + spinner + preview); iOS two-button UI | Create |
| `src/components/dragonshare/DragonShareUploadArea.test.tsx` | Component test: 1 button web / 2 buttons iOS | Create |
| `src/components/dragonshare/DragonShareInlineForm.tsx` | Use `DragonShareUploadArea` | Modify |
| `src/components/dragonshare/DragonShareSubmitSheet.tsx` | Use `DragonShareUploadArea` | Modify |
| `ios/App/App/Info.plist` | Camera + photo-library permission strings | Modify |

**Notes for the implementer (read first):**
- The Supabase upload (`src/hooks/useDragonShareUpload.ts`) derives the storage file extension from `file.name` (falls back to `bin`) and sets `contentType` from `file.type` — so the captured `File` **must** have a real name (`dragonshare-capture.jpeg`) and MIME type.
- `@capacitor/camera`'s `Camera.getPhoto` **throws** on user-cancel (message contains "cancel"). Treat that as a silent `null`; treat any other throw as a permission/error case with a toast.
- This repo's `npm run test` exits non-zero because of unrelated Playwright e2e files. **Always run scoped tests** with `npx vitest run <path>` and trust that file's pass/fail.
- **DOM tests need a jsdom docblock.** The global Vitest environment is `node` (`vite.config.ts`), and there is no jest-dom setup file. Any test that renders (uses `render` or `renderHook` from `@testing-library/react`) **must** start with `// @vitest-environment jsdom` as its first line. Do **not** rely on `@testing-library/jest-dom` matchers (e.g. `.toBeInTheDocument()`) — they are not registered; use plain assertions (`getByText` throws if absent; `queryByText(...)` returns `null`). Pure-function tests (like `nativeCamera.test.ts`) run fine in `node` with no docblock.
- Mac-only step: after the dependency lands, `npx cap sync ios` installs the iOS pod. Do **not** attempt it from Windows; it's part of the Codemagic/Mac build (documented in `docs/runbooks/capacitor-ios.md`).

---

## Task 1: Add the `@capacitor/camera` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the plugin (Capacitor 6 major)**

Run: `npm install @capacitor/camera@^6`
Expected: `package.json` gains `"@capacitor/camera": "^6.x"` under `dependencies`; `package-lock.json` updates.

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds (no new errors).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(ios): add @capacitor/camera dependency (Phase 2 camera slice)"
```

---

## Task 2: `captureCameraPhoto` helper (TDD)

**Files:**
- Create: `src/lib/nativeCamera.ts`
- Test: `src/lib/nativeCamera.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nativeCamera.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPhoto = vi.fn();
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: (...args: unknown[]) => getPhoto(...args) },
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Camera: 'CAMERA' },
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { captureCameraPhoto } from './nativeCamera';

describe('captureCameraPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
    }) as unknown as typeof fetch;
  });

  it('returns a File with a real name + type on success', async () => {
    getPhoto.mockResolvedValue({ webPath: 'capacitor://localhost/x.jpg', format: 'jpeg' });
    const file = await captureCameraPhoto();
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe('dragonshare-capture.jpeg');
    expect(file?.type).toBe('image/jpeg');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('returns null with no toast when the user cancels', async () => {
    getPhoto.mockRejectedValue(new Error('User cancelled photos app'));
    const file = await captureCameraPhoto();
    expect(file).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('returns null and toasts on a permission/other error', async () => {
    getPhoto.mockRejectedValue(new Error('User denied access to camera'));
    const file = await captureCameraPhoto();
    expect(file).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('returns null and toasts when reading the captured photo fails', async () => {
    getPhoto.mockResolvedValue({ webPath: 'capacitor://localhost/x.jpg', format: 'jpeg' });
    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const file = await captureCameraPhoto();
    expect(file).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nativeCamera.test.ts`
Expected: FAIL — cannot resolve `./nativeCamera`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/nativeCamera.ts
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { toast } from 'sonner';

/**
 * Capture a single photo with the native camera and return it as a File ready
 * for the DragonShare upload pipeline. Returns null on cancel or error.
 * Plain async function (no React state) so it can be called from event handlers.
 */
export async function captureCameraPhoto(): Promise<File | null> {
  let photo;
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 80,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) return null; // user dismissed the camera
    toast.error('Camera access is off — enable it in Settings, or choose from your library');
    return null;
  }

  try {
    if (!photo.webPath) return null;
    const blob = await fetch(photo.webPath).then((r) => r.blob());
    const fmt = photo.format ?? 'jpeg';
    return new File([blob], `dragonshare-capture.${fmt}`, {
      type: blob.type || `image/${fmt}`,
    });
  } catch {
    toast.error("Couldn't read the photo — try again");
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nativeCamera.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nativeCamera.ts src/lib/nativeCamera.test.ts
git commit -m "feat(camera): add captureCameraPhoto helper for native iOS capture"
```

---

## Task 3: Extend `useDragonShareSubmitForm` (TDD)

**Files:**
- Modify: `src/hooks/useDragonShareSubmitForm.ts`
- Test: `src/hooks/useDragonShareSubmitForm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// src/hooks/useDragonShareSubmitForm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const uploadMock = vi.fn();
vi.mock('@/hooks/useDragonShareUpload', () => ({
  useDragonShareUpload: () => ({ upload: uploadMock, uploading: false }),
}));
vi.mock('@/hooks/useDragonShare', () => ({
  useSubmitDragonSharePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const captureMock = vi.fn();
vi.mock('@/lib/nativeCamera', () => ({ captureCameraPhoto: () => captureMock() }));

import { useDragonShareSubmitForm } from './useDragonShareSubmitForm';

describe('useDragonShareSubmitForm camera + file paths', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captureFromCamera uploads the captured file and sets uploaded state', async () => {
    const file = new File(['x'], 'dragonshare-capture.jpeg', { type: 'image/jpeg' });
    captureMock.mockResolvedValue(file);
    uploadMock.mockResolvedValue('https://cdn/x.jpeg');

    const { result } = renderHook(() => useDragonShareSubmitForm());
    await act(async () => { await result.current.captureFromCamera(); });

    expect(uploadMock).toHaveBeenCalledWith(file);
    expect(result.current.uploadedUrl).toBe('https://cdn/x.jpeg');
    expect(result.current.uploadedFileType).toBe('image/jpeg');
  });

  it('captureFromCamera does nothing when capture returns null', async () => {
    captureMock.mockResolvedValue(null);
    const { result } = renderHook(() => useDragonShareSubmitForm());
    await act(async () => { await result.current.captureFromCamera(); });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result.current.uploadedUrl).toBeNull();
  });

  it('handleFileSelect still uploads via the shared ingest path', async () => {
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    uploadMock.mockResolvedValue('https://cdn/pic.png');
    const { result } = renderHook(() => useDragonShareSubmitForm());
    await act(async () => {
      await result.current.handleFileSelect({
        target: { files: [file], value: 'pic.png' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(uploadMock).toHaveBeenCalledWith(file);
    expect(result.current.uploadedUrl).toBe('https://cdn/pic.png');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useDragonShareSubmitForm.test.ts`
Expected: FAIL — `result.current.captureFromCamera is not a function`.

- [ ] **Step 3: Implement the change**

In `src/hooks/useDragonShareSubmitForm.ts`:

Add the import near the top:
```ts
import { captureCameraPhoto } from '@/lib/nativeCamera';
```

Replace the existing `handleFileSelect` function with the shared-ingest version and add `captureFromCamera`:
```ts
  async function ingestFile(file: File) {
    const url = await upload(file);
    if (url) {
      setUploadedUrl(url);
      setUploadedFileName(file.name);
      setUploadedFileType(file.type);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function captureFromCamera() {
    const file = await captureCameraPhoto();
    if (file) await ingestFile(file);
  }
```

Add `captureFromCamera` to the returned object's `// Actions` block:
```ts
    handleFileSelect,
    captureFromCamera,
    removeUpload,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useDragonShareSubmitForm.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDragonShareSubmitForm.ts src/hooks/useDragonShareSubmitForm.test.ts
git commit -m "feat(camera): add captureFromCamera to DragonShare submit form"
```

---

## Task 4: `DragonShareUploadArea` shared component (TDD)

**Files:**
- Create: `src/components/dragonshare/DragonShareUploadArea.tsx`
- Test: `src/components/dragonshare/DragonShareUploadArea.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// src/components/dragonshare/DragonShareUploadArea.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockPlatform = { isNative: false, isIOS: false };
vi.mock('@/hooks/use-native-platform', () => ({
  useNativePlatform: () => mockPlatform,
}));

import { DragonShareUploadArea } from './DragonShareUploadArea';

const baseForm = {
  fileInputRef: { current: null },
  handleFileSelect: vi.fn(),
  captureFromCamera: vi.fn(),
  removeUpload: vi.fn(),
  uploadedUrl: null,
  uploadedFileName: null,
  uploadedFileType: null,
  uploading: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('DragonShareUploadArea', () => {
  it('shows a single upload button on web', () => {
    mockPlatform = { isNative: false, isIOS: false };
    render(<DragonShareUploadArea form={baseForm} />);
    expect(screen.getByText(/Tap to upload/i)).toBeTruthy(); // getByText throws if absent
    expect(screen.queryByText(/Take photo/i)).toBeNull();
  });

  it('shows Take photo + Choose buttons on iOS', () => {
    mockPlatform = { isNative: true, isIOS: true };
    render(<DragonShareUploadArea form={baseForm} />);
    expect(screen.getByText(/Take photo/i)).toBeTruthy();
    expect(screen.getByText(/Choose photo or video/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/dragonshare/DragonShareUploadArea.test.tsx`
Expected: FAIL — cannot resolve `./DragonShareUploadArea`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/dragonshare/DragonShareUploadArea.tsx
import { Upload, Camera as CameraIcon, X, Loader2 } from 'lucide-react';
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';
import { useNativePlatform } from '@/hooks/use-native-platform';
import type { useDragonShareSubmitForm } from '@/hooks/useDragonShareSubmitForm';

interface Props {
  form: ReturnType<typeof useDragonShareSubmitForm>;
}

const DASH =
  'border-2 border-dashed border-dc-teal/30 rounded-2xl text-center hover:border-dc-teal/60 transition-colors bg-dc-teal/5';

export function DragonShareUploadArea({ form }: Props) {
  const { isNative } = useNativePlatform();

  return (
    <div>
      <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
        Content
      </label>
      <input
        ref={form.fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={form.handleFileSelect}
      />

      {form.uploadedUrl ? (
        <div className="border border-dc-teal/30 rounded-2xl overflow-hidden bg-dc-teal/5">
          {form.uploadedFileType?.startsWith('video/') ? (
            <div className="h-32 w-full overflow-hidden">
              <VideoThumbnail src={form.uploadedUrl} className="w-full h-full object-cover" />
            </div>
          ) : (
            <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
          )}
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-dc-teal font-medium truncate">✓ {form.uploadedFileName}</span>
            <button onClick={form.removeUpload} className="text-dc-text-muted hover:text-dc-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : isNative ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={form.captureFromCamera} disabled={form.uploading} className={`${DASH} p-5`}>
            <CameraIcon className="h-7 w-7 mx-auto text-dc-teal mb-1.5" />
            <p className="font-semibold text-xs text-dc-text">Take photo</p>
          </button>
          <button onClick={() => form.fileInputRef.current?.click()} disabled={form.uploading} className={`${DASH} p-5`}>
            {form.uploading ? (
              <Loader2 className="h-7 w-7 mx-auto text-dc-teal animate-spin mb-1.5" />
            ) : (
              <Upload className="h-7 w-7 mx-auto text-dc-teal mb-1.5" />
            )}
            <p className="font-semibold text-xs text-dc-text">Choose photo or video</p>
          </button>
        </div>
      ) : (
        <button onClick={() => form.fileInputRef.current?.click()} disabled={form.uploading} className={`${DASH} w-full p-6`}>
          {form.uploading ? (
            <Loader2 className="h-8 w-8 mx-auto text-dc-teal animate-spin mb-2" />
          ) : (
            <Upload className="h-8 w-8 mx-auto text-dc-teal mb-2" />
          )}
          <p className="font-semibold text-sm text-dc-text">
            {form.uploading ? 'Uploading...' : 'Tap to upload photo or video'}
          </p>
          <p className="text-xs text-dc-text-muted mt-1">from your camera roll or files</p>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/dragonshare/DragonShareUploadArea.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dragonshare/DragonShareUploadArea.tsx src/components/dragonshare/DragonShareUploadArea.test.tsx
git commit -m "feat(camera): add shared DragonShareUploadArea with iOS capture UI"
```

---

## Task 5: Wire both forms to use `DragonShareUploadArea`

**Files:**
- Modify: `src/components/dragonshare/DragonShareInlineForm.tsx`
- Modify: `src/components/dragonshare/DragonShareSubmitSheet.tsx`

- [ ] **Step 1: Update `DragonShareInlineForm.tsx`**

Add the import:
```ts
import { DragonShareUploadArea } from '@/components/dragonshare/DragonShareUploadArea';
```
Replace the entire upload-area block (the `<div>` containing the `Content` label, the hidden `<input>`, and the `!form.uploadedUrl ? … : …` button/preview) with:
```tsx
      <DragonShareUploadArea form={form} />
```
Remove the now-unused imports `Upload`, `X`, `Loader2` from `lucide-react` **only if** they are no longer referenced elsewhere in the file (keep `Link`; keep `Loader2` if still used by the Submit button — it is). Verify with the typecheck in Step 3 (strict mode flags unused imports).

- [ ] **Step 2: Update `DragonShareSubmitSheet.tsx`**

Same change: add the `DragonShareUploadArea` import and replace its upload-area `<div>` (the one with the `Content` label, hidden `<input>`, and button/preview) with `<DragonShareUploadArea form={form} />`. Prune unused `lucide-react` imports (`Upload`, `X`) if no longer referenced; keep `Loader2` (Submit button) and `Link`.

- [ ] **Step 3: Typecheck (catches unused imports under strict mode)**

Run: `npm run typecheck`
Expected: PASS, no `noUnusedLocals` errors.

- [ ] **Step 4: Lint the changed files**

Run: `npx eslint src/components/dragonshare/DragonShareInlineForm.tsx src/components/dragonshare/DragonShareSubmitSheet.tsx src/components/dragonshare/DragonShareUploadArea.tsx`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual web regression**

Run: `npm run dev`, open the DragonShare submit flow in a browser. Confirm: a single "Tap to upload photo or video" button is shown (no "Take photo"), selecting a photo or video uploads and previews correctly, and submit still works. (Web is `isNative === false`.)

- [ ] **Step 7: Commit**

```bash
git add src/components/dragonshare/DragonShareInlineForm.tsx src/components/dragonshare/DragonShareSubmitSheet.tsx
git commit -m "refactor(camera): use shared DragonShareUploadArea in both submit forms"
```

---

## Task 6: iOS permission strings

**Files:**
- Modify: `ios/App/App/Info.plist`

- [ ] **Step 1: Add the usage-description keys**

Inside the top-level `<dict>` of `Info.plist`, add:
```xml
	<key>NSCameraUsageDescription</key>
	<string>DragonCandy uses your camera so you can capture photos of food and content to share with restaurants.</string>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>DragonCandy needs access to your photos so you can upload content to share with restaurants.</string>
```

- [ ] **Step 2: Sanity-check the plist is well-formed**

Visually confirm each `<key>` is paired with a following `<string>` and the file still has balanced `<dict>`/`</dict>` tags. (No build tool runs on Windows for this; correctness is verified on the Mac/Codemagic build.)

- [ ] **Step 3: Commit**

```bash
git add ios/App/App/Info.plist
git commit -m "feat(ios): add camera + photo-library permission strings"
```

---

## Task 7: Final verification & integration

- [ ] **Step 1: Run all new tests together**

Run: `npx vitest run src/lib/nativeCamera.test.ts src/hooks/useDragonShareSubmitForm.test.ts src/components/dragonshare/DragonShareUploadArea.test.tsx`
Expected: all PASS (9 tests total: 4 + 3 + 2).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed.

- [ ] **Step 3: Push the branch**

```bash
git push origin worktree-apple-app-store-3
```

- [ ] **Step 4: Open a PR to `main`** (matches the established flow)

Use `gh pr create --base main --head worktree-apple-app-store-3` with a title/body summarizing the camera slice. Wait for required checks (`lighthouse`, `verify`, `smoke`), then merge per the team flow.

> **Device verification (deferred):** native camera capture is verified on a real iPhone via TestFlight in Phases 4–5 (the simulator has no camera). At that point confirm: "Take photo" opens the native camera, captures, uploads, previews, and submits; denying camera permission shows the fallback toast and the file picker still works.

---

## Definition of Done

- `@capacitor/camera` is a dependency; `captureCameraPhoto` returns a properly named/typed `File`, handling cancel and permission errors.
- `useDragonShareSubmitForm` exposes `captureFromCamera`; the file-picker path (incl. input reset) is unchanged.
- `DragonShareUploadArea` renders one button on web and two on iOS; both forms consume it.
- iOS `Info.plist` has camera + photo-library usage strings.
- 9 unit/component tests pass; `npm run typecheck` and `npm run build` pass; web flow shows no regression.
- No video capture, cropping, multi-photo, or changes to other upload surfaces (YAGNI per spec).
