# iOS First Signed Build to TestFlight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a signed DragonCandy build on the founder's physical iPhone via TestFlight, and use that device to verify three native features that shipped in June but have never executed on iOS hardware.

**Architecture:** The Capacitor shell already exists and serves the app from `capacitor://localhost`. Three things block it working: `window.location.origin` resolves to that scheme and leaks into emails, share links and OAuth callbacks; no edge function trusts that origin; and the bundle ID predates the `.com` domain decision. Tasks 1–9 fix those in the repo, Task 12 canaries the one edge function deploy the device session depends on, and Tasks 13–14 build on the Mac and verify on hardware.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Capacitor 6, Supabase (Deno edge functions), Vitest, Xcode 16+ on macOS.

**Spec:** `docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md`

## Global Constraints

- **Worktree:** `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\dc-apple-store`, branch `worktree-dc-apple-store`. Run every command from there. Never `cd` to the main checkout.
- **Vitest global environment is `node`.** A test that renders a component needs `// @vitest-environment jsdom` as **line 1**. **jest-dom matchers are NOT registered** — use `toBeTruthy()` / `toBeNull()`, never `toBeInTheDocument()`.
- **`npm run test` exits 1** because of ~103 pre-existing failing files. Trust the "N passed, 0 failed" line for the files you touched, not the exit code.
- **The web branch of every change must stay byte-identical.** `publicOrigin()` returns `window.location.origin` on web; no web-facing behaviour changes anywhere in this plan.
- **The canonical public origin is `https://dragoncandy.com`.** Verified allow-listed in GoTrue on 2026-08-09 (apex, `www`, and `/auth/update-password` all echo back; unlisted control falls to `.io`).
- **`.io` does NOT yet redirect to `.com`.** GoTrue Site URL is still `.io`. Do not "fix" that here — it belongs to the domain-migration workstream.
- **Bundle ID is `com.dragoncandy.app`** and must be merged **before** anyone creates the App Store Connect record. The record freezes it permanently.
- **ESLint:** only `console.error` and `console.warn` are permitted.
- **Never modify auth logic without confirming first** — Tasks 2 and 3 touch auth-adjacent files; they change only the origin string, never the auth flow.

---

### Task 1: `CANONICAL_APP_ORIGIN` and the `publicOrigin()` seam

**Files:**
- Modify: `src/lib/allowedOrigins.ts`
- Modify: `src/lib/allowedOrigins.test.ts`
- Create: `src/lib/publicOrigin.ts`
- Test: `src/lib/publicOrigin.test.ts`

**Interfaces:**
- Consumes: `isNativeApp()` from `src/lib/platform.ts` (existing, returns `boolean`).
- Produces: `CANONICAL_APP_ORIGIN: string` exported from `src/lib/allowedOrigins.ts`, and `publicOrigin(): string` exported from `src/lib/publicOrigin.ts`. Tasks 2–5 import `publicOrigin` only.

**Why not `APP_ORIGINS[0]`:** that array is an allow-list whose ordering carries no contract; a reorder would silently repoint the native app. And `DEFAULT_ORIGIN` is not the alternative — `_shared/origins.ts:44-51` calls it "a cosmetic default, not a security boundary," the ACAO value for an absent or untrusted `Origin`. `CANONICAL_APP_ORIGIN` deliberately holds the post-migration value already and **never flips**; migration Phase 2 moves `DEFAULT_ORIGIN` to meet it.

- [ ] **Step 1: Add the constant to `src/lib/allowedOrigins.ts`**

Insert directly after the `APP_ORIGINS` / `WWW_APP_ORIGINS` declarations, before `LOVABLE_PREVIEW_ORIGIN`:

```typescript
/**
 * The one origin the app uses when it must name itself to the outside world —
 * an email link, a share sheet, an OAuth `redirect_uri`, a notification
 * `actionUrl`. Read only through `publicOrigin()` (src/lib/publicOrigin.ts),
 * which returns `window.location.origin` on web and this value in the native
 * shell, where `window.location.origin` is `capacitor://localhost`.
 *
 * This is NOT `DEFAULT_ORIGIN` (supabase/functions/_shared/origins.ts), which
 * answers a different question — the ACAO value emitted when a caller's
 * `Origin` is absent or untrusted, and which that file itself calls "a
 * cosmetic default, not a security boundary."
 *
 * It is deliberately AHEAD of `DEFAULT_ORIGIN` during the .io -> .com
 * migration: it already holds the post-migration value, so it never changes.
 * Migration Phase 2 moves `DEFAULT_ORIGIN` from .io to .com to meet it.
 */
export const CANONICAL_APP_ORIGIN = 'https://dragoncandy.com';
```

- [ ] **Step 2: Write the failing invariant tests**

Append to `src/lib/allowedOrigins.test.ts`:

```typescript
describe('CANONICAL_APP_ORIGIN', () => {
  it('is the .com apex', () => {
    expect(CANONICAL_APP_ORIGIN).toBe('https://dragoncandy.com');
  });

  it('is an origin we accept back — a link we mint must be one we allow', () => {
    // These two survive every phase of the .io -> .com migration, where a bare
    // literal assertion would only catch an APP_ORIGINS reorder.
    expect(APP_ORIGINS.includes(CANONICAL_APP_ORIGIN)).toBe(true);
    expect(ALLOWED_REDIRECT_ORIGINS.has(CANONICAL_APP_ORIGIN)).toBe(true);
  });
});
```

Update the import on line 2 to:

```typescript
import { ALLOWED_REDIRECT_ORIGINS, APP_ORIGINS, CANONICAL_APP_ORIGIN } from './allowedOrigins';
```

Note `APP_ORIGINS` is declared `as const`, so `.includes()` on the readonly tuple needs the constant to be assignable — if TypeScript complains, widen the check to `(APP_ORIGINS as readonly string[]).includes(CANONICAL_APP_ORIGIN)`.

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/lib/allowedOrigins.test.ts
```

Expected: PASS, 5 tests (3 pre-existing + 2 new).

- [ ] **Step 4: Write the failing `publicOrigin` test**

Create `src/lib/publicOrigin.test.ts`:

