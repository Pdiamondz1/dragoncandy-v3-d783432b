---
title: Landing Prerendered Shell & Performance
type: concept
created: 2026-06-28
updated: 2026-06-28
sources: [2026-06-28-landing-flash-and-perf.md]
tags: [landing, performance, lcp, webkit, framer-motion, accessibility]
---
# Landing Prerendered Shell & Performance

How the public landing paints its first frame, and how it's kept light enough not to crash mobile
WebKit. Sibling of [[Anonymous Brief Generator]] (the landing's other hardened concern).

## The prerendered shell (and its failure mode)

`index.html` paints a **pre-rendered shell** inside `<div id="root">` *before* the React bundle
loads — for a fast LCP. The trap: if that shell hardcodes **specific landing content**, it goes
**stale** the moment the landing is redesigned, and then *every* load paints the old design for ~1s
before React swaps in the new one (the "old-design flash"). This is **not** a cache/service-worker
bug — there is no SW/PWA, assets are content-hashed, `index.html` is `max-age=0, must-revalidate`,
and the `version.json`/`useAppVersion` update path is correct and unrelated.

**Rule:** the shell must be **content-free** — a dark splash matching the app's `bg-dc-dark`
(`#1A1A2A`) + the logo, nothing else. The real landing fades in over an identical background (no
flash), and a content-free shell **cannot go stale** after a future redesign. Never reintroduce
headline/CTA copy into the shell.

## Keeping the landing off the WebKit-crash threshold

Symptom: "A problem repeatedly occurred" (a Safari/WebKit renderer crash — memory/CPU exhaustion),
on real mobile + the Lovable preview iframe. The landing is many sections of decorative motion; the
cumulative cost is what crashes. Patterns that keep it light:

- **One shared `IntersectionObserver` for scroll reveals**, not one-per-element. `Reveal` uses a
  single module-level observer + a pure-CSS `.reveal`→`.reveal-in` transition. The old version used
  Framer Motion's `whileInView` (an observer *and* the animation engine *per* element, ~20 of them).
  Dropping `m.*` from `Reveal` means the landing no longer triggers Framer Motion's `domAnimation`
  chunk at all.
- **No always-running animation on large blurred layers.** `blur-3xl` blobs with
  `animation: … infinite` are expensive (a big blurred region recomposited every frame). Empty
  `MediaSlot`/`VideoSlot` placeholder blobs are **static**; the remaining `float`/`shimmer` are gated
  behind `@media (prefers-reduced-motion: no-preference)`.
- **Code-split the landing route** (`lazy()` in `App.tsx`) so it's not in the initial bundle — but give
  it a **dark** Suspense fallback (`bg-dc-dark`), or the bare global spinner reintroduces a white flash.
- **Autoplay video only when in view** (`VideoSlot`: IntersectionObserver gate + `preload="none"`), so a
  reel can't autoplay/load off-screen and spike memory.

## Known issues / gotchas

- **A hand-rolled `matchMedia` hook must carry the legacy fallback.** Older Safari/iOS `MediaQueryList`
  has only the deprecated `addListener`/`removeListener`, not `addEventListener` — calling
  `addEventListener` *throws on the exact WebKit that crashes*. Feature-detect and fall back. (Framer
  Motion's `useReducedMotion` handles this; replacing it with a local hook reintroduces the gap unless
  you copy the fallback.)
- **A locally-initialized reduced-motion hook must init synchronously** (`useState(() => matchMedia(...).matches)`),
  else ambient autoplay can fire for one frame before the effect runs; also pause the video when autoplay
  is revoked.
- The reveal's initial state is `opacity:0`; content is hidden without JS / IntersectionObserver — fine
  for a client-rendered SPA, and the `Reveal` guards a missing `IntersectionObserver` by revealing
  immediately.

## See Also

- [[Anonymous Brief Generator]] — the landing's paste-URL teaser endpoint.
- [[Donny AI]] — `BriefGeneratorPreview` (lazy-loaded inside the landing) talks to it.
