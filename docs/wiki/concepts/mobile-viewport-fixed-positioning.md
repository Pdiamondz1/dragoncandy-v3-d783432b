---
title: Mobile Viewport & Fixed Positioning
type: concept
created: 2026-07-14
updated: 2026-08-23
sources: [2026-07-14-mobile-screenfit-fixed-position.md, 2026-07-16-donny-desktop-overlay.md, 2026-07-19-mobile-nav-modal-zindex.md, 2026-08-14-ios-first-physical-device-build.md, 2026-08-23-landing-footer-ios-inset-and-reel-recut.md, 2026-08-23-adrian-feedback-body-scroller-and-how-it-works.md]
tags: [mobile, ios, css, viewport, fixed-position, framer-motion, page-transition, desktop, flexbox, overscroll, portal, z-index]
---
# Mobile Viewport & Fixed Positioning

Rules for keeping bottom-anchored mobile UI (bottom nav, Donny's mobile sheet, sheet
footers, sticky CTAs) actually on-screen. Three independent failure classes hit DragonCandy;
all are now guarded by contract (plus a desktop counterpart, §5).

## 1. The containing-block trap (the PR #224 / PR #230 class)

A `position:fixed` element anchors to the viewport **only if no ancestor has a transform,
`will-change: transform`, `filter`, or similar** — any of those makes that ancestor the
containing block, and "fixed" silently becomes "pinned to that ancestor".

`PageTransition` wraps **every route**, so when its `motion.div` carried `y: 6 → 0`, every
fixed element inside the app was at risk. Worse, framer-motion (LazyMotion, async
`domAnimation` features) **stalls at `initial` on first page load**, leaving
`transform: translateY(6px)` + `opacity: 0` inline forever (pages render only via the
`ensureVisible` CSS fallback animation). Result: on direct loads/refreshes the mobile
bottom nav anchored to the *bottom of the page content* — reachable only by scrolling to
the absolute end, half-hidden behind Safari's toolbar; after a client-side navigation the
animation sometimes completed and cleared the transform. That inconsistency is why the
founder reported it as "most pages".

**Contract:** `PageTransition` is **opacity-only**. Never add x/y/scale to it (comment in
the file says so). The `ensureVisible` keyframe must not mention `transform` either.