```typescript
// src/lib/publicOrigin.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const isNativeApp = vi.fn();
vi.mock('@/lib/platform', () => ({ isNativeApp: () => isNativeApp() }));

import { publicOrigin } from './publicOrigin';
import { CANONICAL_APP_ORIGIN } from './allowedOrigins';

describe('publicOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { origin: 'https://staging.example.test' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the live browser origin on web, unchanged', () => {
    isNativeApp.mockReturnValue(false);
    expect(publicOrigin()).toBe('https://staging.example.test');
  });

  it('returns the canonical origin in the native shell', () => {
    // In Capacitor, window.location.origin is capacitor://localhost — a scheme
    // no mail client, share target or OAuth provider can open.
    isNativeApp.mockReturnValue(true);
    vi.stubGlobal('window', { location: { origin: 'capacitor://localhost' } });
    expect(publicOrigin()).toBe(CANONICAL_APP_ORIGIN);
  });

  it('never returns a capacitor: URL', () => {
    isNativeApp.mockReturnValue(true);
    vi.stubGlobal('window', { location: { origin: 'capacitor://localhost' } });
    expect(publicOrigin().startsWith('capacitor:')).toBe(false);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

```bash
npx vitest run src/lib/publicOrigin.test.ts
```

Expected: FAIL — cannot resolve `./publicOrigin`.

- [ ] **Step 6: Write the implementation**

Create `src/lib/publicOrigin.ts`:

```typescript
import { isNativeApp } from '@/lib/platform';
import { CANONICAL_APP_ORIGIN } from '@/lib/allowedOrigins';

/**
 * The origin to use whenever a URL will be consumed OUTSIDE the WebView — an
 * email body, a share sheet, an OAuth `redirect_uri`, a notification
 * `actionUrl`.
 *
 * On web this is `window.location.origin`, byte-identical to the previous
 * behaviour. In the native shell `window.location.origin` is
 * `capacitor://localhost`, which nothing outside the app can open, so this
 * returns the canonical public origin instead.
 *
 * Do NOT use this for in-app navigation. `AuthPage.tsx` resolves a `returnTo`
 * against the origin and then assigns `window.location.href` — swapping in the
 * canonical origin there would eject the user out of the app into Safari
 * mid-auth. The test is simply: does the value leave the WebView?
 */
