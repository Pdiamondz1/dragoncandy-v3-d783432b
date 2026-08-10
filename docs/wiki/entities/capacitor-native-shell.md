---
title: Capacitor Native Shell
type: entity
created: 2026-06-01
updated: 2026-08-10
sources: [raw/sessions/2026-06-01-apple-app-store-capacitor-phase1.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md, docs/superpowers/specs/2026-06-01-apple-app-store-design.md, raw/sessions/2026-08-09-ios-testflight-first-build.md]
tags: [capacitor, ios, app-store, mobile, native]
---

# Capacitor Native Shell

The iOS delivery surface for [[DragonCandy Platform]]. Capacitor 6 wraps the existing
web build in a native WKWebView so **one codebase serves both dragoncandy.io (unchanged)
and a downloadable iPhone app.** Phase 1 (foundation) has shipped; no business logic
changed.

## What Shipped (Phase 1)

- Capacitor 6 packages (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`).
- `capacitor.config.ts` — `appId: com.dragoncandy.app` (permanent; must match App Store
  Connect), `webDir: dist`, iOS scheme `DragonCandy`.
- iOS native project scaffold committed (`ios/App/**`); `Pods/`, `build/`, and the
  regenerated `public/` are gitignored.
- Platform detection: `src/lib/platform.ts` (`isNativeApp`/`getPlatformName`/`isIOS`) +
  a `useNativePlatform` hook (read once on mount, unit-tested with a mocked Capacitor).
- CSP allows `capacitor://localhost` so the WebView bridge loads.
- npm scripts `cap:sync` / `cap:open` / `cap:copy`; runbook at `docs/runbooks/capacitor-ios.md`.

## Phase 2 — Native Value-Adds (2026-06)

- **Camera / photo-library capture shipped** (Slice B) — native capture UI for
  [[DragonShare]] uploads, iOS permission strings (camera + photo library), and a
  `captureFromCamera` helper feeding a shared upload area. Advances the camera-first
  North Star and the guideline-4.2 "more than a wrapper" bar.
- **Native share sheet shipped** (Slice C) — `@capacitor/share`, `src/lib/nativeShare.ts`.
- **Privacy Policy + Terms of Service pages shipped** — clearing the hosted
  privacy-policy/terms prerequisite below.
- **Purchase-CTA gating (Phase 3a) + UGC block/report (Phase 3b) shipped.**
- Still next: push notifications + universal links (Slice A/D) — both genuinely need
  Apple enrollment, so neither could have preceded Phase 3 below.

## Phase 3 — First Signed Build to TestFlight (2026-08-09/10)

Not the start of the iOS project — the distance between "code exists" and "it runs on a
phone." Neither Slice B (camera) nor Slice C (share) had ever executed on real iOS
hardware before this phase. Full session, including a process record worth reading
before repeating this branch's pattern: five defects in the plan itself (a wrong grep
count; a `never`-typed test fixture that couldn't typecheck under strict mode; a
`supabase functions download` step that reverted committed work and truncated a live
file to 0 bytes; a hardcoded `/settings/billing` route that doesn't exist and had
already caused a documented 404 incident; an expected-hit-count that contradicted the
plan's own earlier decision) — each caught downstream rather than by its author — plus a
`deno install` run that silently corrupted `node_modules` for four tasks. See
[[iOS TestFlight First Build]].

- **`publicOrigin()` seam** (`src/lib/publicOrigin.ts` + `CANONICAL_APP_ORIGIN` in
  `allowedOrigins.ts`) — `window.location.origin` is `capacitor://localhost` inside the
  shell, unusable anywhere the value leaves the WebView (email, share sheet, OAuth
  redirect). Web branch byte-identical.
- **`capacitor://localhost` trusted in the edge-function CORS allow-list**
  (`NATIVE_APP_ORIGINS` in `_shared/origins.ts`, composed into `cors.ts` only) — without
  it the native app reaches Supabase REST/Auth but no custom edge function (Donny,
  campaign generation, payments). Inert until each function the app calls redeploys; the
  `donny-orchestrator` canary is a separate, not-yet-run step.
- **Bundle ID `io.dragoncandy.app` → `com.dragoncandy.app`**, merged before any App
  Store Connect record exists (the record is what freezes it permanently). Seven
  committed docs said it must not change; all seven updated rather than silently
  overridden — see [[Domain Migration (.io → .com)]].
- **`ITSAppUsesNonExemptEncryption`** added to `Info.plist` — without it every
  TestFlight upload parks behind the export-compliance questionnaire.
- **Outstand OAuth declared unavailable in the iOS app, not repointed** — the OAuth
  callback returns over `https` and lands in Safari with no route back into the shell
  (no `@capacitor/app`, no `appUrlOpen` listener), so repointing `redirectUri` alone
  would trade a visible provider rejection for a silent dead end.
  `ConnectAccountButtonGroupGated` says so instead of trying. Closed by Slice D.
- **Bounded purchase-CTA audit** — still closed after 233 commits / 31 new pages since
  the Phase 1 scaffold; nothing new needed gating.

**As of writing:** work sits on `worktree-dc-apple-store`, not yet merged. Founder Apple
enrollment, a canaried edge-function redeploy, and the physical-device build + on-device
verification (blocked on the founder's Mac arriving 2026-08-12) are all still ahead.

## Strategy

- **One codebase, two surfaces** — avoids a second native app to maintain.
- **Payments split by surface** — see [[Payments Split by Surface]]. Marketplace flows use
  [[Stripe Connect]] on both surfaces; subscriptions/credits are web-only to avoid Apple's
  30% cut.
- **Guideline 4.2** — native value-adds (push/camera/share) for Phase 2, not a bare
  wrapper. **Camera (Slice B) and share sheet (Slice C) both shipped 2026-06**; push
  (Slice A) and universal links (Slice D) still planned, both gated on Apple enrollment.
  Camera also advances the camera-first North Star.
- Route to store: TestFlight → submission → review → live.

## Key Decisions

- Capacitor over React Native / native rewrite (lean, Vite/React-native, Lovable-compatible).
- Bundle ID fixed as `com.dragoncandy.app` (2026-08-09; was `io.dragoncandy.app`).
  Changing it after the App Store Connect record exists means re-registering, so it
  was changed while no record existed.
- Platform detection is the single source of truth for "am I native?" — no user-agent sniffing.
- Scaffold on Windows; only the Xcode build/sign needs macOS.

## Hard Prerequisites (Phase 2+)

- macOS or a cloud Mac (Codemagic recommended) to compile/sign the `.ipa`.
- Apple Developer account ($99/yr).
- App Store Connect record, hosted privacy policy/terms/EULA, App Privacy labels, 1024px
  icon, per-device screenshots, three-role reviewer demo accounts.

## See Also

- [[Payments Split by Surface]]
- [[DragonCandy Platform]]
- [[Stripe Connect]]
- [[Apple App Store Capacitor Phase 1 Session]]
- [[Core Docs Recent Updates Sync Session]]
- [[iOS TestFlight First Build]]
- [[Domain Migration (.io → .com)]]
