# Native Share Sheet (Promotion Links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the promotion "Copy Link" actions open the native iOS share sheet (via `@capacitor/share`), with the existing clipboard-copy as the unchanged web fallback.

**Architecture:** A plain async helper `shareOrCopyLink({ url, title, text })` returns `'shared'` (native sheet presented) or `'copied'` (clipboard). The two promotion components' `copyLink` functions delegate to it and branch on the result, keeping their exact current web toast + 2-second "Copied!" flash. iOS-only behavior change; web is byte-identical.

**Tech Stack:** React 18 + TypeScript (strict), Vite, `@capacitor/share` (Capacitor 6), shadcn `useToast`, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-06-07-native-share-sheet-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `package.json` | Declare `@capacitor/share` | Modify |
| `src/lib/nativeShare.ts` | `shareOrCopyLink(): Promise<'shared'\|'copied'>` — native sheet on iOS, clipboard on web | Create |
| `src/lib/nativeShare.test.ts` | Unit tests for the helper | Create |
| `src/components/promotions/PromotionCard.tsx` | Route `copyLink` through the helper | Modify |
| `src/pages/PromotionDetailPage.tsx` | Route `copyLink` through the helper | Modify |

**Notes for the implementer (read first):**
- Work in the worktree `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\apple-app-store-3` (branch `worktree-apple-app-store-3`). Use the **Bash** tool for npm/npx/git.
- `npm run test` exits non-zero due to unrelated Playwright e2e files. **Always run scoped tests:** `npx vitest run <path>` and trust that file's result.
- The helper test is a **pure-function test in the `node` env — no `// @vitest-environment jsdom` docblock.** It stubs `navigator` with `vi.stubGlobal('navigator', …)` because `navigator` is not defined in the node env. (DOM-rendering tests would need the jsdom docblock, but this slice has none.)
- Mac-only: after the dependency lands, `npx cap sync ios` installs the pod. Do **not** run it from Windows — it's part of the Codemagic/Mac build.
- Each file has exactly one `copyLink`, reused at all its call sites (PromotionCard: main button + QR-modal button; PromotionDetailPage: main button + QR-modal button). There are NO inline `navigator.clipboard` calls in these files — rewriting the single `copyLink` per file covers every share spot.
- Both components import `toast` from `@/hooks/use-toast` (shadcn), NOT sonner. Keep that.

---

## Task 1: Add the `@capacitor/share` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the plugin (Capacitor 6 major)**

Run: `npm install @capacitor/share@^6`
Expected: `package.json` gains `"@capacitor/share": "^6.x"`; lockfile updates.

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(ios): add @capacitor/share dependency (Phase 2 share slice)"
```

---

## Task 2: `shareOrCopyLink` helper (TDD)

**Files:**
- Create: `src/lib/nativeShare.ts`
- Test: `src/lib/nativeShare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nativeShare.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const share = vi.fn();
vi.mock('@capacitor/share', () => ({
  Share: { share: (...a: unknown[]) => share(...a) },
}));

const isNativeApp = vi.fn();
vi.mock('@/lib/platform', () => ({ isNativeApp: () => isNativeApp() }));

import { shareOrCopyLink } from './nativeShare';

const writeText = vi.fn();