export function publicOrigin(): string {
  return isNativeApp() ? CANONICAL_APP_ORIGIN : window.location.origin;
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx vitest run src/lib/publicOrigin.test.ts src/lib/allowedOrigins.test.ts
```

Expected: PASS, 8 tests total.

- [ ] **Step 8: Commit**

```bash
git add src/lib/publicOrigin.ts src/lib/publicOrigin.test.ts src/lib/allowedOrigins.ts src/lib/allowedOrigins.test.ts
git commit -m "feat(ios): add CANONICAL_APP_ORIGIN and the publicOrigin() seam

window.location.origin is capacitor://localhost inside the Capacitor shell.
publicOrigin() returns it unchanged on web and the canonical .com origin in
the native app, for values that leave the WebView.

CANONICAL_APP_ORIGIN is not APP_ORIGINS[0] (an allow-list with no ordering
contract) and not DEFAULT_ORIGIN (the ACAO fallback, which origins.ts itself
calls cosmetic). It already holds the post-migration value, so it never flips."
```

---

### Task 2: Repoint Category A — auth and email redirects

**Files:**
- Modify: `src/components/auth/AuthForm.tsx:50`
- Modify: `src/components/auth/AuthenticationModal.tsx:44`
- Modify: `src/pages/ForgotPassword.tsx:22`
- Modify: `src/pages/VerifyEmail.tsx:33,48`

**Interfaces:**
- Consumes: `publicOrigin()` from Task 1.
- Produces: nothing new.

These five values are handed to GoTrue or the `verify-email` edge function and end up in an email. Today the native app would send `capacitor://localhost/…`, which is unopenable from Mail — **password reset is dead in the native app.** All four destinations (`https://dragoncandy.com/`, `https://www.dragoncandy.com/`, `https://dragoncandy.com/auth/update-password`) were probe-verified allow-listed in GoTrue on 2026-08-09.

**This changes the origin string only. Do not alter any auth flow, option, or error path.**

- [ ] **Step 1: `src/components/auth/AuthForm.tsx`**

Add to the imports:

```typescript
import { publicOrigin } from '@/lib/publicOrigin';
```

Replace line 50:

```typescript
            emailRedirectTo: `${window.location.origin}/`,
```

with:

```typescript
            emailRedirectTo: `${publicOrigin()}/`,
```

- [ ] **Step 2: `src/components/auth/AuthenticationModal.tsx`**

Add the same import. Replace line 44:

```typescript
            emailRedirectTo: `${window.location.origin}/`,
```

with:

```typescript
            emailRedirectTo: `${publicOrigin()}/`,
```

- [ ] **Step 3: `src/pages/ForgotPassword.tsx`**

Add the same import. Replace line 22:

```typescript
        redirectTo: `${window.location.origin}/auth/update-password`,
```

with:

```typescript
        redirectTo: `${publicOrigin()}/auth/update-password`,
```

- [ ] **Step 4: `src/pages/VerifyEmail.tsx`**

Add the same import. Replace **both** line 33 and line 48 — they are identical:

```typescript
          const redirect = encodeURIComponent(window.location.origin);
```

with:

```typescript
          const redirect = encodeURIComponent(publicOrigin());
```

Preserve each line's existing indentation (line 33 is inside a deeper block than line 48).

- [ ] **Step 5: Verify no Category A auth site remains**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no errors.

```bash
npx vitest run src/lib/publicOrigin.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/AuthForm.tsx src/components/auth/AuthenticationModal.tsx src/pages/ForgotPassword.tsx src/pages/VerifyEmail.tsx
git commit -m "fix(ios): send a reachable origin in auth email redirects

Password reset and email verification handed GoTrue capacitor://localhost in
the native shell — a scheme no mail client can open. Web behaviour unchanged.

Note the confirmation still lands in Safari, not the app, until universal
links (Slice D). Documented as a known limitation."
```

---

### Task 3: Repoint Category A — shareable links

**Files:**
- Modify: `src/components/promotions/PromotionCard.tsx:57`
- Modify: `src/pages/PromotionDetailPage.tsx:291`
- Modify: `src/pages/CreatorPackages.tsx:34`

**Interfaces:**
- Consumes: `publicOrigin()` from Task 1.
- Produces: nothing new.

The native share sheet shipped in June (`src/lib/nativeShare.ts`). On a device it would share `capacitor://localhost/promo/<id>` — **a link nobody can open, from the one feature whose entire purpose is producing an openable link.**

- [ ] **Step 1: `src/components/promotions/PromotionCard.tsx`**

Add to the imports:

```typescript
import { publicOrigin } from '@/lib/publicOrigin';
```

Replace line 57:

```typescript
  const promotionUrl = `${window.location.origin}/promo/${promotion.id}`;
```

with:

```typescript
  const promotionUrl = `${publicOrigin()}/promo/${promotion.id}`;
```

- [ ] **Step 2: `src/pages/PromotionDetailPage.tsx`**

Add the same import. Replace line 291 — identical text to Step 1:

```typescript
  const promotionUrl = `${publicOrigin()}/promo/${promotion.id}`;
```

- [ ] **Step 3: `src/pages/CreatorPackages.tsx`**

Add the same import. Replace line 34:

```typescript
    slug ? `${window.location.origin}/p/${slug}/${pkg.slug}` : null;
```

with:

```typescript
    slug ? `${publicOrigin()}/p/${slug}/${pkg.slug}` : null;
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/promotions/PromotionCard.tsx src/pages/PromotionDetailPage.tsx src/pages/CreatorPackages.tsx
git commit -m "fix(ios): share links must be openable off-device

The June native share sheet would have shared capacitor://localhost/promo/<id>
— unopenable by any recipient. Verified on device by checklist item 5."
```

---

### Task 4: Repoint Category A — notification `actionUrl`s

**Files:**
- Modify: `src/hooks/useProjectComplete.ts:151,173,207,227`
- Modify: `src/hooks/useSponsorshipComplete.ts:111,133,164,187`

**Interfaces:**
- Consumes: `publicOrigin()` from Task 1.
- Produces: nothing new.

These eight `actionUrl`s are passed to `create-notification`, **which emails them to a different user.** In the native shell a dead `capacitor://localhost` link would land in a creator's inbox after the business marks their project complete. This is the worst instance of the bug and the least visible.

- [ ] **Step 1: `src/hooks/useProjectComplete.ts`**

Add to the imports:

```typescript
import { publicOrigin } from '@/lib/publicOrigin';
```

Replace all four occurrences. Line 151:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/business/campaigns/${campaignData.id}`,
```

Line 173:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/creator/projects?highlight=${collaborationId}`,
```

Line 207:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/business/campaigns/${collabCampaign.id}`,
```

Line 227:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/creator/projects?highlight=${collaborationId}`,
```

Lines 173 and 227 are textually identical, and so are 151 and 207 apart from the variable (`campaignData.id` vs `collabCampaign.id`) — **replace by line number, not by search-and-replace-first-match.**

- [ ] **Step 2: `src/hooks/useSponsorshipComplete.ts`**

Add the same import. Line 111:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/brand/sponsorships?highlight=${sponsorshipId}`,
```

Line 133:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/business/campaigns/${campaignData.id}`,
```

Line 164:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/business/campaigns/${campaignData.id}`,
```

Line 187:

```typescript
              actionUrl: `${publicOrigin()}/dashboard/brand/sponsorships?highlight=${sponsorshipId}`,
```

Lines 111/187 are identical and 133/164 are identical — again, replace by line number.

- [ ] **Step 3: Verify all eight changed**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no errors.

```bash
grep -c "publicOrigin()" src/hooks/useProjectComplete.ts src/hooks/useSponsorshipComplete.ts
grep -n "window.location.origin" src/hooks/useProjectComplete.ts src/hooks/useSponsorshipComplete.ts
```

Expected: `4` for each file from the first command, and **no output** from the second. Four, not five — the import line reads `import { publicOrigin } from …` with no parentheses, so it does not match the pattern. Confirm both imports separately; this count would not catch a missing one.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useProjectComplete.ts src/hooks/useSponsorshipComplete.ts
git commit -m "fix(ios): notification actionUrls are emailed to OTHER users

create-notification emails these. In the native shell all eight were
capacitor://localhost — a dead link arriving in a creator's inbox after
their project was marked complete."
```

---

### Task 5: Outstand OAuth — declared unavailable in the iOS app

**Files:**
- Create: `src/components/outstand/ConnectAccountButtonGroupGated.tsx`
- Test: `src/components/outstand/ConnectAccountButtonGroupGated.test.tsx`
- Modify: `src/components/outstand/AccountsTab.tsx:155`
- Modify: `src/components/outstand/ConnectedAccountsList.tsx:150,243,261`

**Interfaces:**
- Consumes: `useNativePlatform()` from `@/hooks/use-native-platform` (the hook `WebOnly` uses), and `ConnectAccountButtonGroup` from **`@outstand-so/ui`** — it is a third-party package export, **not** a local component file.
- Produces: `ConnectAccountButtonGroupGated`, a drop-in replacement taking the identical props.

**Why not simply repoint `redirectUri` like Tasks 2–4.** Repointing stops the provider rejecting a `capacitor://` `redirect_uri`, but the callback then completes in Safari against the web app and has no route back into the shell — there is no `@capacitor/app`, no `appUrlOpen` listener and no `@capacitor/browser` anywhere in the tree. That converts a hard rejection into a silent dead end, which is not an improvement. Surface it honestly until Slice D lands.

**Do not wrap these in `<WebOnly>`** — it renders `null`, leaving an unexplained hole where a Connect button used to be.

- [ ] **Step 1: Write the failing test**

Create `src/components/outstand/ConnectAccountButtonGroupGated.test.tsx`:

```typescript
// @vitest-environment jsdom
// src/components/outstand/ConnectAccountButtonGroupGated.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockPlatform = { isNative: false, isIOS: false };
vi.mock('@/hooks/use-native-platform', () => ({
  useNativePlatform: () => mockPlatform,
}));

// ConnectAccountButtonGroup ships in @outstand-so/ui, not a local file.
vi.mock('@outstand-so/ui', () => ({
  ConnectAccountButtonGroup: () => <button>Connect Instagram</button>,
}));

import { ConnectAccountButtonGroupGated } from './ConnectAccountButtonGroupGated';

describe('ConnectAccountButtonGroupGated', () => {
  // Typed against the real prop shape, NOT `as never` — under this repo's strict
  // config a `never`-typed fixture fails TS2698 ("Spread types may only be created
  // from object types") on the JSX spread below, and would not be type-checking
  // anything even if it compiled.
  const props: Parameters<typeof ConnectAccountButtonGroupGated>[0] = {
    networks: ['instagram'],
    redirectUri: 'https://dragoncandy.com/outstand/callback',
    apiKey: 'k',
    baseUrl: 'https://api.example.test',
  };

  it('renders the real connect buttons on web', () => {
    mockPlatform = { isNative: false, isIOS: false };
    render(<ConnectAccountButtonGroupGated {...props} />);
    expect(screen.queryByText('Connect Instagram')).toBeTruthy();
  });

  it('replaces them with an explanation in the native app', () => {
    mockPlatform = { isNative: true, isIOS: true };
    render(<ConnectAccountButtonGroupGated {...props} />);
    expect(screen.queryByText('Connect Instagram')).toBeNull();
    expect(screen.queryByText(/dragoncandy\.com/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/outstand/ConnectAccountButtonGroupGated.test.tsx
```

Expected: FAIL — cannot resolve `./ConnectAccountButtonGroupGated`.

- [ ] **Step 3: Write the component**

Create `src/components/outstand/ConnectAccountButtonGroupGated.tsx`:

```typescript
import React from 'react';
import { useNativePlatform } from '@/hooks/use-native-platform';
import { ConnectAccountButtonGroup } from '@outstand-so/ui';

type Props = React.ComponentProps<typeof ConnectAccountButtonGroup>;

/**
 * Connecting a social account is web-only in the iOS app until deep links land.
 *
 * The OAuth callback returns to an https URL, which opens in Safari against the
 * web app; the native shell has no way to receive it (no @capacitor/app, no
 * appUrlOpen listener). Repointing `redirectUri` alone would turn a visible
 * provider rejection into a silent dead end, so we say so instead.
 *
 * Deliberately NOT <WebOnly>, which renders null — an unexplained missing
 * button is worse than a sentence explaining where to go.
 */
export const ConnectAccountButtonGroupGated: React.FC<Props> = (props) => {
  const { isNative } = useNativePlatform();

  if (isNative) {
    return (
      <p className="text-sm text-dc-text-muted">
        Connecting a social account isn&apos;t available in the app yet. Sign in at
        dragoncandy.com to connect it, then it&apos;ll show up here.
      </p>
    );
  }

  return <ConnectAccountButtonGroup {...props} />;
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/outstand/ConnectAccountButtonGroupGated.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Swap the four call sites**

In `src/components/outstand/AccountsTab.tsx`, add:

```typescript
import { ConnectAccountButtonGroupGated } from './ConnectAccountButtonGroupGated';
```

and change the element at line 153 from `<ConnectAccountButtonGroup` to `<ConnectAccountButtonGroupGated`. Leave every prop untouched.

In `src/components/outstand/ConnectedAccountsList.tsx`, add the same import and change the elements at lines **148**, **241** and **259** the same way. Each is a multi-line JSX element — change the opening tag only; they are self-closing (`/>`), so there is no closing tag to match.

If `ConnectAccountButtonGroup` becomes an unused import in either file after the swap, remove it — `noUnusedLocals` is on and the build will fail otherwise.

- [ ] **Step 6: Typecheck and build**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/outstand/ConnectAccountButtonGroupGated.tsx src/components/outstand/ConnectAccountButtonGroupGated.test.tsx src/components/outstand/AccountsTab.tsx src/components/outstand/ConnectedAccountsList.tsx
git commit -m "feat(ios): say social-account linking is web-only in the app

The OAuth callback returns over https and lands in Safari; the shell has no
appUrlOpen listener to catch it. Repointing redirectUri would convert a
provider rejection into a silent dead end. Closed by Slice D (deep links)."
```

---

### Task 6: Trust `capacitor://localhost` in the edge function CORS allow-list

**Files:**
- Modify: `supabase/functions/_shared/origins.ts`
- Modify: `supabase/functions/_shared/cors.ts`
- Modify: `src/lib/allowedOrigins.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `NATIVE_APP_ORIGINS` exported from `_shared/origins.ts`, consumed only by `_shared/cors.ts`.

**This weakens nothing.** CORS is enforced by browsers; a non-browser caller ignores it entirely, so it was never the security boundary. Authorization still rests on the JWT.

**Do NOT mirror this into `src/lib/allowedOrigins.ts`.** That file exports one consumed value, `ALLOWED_REDIRECT_ORIGINS`, used only at `AuthPage.tsx:64,195` to decide where a session `access_token` may be sent. A mirror there is dead code at best and widens a credential boundary at worst. Step 3 adds a test that pins that.

- [ ] **Step 1: Add the group to `supabase/functions/_shared/origins.ts`**

Insert after the `INTERNAL_APP_ORIGINS` declaration:

```typescript
/**
 * The origin the iOS Capacitor shell serves from.
 *
 * `capacitor.config.ts` sets `webDir: 'dist'` with no `server.url`, so the app
 * loads its bundle locally and every fetch carries `Origin:
 * capacitor://localhost`. Without this the native app reaches Supabase REST and
 * Auth (which send their own permissive CORS) but NO custom edge function.
 *
 * Composed into `cors.ts` only — deliberately NOT into the email-redirect
 * allow-list, which must keep naming real web URLs.
 */
export const NATIVE_APP_ORIGINS = [
  'capacitor://localhost',
] as const;
```

- [ ] **Step 2: Compose it in `supabase/functions/_shared/cors.ts`**

Change the import block to add `NATIVE_APP_ORIGINS`:

```typescript
import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  NATIVE_APP_ORIGINS,
  WWW_APP_ORIGINS,
} from './origins.ts';
```

and add it to the set:

```typescript
const ALLOWED = new Set<string>([
  ...APP_ORIGINS,
  ...WWW_APP_ORIGINS,
  ...INTERNAL_APP_ORIGINS,
  ...NATIVE_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
]);
```

- [ ] **Step 3: Pin the negative assertion on the frontend side**

Append to `src/lib/allowedOrigins.test.ts`:

```typescript
describe('the native origin is a CORS concern, not a redirect concern', () => {
  it('never admits capacitor://localhost as a redirect target', () => {
    // ALLOWED_REDIRECT_ORIGINS gates where a session access_token is sent.
    // capacitor://localhost belongs in the Deno CORS allow-list only; folding
    // it in here would widen the app's one credential boundary.
    expect(ALLOWED_REDIRECT_ORIGINS.has('capacitor://localhost')).toBe(false);
  });
});
```

- [ ] **Step 4: Run the frontend test**

```bash
npx vitest run src/lib/allowedOrigins.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck the Deno side by hand**

