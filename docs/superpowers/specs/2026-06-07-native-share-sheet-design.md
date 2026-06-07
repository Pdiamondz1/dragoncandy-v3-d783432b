# Native Share Sheet for Promotion Links — Design Spec

> **Status:** Draft (pending spec review) · **Created:** 2026-06-07
> **Phase:** Apple App Store roadmap → Phase 2 (native value-adds), Slice C.
> **Roadmap:** `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`
> **Sibling slice (pattern reference):** `docs/superpowers/specs/2026-06-06-native-camera-capture-design.md`

## Context

DragonCandy's web app is wrapped in a Capacitor iOS shell for the Apple App
Store. Apple guideline 4.2 wants genuine native functionality, not a repackaged
website. The native **share sheet** is a self-contained native value-add with
**zero Apple Developer-account dependency** — buildable and testable now.

Today the app shares promotion links by copying a URL to the clipboard. A
codebase audit found the only genuine "share a link with another person"
surfaces are the **promotion "Copy Link" actions**; everything else that copies
(captions, hashtags, ROI reports, test card numbers) is internal copy-to-paste,
and the DragonShare/Deliverables "Share" buttons are Outstand social-posting
flows (a different feature). So this slice targets exactly the promotion links.

## Problem

The promotion "Copy Link" actions use `navigator.clipboard.writeText(...)`. In
the native iOS app this is functional but unremarkable and registers as nothing
native to Apple. There is no native share affordance anywhere in the app.

## Goals

1. On iOS, the promotion "Copy Link" actions open the **native iOS share
   sheet** (`@capacitor/share`) so a user can send the promo link via Messages,
   Mail, WhatsApp, AirDrop, etc.
2. On web, behavior is **byte-identical to today** (clipboard copy + the same
   toast + the 2-second "Copied!" button flash).
3. Keep the change small, additive, and well-isolated behind one helper.

## Non-goals (YAGNI)

- No new share surfaces (public profiles, campaigns, DragonShare content are out
  of scope — confirmed with the product owner).
- No button-label changes; the existing "Copy Link" labels stay.
- No sharing of images/files — URL (with optional title/text) only.
- No share analytics/event logging.
- No changes to the internal copy-to-paste actions (captions, hashtags,
  reports, test cards) or the Outstand social-posting "Share" flows.

## Architecture & components

### 1. Dependency
Add `@capacitor/share@^6` (Capacitor-6-compatible, matches
`@capacitor/core@6.2.1`). Run `npx cap sync ios` to install the pod — a
Mac/Codemagic step, **not** run from Windows. No iOS permission strings are
required for Share.

### 2. `shareOrCopyLink` — `src/lib/nativeShare.ts` (plain async function, not a hook)
Single purpose: present the native share sheet on iOS, or copy to clipboard on
web. Holds no React state, so it is a plain module function (same rationale as
`captureCameraPhoto` — a `use*` hook called from a handler would violate
`react-hooks/rules-of-hooks`).

- Signature:
  `export async function shareOrCopyLink(opts: { url: string; title?: string; text?: string }): Promise<'shared' | 'copied'>`
- On iOS (`isNativeApp()` from `src/lib/platform.ts`):
  - `await Share.share({ title, text, url })` → return `'shared'`.
  - A **user-cancel rejection is swallowed** and still returns `'shared'` — the
    native sheet was presented; cancelling is a normal outcome, no error.
  - If `Share.share` rejects for a non-cancel reason (share genuinely
    unavailable), fall through to the clipboard path below.
- On web (or native fallthrough):
  - `await navigator.clipboard.writeText(url)` → return `'copied'`.
  - If the clipboard write **throws, let it propagate** (re-throw) so the
    caller's existing catch shows its "Failed to copy" toast.
- Depends only on `@capacitor/share` and `src/lib/platform.ts`. It does **not**
  toast — callers own their toast + copied-state so each surface keeps its exact
  current web UX.

**Cancel detection:** `@capacitor/share` rejects on user-cancel (message
contains "cancel"/"canceled"/"abort"). Treat a cancel-shaped rejection as
`'shared'` (silent). Treat any other rejection as "native share unavailable" and
fall back to clipboard (returning `'copied'`).

