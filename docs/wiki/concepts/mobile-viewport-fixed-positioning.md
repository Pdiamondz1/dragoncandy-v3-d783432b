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

**Was "still open":** *if the jump survives on a real phone, the remaining candidate is iOS
rubber-band overscroll — a different mechanism, wanting `overscroll-behavior-y: none` on `body`,
which is an app-wide behavioural change and was deliberately not bundled here.* It did survive, it
was exactly that, and §10 closes it. Note the prediction was right about the mechanism and wrong
about the surface: this is not iOS-only.

## 10. A page with nothing to scroll can still be DRAGGED, and the gutter is white (2026-08-24)

> **This section diagnosed the report below WRONGLY, and shipped a fix that did not resolve it.**
> The guards it describes are real, are still in the tree, and are worth keeping — but the cause of
> the white band was **§11**, a height-unit mismatch, not the rubber-band. Read §11 first. This
> section is kept rather than rewritten because the reasoning here is exactly what a plausible
> wrong answer looks like: it explained every observation available at the time, and every
> observation available at the time came from an instrument that could not see the real cause.

The day after §9 shipped, the same reviewer reported from the same phone: *"you can still move the
page on mobile, looks buggy and would not be good when you add a wrapper."* Two screenshots, one
showing white **above** the header, one white **below** the footer. The founder saw it on desktop
too.

**§9 is not wrong and this is not a regression — they are two mechanisms.** §9 removed the
*scrollable gap* that made the screen **jump** mid-gesture. Rubber-band overscroll is separate: a
scroll container with nothing to scroll still bounces. That also explains the one detail §9's
prediction got wrong — it called this an iOS candidate, and a macOS trackpad rubber-bands too, which
is why one report covered both viewports where the previous bug was iOS-only.

**Why the band is white, and why nothing inside the app could have fixed it.** The elastic strip a
bounce opens sits **outside the body box**, so no element under `#root` can paint it. The canvas
takes its background from `<html>`, falling back to `<body>` only when the root is transparent — and
`body` is `bg-background`, i.e. white. A page whose entire premise is one dark cinematic screen
therefore opened a white gutter at both ends.

**Two guards, because they fail differently.**

1. `overscroll-behavior-y: none` on `html` **and** `body`. Both: body is the document's scroll
   container (§9), while the value governing the viewport is read off the root. **Y axis only** —
   the shorthand takes X with it, and X is where iOS Safari's edge-swipe-back gesture lives; there
   is no horizontal scrolling to suppress anyway, since `overflow-x: hidden` is already set.
   **Known cost, accepted:** pull-to-refresh goes away on Android Chrome.
2. The landing paints the canvas: `LandingPage` adds `landing-surface` to `documentElement` for its
   lifetime (`html.landing-surface { @apply bg-landing-grape }`), removed on unmount so it cannot
   tint the white page the visitor opens next. Mirrors `InternalLayout`'s toggle, the only other
   place the app touches `documentElement`. **This is not redundancy** — it covers precisely what
   guard 1 cannot reach: Safari before 16, and the Capacitor WKWebView, whose bounce is a **native
   scroll-view setting** no CSS property switches off. Any future full-bleed dark surface needs the
   same treatment; it is per-surface, not global.

