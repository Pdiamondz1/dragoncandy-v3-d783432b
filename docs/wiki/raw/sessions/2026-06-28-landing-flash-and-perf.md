# Landing: kill the old-design flash + lighten it (2026-06-28)

Branch `fix/landing-flash-and-perf`. Pure frontend; no schema/edge/secret. Two founder-reported
symptoms (with a screenshot of the *old* white landing flashing + a "A problem repeatedly occurred"
Safari crash on the Lovable preview).

## Symptom 1 — old-design flash (root cause found)

On every load an *entirely old* landing ("SOCIAL MEDIA CONTENT FOR RESTAURANTS — POWERED BY AI",
white bg, "I'm a Restaurant"/"I'm a Creator") painted for ~1s, then the current dark landing
replaced it. **Not** a service worker / PWA / CDN-cache bug (verified: none exist; assets are
content-hashed; `index.html` is `max-age=0, must-revalidate`; the `version.json`/`useAppVersion`
update path is correct and unrelated). **Cause:** `index.html` line 87 hardcodes a **pre-rendered
"instant-LCP" shell** (added in `cc4d83b3`) that is still the OLD white design + its light-theme
`sh-*` CSS — never updated when the landing went dark. It paints before React mounts → the flash.

**Fix (decision: minimal dark shell):** replace the shell with a **content-free dark splash**
(`background:#1A1A2A` = `dc-dark` + the logo, fade-in). The real dark landing fades in over an
identical bg → no white flash, no old copy — and a content-free shell **can never go stale again**
after a redesign (that staleness was the whole bug). Deleted the now-dead `sh-*` + old utility CSS.

## Symptom 2 — WebKit "a problem repeatedly occurred" crash (perf pass)

The landing was heavy enough to exhaust the mobile/Lovable-preview renderer. Cumulative load:
~20 Framer-Motion `whileInView` observers (one per `Reveal`) + the animation engine; 6–8 always-
running `infinite` CSS animations on **`blur-3xl`** blobs (large blurred layers animating forever =
expensive compositing); and the landing route was **not** code-split. Four contained changes, each
preserving the design for normal users:

- **Code-split** the landing route (`App.tsx` `lazy()` + a **dark** Suspense fallback so the loading
  state stays seamless with the splash — never a white flash). Entry bundle ~328kB → ~290kB; landing
  is its own `LandingPage-*.js` chunk.
- **Lightweight `Reveal`** — rewrote it to ONE shared module-level `IntersectionObserver` + a pure-CSS
  `.reveal`→`.reveal-in` transition (was a Framer-Motion `m.div` per element). Dropping `m.*` means the
  landing no longer triggers Framer Motion's `domAnimation` chunk. `prefers-reduced-motion` honored in
  CSS. Guards `IntersectionObserver` absence (reveal immediately).
- **Tame animations** — empty `MediaSlot`/`VideoSlot` placeholder blobs made **static** (dropped
  `animate-float`); remaining `float`/`shimmer` gated behind `@media (prefers-reduced-motion:
  no-preference)`.
- **VideoSlot** — ambient autoplay now arms **only when the slot is in view** (IntersectionObserver +
  `preload="none"`), so a future `CREATOR_REEL` can't autoplay/load off-screen; uses a local
  reduced-motion hook (the landing's last Framer-Motion consumer removed).

## Codex catches (2 P2s, both real, fixed)

1. The local reduced-motion hook started `false` → a real reel could `play()` for one frame before the
   preference applied (and cleanup didn't pause). Fixed: **synchronous `matchMedia` init** + **pause in
   the ambient cleanup**.
2. Older Safari/iOS `MediaQueryList` lacks `addEventListener` (only the deprecated `addListener`) — my
   hand-rolled hook would **throw on the very WebKit that crashes**. Fixed: feature-detect
   `addEventListener`, fall back to `addListener`. (The Framer-Motion hook I replaced handled this; rolling
   my own reintroduced the gap — lesson: a hand-rolled `matchMedia` hook must carry the legacy fallback.)

## Honest scope

Lovable's *editor* crash + slow deploys are partly their platform; these changes remove the stale shell
(fixes the flash on prod + Lovable) and cut the renderer load (reduces crash risk) but can't fix Lovable's
own infra. The "less generic" redesign is a separate effort.

## Files

`index.html`, `src/App.tsx`, `src/components/landing/Reveal.tsx`, `src/index.css`,
`src/components/landing/MediaSlot.tsx`, `src/components/landing/VideoSlot.tsx`.