### 3. Caller changes — `PromotionCard.tsx` + `PromotionDetailPage.tsx`
Both have a `copyLink` async function (and `PromotionDetailPage` reuses it for
the QR-modal copy spots). Rewrite each `copyLink` to delegate to the helper and
branch on the result, preserving the existing toast text and `copied` flash:

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
      toast({ title: 'Link copied!', description: 'Share this link with your customers' }); // PromotionCard's exact text
      setTimeout(() => setCopied(false), 2000);
    }
    // 'shared' → native sheet handled feedback; no toast, no copied flash
  } catch {
    toast({ title: 'Failed to copy', variant: 'destructive' });
  }
};
```

- Keep each file's existing toast wording: `PromotionCard` uses
  `{ title: 'Link copied!', description: 'Share this link with your customers' }`;
  `PromotionDetailPage` uses `{ title: 'Link copied!' }`. Do not homogenize them.
- These files use the shadcn `useToast` `toast(...)`, **not** sonner — leave
  that as-is (the helper does not toast).
- **One edit per file covers every copy spot.** Each file has exactly one
  `copyLink` function, reused at all call sites: `PromotionCard` calls it from 1
  button (plus its QR-modal button at ~line 241, same function);
  `PromotionDetailPage` calls the same `copyLink` from both the main action
  button (~line 392) and the QR-modal button (~line 497). There are **no inline
  `navigator.clipboard` calls** anywhere in these files. So rewriting each file's
  single `copyLink` is sufficient — no per-button edits.

## Data flow

```
Tap "Copy Link"
  → copyLink()
      → shareOrCopyLink({ url, title, text })   [src/lib/nativeShare.ts]
          iOS:  Share.share({title,text,url}) → 'shared'   [native share sheet]
          web:  navigator.clipboard.writeText(url) → 'copied'
  → if 'copied': setCopied(true) + toast + reset flash   [unchanged web UX]
    if 'shared': nothing (native UX already gave feedback)
```

## Error handling

| Case | Behavior |
|---|---|
| iOS, user cancels the share sheet | `shareOrCopyLink` returns `'shared'`; no toast, no flash |
| iOS, share genuinely unavailable | falls back to clipboard → `'copied'` → normal copy toast |
| Web, clipboard write succeeds | `'copied'` → existing "Link copied!" toast + 2s flash |
| Web, clipboard write throws | helper re-throws → caller's existing "Failed to copy" toast |

## Testing

- **Unit — `shareOrCopyLink`** (`src/lib/nativeShare.test.ts`, node env, no DOM):
  mock `@capacitor/core` (`isNativePlatform`), `@capacitor/share` (`Share.share`),
  and `navigator.clipboard` (via `vi.stubGlobal`). Assert:
  - iOS success → returns `'shared'`, `Share.share` called with `{ title, text, url }`.
  - iOS cancel (reject with "canceled") → returns `'shared'`, does not throw, no clipboard call.
  - iOS non-cancel reject → falls back to clipboard, returns `'copied'`.
  - Web → returns `'copied'`, `clipboard.writeText` called with the url.
  - Web clipboard throws → `shareOrCopyLink` rejects (caller handles).
- **Web regression**: `npm run build` + `npm run typecheck`; manually confirm the
  promotion "Copy Link" still copies and shows the identical toast + flash.
- **Native (deferred to TestFlight)**: on a real iPhone, "Copy Link" opens the
  native share sheet with the promo URL; cancelling is silent. The simulator can
  exercise the share sheet, but real verification is in Phases 4–5.

## Verification (end-to-end)

1. `npm run typecheck` and `npm run build` pass.
2. `npx vitest run src/lib/nativeShare.test.ts` passes.
3. On web (`npm run dev`): promotion "Copy Link" copies the URL and shows the
   same toast + 2-second "Copied!" flash as before — no regression.
4. (Later, on device) "Copy Link" opens the native share sheet; cancel is silent.

## Risks

- **Capacitor Share version drift** — pin `@capacitor/share@^6` to match
  `@capacitor/core@6.2.1`.
- **Cancel-rejection shape** — relies on the plugin's cancel error message
  matching a `/cancel|abort/i` heuristic (the documented behavior). If it
  changes, a cancel could fall back to a clipboard copy — harmless (the link is
  still copied), just an extra toast. Acceptable.
- **`navigator` in tests** — the helper touches `navigator.clipboard`; the unit
  test runs in the `node` env and must `vi.stubGlobal('navigator', …)` (no jsdom
  needed for this pure-function test).
- **iPhone-only.** The app targets iPhone. On iPad, `Share.share` presents via a
  popover and may need a source anchor — not a concern for this slice, but a
  future iPad-enablement effort should account for it.

## Out of scope / follow-ups
- Other Phase 2 slices: push notifications (A), deep links (D).
- Phase 3 compliance (gate subscription CTAs on iOS, block-user).
- Any new share surfaces (profiles, campaigns, DragonShare) — deferred.
