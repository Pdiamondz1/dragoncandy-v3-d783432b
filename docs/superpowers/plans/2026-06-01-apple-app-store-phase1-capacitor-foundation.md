# Apple App Store — Phase 1: Capacitor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing DragonCandy Vite/React web app in a Capacitor iOS shell so the same codebase builds both the dragoncandy.io website (unchanged) and an iOS app project, with a platform-detection utility that downstream phases use to gate iOS-only behavior.

**Architecture:** Add Capacitor as a thin native layer that loads the existing `dist/` build inside a `WKWebView`. No web behavior changes. Introduce `src/lib/platform.ts` + a `useNativePlatform()` hook as the single source of truth for "am I running inside the native app?", which Phases 2–3 use for native plugins and iOS payment gating. Adjust the `index.html` CSP so the Capacitor bridge works inside the native WebView.

**Tech Stack:** Capacitor 6 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`), existing Vite 5 + React 18 + TypeScript + Vitest.

**Scope boundary:** This plan ends with a committed `ios/` Xcode project that `npx cap sync` populates from the web build, plus the platform helper. It does **not** compile/sign the app (needs macOS — see Plan 4) and does **not** add native plugins (Plan 2) or compliance changes (Plan 3). The web app must remain byte-for-byte behaviorally identical.

**Reference:** Spec at `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `package.json` | Capacitor deps + `cap:*` npm scripts | Modify |
| `capacitor.config.ts` | Capacitor app id / name / webDir / iOS scheme | Create |
| `src/lib/platform.ts` | Platform-detection utility (wraps `Capacitor` API) | Create |
| `src/lib/platform.test.ts` | Unit tests for the utility | Create |
| `src/hooks/use-native-platform.tsx` | React hook exposing `isNative` | Create |
| `index.html` | CSP meta tag updated for the `capacitor:` scheme | Modify |
| `ios/` | Generated native Xcode project | Create (via CLI) |
| `.gitignore` | Ignore Capacitor build artifacts inside `ios/` | Modify |
| `docs/runbooks/capacitor-ios.md` | How to sync/open/build the iOS project | Create |

---

## Pre-flight (read before Task 1)

- Run all commands from the worktree root: `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\apple-app-store`.
- This is Windows + PowerShell. Capacitor install, config, scaffolding, and `cap sync` all work on Windows. Only `cap build`/Xcode require macOS and are out of scope here.
- Confirm a clean baseline first: `npm run build` and `npm run test` should pass before starting. If they don't, stop and report — do not layer Capacitor onto a broken build.
- Capacitor 6 requires Node 18+. The existing Vite 5 / Vitest 4 toolchain already implies this; a quick `node -v` confirms it.
- Vitest's global `environment` is `node` (`vite.config.ts:53`). The platform tests in this plan are written to run under the node environment by mocking `@capacitor/core` — they do **not** require jsdom.

---

## Task 1: Install Capacitor dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the Capacitor core, CLI, and iOS packages**

Run:
```bash
npm install @capacitor/core@^6 @capacitor/cli@^6 @capacitor/ios@^6
```
Expected: `package.json` gains `@capacitor/core` and `@capacitor/ios` under `dependencies`, `@capacitor/cli` under `devDependencies` (npm may place all three in `dependencies`; either is acceptable). No peer-dependency errors that abort install.

- [ ] **Step 2: Verify the build still passes with the new deps present**

Run: `npm run build`
Expected: build succeeds (the new packages are not yet imported, so output is unchanged).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add Capacitor 6 core, cli, and ios packages"
```

---

## Task 2: Platform-detection utility (TDD)

This is the only logic-bearing unit in Phase 1 — everything downstream depends on it, so it is test-driven.

**Files:**
- Create: `src/lib/platform.ts`
- Test: `src/lib/platform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/platform.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Capacitor core module so we can drive isNativePlatform()/getPlatform()
const mockIsNative = vi.fn();
const mockGetPlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNative(),
    getPlatform: () => mockGetPlatform(),
  },
}));

