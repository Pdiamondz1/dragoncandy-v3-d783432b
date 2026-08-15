# iOS — the first physical-device build, on the new Mac

**Date:** 2026-08-14
**Branch:** `worktree-DC-apple-IOS` (5 commits)
**Spec:** `docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md`

The founder's 14" MacBook Pro (M5) arrived and the Apple Organization enrollment was approved,
clearing both named gates on the iOS project. DragonCandy ran on real Apple hardware for the first
time. Three features that shipped in June had never once executed on a device.

---

## What shipped

| Commit | Work |
|---|---|
| `eda8ae4e` | Windows→macOS tooling port (parallel session) |
| `08493166` | Enrollment approved + Mac provisioned (parallel session) |
| `a5937ef5` | Resolved pods, workspace, signing team, real app icon |
| `44688cb1` | `env(safe-area-inset-top)` across 5 chrome components + `DESIGN_SYSTEM.md` rule |
| `451d7855` | Codex P2: date-only handoffs dropped from the 48h window |

Toolchain installed: **Xcode 26.6** (iOS SDK 26.5, Simulator runtime 26.5 — an 8.52 GB separate
download), **CocoaPods 1.17.0** via Homebrew, **Node 24** alongside the machine's Node 26.

---

## Finding 1 — the spec's biggest open risk was closed by evidence, and it was a non-issue

The spec's Risk 3 read: *"Apple's current minimum SDK is unverified and may force a Capacitor
upgrade, which would expand scope beyond this spec."* It was explicitly marked as the one claim
neither grepped nor probed — deferred to the Mac.

**Xcode 26.6 compiled the project at iOS 13.0 on Capacitor 6 with no error and no deprecation
warning.** Read off the compiler invocation itself, not inferred from a green build:

```
--deployment-target 13.0 --target-triple arm64-apple-ios13.0-simulator
```

**No deployment-target bump, no Capacitor 7.** The pre-authorized fallback was never needed.

Worth keeping: the risk was real to *hold*, and cheap to *resolve* — one build answered it. The cost
of the unknown was in planning, not in the code.

## Finding 2 — `safe-area-inset-top` was missing app-wide, and the web could never have shown it

`index.html:5` sets `viewport-fit=cover`, so the layout viewport extends **under** the status bar
and Dynamic Island. Across all of `src/`, `safe-area-inset-top` appeared **once**
(`DonnyChatView.tsx:43`) against **eight** uses of `-bottom`.

Observed on the physical iPhone (iOS 26.6): the landing logo and hamburger rendered *on top of* the
clock. Confirmed by founder screenshot before and after.

**Why it survived until the first device build, which is the durable part:** in mobile Safari the
browser's URL bar occupies that space, so the page never sits under the status bar and
`viewport-fit=cover` costs nothing. **Only a chromeless `WKWebView` exposes it.** No amount of
browser testing, responsive-mode emulation, or `verify-prod` on both viewports would have found
this. It is a defect that is *structurally invisible* outside the native shell.