describe('shareOrCopyLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    writeText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the native share sheet on iOS and returns "shared"', async () => {
    isNativeApp.mockReturnValue(true);
    share.mockResolvedValue(undefined);
    const result = await shareOrCopyLink({ url: 'https://x/promo/1', title: 'T', text: 'X' });
    expect(result).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'X', url: 'https://x/promo/1' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('treats a user cancel as "shared" without copying or throwing', async () => {
    isNativeApp.mockReturnValue(true);
    share.mockRejectedValue(new Error('Share canceled'));
    const result = await shareOrCopyLink({ url: 'https://x/promo/1' });
    expect(result).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when native share is unavailable', async () => {
    isNativeApp.mockReturnValue(true);
    share.mockRejectedValue(new Error('Share API not available'));
    const result = await shareOrCopyLink({ url: 'https://x/promo/1' });
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/promo/1');
  });

  it('copies to clipboard on web and returns "copied"', async () => {
    isNativeApp.mockReturnValue(false);
    const result = await shareOrCopyLink({ url: 'https://x/promo/1' });
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/promo/1');
    expect(share).not.toHaveBeenCalled();
  });

  it('re-throws when the web clipboard write fails', async () => {
    isNativeApp.mockReturnValue(false);
    writeText.mockRejectedValue(new Error('denied'));
    await expect(shareOrCopyLink({ url: 'https://x/promo/1' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nativeShare.test.ts`
Expected: FAIL — cannot resolve `./nativeShare`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/nativeShare.ts
import { Share } from '@capacitor/share';
import { isNativeApp } from '@/lib/platform';

interface ShareLinkOptions {
  url: string;
  title?: string;
  text?: string;
}

/**
 * Present the native share sheet on iOS, or copy the URL to the clipboard on web.
 * Returns 'shared' when the native sheet was presented (including user cancel),
 * or 'copied' when the URL was written to the clipboard. Re-throws on a web
 * clipboard failure so the caller can show its own error toast. Plain async
 * function (no React state) so it can be called from event handlers.
 */
export async function shareOrCopyLink({
  url,
  title,
  text,
}: ShareLinkOptions): Promise<'shared' | 'copied'> {
  if (isNativeApp()) {
    try {
      await Share.share({ title, text, url });
      return 'shared';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/cancel|abort/i.test(message)) return 'shared'; // user dismissed the sheet
      // native share genuinely unavailable → fall through to the clipboard path
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nativeShare.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nativeShare.ts src/lib/nativeShare.test.ts
git commit -m "feat(share): add shareOrCopyLink helper for native iOS share sheet"
```

---

## Task 3: Route both promotion `copyLink` functions through the helper

**Files:**
- Modify: `src/components/promotions/PromotionCard.tsx`
- Modify: `src/pages/PromotionDetailPage.tsx`

- [ ] **Step 1: Update `PromotionCard.tsx`**

Add the import (near the other imports):
```ts
import { shareOrCopyLink } from '@/lib/nativeShare';
```
Replace the existing `copyLink` function with:
```ts
  const copyLink = async () => {
    try {
      const result = await shareOrCopyLink({
        url: promotionUrl,
        title: promotion.title,
        text: `Check out this offer — ${discountDisplay}`,
      });
      if (result === 'copied') {
        setCopied(true);
        toast({ title: "Link copied!", description: "Share this link with your customers" });
        setTimeout(() => setCopied(false), 2000);
      }
      // 'shared' → native sheet handled feedback; no toast, no flash
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };
```

- [ ] **Step 2: Update `PromotionDetailPage.tsx`**

Add the import:
```ts
import { shareOrCopyLink } from '@/lib/nativeShare';
```
Replace the existing `copyLink` function with (note: this file's toast has no description):
```ts
  const copyLink = async () => {
    try {
      const result = await shareOrCopyLink({
        url: promotionUrl,
        title: promotion.title,
        text: `Check out this offer — ${discountDisplay}`,
      });
      if (result === 'copied') {
        setCopied(true);
        toast({ title: 'Link copied!' });
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (strict mode confirms `promotion.title`/`promotionUrl`/`discountDisplay` are in scope and no unused symbols).

- [ ] **Step 4: Lint the changed files**

Run: `npx eslint src/components/promotions/PromotionCard.tsx src/pages/PromotionDetailPage.tsx`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual web regression**

Run `npm run dev`, open a promotion (business promotional tools / a promo detail page), click "Copy Link" on the card and on the detail page (incl. the QR modal). Confirm each copies the URL and shows the identical toast + 2-second "Copied!" flash as before. (Web is `isNativeApp() === false`, so behavior is unchanged.)

- [ ] **Step 7: Commit**

```bash
git add src/components/promotions/PromotionCard.tsx src/pages/PromotionDetailPage.tsx
git commit -m "feat(share): use native share sheet for promotion Copy Link actions"
```

---

## Task 4: Final verification & integration

- [ ] **Step 1: Run the helper test**

Run: `npx vitest run src/lib/nativeShare.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed.

- [ ] **Step 3: Push the branch**

```bash
git push origin worktree-apple-app-store-3
```

- [ ] **Step 4: Open a PR to `main`**

Use `gh pr create --base main --head worktree-apple-app-store-3` with a title/body summarizing the share-sheet slice. Wait for required checks (`lighthouse`, `verify`, `smoke`), then merge per the team flow.

> **Device verification (deferred):** the native share sheet is verified on a real iPhone via TestFlight in Phases 4–5. On web everything is unchanged; the helper logic is fully unit-tested now.

---

## Definition of Done

- `@capacitor/share` is a dependency; `shareOrCopyLink` returns `'shared'`/`'copied'` correctly, swallows native cancel, falls back to clipboard when native share is unavailable, and re-throws on web clipboard failure.
- Both promotion `copyLink` functions delegate to the helper; web behavior (toast text + 2s flash) is byte-identical to before.
- 5 helper unit tests pass; `npm run typecheck` and `npm run build` pass; web "Copy Link" shows no regression.
- No new share surfaces, no label changes, no file/image sharing, no analytics (YAGNI per spec).