import { isNativeApp, isIOS, getPlatformName } from './platform';

describe('platform', () => {
  beforeEach(() => {
    mockIsNative.mockReset();
    mockGetPlatform.mockReset();
  });

  it('isNativeApp is true inside the native shell', () => {
    mockIsNative.mockReturnValue(true);
    expect(isNativeApp()).toBe(true);
  });

  it('isNativeApp is false in a normal browser', () => {
    mockIsNative.mockReturnValue(false);
    expect(isNativeApp()).toBe(false);
  });

  it('isIOS is true only when native AND platform is ios', () => {
    mockIsNative.mockReturnValue(true);
    mockGetPlatform.mockReturnValue('ios');
    expect(isIOS()).toBe(true);
  });

  it('isIOS is false for web even if getPlatform reports web', () => {
    mockIsNative.mockReturnValue(false);
    mockGetPlatform.mockReturnValue('web');
    expect(isIOS()).toBe(false);
  });

  it('getPlatformName passes through Capacitor.getPlatform()', () => {
    mockGetPlatform.mockReturnValue('ios');
    expect(getPlatformName()).toBe('ios');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/platform.test.ts`
Expected: FAIL — `Failed to resolve import "./platform"` / module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/platform.ts`:
```ts
import { Capacitor } from '@capacitor/core';

/** True when running inside the native (iOS) Capacitor shell, false in any browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** The platform string: 'ios' | 'android' | 'web'. */
export function getPlatformName(): string {
  return Capacitor.getPlatform();
}

/** True only when running inside the native iOS app. */
export function isIOS(): boolean {
  return isNativeApp() && getPlatformName() === 'ios';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/platform.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform.ts src/lib/platform.test.ts
git commit -m "feat(platform): add Capacitor platform-detection utility"
```

---

## Task 3: `useNativePlatform` React hook

A render-safe hook so components can branch on native vs web. Mirrors the existing `src/hooks/use-mobile.tsx` convention.

**Files:**
- Create: `src/hooks/use-native-platform.tsx`

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-native-platform.tsx`:
```tsx
import * as React from 'react';
import { isNativeApp, isIOS } from '@/lib/platform';

/**
 * Exposes whether the app is running inside the native shell.
 * Value is stable for the lifetime of the app (platform never changes at runtime),
 * so it is read once on mount.
 */
export function useNativePlatform() {
  const [state] = React.useState(() => ({
    isNative: isNativeApp(),
    isIOS: isIOS(),
  }));
  return state;
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-native-platform.tsx
git commit -m "feat(platform): add useNativePlatform hook"
```

---

## Task 4: Capacitor configuration

**Files:**
- Create: `capacitor.config.ts`

- [ ] **Step 1: Create the config**

Create `capacitor.config.ts` at the repo root:
```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.dragoncandy.app',
  appName: 'DragonCandy',
  webDir: 'dist',
  ios: {
    // `scheme` is the Xcode BUILD scheme name (default 'App') — NOT the WebView
    // URL scheme. The served origin stays capacitor://localhost because we do not
    // set `server.iosScheme`. The Task 5 CSP (capacitor://localhost) is therefore correct.
    scheme: 'DragonCandy',
    contentInset: 'always',
  },
};

export default config;
```

> **Note on `appId`:** `io.dragoncandy.app` is the bundle identifier that must match the App Store Connect record created in Phase 0. Do not change it later without updating App Store Connect — it is the app's permanent identity.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors (the config is picked up by the CLI, not the app build; this just confirms types resolve).

- [ ] **Step 3: Commit**

```bash
git add capacitor.config.ts
git commit -m "feat(capacitor): add capacitor.config.ts (appId io.dragoncandy.app)"
```

---

## Task 5: Adjust the CSP for the Capacitor native bridge

The `index.html` CSP currently uses `default-src 'self'`. Inside the iOS WebView the app origin is `capacitor://localhost`, and Capacitor's native bridge needs its scheme allowed, or the bridge/asset loads fail silently. Add the `capacitor:` scheme to the relevant directives **without removing or loosening any existing web allowance**.

**Files:**
- Modify: `index.html:10`

- [ ] **Step 1: Update the CSP `meta` tag**

In `index.html`, replace the existing CSP content. The only changes are: add `capacitor://localhost` and `https://localhost` to `default-src`, `connect-src`, `img-src`, and `media-src`. Everything else is preserved verbatim.

Replace line 10 (`<meta http-equiv="Content-Security-Policy" ... >`) with:
```html
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' capacitor://localhost https://localhost; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: capacitor://localhost https://localhost https://*.supabase.co https://dragoncandy.io https://maps.googleapis.com https://maps.gstatic.com https://*.google.com https://*.ggpht.com; connect-src 'self' capacitor://localhost https://localhost https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.anthropic.com https://maps.googleapis.com; media-src 'self' blob: capacitor://localhost https://localhost https://*.supabase.co; frame-src https://js.stripe.com; object-src 'none'; base-uri 'self';" />
```

- [ ] **Step 2: Verify the web app is unaffected**

Run: `npm run build`
Expected: build succeeds.

Run: `npm run dev`, open `http://127.0.0.1:8080` in a browser, and confirm the landing page renders, you can navigate to `/auth`, and the browser console shows **no new CSP violation errors** (adding allowances never breaks existing web behavior; this step confirms it). Stop the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix(csp): allow capacitor:// scheme for native WebView bridge"
```

---

## Task 6: Add Capacitor npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `cap:*` scripts**

In `package.json`, add to the `"scripts"` block (after `"preview"`):
```json
    "cap:sync": "npm run build && npx cap sync ios",
    "cap:open": "npx cap open ios",
    "cap:copy": "npm run build && npx cap copy ios"
```

- [ ] **Step 2: Verify the scripts are valid JSON / runnable**

Run: `npm run` (lists scripts)
Expected: `cap:sync`, `cap:open`, `cap:copy` appear in the list. (Do not run `cap:sync` yet — the `ios/` project does not exist until Task 7.)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: add cap:sync / cap:open / cap:copy npm scripts"
```

---

## Task 7: Generate and sync the iOS native project

`npx cap add ios` scaffolds the `ios/` Xcode project from a template. This works on Windows (it copies files and runs `cap sync`); only *compiling* it later needs macOS.

**Files:**
- Create: `ios/` (generated)
- Modify: `.gitignore`

- [ ] **Step 1: Produce a fresh production build**

Run: `npm run build`
Expected: `dist/` is populated (Capacitor copies `webDir: dist` into the iOS project).

- [ ] **Step 2: Add the iOS platform**

Run: `npx cap add ios`
Expected: an `ios/` directory is created containing `ios/App/App.xcodeproj`, `ios/App/App/`, and `ios/App/Podfile`. The command finishes with a sync step that copies `dist/` into `ios/App/App/public`.

If the command reports it cannot run CocoaPods (`pod install`) or emits `[warn] Skipping pod install` — that is the **expected** Windows path and is **not** a failure for this plan. The project files are still scaffolded; `pod install` runs later on the Mac (Plan 4).

- [ ] **Step 3: Ignore CocoaPods + build artifacts, keep the project**

Append to `.gitignore`:
```gitignore
# Capacitor / iOS native — generated build artifacts (project files ARE committed)
ios/App/Pods/
ios/App/App/public/
ios/.DS_Store
ios/App/build/
DerivedData/
```

> Rationale: commit the `ios/App/App.xcodeproj` and source so the project is reproducible, but ignore `Pods/` (restored by `pod install`) and `public/` (regenerated by every `cap sync` from `dist/`).

- [ ] **Step 4: Run a sync to confirm the pipeline works end-to-end**

Run: `npm run cap:sync`
Expected: build runs, then `cap sync ios` reports `✔ copy ios` and `✔ update ios` (the `pod install` sub-step may warn on Windows — acceptable, per Step 2).

- [ ] **Step 5: Commit the iOS project**

```bash
git add ios .gitignore
git commit -m "feat(ios): scaffold Capacitor iOS native project (io.dragoncandy.app)"
```

---

## Task 8: Document the iOS workflow + verify no web regression

**Files:**
- Create: `docs/runbooks/capacitor-ios.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/capacitor-ios.md`:
```markdown
# Capacitor iOS — Build & Sync Runbook

DragonCandy ships one codebase to two surfaces: the web app (dragoncandy.io,
unchanged) and an iOS app via Capacitor. This runbook covers the iOS side.

## Daily workflow (any OS)
- `npm run dev` — web development, exactly as before. Capacitor is not involved.
- `npm run cap:sync` — production build + copy the web build into `ios/`. Run
  after web changes you want reflected in the native app.

## What needs a Mac (out of scope for Windows)
- `npm run cap:open` — opens the project in Xcode (macOS only).
- Compiling, signing, running on a simulator/device, and archiving for
  TestFlight/App Store. See the Plan 4 build-and-submit runbook.

## Platform detection in code
Use `@/lib/platform` (`isNativeApp()`, `isIOS()`, `getPlatformName()`) or the
`useNativePlatform()` hook to branch behavior between web and the native app.
Never branch on user-agent sniffing.

## Identity
- Bundle id (`appId`): `io.dragoncandy.app` — permanent; must match App Store Connect.
- `webDir`: `dist` — Vite's build output; `cap sync` copies this into the app.
```

- [ ] **Step 2: Final full verification — web build + tests + typecheck all green**

Run: `npm run build`
Expected: PASS.

Run: `npm run test`
Expected: PASS, including the 5 new `platform.test.ts` cases.

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors introduced by the added files.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/capacitor-ios.md
git commit -m "docs(ios): add Capacitor iOS build & sync runbook"
```

---

## Phase 1 Definition of Done

- [ ] `npm run build`, `npm run test`, `npm run typecheck`, `npm run lint` all pass.
- [ ] The web app at `npm run dev` behaves identically to before (no CSP regressions, no layout changes).
- [ ] `src/lib/platform.ts` + `useNativePlatform()` exist and are tested.
- [ ] `capacitor.config.ts` exists with `appId: io.dragoncandy.app`, `webDir: dist`.
- [ ] `ios/` Xcode project is committed; `npm run cap:sync` copies the latest build into it.
- [ ] The iOS runbook is committed.

---

## Roadmap — subsequent plans (not in this plan)

These are written as separate plans after Phase 1 lands, in order:

- **Plan 2 — Native value-adds (spec Phase 2):** `@capacitor/push-notifications` (APNs registration → device-token storage in Supabase → confirm/build server send path), `@capacitor/camera` in the content-upload flow, `@capacitor/share`, and universal links (`apple-app-site-association` on dragoncandy.io + associated-domains entitlement). Satisfies guideline 4.2.
- **Plan 3 — Compliance build-out (spec Phase 3):** self-serve account-deletion flow (settings sections, writing to `account_deletion_requests`), UGC block-user + report completeness + EULA, and iOS payment gating — enumerate and hide every in-app subscription/credit purchase CTA (pricing page, upgrade prompts, Donny credit-overage nudges) behind `useNativePlatform().isNative`.
- **Plan 4 — Build & submit ops (spec Phases 0, 4, 5, 6):** a runbook, not TDD code — Apple Developer enrollment, Codemagic cloud-Mac signing pipeline, first `.ipa`, TestFlight beta, App Privacy labels + screenshots + reviewer demo accounts, and App Store submission.
```
