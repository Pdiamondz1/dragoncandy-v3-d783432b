---
title: Capacitor Native Shell
type: entity
created: 2026-06-01
updated: 2026-06-07
sources: [raw/sessions/2026-06-01-apple-app-store-capacitor-phase1.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md, docs/superpowers/specs/2026-06-01-apple-app-store-design.md]
tags: [capacitor, ios, app-store, mobile, native]
---

# Capacitor Native Shell

The iOS delivery surface for [[DragonCandy Platform]]. Capacitor 6 wraps the existing
web build in a native WKWebView so **one codebase serves both dragoncandy.io (unchanged)
and a downloadable iPhone app.** Phase 1 (foundation) has shipped; no business logic
changed.

## What Shipped (Phase 1)

- Capacitor 6 packages (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`).
- `capacitor.config.ts` — `appId: io.dragoncandy.app` (permanent; must match App Store
  Connect), `webDir: dist`, iOS scheme `DragonCandy`.
- iOS native project scaffold committed (`ios/App/**`); `Pods/`, `build/`, and the
  regenerated `public/` are gitignored.
- Platform detection: `src/lib/platform.ts` (`isNativeApp`/`getPlatformName`/`isIOS`) +
  a `useNativePlatform` hook (read once on mount, unit-tested with a mocked Capacitor).
- CSP allows `capacitor://localhost` so the WebView bridge loads.
- npm scripts `cap:sync` / `cap:open` / `cap:copy`; runbook at `docs/runbooks/capacitor-ios.md`.

## Phase 2 — Native Value-Adds (started 2026-06)

- **Camera / photo-library capture shipped** — the first native value-add. Native
  capture UI for [[DragonShare]] uploads, iOS permission strings (camera + photo
  library), and a `captureFromCamera` helper feeding a shared upload area. This
  advances the camera-first North Star and the guideline-4.2 "more than a wrapper" bar.
- **Privacy Policy + Terms of Service pages shipped** — clearing the hosted
  privacy-policy/terms prerequisite below.
- Still next: push + share plugins, then TestFlight → submission → review.

## Strategy

- **One codebase, two surfaces** — avoids a second native app to maintain.
- **Payments split by surface** — see [[Payments Split by Surface]]. Marketplace flows use
  [[Stripe Connect]] on both surfaces; subscriptions/credits are web-only to avoid Apple's
  30% cut.
- **Guideline 4.2** — native value-adds (push/camera/share) for Phase 2, not a bare
  wrapper. **Camera shipped (2026-06)**; push/share still planned. Camera also advances
  the camera-first North Star.
- Route to store: TestFlight → submission → review → live.

## Key Decisions

- Capacitor over React Native / native rewrite (lean, Vite/React-native, Lovable-compatible).
- Bundle ID fixed now as `io.dragoncandy.app` (changing it later means re-registering).
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