CI's edge typecheck gate does not cover every `_shared` importer.

> **⚠️ NEVER run `npx supabase functions download` to do this.** An earlier draft of this
> step said to, and it caused real damage: the command overwrites local source with the
> **currently deployed** bundle. It reverted `_shared/cors.ts` and `_shared/origins.ts` to
> their pre-task state — silently undoing this very task — and truncated
> `donny-orchestrator/types.ts` to **0 bytes**, a file nine other files import. The commit
> survived; the working tree did not. A blanket `git add` afterwards would have shipped the
> reverted CORS with no error anywhere.

Check the local sources directly instead, without fetching anything:

```bash
deno check supabase/functions/_shared/cors.ts
```

`cors.ts` imports only `./origins.ts`, so this covers both files with no external
dependency to resolve. If it fails on module resolution rather than types — Deno may not
resolve this repo's `npm:` specifiers locally — record that plainly and let Task 12's
deploy be the gate. Note it in the PR rather than implying coverage you do not have.

Then confirm the tree is still clean, because this step's whole hazard is invisible otherwise:

```bash
git status --porcelain
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/origins.ts supabase/functions/_shared/cors.ts src/lib/allowedOrigins.test.ts
git commit -m "feat(ios): allow capacitor://localhost in edge function CORS

Without this the native app reaches REST and Auth but no custom edge
function — Donny, campaign generation, payments. CORS is browser-enforced so
this weakens nothing; authorization still rests on the JWT.

INERT UNTIL REDEPLOY: _shared is bundled per function at deploy time and 82
function files import it. See Task 12."
```

