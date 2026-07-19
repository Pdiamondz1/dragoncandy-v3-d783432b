---
title: Mobile Viewport & Fixed Positioning
type: concept
created: 2026-07-14
updated: 2026-07-19
sources: [2026-07-14-mobile-screenfit-fixed-position.md, 2026-07-16-donny-desktop-overlay.md, 2026-07-19-mobile-nav-modal-zindex.md]
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
