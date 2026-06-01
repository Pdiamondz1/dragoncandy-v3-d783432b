# DragonCandy — Apple App Store Readiness & Launch

**Date:** 2026-06-01
**Status:** Draft — pending spec review
**Author:** Dame (with Claude Code)

---

## Goal

Get DragonCandy live on the Apple App Store as a downloadable iPhone app, **without forking the codebase**. Laptop users (Windows or Mac) keep using the existing web app at dragoncandy.io unchanged; iPhone users get a native app from the App Store. One codebase serves both surfaces.

## Non-Goals

- Google Play / Android submission (the same Capacitor codebase can target it later; out of scope here).
- iPad-optimized layouts (ship as an iPhone app; iPad runs it in compatibility mode).
- A native rewrite in React Native or Swift.
- In-app Apple IAP for subscriptions at launch (deferred — see Payments).
- Offline support / service worker.
- Reviving the abandoned `DesktopGate` mobile-only PWA gate (the [2026-03-23 mobile-pwa-gate spec](./2026-03-23-mobile-pwa-gate-design.md) was never implemented; desktop browser access is fully supported and stays that way).

---

## Background & Current State

DragonCandy is a pure web app: Vite + React 18 + TypeScript, served as a website on Lovable.dev at dragoncandy.io. There is **no native iOS project, no Capacitor, no React Native** (`package.json` confirms; no `ios/`, `android/`, or `capacitor.config.*` files exist).

Apple does not accept websites into the App Store. A submission requires a signed native binary (`.ipa`). The chosen strategy wraps the existing web build in a native iOS shell via **Capacitor** (by Ionic), which is React/Vite-native and Lovable-compatible.

**Relevant existing assets:**
- `public/manifest.json` — PWA manifest already present (name, theme colors `#4DD9C0` / `#A8A8A0`, icon references). Seeds the Capacitor app config and icon set.
- `public/icons/` — PWA icons (192/512) if present; the 512 seeds the 1024px App Store icon (must be regenerated at full resolution — upscaling 512→1024 is not acceptable).
- Supabase email/password auth only — **no third-party OAuth login**.
- `account_deletion_requests` table exists; `DeleteUserSheet.tsx` is org-admin member removal, **not** self-serve account deletion.
- DragonShare UGC uses a trust-then-flag model with a report/flag mechanism (`dragonshare_posts.flagged_at/flagged_by`).
- Test account credentials for all three roles already exist (stored in project memory) — these become the App Store reviewer demo accounts.

**Hard prerequisite:** iOS apps can only be compiled and signed on macOS. The team is on Windows 11. Web work and Capacitor scaffolding happen on Windows; the compile/sign step requires a cloud Mac CI (recommended: **Codemagic** — Capacitor-native, free tier to start) or a physical/rented Mac.

---

## Approach

**Capacitor single-codebase wrapper.** Capacitor loads the existing Vite production build inside a native `WKWebView` and exposes native device APIs through plugins. The web app at dragoncandy.io is unaffected; `npx cap copy` syncs the same `dist/` into the iOS shell.

Alternatives considered and rejected:
- **PWABuilder / thin PWA wrapper** — produces the thinnest possible wrapper, the exact profile Apple rejects under guideline 4.2.
- **React Native / native rewrite** — second codebase, multi-month effort; contradicts the lean, pre-revenue posture. Revisit at scale.

### Why this satisfies Apple guideline 4.2 ("minimum functionality")

A bare website wrapper is rejected. The app must provide genuine native value. The native value-adds below double as roadmap features already wanted by the "voice → camera → paste, less typing" North Star:
- **Push notifications** (APNs) — campaign updates, new messages, application status.
- **Native camera capture** — content upload directly from the camera (advances camera-first North Star).
- **Native share sheet** — sharing campaigns / DragonShare content.

---

## Architecture

### Surface split