`DESIGN_SYSTEM.md` documented the bottom rule ("pad bottom-fixed footers/navs with
`env(safe-area-inset-bottom)`") and was **silent on the top**. The design system had the same gap
the code did — which is why the fix includes the rule, not just the padding.

**The fix was not a sweep, and that mattered.** 14 files carry `top-0` anchored elements and none
padded the top inset, but they are not the same thing:

- **Padded (5)** — real viewport chrome: `MobileTopNav`, `landing/Header`, `PublicPageHeader`,
  `UpdateBanner` (`fixed top-0`), the mobile `ui/toast` viewport.
- **Deliberately NOT padded (9)** — in-page `sticky top-0` section headers (`AgendaView`,
  `CampaignMetricsBar`, `CampaignBrowseContent`, `BrandCreators`, `HelpBriefPage`). These stick
  *inside* a scroll container below the real nav; an inset there inserts a gap mid-page.

The toast viewport is `top-0` at base but `sm:top-auto sm:bottom-0`, so its inset is scoped to base
and reset with `sm:pt-4` — otherwise the desktop bottom-anchored toast carries a phantom top gap.
**A viewport that moves by breakpoint needs its inset scoped to the breakpoint where it is
actually on top.**

## Finding 3 — 13 money edge functions never got the native origin, contradicting a standing claim

`PROJECT_CONTEXT.md` §5 states the `capacitor://localhost` CORS widening *"rode along with the
Phase 2 fleet deploy, verified live by preflight probe."* **That is true for some functions and
false for thirteen.**

Probed all 50 functions `src/` invokes, with a discriminating control rather than a single reading:

| Origin sent | 13 money functions answer | `donny-orchestrator` answers |
|---|---|---|
| `capacitor://localhost` | `https://dragoncandy.io` | `capacitor://localhost` |
| `https://dragoncandy.com` | `https://dragoncandy.com` | `https://dragoncandy.com` |

The `.com` column is what makes this readable: these functions **are** on the Phase-1 allow-list, so
they are not ancient — they simply fall back to `DEFAULT_ORIGIN` for `capacitor://localhost`,
proving the native origin is absent from their bundled `_shared/origins.ts`.

The thirteen: `release-creator-payout`, `release-package-payout`, `release-sponsorship-payout`,
`withdraw-pending-balance`, `create-package-order-escrow`, `verify-campaign-escrow`,
`verify-package-order-escrow`, `verify-sponsorship-payment`, `refund-package-order`,
`check-creator-payout-status`, `disconnect-stripe-account`, `get-stripe-dashboard-link`,
`invoice-rush-surcharges`. (`toast-token-refresh` returns no ACAO for any origin — separate.)

**They are almost exactly the money surface.** In `WKWebView` this fails as a generic fetch error,
which the spec warns is *indistinguishable from "payments are broken on iOS."* Not deployed this
session — a 13-function prod deploy of payment code is not a side effect of a UI fix.

**The general lesson is about the original verification, not the deploy.** "Verified live by
preflight probe" was true of the function that was probed and got generalised to the fleet. A
sample proves a sample. This is the same shape as the [[Domain Migration (.io → .com)]] rule about
probes that cannot distinguish a true answer from a false one — here the probe was sound, its
*scope* was not.

## Finding 4 — Node 26 shadows jsdom's `localStorage`, silently breaking 50 tests

Fresh `npm install` on the Mac, then `npm run test`: **50 failures across 3 files**, all
`localStorage is undefined`. Not a repo bug and not lockfile drift (tree clean, jsdom pinned
29.1.1 and installed).

Homebrew installed **Node 26**; CI (`.github/workflows/ci.yml`) runs **Node 24**. Node 26 defines
`localStorage` on `globalThis` as an accessor that returns `undefined` unless `--localstorage-file`
is passed. Vitest's jsdom environment skips globals that already exist, so **jsdom's real
`localStorage` is never installed**.

Proven rather than reasoned: `'localStorage' in globalThis` → **`true`** on Node 26, **`false`** on
Node 24. Installing Node 24 keg-only took the same suite to **243/243 files, 2443/2443 tests**.

Separately, `npm run test` sweeps `.claude/worktrees/` — vitest's excludes are repo-relative, so it
runs ~30 other worktrees' copies of the suite. That is what turned 50 failures into 100. The honest
invocation is `--exclude '**/.claude/**'`.

**Neither is fixed in this branch** — a `.nvmrc` pinning 24 and a vitest worktree exclude are a
separate change.

## Finding 5 — the `Podfile` in git could not build the app's own features

`npx cap sync ios` rewrote `ios/App/Podfile` to add two pods that were never committed:

```ruby
+  pod 'CapacitorCamera', :path => '../../node_modules/@capacitor/camera'
+  pod 'CapacitorShare',  :path => '../../node_modules/@capacitor/share'
```

Anyone running `pod install` **without** `cap sync` first would have produced a build with **no
camera and no share sheet** — the two native features this device session existed to verify. Wrong
in git since the scaffold was generated; invisible because nobody had ever built the project.
`Podfile.lock` and `App.xcworkspace/contents.xcworkspacedata` were likewise untracked and are now
committed.

---

## On-device verification (spec checklist)

| # | Check | Result |
|---|---|---|
| 1 | App boots, console clean | **PASS** — Simulator and device; no native error log |
| 2 | Login | **PASS** — founder-confirmed |
| 3 | **Donny responds** | **PASS** — proves the `capacitor://localhost` CORS path end-to-end |
| 4 | Native camera | not run |
| 5 | Share sheet emits `https://dragoncandy.com/...` | **code-verified, not device-verified** |
| 6 | Purchase CTAs | not run |
| 7 | Safe area at notch | **FOUND BROKEN → FIXED → founder-confirmed by screenshot** |
| 8 | `#main-content` scrolling | not run |
| 9 | Password reset | not run |

**#5's code-level verification is complete and worth recording as such:** all three share-URL
builders (`PromotionCard.tsx:58`, `PromotionDetailPage.tsx:292`, `CreatorPackages.tsx:35`) route
through `publicOrigin()`, and they feed all three real `shareOrCopyLink` call sites. The only raw
`window.location.origin` uses remaining are exactly the four the spec deliberately keeps
(Outstand OAuth ×2, `safeUrl`, `AuthPage` ×2). Finding 1 of the spec is discharged in code; the
device test is confirmation, not discovery.

---

## Gates that were themselves missing on the new machine

`codex` was not installed — the mandatory second reviewer simply did not exist on this Mac, and a
branch could have been finished without anyone noticing its absence. Installed (0.147.0),
authenticated, run.

**Codex found one real P2, and it was in the parallel session's file, not the code under review.**
`session-context.sh` fell back to `000000` for date-only handoff filenames, so the "last 48h"
window dropped them up to 24 hours early — at 14:37 on Aug 14, a date-only Aug 12 handoff was
excluded even if written that evening. **8 of 19 handoffs are date-only.** Fixed with end-of-day,
but with the *display* separated from the windowing key: end-of-day alone would print "23:59",
which reads as a real timestamp when the time is genuinely unknown. Round 2 clean.

---

## Process notes worth keeping

**Two Claude sessions ran in one worktree simultaneously.** A parallel session (`claude --worktree
DC-apple-IOS`) committed this session's uncommitted iOS files — icon, `Podfile`, `Podfile.lock`,
workspace, `DEVELOPMENT_TEAM` — into its own commit, under a message that does not mention the
icon. Nothing was lost (verified by SHA-256: the committed icon matches the built artifact exactly),
but a `git commit -a` from either session would have swept the other's in-flight work into the wrong
PR.

**All four pre-existing commits were authored to a hostname-derived placeholder**
(`dwill@macbook-pro.myfiosgateway.com`) because git identity was unset on the new Mac — it
auto-derives from the macOS user record and hostname, silently, with only a hint printed after the
fact. GitHub cannot link that address to an account. Corrected to the canonical
`31894588+Pdiamondz1@users.noreply.github.com` (151 commits in history use it) by rebase, with
**tree hashes captured before and after and diffed to prove content was byte-unchanged** — a rebase
is exactly where content can shift silently.

**Three steps were GUI-and-human only** and no remote tooling removes them: `sudo xcodebuild
-license accept` (which, once `Xcode.app` existed, broke `git`, Homebrew and CocoaPods until
accepted), selecting the team + **Register Device** in Xcode's Signing pane, and enabling
**Developer Mode** on the iPhone.

## Still open

- The 13 money edge functions (Finding 3) — no owner, no trigger, not deployed
- Device checks #4, #6, #8, #9; #5 confirmed in code only
- `.nvmrc` pinning Node 24 + a vitest `.claude/worktrees/` exclude (Finding 4)
- TestFlight itself — the App Store Connect record has not been created