---

### Task 7: Bundle ID → `com.dragoncandy.app`, and the five documents that forbid it

**Files:**
- Modify: `capacitor.config.ts:4`
- Modify: `ios/App/App.xcodeproj/project.pbxproj:357,376`
- Modify: `docs/wiki/concepts/domain-migration-io-to-com.md:121`
- Modify: `docs/runbooks/capacitor-ios.md:25`
- Modify: `docs/wiki/entities/capacitor-native-shell.md:20,53`
- Modify: `docs/wiki/sources/apple-app-store-capacitor-phase1-session.md:18`

**Interfaces:** none — configuration and documentation only.

**Ordering rule: this must merge BEFORE anyone creates the App Store Connect record.** The record freezes the identifier permanently; changing it afterwards means a new listing and losing reviews, ratings and TestFlight testers. Today it is free.

The wiki source file is a historical record of what was decided in June — correct it with a dated note rather than rewriting history.

- [ ] **Step 1: `capacitor.config.ts`**

Replace line 4:

```typescript
  appId: 'io.dragoncandy.app',
```

with:

```typescript
  // com, not io: dragoncandy.com is the company's primary domain as of 2026-08.
  // Immutable once the App Store Connect record exists — changed before that
  // record was created. See docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md
  appId: 'com.dragoncandy.app',
```

- [ ] **Step 2: `ios/App/App.xcodeproj/project.pbxproj`**

Replace **both** line 357 and line 376 (Debug and Release configurations — the text is identical, so replace by line number):

```
				PRODUCT_BUNDLE_IDENTIFIER = com.dragoncandy.app;
```

Preserve the leading tabs exactly.

- [ ] **Step 3: Verify no `io.dragoncandy.app` remains in code**

```bash
grep -rn "io\.dragoncandy\.app" capacitor.config.ts ios/
```

Expected: no output.

- [ ] **Step 4: `docs/runbooks/capacitor-ios.md:25`**

Replace:

```markdown
- Bundle id (`appId`): `io.dragoncandy.app` — permanent; must match App Store Connect.
```

with:

```markdown
- Bundle id (`appId`): `com.dragoncandy.app` — permanent; must match App Store Connect.
  (Changed from `io.dragoncandy.app` on 2026-08-09, before any App Store Connect
  record existed, to match the now-primary `dragoncandy.com` domain. It is frozen
  the moment that record is created.)
```

- [ ] **Step 5: `docs/wiki/entities/capacitor-native-shell.md`**

Line 20 — replace:

```markdown
- `capacitor.config.ts` — `appId: io.dragoncandy.app` (permanent; must match App Store
```

with:

```markdown
- `capacitor.config.ts` — `appId: com.dragoncandy.app` (permanent; must match App Store
```

Line 53 — replace:

```markdown
- Bundle ID fixed now as `io.dragoncandy.app` (changing it later means re-registering).
```

with:

```markdown
- Bundle ID fixed as `com.dragoncandy.app` (2026-08-09; was `io.dragoncandy.app`).
  Changing it after the App Store Connect record exists means re-registering, so it
  was changed while no record existed.
```

- [ ] **Step 6: `docs/wiki/concepts/domain-migration-io-to-com.md:121`**

This sits inside a **"Must NOT change"** section. Replace the line:

```markdown
`io.dragoncandy.app` (Capacitor appId / iOS bundle id) — a reverse-DNS **identifier**, not a
```

with:

```markdown
~~`io.dragoncandy.app`~~ → **`com.dragoncandy.app`** (Capacitor appId / iOS bundle id).
**Superseded 2026-08-09.** It is a reverse-DNS **identifier**, not a
```

Then, immediately after that entry's existing prose, add:

```markdown
> **Why this moved out of "Must NOT change" (2026-08-09):** the constraint is real but
> begins only when the App Store Connect record is created, and none existed. It was
> changed to match the now-primary domain while it was still free. After the record
> exists it is genuinely immutable, and this entry applies again — permanently.
```

- [ ] **Step 7: `docs/wiki/sources/apple-app-store-capacitor-phase1-session.md:18`**

This is a historical session record. Replace:

```markdown
- Permanent bundle ID `io.dragoncandy.app`.
```

with:

```markdown
- Permanent bundle ID `io.dragoncandy.app`. *(Superseded 2026-08-09 →
  `com.dragoncandy.app`, before any App Store Connect record existed. Left here
  as the record of what was decided in June.)*
```

- [ ] **Step 8: Verify every doc reference is handled**

```bash
grep -rn "io\.dragoncandy\.app" docs/ | grep -v "2026-08-09-ios-testflight"
```

Expected: only the four lines you just annotated, each now carrying a supersession note.

- [ ] **Step 9: Commit**