| Surface | Served by | Apple rules apply? |
|---|---|---|
| Laptop/desktop browser (Win/Mac) | dragoncandy.io (existing Vite build) | No |
| iPhone app | Same build inside Capacitor `WKWebView` | Yes — only to in-app behavior |

### What changes in the repo

| File / area | Change |
|---|---|
| `package.json` | Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, and plugin deps (`@capacitor/push-notifications`, `@capacitor/camera`, `@capacitor/share`, `@capacitor/app` for deep links). |
| `capacitor.config.ts` | New — appId (`io.dragoncandy.app`), appName, `webDir: 'dist'`, server config. |
| `ios/` | New — generated native Xcode project (`npx cap add ios`). Committed to the repo. |
| `src/` runtime-platform detection | A small `useNativePlatform()` helper (wraps Capacitor's `Capacitor.isNativePlatform()`) to gate iOS-only behavior (payment hiding, native plugin calls). |
| Account deletion | New self-serve "Delete my account" flow in user settings (Creator + Business settings sections), writing to `account_deletion_requests`. |
| UGC moderation | Add block-user capability and ensure report/flag is reachable on all UGC surfaces; publish EULA. |
| iOS payment gating | Hide in-app subscription/credit *purchase* entry points when `isNativePlatform()`; keep Stripe marketplace flows. |
| `Info.plist` (via iOS project) | Permission usage strings: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, push + associated-domains entitlements. |
| `apple-app-site-association` | New — served from dragoncandy.io root for universal links (paired with the associated-domains entitlement). |

### What does not change

- The web app for laptop/desktop users — fully unchanged.
- Supabase backend, auth, RLS, edge functions.
- Routing, React Query patterns, design system.
- Marketplace Stripe Connect flows (boosts, campaign payments, 80/20 split).

---

## Payments Compliance

Apple polices only money flows **inside the iOS app**. Split by surface:

| Flow | Web (browser) | iOS app |
|---|---|---|
| Marketplace: boosts, campaign payments, DragonShare 80/20 split | Stripe | **Stripe** — real-world services between people (per Apple guideline 3.1.3(e) / person-to-person services; same category as Uber/Airbnb/Fiverr/Upwork). |
| SaaS subscriptions (Starter/Growth/Pro) + Donny AI credit overages | Stripe | **Not sold in-app at launch.** Users subscribe on the web; the iPhone app reflects whatever tier the account already holds. Avoids Apple's 30% and the most common rejection reason. |

The iOS app must not contain buttons/links whose purpose is to purchase the digital subscription elsewhere (beyond what Apple's external-purchase entitlements explicitly permit). Tier status is read-only in-app; upgrade prompts route to "manage your plan on the web" without an in-app buy CTA. Revisit Apple IAP only if in-app subscription conversion is later judged worth the cut.

The detailed plan must **enumerate every in-app purchase/upgrade CTA to gate** — at minimum the pricing page, tier-upgrade prompts, and Donny AI credit-overage nudges. A single missed in-app buy CTA is a common rejection cause, so this enumeration is a planning deliverable, not an afterthought.

---

## Apple Guideline Compliance Checklist

| Guideline | Requirement | Status / Action |
|---|---|---|
| 4.2 Minimum functionality | Not just a repackaged website | Add push + camera + share native value-adds |
| 5.1.1(v) Account deletion | Self-serve in-app account deletion | **Build** — flow missing today |
| 1.2 UGC | Filter, report, block, published contact, EULA | Have flag/report; **add block-user + EULA**; verify content filtering |
| 5.1.1 Privacy policy | Hosted privacy policy URL | **Verify/host** policy + terms + EULA |
| App Privacy labels | Data-collection "nutrition label" in App Store Connect | **Author** based on actual data collected |
| 4.8 Sign in with Apple | Required only if other social logins offered | **N/A** — email/password only |
| 3.1 Payments | IAP vs external | Designed (see Payments) |
| 2.1 App completeness | Working demo account for reviewer | Have test creds → reviewer notes |
| Permission strings | Info.plist usage descriptions for camera/photos/push | **Add** with native plugins |

---

## Phased Plan (→ TestFlight → live)

**Phase 0 — Prerequisites (no code).**
Enroll Apple Developer Program ($99/yr). Choose cloud Mac CI (Codemagic). Decide bundle ID (`io.dragoncandy.app`). Confirm/host privacy policy, terms, and EULA. Create the App Store Connect app record.

**Phase 1 — Capacitor integration (Windows-compatible).**
Add Capacitor deps, `capacitor.config.ts`, `npx cap add ios`, wire `webDir: dist`, `useNativePlatform()` helper. Verify the existing web build runs in the iOS WebView (testable via browser + later on device).

**Phase 2 — Native value-adds (guideline 4.2).**
Push notifications (APNs registration → device-token storage in Supabase → server-side send path; **confirm during planning whether an APNs delivery edge function exists or is net-new** — the existing notification triggers fire in-app, but device-token→APNs delivery is a distinct backend piece). Native camera capture in the content-upload flow; native share sheet; deep links / universal links (requires the `apple-app-site-association` file served from dragoncandy.io plus the associated-domains entitlement).

**Phase 3 — Compliance build-out.**
Self-serve account-deletion UI; UGC block-user + filtering completeness; iOS payment gating (`isNativePlatform()` hides subscription/credit purchase); Info.plist permission strings.

**Phase 4 — Cloud Mac build + signing.**
Codemagic pipeline; signing certificates + provisioning profiles; produce first signed `.ipa`.

**Phase 5 — TestFlight (the test environment).**
Internal testers first, then external (Joe, Juwan, ~30 organic users). Iterate on crashes/feedback. TestFlight is the staging environment — never go straight to live.

**Phase 6 — App Store submission.**
Metadata (name, subtitle, description, keywords, category), per-device screenshots, 1024px icon, App Privacy labels, reviewer notes + demo accounts → submit → review (typically 1–3 days) → live.

---

## Effort & Cost

- **Dev:** a few focused weeks (wrapping a finished web app + compliance punch-list), not months.
- **Recurring:** Apple Developer Program $99/yr.
- **Build infra:** Codemagic free tier to start (paid tiers if build minutes exceed free allotment); or ~$600 one-time Mac mini; or rented Mac.

---

## Risks & Open Questions

1. **Guideline 4.2 rejection** if native value-adds are judged insufficient — mitigated by shipping push + camera + share, not a bare wrapper.
2. **Payments interpretation** — Apple could argue marketplace flows are digital. Mitigation: frame clearly as real-world content services in reviewer notes; precedent (Fiverr/Upwork) supports external payment.
3. **WebView performance** — heavy pages (Framer Motion, video) must be smooth in `WKWebView`; profile on a real device in Phase 5.
4. **Build environment friction** — first iOS signing setup on Windows-via-cloud-Mac is the highest-friction step; budget extra time in Phase 4.
5. **Open: privacy policy** — confirm a hosted, current privacy policy + terms exist, or author them in Phase 0.
6. **Open: EULA** — Apple's standard EULA may suffice, or a custom one for UGC; decide in Phase 0.
7. **Open: UGC content filtering (1.2)** — "filtering" is the least-specified compliance item. Clarify in planning what it means for DragonShare beyond the existing trust-then-flag + report model (e.g. whether Apple expects proactive text/image moderation). Apple frequently probes UGC apps here.

---

## Success Criteria

1. The same codebase builds and serves dragoncandy.io (browser, unchanged) and a signed iOS `.ipa`.
2. The iOS app exposes working push notifications, native camera capture, and share sheet.
3. Self-serve account deletion works in-app.
4. In the iOS app, no in-app purchase CTA for subscriptions/credits; marketplace Stripe flows work.
5. The build passes Apple review and reaches TestFlight, then the public App Store.
