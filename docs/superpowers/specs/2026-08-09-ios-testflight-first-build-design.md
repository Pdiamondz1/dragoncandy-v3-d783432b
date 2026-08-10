# DragonCandy iOS — First Signed Build to TestFlight

**Date:** 2026-08-09
**Status:** Draft — pending spec review
**Author:** Dame (with Claude Code)
**Predecessor:** [2026-06-01 Apple App Store Readiness & Launch](./2026-06-01-apple-app-store-design.md)

---

## Goal

Get a signed DragonCandy build onto the founder's physical iPhone via TestFlight, and use
that device to verify the three native features that shipped in June but have **never once
executed on iOS hardware**.

This is not the start of the iOS project. Phase 1 and four slices already shipped. This spec
covers the remaining distance between "code exists" and "it runs on a phone."

## Non-Goals

- Public App Store listing — screenshots, metadata, App Privacy labels, reviewer notes,
  submission. The listing is gated behind content-delivery stability, the same thing gating
  production launch.
- Push notifications (Phase 2 Slice A) and universal links (Phase 2 Slice D). Both genuinely
  require Apple enrollment, so neither could have preceded this work.
- Codemagic or any cloud-Mac CI. **Deleted from scope** — see Build Environment.
- macOS development-environment setup (repo, worktrees, Node, Supabase CLI, Claude Code).
  Explicitly excluded by the founder, though it must happen before anything here can be built.
- Capacitor version upgrade, unless Apple's current minimum SDK forces one.
- Android, iPad-optimized layouts, offline support.

---

## Background — What Is Already Built

Verified by direct inspection of this worktree on 2026-08-09, not read off the June spec:

| Shipped | Evidence in repo |
|---|---|
| Phase 1 — Capacitor foundation | `capacitor.config.ts`, `ios/App/` Xcode project, `cap:sync`/`cap:open`/`cap:copy` scripts, `src/lib/platform.ts` |
| Phase 2 Slice B — native camera | `@capacitor/camera` ^6.1.3, `src/lib/nativeCamera.ts` |
| Phase 2 Slice C — native share sheet | `@capacitor/share` ^6.0.4, `src/lib/nativeShare.ts` |
| Phase 3a — purchase-CTA gating | `src/components/platform/WebOnly.tsx` used across 8 CTAs in 6 files |
| Phase 3b — UGC block + report | `user_blocks` / `user_reports`, prod-verified 2026-06-07 |
| Phase 0 partial | `/privacy` + `/terms` live; `docs/app-store/app-privacy-data-inventory.md`; account deletion already exists |

Two things the June spec worried about are already correct and need no work. The CSP in
`index.html` is properly Capacitor-aware (`capacitor://localhost` present in `default-src`,
`connect-src`, `img-src`, `media-src`). `Info.plist` carries both `NSCameraUsageDescription`
and `NSPhotoLibraryUsageDescription`.

The shell is also structurally correct: `webDir: 'dist'` with **no `server.url`**, so the app
ships its bundle locally and serves from `capacitor://localhost`. It is a real app, not a
remote-URL wrapper — which is what keeps guideline 4.2 defensible.

### The app has moved on without the shell

`git log --since=2026-06-01 -- src` shows **233 commits and 31 new pages** since the iOS
scaffold was generated. The Donny-first dashboard, `/rewards`, the rebuilt DragonFeed and
creator packages have never been examined through an iOS lens.

The shell itself cannot go stale — `npx cap sync` copies whatever `npm run build` produces —
but the *compliance and suitability review* of those 31 pages has never happened.

---

## Findings That Drive This Design

### Finding 1 — `window.location.origin` is a lie inside the shell

In Capacitor, `window.location.origin` evaluates to `capacitor://localhost`. The current tree
uses it in nine user-facing places, in three groups. Every one breaks on device.

**Auth email redirects** — `AuthForm.tsx:50`, `AuthenticationModal.tsx:44`,
`ForgotPassword.tsx:22`, `VerifyEmail.tsx:33,48`. These hand GoTrue a `capacitor://localhost/…`
redirect. It is not allow-listed, and an email link to that scheme is unopenable from Mail.
**Password reset is dead in the native app.**

**OAuth callbacks** — `ConnectedAccountsList.tsx:39`, `AccountsTab.tsx:33`. Outstand social
linking would send a `capacitor://` `redirect_uri`, which the provider refuses.

**Shareable links** — `PromotionCard.tsx:57`, `PromotionDetailPage.tsx:291`,
`CreatorPackages.tsx:34`. Slice C shipped the native share sheet in June; on a device it would
share `capacitor://localhost/promo/<id>` — a link nobody can open. **A shipped feature that is
broken on the only platform it was built for.**

### Finding 2 — the native origin is not trusted by any edge function

`supabase/functions/_shared/origins.ts` allow-lists six web origins.
**`capacitor://localhost` is not among them.** Supabase REST and Auth send permissive CORS of
their own, so login and direct table queries would work — but all 80+ custom edge functions
would fail. That is Donny, campaign generation, payments, essentially the product.