**The simulator answered the question that mattered, and only that one.** A throwaway build with a
computed-style readout injected into the *copied* `ios/App/App/public/index.html` (never source;
restored with `npx cap sync ios`) reported, inside WKWebView: `html`/`body` `overscroll-behavior-y:
none`, `html` background `rgb(36, 19, 50)`, `innerHeight` 874 `=== documentElement.clientHeight` 874
(so §8's `contentInset: 'never'` invariant still holds), body overflow 0, safe-top 62px.

So **WebKit does apply the property in a WKWebView** — the one fact unobtainable from Chrome. What
this does **not** establish is the native scroll view refusing to bounce: *applied* and *suppressed*
are different claims, and no drag could be synthesised (`cliclick` absent; `CGEvent` needs
Accessibility permission an agent cannot grant itself). Recorded as unproven rather than assumed —
the same discipline §9's forced-overflow control introduced, applied to the limits of the instrument
instead of the reading.

**Pinned** by `src/documentOverscroll.test.ts` as text assertions (jsdom has neither a layout engine
nor a rubber-band), including a guard that nobody reaches for the `overscroll-behavior` shorthand
and quietly takes the X axis with it.

Shipped alongside: `AuthPage` and `AuthShell` moved off `min-h-screen`, the §9 defect one page over,
on the page the landing's only CTA leads to. The other 113 `h-screen`/`min-h-screen` usages in
`src/` are untouched — a sweep is a different change.

## 11. `body` must be sized in the SAME UNIT as the shell — the real cause (2026-08-24)

**CONFIRMED FIXED on a real phone**, which matters because nothing in this repo's toolchain could
confirm it. Three consecutive diagnoses of one report; the first two were confident and wrong.

`src/index.css` pinned `html, body { height: 100% }`. A percentage resolves against the **initial
containing block**, which on iOS Safari is the **small** viewport (toolbars showing). `100dvh` is
the **current** dynamic viewport, and it **grows** as Safari collapses or compacts its toolbars —
aggressively so in landscape.

So with `AppShell` at `h-[100dvh]` and body pinned to the small height, the shell outgrows body's
box the moment the toolbar moves, body scrolls by exactly that difference, and the strip below the
shell paints body's own background: **white**.

**This page already held the measurement that proves it, in §9, and nobody read it that way:**
body `clientHeight` **753** against `100vh` **833**. §9 correctly identified that the two elements
disagreed, changed the **shell's** unit from `vh` to `dvh`, and left the other side of the
comparison on `%`. That closed the always-80px case and left a gap that opens and shuts with the
toolbar.

> **A height comparison has two sides, and fixing one of them is not fixing it.**

**Fix:** `html` and `body` are `height: 100dvh`, the same unit as the shell, so both move together.
A `height: 100%` fallback stays declared **before** it — `documentOverscroll.test.ts` asserts the
declaration order, because if the fallback came last it would win and the bug would be back with
the guard still green.

**Second guard, deliberately independent:** while the landing is mounted,
`html.landing-surface, html.landing-surface body { overflow: hidden }`. The landing is one screen
by definition, so the document has nowhere to scroll — a guard that does not depend on any unit
comparison coming out right, and the standard way to stop the iOS rubber-band, which cannot fire on
a document with no scrollable overflow. **`#main-content` is NOT locked**: if content ever
genuinely does not fit, `main` can still scroll, so the only CTA can never become unreachable.
Clipping "Get started" is a worse failure than a scrollbar.

**Landscape had a second, real problem** the lock alone would have clipped. Measured: the hero's
natural content is **277px** at landscape width plus a **78px** footer = **355px**, against roughly
**310px** a phone leaves with toolbars showing. Closed with a **height** breakpoint — `short:`
(`max-height: 430px`) — because no width breakpoint can see that a phone is held sideways. Content
drops to **195px**.

### How three wrong-then-right diagnoses happened, which is the part worth keeping

1. **"The content overflows."** Refuted by measuring: zero overflow at every viewport Chrome could
   produce.
2. **"It is the rubber-band."** Plausible, shipped (§10), and did not fix it. The simulator even
   confirmed WebKit *applies* `overscroll-behavior` — a true fact that answered a question nobody
   had asked, since *applied* was never the same claim as *suppressed*.
3. **The screenshot settled it.** The white sat **below the app shell**, with a scroll indicator.
   That single observation rules out every mechanism *inside* the page at once — no element under
   `#root` can paint outside the body box.

**The instrument was the whole problem.** Chrome, device emulation and the Capacitor WebView all
report this family of defects absent, for one shared reason: none has a collapsing toolbar, so
ICB `===` dvh and the gap is structurally zero. That is now **three** defects (§8, §9, §11) with
exactly that blind spot. When a report comes from a real phone and every local instrument says the
page is fine, the instrument is the thing to distrust — and the fastest way out is a screenshot
that shows *where* the artefact sits relative to known elements, because position rules out whole
classes of cause in one step.

## Key Decisions

- **Delete the trap, don't patch victims:** removing the transform un-traps all ~14
  hand-rolled fixed-position components inside routes at once; portal-to-body remains the
  per-overlay defense-in-depth.
- Reason from the framer **stall state**, not the at-rest ideal: "v12 clears transforms
  when the animation completes" is true and irrelevant when the animation never runs.
- **Portal bottom-anchored mobile chrome to `<body>`:** it dodges *both* the transform trap
  (§1) and the iOS fixed-inside-scroller overscroll mis-paint (§3) in one move — the nav is
  viewport-anchored regardless of any transformed ancestor or scroll container.
- **Closing a scroll and colouring a gutter are different jobs (§10).** Removing the overflow stops
  the page moving; it does nothing about a bounce, and a bounce paints from `<html>`, outside
  everything the app renders. Ship both, because the CSS guard cannot reach a native WebView and
  the colour guard cannot stop the movement.
- **Record what the instrument could not see.** The simulator proved WebKit *applies*
  `overscroll-behavior`; it could not prove the native scroll view stops bouncing. Writing the
  second sentence down is what stops the first being read as the whole answer. §11 shows the cost
  of not doing it: that true-but-irrelevant fact was read as confirmation of a wrong diagnosis.
- **A height comparison has two sides (§11).** §9 measured body at 753 against a shell at 833,
  fixed the shell's unit, and left body's. Whenever a fix changes one operand of a comparison, ask
  what the other operand is measured in.
- **Position rules out cause faster than any probe.** Three diagnoses of one report were settled by
  a screenshot showing the white *below* the app shell — which eliminates every mechanism inside
  the page at once, because nothing under `#root` can paint outside the body box. Ask where the
  artefact sits relative to known elements before asking why it is there.

## See Also

- [[Creator Groups (Crews)]] — the invite sheet this fixed
- [[Donny Chat UX]] — DonnyMobileSheet, un-trapped by the same change
- [[Landing Prerendered Shell & Performance]] — sibling mobile-WebKit rendering work