```bash
git add capacitor.config.ts ios/App/App.xcodeproj/project.pbxproj docs/
git commit -m "feat(ios): bundle ID io.dragoncandy.app -> com.dragoncandy.app

dragoncandy.com is the primary domain now. Immutable once an App Store
Connect record exists; none does, so this is free today and permanent after.

Five committed docs said it must not change — including a wiki page synced
into Donny's RAG. All five updated rather than silently overridden: the
constraint was real, it just had not started yet."
```

---

### Task 8: `ITSAppUsesNonExemptEncryption`

**Files:**
- Modify: `ios/App/App/Info.plist`

**Interfaces:** none.

Without this key **every** upload parks in App Store Connect awaiting the export-compliance questionnaire before the build is installable — friction landing squarely on Wednesday's critical path, removed permanently by one key. The app uses only standard HTTPS/TLS, which is exempt.

- [ ] **Step 1: Add the key**

In `ios/App/App/Info.plist`, insert immediately before the closing `</dict>` on line 52, after the `NSPhotoLibraryUsageDescription` string:

```xml
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
```

Use a leading tab to match the file's existing indentation.

- [ ] **Step 2: Verify the plist is still well-formed**

```bash
grep -c "<key>" ios/App/App/Info.plist
```

Expected: one more than before the edit. Confirm the file still ends `</dict>` then `</plist>`.

- [ ] **Step 3: Commit**

```bash
git add ios/App/App/Info.plist
git commit -m "chore(ios): declare exempt encryption in Info.plist

Without it every TestFlight upload waits behind the export-compliance
questionnaire before becoming installable. The app uses only standard
HTTPS/TLS, which is exempt."
```

---

### Task 9: Bounded purchase-CTA audit

**Files:**
- Create: `docs/app-store/2026-08-09-ios-purchase-cta-audit.md`

**Interfaces:** none — this task produces a findings document and, if it finds anything, gating changes.

233 commits and 31 new pages landed since the iOS scaffold. A single ungated in-app purchase CTA is among the most common App Store rejection causes. This is **mechanical, not exploratory** — run the fixed predicate set and confirm the known set is still closed.

- [ ] **Step 1: Run the predicate set**

```bash
grep -rn "create-checkout-session\|create-billing-portal-session\|checkout_url\|billingRoute\|/pricing\|>Upgrade\|Upgrade<" src/ --include=*.tsx --include=*.ts
```

- [ ] **Step 2: Compare against the known-closed set**

As of 2026-08-09 the expected hits are exactly:

| Site | Status |
|---|---|
| `PricingPage.tsx:32,37` | `handleSelectTier` is unreachable — `TierComparisonGrid.tsx:121` wraps its only caller in `<WebOnly>` |
| `OrgBillingPage.tsx:59,137,141` | gated |
| `DonnyChatView.tsx:98` | gated |
| `DonnyAutoPilot.tsx`, `DonnyPerformanceInsights.tsx:72`, `DonnyWeeklyPlanner.tsx` | gated |
| `SoftPaywallSheet.tsx`, `TierComparisonGrid.tsx` | gated |

Anything **outside** this table is a finding.

- [ ] **Step 3: Confirm the gate count is unchanged**

```bash
grep -rln "WebOnly" src/ | sort
```

Expected: 9 files — `WebOnly.tsx`, `WebOnly.test.tsx`, `OrgBillingPage.tsx`, `TierComparisonGrid.tsx`, `SoftPaywallSheet.tsx`, `DonnyChatView.tsx`, `DonnyAutoPilot.tsx`, `DonnyPerformanceInsights.tsx`, `DonnyWeeklyPlanner.tsx`.

- [ ] **Step 4: Write the findings document**

Create `docs/app-store/2026-08-09-ios-purchase-cta-audit.md` recording: the exact command run, its full output, each hit classified gated/ungated, and the named short list for the Wednesday device pass. If the set is still closed, say so explicitly — a document saying "checked, nothing new" is the deliverable, not a failure.

**Name the device-pass list here.** Do not write "31 pages" — many need data states one founder account cannot produce in a sitting (a package order, a guest order token, a crew, a pending invite, a completed collaboration, brand role behind `BRAND_ROLE_ENABLED`).

The list is: `/pricing`, **`/dashboard/business/billing` or `/dashboard/brand/billing`** (whichever matches the signed-in role), the Donny chat panel, the three Donny lock cards, `/dashboard/business`, `/dashboard/creator`, `/rewards`, and DragonFeed.

> **The billing route is written out in full deliberately.** An earlier draft of this plan said `/settings/billing`. **There is no top-level `/settings/*` route in this app** — `src/lib/donnyRoutes.ts` resolves billing via `billingRoute(role)`, and its own comment records that `/settings/billing` was once hardcoded in 8 places and every "Upgrade" CTA 404'd. A tester following the stale list would hit a 404 at precisely the screen holding the two most sensitive gated CTAs. **Verify every route in this list against `src/App.tsx` before the device pass** rather than trusting it.

- [ ] **Step 5: Gate anything ungated**

For each ungated purchase CTA found, wrap it in `<WebOnly>` following the existing pattern, e.g.:

```tsx
<WebOnly><a href={billingRoute(profile?.role)} className="underline text-dc-teal">Upgrade</a></WebOnly>
```

Keep the read-only context around it; remove only the buy affordance. If nothing was ungated, skip this step and say so in the document.

- [ ] **Step 6: Commit**

```bash
git add docs/app-store/2026-08-09-ios-purchase-cta-audit.md src/
git commit -m "docs(ios): purchase-CTA audit after 233 commits since the scaffold

Bounded by a fixed predicate set rather than a page walk. Records the closed
set and names the short list for the on-device pass."
```

---

### Task 10: Pre-PR gates and the pull request

**Files:** none created — this task runs the project's mandatory review gates.

- [ ] **Step 1: Prove Category B was NOT swept**

The likeliest way this branch causes a regression is an over-eager sweep replacing *every* `window.location.origin`. Three sites must still hold the original:

```bash
grep -n "window.location.origin" src/pages/AuthPage.tsx src/lib/safeUrl.ts
```

Expected, exactly:

```
src/pages/AuthPage.tsx:63:      const returnUrl = new URL(returnTo, window.location.origin);
src/pages/AuthPage.tsx:194:          const url = new URL(returnTo, window.location.origin);
src/lib/safeUrl.ts:4:    const url = new URL(raw, window.location.origin);
```

`AuthPage` resolves a `returnTo` and then assigns `window.location.href` — repointing it would eject the user into Safari mid-auth. `safeUrl` is reached from `DonnyMessage.tsx:84`, where Donny's markdown may carry a relative in-app route; its other seven callers pass absolute URLs from the database, so the base is unused there.