This has never fired because the app has never run on a device. It fires on first install.

### Finding 3 — the bundle ID predates the domain decision

`capacitor.config.ts` carries `appId: 'io.dragoncandy.app'`, chosen when `.io` was the only
domain. A bundle ID is **immutable once the App Store Connect record exists**; changing it
afterwards means a new listing, losing reviews, ratings and TestFlight testers. Today it is a
two-file edit.

### Finding 4 — the domain migration is two phases behind the founder's understanding

The founder stated that `dragoncandy.io` now redirects to `dragoncandy.com`. **It does not
yet.** Probed against prod on 2026-08-09 using a bogus-token `/auth/v1/verify` with a
mandatory unlisted control:

| `redirect_to` sent | `Location` returned | Meaning |
|---|---|---|
| `https://dragoncandy.com/auth/update-password` | echoed back | `.com` **is** allow-listed |
| `https://dragoncandy.io/auth/update-password` | echoed back | `.io` is allow-listed |
| `https://unlisted-control-probe.invalid/x` | `https://dragoncandy.io/` | **Site URL is still `.io`** |

The control behaving differently from the two test cases is what makes the result trustworthy;
without it, an endpoint that echoed everything would look identical to a correct allow-list.

This matches `docs/wiki/concepts/domain-migration-io-to-com.md`: Phase 1 (EXPAND) shipped,
Phase 2 (SWITCH — Site URL, `APP_URL`) and Phase 3 (REDIRECT — the `.io` 301) have not.

**Consequence for this design: none, by construction.** `publicOrigin()` derives from the
canonical constant rather than hardcoding, `.com` is already fully allow-listed and verified
across all 82 edge functions, and the value stays correct after Phase 2 flips. Note the Vercel
apex currently 308s to `www`, so a `.com` link takes one extra hop; both are allow-listed and
browsers reapply the URL fragment across a redirect, so auth returns survive it.

---

## Design

### Component 1 — `src/lib/publicOrigin.ts`

A single seam, following the pattern `nativeCamera.ts` and `nativeShare.ts` already
established: a plain function, not a hook, gated by the existing `isNativeApp()`.

```
publicOrigin(): string
  web    → window.location.origin      (byte-identical to today)
  native → the canonical public origin
```

The native value is **derived from `APP_ORIGINS[0]` in `src/lib/allowedOrigins.ts`**, not
hardcoded a second time. One source of truth for the app's public origin on both sides of the
seam, and it follows the domain migration automatically.

All nine call sites in Finding 1 are repointed. Web behavior is unchanged everywhere.

### Component 2 — native origin in the CORS allow-list

Add a `NATIVE_APP_ORIGINS` group to `supabase/functions/_shared/origins.ts` containing
`capacitor://localhost`, composed into **`cors.ts` only** — deliberately not into the
email-redirect allow-list, which must keep pointing at real web URLs. Mirror the group in
`src/lib/allowedOrigins.ts`, since that duplication is forced by the Deno/Vite runtime
boundary.

**This weakens nothing.** CORS is enforced by browsers; a non-browser caller ignores it
entirely, so it was never the security boundary. Authorization continues to rest on the JWT.

### Component 3 — bundle ID

`capacitor.config.ts` `appId` → `com.dragoncandy.app`, plus `PRODUCT_BUNDLE_IDENTIFIER` in
`ios/App/App.xcodeproj/project.pbxproj` for **both** Debug and Release configurations.

**Ordering rule:** this merges *before* the App Store Connect record is created. The record is
what freezes the identifier. Same discipline as the project's migration-before-code rule.

### Component 4 — iOS suitability audit of the 31 new pages

A read-only pass over surfaces added since 2026-06-01, looking for two things: purchase or
subscription CTAs that need `<WebOnly>` (a single missed in-app buy CTA is among the most
common rejection causes), and any further `window.location.origin` uses introduced after the
Finding 1 sweep. Output is a findings list; fixes are scoped from it.

### What does not change

The web app at dragoncandy.io / dragoncandy.com. Supabase schema, RLS, auth. Routing, React
Query patterns, the design system. Marketplace Stripe Connect flows. No migration, no edge
function deploy is required by this spec — the CORS change ships with the next deploy of the
functions that need it, and is inert until then.

---

## Build Environment

**The founder's 14-inch MacBook Pro (M5 Pro) arrives Wednesday 2026-08-12, which deletes the
entire cloud-CI phase.** The June spec called Phase 4 the highest-friction step in the project;
a local Mac removes it rather than solving it.

What the Mac provides that Codemagic could not: Xcode with automatic signing (materially
gentler than CI signing), the iOS Simulator, `npx cap open ios`, direct TestFlight upload, and
**Safari Web Inspector against a physical iPhone** — the only real debugger for a `WKWebView`
app, and macOS-only.

CI is deferred until builds are routine, which is when CI actually earns its keep.

---

## Sequencing

### Phase 0 — today, in parallel with repo work