**Defense for overlays:** hand-rolled `fixed inset-0` overlays should still
`createPortal(node, document.body)` (the PR #224 fix for ApplyConfirmation) — body is a
verified-clean containing block; portaling makes an overlay immune to *any* future
transformed ancestor, not just this one.

**Diagnostic (fixed-probe test):** inject
`position:fixed;bottom:0;width:10px;height:10px` into the suspect subtree and compare
`getBoundingClientRect().bottom` to `window.innerHeight` (viewport-anchored) vs the
ancestor's rect bottom (trapped). This settled the root cause in one probe on prod.

## 2. iOS Safari viewport units + toolbar (the invite-sheet class)

The app shell is `div.h-screen` with an inner `overflow-auto` `<main>` — **the document
itself never scrolls**, so iOS Safari's toolbars **never collapse**, and the
toolbar-expanded state is permanent, not transient:

- `vh` is the **large** viewport unit (toolbar collapsed) — a `max-h-[82vh]` bottom sheet
  can exceed the visible height and its footer lands behind the toolbar/home indicator.
  Use **`dvh`** (or `svh`) for anything bottom-anchored on mobile.
- Bottom-fixed footers/nav pad with **`env(safe-area-inset-bottom)`**
  (`viewport-fit=cover` is set in index.html, so `env()` is live; it's 0 on desktop).
  Tailwind arbitrary values normalize calc operators — `pb-[calc(1rem+env(safe-area-inset-bottom))]`
  emits valid `calc(1rem + env(...))` (verified in dist CSS).

Applied to the [[Creator Groups (Crews)]] "Invite creators" sheet (`82dvh` + safe-area
footer). `DonnyMobileSheet` already used `dvh`.

## 3. `position:fixed` inside an `overflow:auto` scroller (the PR #239 class)

The authenticated app scrolls in an **inner** container, not the document: `AppShell` is
`<div className="flex h-screen">` wrapping `<main className="flex-1 overflow-auto">`; the
document/body never scrolls, that `<main>` does. `MobileBottomNav` renders its
`position:fixed` `<nav>` (and the hand-rolled `DonnyMobileSheet`) *inside* that scroller
(deep under `DashboardLayout` / `CampaignCreator`).

Per spec, `overflow` does **not** establish a containing block for `fixed`, so at rest the
nav sits correctly at the viewport bottom (this class is **not** the §1 transform trap —
there is no transformed ancestor now). But **iOS Safari does not repaint a `position:fixed`
descendant of an `overflow:auto` container stably during rubber-band / momentum overscroll**
— overscrolling the top (or bouncing) briefly drags the "fixed" nav up with the scrolled
content, exposing the shell background (white) below it, then snaps it back when the scroll
settles. Founder-reported as "scroll up too hard → the bottom nav goes up and leaves
whitespace underneath."

**Contract / fix:** a `position:fixed` element that must stay viewport-anchored on mobile
must not be a descendant of the inner scroller. `MobileBottomNav` `createPortal`s its output
to `document.body` (PR #239) — as a `<body>` child it's outside `<main>`, viewport-anchored,
and immune to the scroller's overscroll. Same remedy as the ApplyConfirmation portal (§1);
context flows through the portal, so routing / Donny / unread counts are unaffected.

**Not sufficient on iOS:** `overscroll-behavior: contain/none` on the scroller stops
scroll-chaining / pull-to-refresh but does **not** reliably kill the elastic bounce that
triggers the mis-paint — get the fixed element out of the scroller instead.

## 4. The bottom nav never hides

The nav originally hid on scroll-down (`useScrollDirection`), which stranded users — at
the end of a page the last gesture is always 'down', so the nav (Donny's only mobile
entry point) was gone exactly where users park. PR #231 first added an 80px bottom-reveal
floor; the founder then decided (2026-07-14, same day) the hide behavior itself was the
problem: **the nav is now always visible** and `useScrollDirection` was deleted outright.
If a future feature wants hide-on-scroll chrome, that's a founder-level UX decision —
don't reintroduce it for screen-space reasons alone.

## 5. Desktop: a docked side-panel must overlay, not steal flex width (PR #236)

The desktop counterpart of the fixed-positioning story — same tool (`position: fixed`),
opposite goal (here it *prevents* a layout defect). The Donny desktop panel
(`DonnyDesktopPanel`) was a docked flex **sibling** of `<main className="flex-1">` inside
`AppShell`'s `<div className="flex h-screen">`, with `flex-shrink-0` + a hard width (`w-80`
tray / `w-[420px]` chat). Opening it subtracted 320–420px from the row, so `<main>` reflowed
to `100% − panelWidth` and **every page inside squished**.

It read as "squished" rather than "smaller" because pages use **viewport** breakpoints
(`lg:grid-cols-3`, brand browse `lg:grid-cols-4`), not container queries — the *viewport*
stays wide while the *container* shrinks, so the grid keeps its wide-screen column count at a
too-narrow width and crushes each card (`CreatorCard`'s fixed `w-24` avatar + `truncate`
makes it worse). No app page uses `@container` (only `landing/LeadCaptureSection.tsx` does),
so this hits *every* authenticated page, not one.

**Fix (one className):** make the panel `fixed inset-y-0 right-0 z-40 shadow-2xl` and drop
`flex-shrink-0`. A fixed element leaves the flex flow, so `<main>` reclaims 100% width — the
page never loses space, and Donny floats over the right edge instead. `AppShell` needed no
change. `hidden md:flex` stays (desktop-only; mobile uses the separate `DonnyMobileSheet`
overlay). This is safe *because* of the §1 contract: no transformed ancestor
(`PageTransition` is opacity-only and is a sibling of the panel, not an ancestor), so `fixed`
anchors to the viewport. z-index: `z-40` sits above content + the `sticky top-0 z-40` header
(via DOM order) and below `z-50` dialogs.

**Rule:** a docked desktop side-panel/drawer that should *coexist* with full-width page
content must be a **fixed overlay**, never an in-flow `flex-shrink-0` sibling of a `flex-1`
content column — otherwise it silently reflows every viewport-breakpoint-keyed page underneath
it. (Converting every page grid to container queries is the far larger alternative that was
rejected.)

## 6. App chrome must sit BELOW the modal layer (the bottom-nav overlap class, PR #297)

Reported: on iOS Safari the "Send Invitation" button at the bottom of the campaign-invite
bottom-sheet (`InviteToCampaignModal`) was mostly hidden behind the fixed bottom nav.

Root cause is a plain **z-index collision** (not §1's transform trap, not §3's overscroll
mis-paint): `MobileBottomNav` **and** `MobileTopNav` were `z-50` — the SAME layer as every
Radix modal (shadcn `Sheet`/`Dialog`/`AlertDialog` overlay + content are all `z-50`, see
`src/components/ui/sheet.tsx`). Both the nav and the sheets `createPortal` to `<body>`, so at
equal z-index paint order is decided only by DOM insertion order — fragile and engine-dependent,
and on iOS Safari the opaque white nav won the tie and painted over the sheet's bottom button.

**Contract — the app's z-layering stack (low → high):** page content (`z-auto`) < in-page
sticky sub-headers (`z-10/20/30`) < **app chrome** (both mobile navs, desktop header,
`DonnyDesktopPanel` = `z-40`) < **Radix modal layer** (every `Sheet`/`Dialog`/`AlertDialog`/
`Popover`/`Dropdown`/`Tooltip` = `z-50`) < `DonnyMobileSheet` (`z-[60]/[61]`) < toasts
(`z-[100]`). Never give persistent app chrome the modal layer's `z-50`. Lowering both navs to
`z-40` puts every dialog/sheet reliably above them at once (~20 `side="bottom"` sheets + all
dialogs), with the modal overlay correctly dimming the nav. Nav dropdowns (OrgUnitSwitcher,
notifications) are `z-50` and open downward, so they still render above the nav.

**In-page (non-modal) bottom bars must clear the nav themselves.** A `fixed bottom-0` bar that
coexists with the nav — no overlay, e.g. `StickyApplyCTA` and the `ShortlistDrawer` peek bar —
can't be fixed by z-index alone (it should sit *above* the nav, and both are `z-40`). Offset it
up on mobile with the app's nav-clearance — `bottom-[calc(6rem+env(safe-area-inset-bottom))]`
(the `6rem` mirrors the `pb-24` the mobile content area already uses to clear the nav) — so the
button clears the ~56px nav bar + the floating Donny emblem + the home-indicator safe area;
`md:bottom-0` on desktop (no bottom nav). A sticky footer *inside* a `Sheet` (e.g.
`ScheduleReviewScreen`) needs nothing — the Sheet (`z-50`) already sits above the nav.

**Rule:** persistent app chrome is `z-40`, the Radix modal layer is `z-50` — never tie them. A
new `fixed`/`sticky` bottom-anchored *in-page* bar must either live inside a modal or offset
itself above the nav on mobile (`6rem + env(safe-area-inset-bottom)`).

## 7. Top-anchored chrome needs `env(safe-area-inset-top)` — and only the native shell shows you

Found on the **first physical-device build**, 2026-08-14 ([[iOS TestFlight First Build]]), on a
real iPhone running iOS 26.6. The landing logo and hamburger rendered *on top of* the status-bar
clock and the Dynamic Island.

`index.html` sets **`viewport-fit=cover`**, so the layout viewport extends under the notch. Every
element genuinely at the top of the viewport must pay that back. Across all of `src/`,
`safe-area-inset-top` appeared **once** (`DonnyChatView.tsx:43`) against **eight** uses of
`-bottom` — §2 and §6 above had taught the bottom half of the lesson and nothing had taught the top.

**Why it hid for the entire life of the project, which is the transferable part.** In mobile Safari
the browser's URL bar occupies exactly that space, so the page never sits under the status bar and
`viewport-fit=cover` costs nothing. **The defect exists only in a chromeless `WKWebView`.** Neither
`verify-prod`'s both-viewport pass, nor devtools responsive mode, nor a real iPhone *in Safari*
could have surfaced it — the same "only the native shell can tell you" class as
`window.location.origin` returning `capacitor://localhost`. **A web-only test matrix cannot find a
web-invisible bug**; the native shell is a distinct target, not a smaller screen.

**The fix is a judgment call per element, not a sweep.** 14 files carry `top-0` anchored elements
and none padded the inset, but only five are real viewport chrome:

| Padded — real chrome | Left alone — in-page `sticky top-0` |
|---|---|
| `MobileTopNav`, `landing/Header`, `PublicPageHeader`, `UpdateBanner` (`fixed top-0`), the mobile `ui/toast` viewport | `AgendaView`, `CampaignMetricsBar`, `CampaignBrowseContent`, `BrandCreators`, `HelpBriefPage` |

The right column sticks *inside* a scroll container, below the real nav — padding those inserts a
gap in the middle of the page. **`sticky top-0` does not mean "at the top of the viewport"; it
means "at the top of my scroll container."** That distinction is the whole difference between the
two columns.

Preserve existing padding rather than replacing it — `pt-[calc(0.5rem+env(safe-area-inset-top))]`,
not `pt-[env(safe-area-inset-top)]` — except where the element has none of its own
(`landing/Header`), which takes the raw inset.

**Scope the inset to the breakpoint where the element is actually on top.** `ui/toast`'s viewport is
`top-0` at base but `sm:top-auto sm:bottom-0`, so it gets the inset at base and `sm:pt-4` to reset
it; otherwise the desktop bottom-anchored toast carries a phantom top gap. Mirrors the
desktop/mobile separation rule in `DESIGN_SYSTEM.md`.

**Rule:** `fixed top-0`, or a `sticky top-0` that is page chrome, pads with
`env(safe-area-inset-top)`. In-page section headers do not. The value is `0` on the web, so the
change is a no-op there.

## 8. In the iOS shell, `contentInset` must be `'never'` — CSS owns the safe areas, or the native layer does, never both (2026-08-23)

`capacitor.config.ts` set `ios.contentInset: 'always'`. Under that setting WebKit shrinks
**`documentElement.clientHeight` by the top safe-area inset**, while `innerHeight`, `100vh` and
`100dvh` all keep reporting the full height. Measured inside a real WKWebView on an iPhone 17 Pro
simulator, by injecting a diagnostic into the installed app bundle:

```
innerHeight               = 840
documentElement.clientHeight = 778      <-- 840 - 62
safe-area-inset-top       = 62
safe-area-inset-bottom    = 34
```

So anything sized to a viewport unit is **taller than the document box**, and the webview's own
**white** background shows through underneath it — about 96pt here. On the landing page that band
clipped the footer's Terms / Privacy / Help links.

**This was live for every page in the app.** `AppShell` is `flex h-screen` (`100vh`), so the
overhang existed everywhere; it was invisible purely because every other surface in the app is
white, and so was the band. It became visible only when the landing footer stopped being white
([[Landing Cinematic Single-CTA Redesign]]). **A defect hidden by a coincidence of palette is
still a defect.**

Fixed by `contentInset: 'never'`. The app already pays back `env(safe-area-*)` in CSS on every
surface that needs it (§7 above), so insetting natively as well was two mechanisms solving one
problem and disagreeing about the answer. Afterwards `innerHeight`, `clientHeight`, the page
wrapper and the footer's bottom all agree at 874, `env(safe-area-*)` still reports 62/34 so
existing CSS padding is untouched, and the light `/terms` page renders unchanged.

**Not reproducible in any browser or emulator** — same class as §7. Emulated viewports have no
native scroll-view inset, so `clientHeight` and `innerHeight` are always equal there. It needs the
real WKWebView.

**A related refutation worth keeping, because it is the same numbers pointing the other way.** A
review had claimed the `AppShell` `100vh` / landing `100dvh` mismatch left "unused scrollable space
below the footer" on **mobile Safari**. Tested directly — shell pinned to `100vh`, wrapper to
`100dvh`, at 60/100/140px of browser chrome — and it does not reproduce: `main.scrollHeight ===
main.clientHeight` in every case and `main.scrollTop` refuses to move, because **a container taller
than its content produces no overflow**. "Unused space" is not "scrollable space". The probe was
controlled (forcing the wrapper to 2000px produced 1432px of overflow and real scrolling on the
same instruments). The one-word fix proposed there — `h-screen` → `h-[100dvh]` — would also have
been a **regression**: `DashboardLayout` is `min-h-screen` (`100vh`) *inside* that container, so
shrinking the shell would make every short dashboard page newly scrollable on mobile Safari.

**The lesson is the pair, not either half: refuting a claim on the surface where it was raised does
not refute it on the surfaces where it was never tested.** The browser claim was false; the same
family of bug was real one layer down, in the shell nobody had measured.

## 9. `body` is the document's scroll container, and `AppShell` must be `100dvh` (2026-08-23)

Reported from a real phone: *"when going on it on mobile I see the screen jumps if I scroll up or
down, I think it's a bug."* It was, on **every page in the app**, and it is the finding a review had
already raised and this page's author had refuted.

**Which element scrolls.** `src/index.css` sets `body { height: 100%; overflow-x: hidden }`. Per
spec, an `overflow-x` of `hidden` against a visible `overflow-y` computes `overflow-y` to **`auto`**
— so body is a **fixed-height scroll box**, and anything taller than it makes **body** scroll.
Not `<html>`, not `#root`, not `<main>`.

`AppShell` was `flex h-screen` = `100vh`, and on iOS Safari `100vh` is the URL-bar-**collapsed**
height. So the shell stood ~60–90px taller than body's box, body scrolled by exactly that, and
scrolling collapsed the URL bar, which grew `100dvh`, which resized the page mid-gesture.

Measured, by forcing the shell 80px over and asking every candidate which one moves:

| element | scrollHeight | clientHeight | overflow | scrollTop after scroll |
|---|---|---|---|---|
| `html` | 753 | 753 | 0 | 0 |
| **`body`** | **833** | **753** | **80** | **80** |
| `#root` | 833 | 833 | 0 | 0 |
| shell | 833 | 833 | 0 | 0 |
| `main` | 833 | 833 | 0 | 0 |

`window.scrollY` stayed **0** throughout.

**Fix:** `AppShell` → `h-[100dvh]`. `DashboardLayout`'s two `min-h-screen` track it — they are
inside `main` so they never scrolled body, but a `100vh` child of a `100dvh` `main` hands short
pages the same dead scroll one container down. Pinned by `src/layoutViewportHeight.test.ts` as a
**text** assertion, because jsdom has no layout engine to evaluate a CSS length.

**Two ways the original refutation went wrong, either sufficient on its own:**

1. **Wrong element.** It checked `main.scrollHeight`/`main.scrollTop`. `main` is not the scroller.
2. **Wrong instrument.** It ran in device emulation, which has no collapsing URL bar, so
   `100vh === 100dvh` and the gap under test is structurally zero there.

**The lesson is not "test on a real device" — it is: when a probe returns zero, prove the probe
could have returned non-zero.** The forced-overflow control above costs one line, and it identifies
the scroller *and* demonstrates the instrument responds. Note this is the second iOS-only defect in
two days that an emulator confidently reported absent (§8 was the first), and both were found only
because a human looked at a real screen.

**`docs/DESIGN_SYSTEM.md` carried the false premise in writing** — "the app document never scrolls
(h-screen shell + inner overflow-auto main), so iOS Safari toolbars never collapse" — and has been
corrected. A rule whose stated justification is false will be re-derived wrongly by whoever reads
it next; §2 above states the same `dvh`-not-`vh` rule and is unaffected, because its reasoning was
about the *unit*, not about the document.

**The steady state is not the whole surface — check the LOADING states too.** The first pass at
this fix corrected `AppShell` and `DashboardLayout` and left three `min-h-screen` loading fallbacks
in `App.tsx`. Two of them (`/pitch`'s Suspense fallback and the session-hint splash) **return
directly from `AppLayout`, bypassing `AppShell`**, so their `100vh` overflows the **document**, not
merely `main` — and the splash renders on **public** paths while auth resolves for a returning
visitor, i.e. on the landing during every warm load, the exact scenario reported. The pin is
therefore "**no `100vh` survives anywhere in `App.tsx`**", not "the shell is `h-[100dvh]`".

**Still open:** if the jump survives on a real phone, the remaining candidate is iOS rubber-band
overscroll — a different mechanism, wanting `overscroll-behavior-y: none` on `body`, which is an
app-wide behavioural change and was deliberately not bundled here.

## Key Decisions

- **Delete the trap, don't patch victims:** removing the transform un-traps all ~14
  hand-rolled fixed-position components inside routes at once; portal-to-body remains the
  per-overlay defense-in-depth.
- Reason from the framer **stall state**, not the at-rest ideal: "v12 clears transforms
  when the animation completes" is true and irrelevant when the animation never runs.
- **Portal bottom-anchored mobile chrome to `<body>`:** it dodges *both* the transform trap
  (§1) and the iOS fixed-inside-scroller overscroll mis-paint (§3) in one move — the nav is
  viewport-anchored regardless of any transformed ancestor or scroll container.

## See Also

- [[Creator Groups (Crews)]] — the invite sheet this fixed
- [[Donny Chat UX]] — DonnyMobileSheet, un-trapped by the same change
- [[Landing Prerendered Shell & Performance]] — sibling mobile-WebKit rendering work