If any of these three now says `publicOrigin()`, revert that one line before going further.

- [ ] **Step 2: Confirm the full origin sweep is otherwise complete**

Exclude the seam itself — `publicOrigin.ts` legitimately contains `window.location.origin` in both its implementation and its docstring, and `allowedOrigins.ts` names it in a comment:

```bash
grep -rn "window\.location\.origin" src/ --include=*.ts --include=*.tsx \
  | grep -v "src/lib/publicOrigin.ts" \
  | grep -v "src/lib/allowedOrigins.ts"
```

Expected: exactly the three Category B lines from Step 1, and nothing else. There were **21 occurrences across 14 files** before this branch.

- [ ] **Step 3: Full local gate**

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

`npm run test` exits 1 from ~103 pre-existing failing files — read the "N passed, N failed" line and confirm no file **you touched** is failing.

- [ ] **Step 4: `data-exposure-reviewer` subagent**

Task 6 changes an allow-list, so run this before Codex. Ask it one question: can any change in this branch let one actor reach data that isn't theirs? Expect PASS — CORS is not an authorization boundary — but run it rather than assuming.

- [ ] **Step 5: Codex second review (mandatory)**

```bash
codex review --base main --title "iOS TestFlight first signed build"
```

Fix anything real and re-run until clean. A blank run is a **failed gate**, not a pass. Codex's sandbox may reject some of its own shell commands ("blocked by policy") — that is expected and it still completes a full diff pass.

- [ ] **Step 6: Open the PR**

```bash
git push -u origin worktree-dc-apple-store
gh pr create --title "iOS: first signed build to TestFlight" --body "$(cat <<'EOF'
Spec: `docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md`
Plan: `docs/superpowers/plans/2026-08-09-ios-testflight-first-build.md`

Gets a signed build onto a physical iPhone via TestFlight and verifies three
native features that shipped in June but have never run on iOS hardware.

**Two latent bugs in already-shipped web code, exposed by the iOS work:**
- `window.location.origin` is `capacitor://localhost` in the shell — 21 sites
  across 14 files. Worst case: `useProjectComplete` / `useSponsorshipComplete`
  build `actionUrl`s that `create-notification` **emails to another user**.
  The June share sheet would have shared an unopenable link.
- `capacitor://localhost` is in no CORS allow-list, so no custom edge function
  would answer the app.

Not every site is repointed: `AuthPage.tsx:63,194` use the origin as an in-app
navigation base and would eject the user into Safari. The rule is whether the
value leaves the WebView.

**Bundle ID changed to `com.dragoncandy.app`** — free today, permanent once an
App Store Connect record exists. Five committed docs said it must not change;
all five updated rather than overridden.

**⚠️ NOT DONE BY MERGING:** the CORS fix is inert until edge functions
redeploy (`_shared` is bundled per function; 82 files import it). See plan
Task 12 — canary `donny-orchestrator` first.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JSg18V7ANKjmG2qqftj5Rn
EOF
)"
```

- [ ] **Step 7: Merge once checks are green**

If another PR lands first, branch protection requires up-to-date: `git merge origin/main --no-edit`, push, wait for re-run, then merge.

---

### Task 11: Phase 0 — Apple enrollment (founder, non-code, START FIRST)

**Files:** none.

**This is not code and it gates everything. It takes 24–48 hours, so it must start before Tasks 1–10 finish, not after.** Listed at this position only because it is verified here; begin it on day one.

- [ ] **Step 1: Apple ID**

Create an Apple ID against `appstore@dragoncandy.com` (the Workspace mailbox is live) with 2FA on a trusted number. A Google Group works — Apple only needs to receive verification mail.

- [ ] **Step 2: Enroll Individual**

developer.apple.com/programs/enroll, $99/yr. Individual needs no D-U-N-S and no verification call, and approves in ~24–48h. Migration to an Organization account is deferred to before public launch.

- [ ] **Step 3: Do NOT create the App Store Connect app record yet**

It waits until Task 7 is merged. The record freezes the bundle ID.

- [ ] **Step 4: Create the record, after Task 7 merges**

Bundle ID `com.dragoncandy.app`, name DragonCandy.

---

### Task 12: Canaried edge function deploy

**Files:** none — deployment only.

Merging ships the frontend. `_shared/*` is bundled into each function **at deploy time**, and 85 imports span 82 function files, so Task 6's allow-list edit is **inert on prod until redeploy**. PR #415 made fleet redeploys a known-risk operation, hence the canary.

- [ ] **Step 1: Run `edge-function-reviewer` on `donny-orchestrator`**

Mandatory before any edge function deploy. Read-only; returns PASS/ISSUES against documented deploy hazards.

- [ ] **Step 2: Deploy the canary alone**

```bash
npx supabase functions deploy donny-orchestrator --project-ref zocahiffooqdybdhguqv
```

- [ ] **Step 3: Verify by reading the DEPLOYED SOURCE, not the version number**

Use the Supabase MCP `get_edge_function` for `donny-orchestrator` and confirm the bundled `cors.ts` contains `capacitor://localhost`. "Merged ≠ deployed" has bitten this project repeatedly; a version bump is not evidence.

- [ ] **Step 4: Confirm the function still boots and still requires auth**

```bash
curl.exe -s -o NUL -w "%{http_code}\n" -X POST https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-orchestrator
curl.exe -s -o NUL -w "%{http_code}\n" -X OPTIONS https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-orchestrator
```

Expected: `401` for the unauthenticated POST (proving `verify_jwt` survived) and `200` for OPTIONS. A `500` or `WORKER_ERROR` means the bundle broke — stop and diagnose before deploying anything else.

- [ ] **Step 5: Build the deployed-function reference sheet**

```bash
grep -rn "supabase.functions.invoke(" src/ --include=*.ts --include=*.tsx | grep -v "/internal" | sed "s/.*invoke(['\"]\\([^'\"]*\\)['\"].*/\\1/" | sort -u
```

That list minus `/internal`-only callers is the fan-out set. A function invoked server-to-server or by cron carries no browser `Origin` and needs nothing — CORS applies only to the outermost response.

Write the result to `docs/app-store/2026-08-09-ios-deployed-functions.md` with two columns: function name, deployed yes/no. **Carry this into the Wednesday session.**

- [ ] **Step 6: Fan out**

Deploy the remaining functions in the set, in batches, re-running the boot check after each batch.

- [ ] **Step 7: Record what a partial deploy looks like on device**

Add to the reference sheet, verbatim:

> An un-deployed function answers a `capacitor://localhost` caller with
> `Access-Control-Allow-Origin: https://dragoncandy.io`. WKWebView blocks the
> response and supabase-js surfaces a generic fetch error **indistinguishable
> from "this feature is broken on iOS."** Before filing any on-device failure as
> an iOS bug, check this sheet.