1. Create the Apple ID against `appstore@dragoncandy.com` (Workspace is live), with 2FA on a
   trusted number.
2. Enroll **Individual** at $99/yr. Approves in 24–48h, needs no D-U-N-S and no verification
   call — so it is approved and waiting by Wednesday. Migration to an Organization account is
   deferred to before public launch, as previously decided.
3. **Do not create the App Store Connect app record yet** — it waits on the bundle-ID merge.

### Phase 1 — repo work, today through Tuesday

Components 1–4 above, on the existing `worktree-dc-apple-store` branch. `npm run build`,
`npm run typecheck`, `npm run lint`, `npm run test`, then the mandatory Codex second review,
then PR.

### Phase 2 — Wednesday, on the Mac

Environment setup (out of scope here, but blocking). Then `npm install`, `npm run build`,
`npx cap sync ios`, `npx cap open ios`. Sign in to Xcode, select the team, automatic signing.
Run the Simulator first — free and fast, and it catches boot failures, CSP blocks and layout
breakage immediately. Then run on the physical iPhone over cable with Web Inspector attached.

Verify Apple's current minimum Xcode and SDK for new submissions **on the Mac, from Apple** —
the project targets iOS 13.0 on Capacitor 6, and whether that still satisfies Apple in August
2026 is not something to assume. Upgrade Capacitor only if forced.

### Phase 3 — TestFlight

Archive, upload, internal tester (founder only). External testers are out of scope.

---

## On-Device Verification Checklist

This is the actual deliverable. Three shipped features have never executed on iOS.

| # | Check | Why it matters |
|---|---|---|
| 1 | App boots; Web Inspector console is clean | Proves CSP and the bundle are sound |
| 2 | Login succeeds | Supabase Auth path |
| 3 | **Donny responds** | The single best proof the CORS fix works — highest-value edge function |
| 4 | Native camera capture with a real camera | Slice B, never run; the Simulator cannot fake this |
| 5 | Share sheet emits `https://dragoncandy.com/...`, not `capacitor://...` | Slice C, currently broken by Finding 1 |
| 6 | Walk all 8 known purchase CTAs + the 31 new pages | Guideline 3.1; a single miss is a rejection |
| 7 | Safe area at notch and home indicator | `dvh` and `env(safe-area-inset-bottom)` were tuned for mobile Safari, not `WKWebView` |
| 8 | `#main-content` scrolling behaves | This app's document deliberately never scrolls |
| 9 | Password reset reaches Safari and works | Known limitation, verified rather than assumed |

---

## Testing

`publicOrigin()` gets a unit test in the node environment mocking `@capacitor/core`, mirroring
`platform.test.ts` and `nativeShare.test.ts`. Both branches asserted.

The CORS change has no meaningful unit test; it is proven by check #3 on a real device.

Everything else on the checklist is manual device verification. Automating it would be theatre —
the entire point is that a real `WKWebView` on real hardware behaves differently from every
environment we can reach from Windows.

Repo gotcha to respect: Vitest's global environment is `node`, and DOM tests need
`// @vitest-environment jsdom` as line 1. `publicOrigin` is a plain function, so it needs
neither.

---

## Known Limitations, Shipped Knowingly

- **No push notifications, no universal links.** Slices A and D remain.
- **Auth emails open in Safari, not the app, and that session does not carry across.** A
  consequence of deferring universal links. Acceptable for a founder-only TestFlight on an
  existing account; **not acceptable for public release**, and it must be closed by Slice D.
- **Camera is photo-only** — Capacitor's Camera plugin cannot record video. Video stays on the
  file picker.
- iPad runs in iPhone compatibility mode.

---

## Risks & Open Questions

1. **The `WKWebView` may misbehave in ways nobody has predicted.** This is the accepted purpose
   of the exercise, and Web Inspector is the mitigation. It is also the largest unknown.
2. **Apple's current minimum SDK is unverified** and may force a Capacitor upgrade, which would
   expand scope beyond this spec. Checked in Phase 2; if it forces an upgrade, that becomes its
   own spec.
3. **macOS environment setup is out of scope but on the critical path**, and it lands the same
   day as the build. Realistically it consumes some of Wednesday.
4. **The 31-page audit may surface more than purchase CTAs.** Findings that are not
   rejection-blocking should be filed, not fixed inline, or this spec grows without bound.
5. **Open:** whether the Outstand OAuth callback needs the provider's redirect-URI allow-list
   updated for the `.com` origin, or whether repointing to the canonical origin is sufficient.
   Determined during Component 1.

---

## Success Criteria

1. A signed build reaches the founder's physical iPhone through TestFlight.
2. Login and Donny both work on device — proving the edge-function path end to end.
3. Native camera capture produces a real photo upload.
4. The share sheet emits an openable `https://dragoncandy.com/...` link.
5. No purchase or subscription CTA is reachable anywhere in the iOS app.
6. dragoncandy.io and dragoncandy.com in a browser are byte-unchanged.
