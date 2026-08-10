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
- On Windows, `cap sync` prints `[warn] Skipping pod install` and
  `[warn] Unable to find "xcodebuild"`. This is expected — `pod install`
  runs on the Mac.

## Platform detection in code
Use `@/lib/platform` (`isNativeApp()`, `isIOS()`, `getPlatformName()`) or the
`useNativePlatform()` hook to branch behavior between web and the native app.
Never branch on user-agent sniffing.

## Identity
- Bundle id (`appId`): `com.dragoncandy.app` — permanent; must match App Store Connect.
  (Changed from `io.dragoncandy.app` on 2026-08-09, before any App Store Connect
  record existed, to match the now-primary `dragoncandy.com` domain. It is frozen
  the moment that record is created.)
- `webDir`: `dist` — Vite's build output; `cap sync` copies this into the app.

## What is / isn't committed
- Committed: the `ios/` Xcode project (`App.xcodeproj`, Swift, Info.plist, Podfile).
- Ignored (regenerated): `ios/App/App/public/` (synced from `dist/` every build)
  and `ios/App/Pods/` (restored by `pod install` on the Mac).