**Open, and outside this plan:** the ~77 functions outside the fan-out set keep rejecting the native origin. Not on the TestFlight path. The natural closure is the `DEFAULT_ORIGIN` `.io` → `.com` flip, which forces a sweep — but migration Phase 2 does not currently list it, and no workstream owns it.

---

### Task 13: Wednesday 2026-08-12 — build and sign on the Mac

**Files:** none — build environment.

**Blocking prerequisite, out of scope for this plan:** macOS dev-environment setup (repo clone, Node, npm, Git, Supabase CLI, Claude Code). Budget real time for it; it lands the same day.

- [ ] **Step 1: Verify Apple's current minimum Xcode and SDK**

Check Apple's developer site directly — **this is the one claim in the spec deliberately left unverified**, because it postdates the model's knowledge and Apple ratchets it. The project targets iOS 13.0 on Capacitor 6. If the required Xcode still builds Capacitor 6, change nothing. Only if it does not does a Capacitor upgrade enter scope — and then it becomes its own spec, not an improvised fix on the day.

- [ ] **Step 2: Build the web bundle and sync**

```bash
npm install
npm run build
npx cap sync ios
npx cap open ios
```

- [ ] **Step 3: Configure signing in Xcode**

Sign in with the `appstore@dragoncandy.com` Apple ID. Select the team. Leave **Automatically manage signing** on — it handles certificates and provisioning profiles, which is where first-time iOS builds usually die. Confirm the bundle identifier reads `com.dragoncandy.app`.

- [ ] **Step 4: Replace the app icon**

`ios/App/App/Assets.xcassets/AppIcon.appiconset/` currently holds only the Capacitor template `AppIcon-512@2x.png`. Upload validation passes either way, but confirm it is DragonCandy's icon before archiving. Source the 1024px master from the brand assets — **do not upscale the 512px PWA icon.**

- [ ] **Step 5: Run in the Simulator**

Pick any iPhone simulator and Run. This is free and fast and catches boot failures, CSP blocks and layout breakage immediately. **The Simulator cannot test the camera** — that needs hardware.

- [ ] **Step 6: Run on the physical iPhone**

Connect over cable, select the device, Run. Then attach **Safari Web Inspector** (Safari → Develop → *device name* → the app's WebView). This is the only real debugger for a `WKWebView` and the reason a Mac beats CI here.

- [ ] **Step 7: Archive and upload to TestFlight**

Product → Archive → Distribute App → App Store Connect → Upload. Expect an **`ITMS-91053`** privacy-manifest warning email — there is no `PrivacyInfo.xcprivacy` in `ios/`. It is informational for TestFlight, not a rejection.

- [ ] **Step 8: Install from TestFlight**

Add the founder as an internal tester. External testers are out of scope.

---

### Task 14: On-device verification

**Files:**
- Create: `docs/app-store/2026-08-12-on-device-verification.md`

**This is the actual deliverable of the whole plan.** Three shipped features have never executed on iOS. **Keep Task 12's reference sheet open throughout** — without it an un-deployed function is indistinguishable from a genuine iOS bug.

Record each item as pass/fail with evidence (screenshot, console line, or the shared URL itself). A checklist filled in from memory is worth nothing.

- [ ] **Step 1: Boot and console**

App launches; Safari Web Inspector console is clean. Any CSP violation appears here first.

- [ ] **Step 2: Login**

Sign in with an existing test account. **Do not sign up in-app** — the confirmation lands in Safari and never returns (known limitation until Slice D).

- [ ] **Step 3: Donny responds**

The single best proof the CORS fix reached the device. If this fails, check the reference sheet before concluding anything.

- [ ] **Step 4: Native camera capture**

Take a photo through the DragonShare upload flow. Real camera, real upload. The Simulator could not test this.

- [ ] **Step 5: Share sheet emits an openable link**

Share a promotion. **Read the actual URL** in the share sheet — it must begin `https://dragoncandy.com/promo/`, not `capacitor://`. Paste it into Safari on another device and confirm it opens.

- [ ] **Step 6: No purchase CTA anywhere**

Walk the named short list from Task 9's audit document. Any visible buy or upgrade affordance is a rejection risk and a bug.

- [ ] **Step 7: Safe area**

Check the notch and the home indicator. The app's `dvh` and `env(safe-area-inset-bottom)` work was tuned for mobile Safari, not `WKWebView`; the bottom nav must clear the home indicator.

- [ ] **Step 8: Scrolling**

Confirm `#main-content` scrolls and the document itself does not. This app's window deliberately never scrolls, and `WKWebView` handles that differently from Safari.

- [ ] **Step 9: Password reset**

Request a reset. Confirm the email arrives with an `https://dragoncandy.com/auth/update-password` link (not `capacitor://`) and that it opens and works — **in Safari**, which is the expected behaviour until Slice D.

- [ ] **Step 10: Write up and commit**

```bash
git add docs/app-store/2026-08-12-on-device-verification.md
git commit -m "docs(ios): on-device verification results, first TestFlight build"
```

Report honestly. If checklist item 3 failed because the canary did not land, **Success Criterion 2 is unmet and this is a partial success** — not a pass with a caveat.

---

## Success Criteria

1. A signed build reaches the founder's physical iPhone through TestFlight.
2. Login and Donny both work on device, proving the edge-function path end to end.
3. Native camera capture produces a real photo upload.
4. The share sheet emits an openable `https://dragoncandy.com/...` link.
5. No purchase or subscription CTA is reachable anywhere in the iOS app.
6. The web surface is provably unregressed: `publicOrigin()`'s web branch returns `window.location.origin` (asserted by unit test) and no web-facing behaviour changed.

## Out of Scope

macOS dev-environment setup. Push notifications (Slice A) and universal links (Slice D). The public App Store listing — screenshots, metadata, App Privacy labels, reviewer notes, submission. Any Capacitor upgrade not forced by Apple's SDK minimum. Android. The ~77 edge functions outside Task 12's fan-out set.
