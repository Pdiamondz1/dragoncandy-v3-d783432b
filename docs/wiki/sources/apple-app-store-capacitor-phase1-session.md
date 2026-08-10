---
title: Apple App Store Capacitor Phase 1 Session
type: source
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-apple-app-store-capacitor-phase1.md]
tags: [capacitor, ios, app-store, mobile]
---

# Apple App Store Capacitor Phase 1 Session

Synthesis of the Capacitor foundation merge. Phase 1 wraps the existing web build in a native
iOS shell — one codebase serving both web and an iPhone app. No business logic changed.

## Key Decisions

- Capacitor 6 over React Native / native rewrite (one codebase, Vite/React-native, Lovable-compatible).
- Permanent bundle ID `io.dragoncandy.app`. *(Superseded 2026-08-09 →
  `com.dragoncandy.app`, before any App Store Connect record existed. Left here
  as the record of what was decided in June.)*
- Platform detection (`useNativePlatform`) as the single source of truth for native-vs-web.
- CSP must allow `capacitor://localhost` or the WebView load fails silently.
- Scaffold on Windows; compile/sign only on macOS.
- Payments split by surface — see [[Payments Split by Surface]].

## What Shipped

Capacitor packages, `capacitor.config.ts`, iOS scaffold (`ios/App/**`), platform util + hook,
CSP allowance, `cap:sync`/`cap:open`/`cap:copy` scripts, and the iOS runbook.

## Open Prerequisites (Phase 2+)

macOS/cloud Mac (Codemagic), Apple Developer account ($99/yr), App Store Connect record, hosted
privacy policy/terms/EULA, App Privacy labels, 1024px icon, screenshots, reviewer demo accounts.

## See Also

- [[Capacitor Native Shell]]
- [[Payments Split by Surface]]
- [[DragonCandy Platform]]
