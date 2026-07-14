# Session: Mobile screen-fit — un-trap fixed UI from PageTransition + crew invite sheet iOS fit

**Date:** 2026-07-14
**Branch:** `worktree-DC-mobile-screenfit`
**Trigger:** Two founder iPhone screenshots: (1) the crew "Invite creators" sheet's confirm
footer cut off behind Safari's bottom toolbar; (2) "unable to get to Donny on most pages" —
the mobile bottom nav (Donny's only mobile entry point) visible only as a sliver behind the
toolbar at the very end of a full page scroll.

## What shipped

Frontend-only, 5 files, no schema/edge-fn/secret change:

1. **`PageTransition.tsx` — opacity-only route transition (the keystone).** The wrapper
   `motion.div` animated `y: 6 → 0`. Verified live on prod: framer-motion stalls at its
   `initial` values on first page load (LazyMotion loads `domAnimation` async; inline
   `opacity: 0` + `translateY(6px)` persist — the page is only visible because of the
   `ensureVisible` CSS fallback). A non-`none` transform makes the wrapper the **containing
   block for every `position:fixed` descendant**, so `MobileBottomNav`, `DonnyMobileSheet`,
   sticky CTAs etc. anchored to the *bottom of the page content* instead of the viewport.
   Client-side navigations sometimes animated properly and cleared the transform — hence
   "most pages" flakiness. Fix: `initial/animate` are opacity-only; the `ensureVisible`
   keyframe dropped its `transform: none` too. Contract comment added: never add x/y/scale
   to this wrapper.
2. **`useScrollDirection.ts` — bottom reveal.** The nav hides on scroll-down and nothing
   un-hid it when the user parked at the end of a page (the last gesture there is always
   'down'). Now reports 'up' within 80px of the container bottom (gated on
   `scrollHeight > clientHeight` so jsdom zero-height containers keep old semantics).
   2 new tests (6 total).
3. **`InviteCreatorsSheet.tsx` — iOS fit.** `max-h-[82vh]` → `max-h-[82dvh]` and the confirm
   footer pads `pb-[calc(1rem+env(safe-area-inset-bottom))]`. This app's document never
   scrolls (`h-screen` shell + inner `overflow-auto` main), so iOS Safari's toolbars never
   collapse and `vh` (large-viewport unit) permanently exceeds the visible height; `dvh`
   tracks it. `viewport-fit=cover` is already set, so `env()` is live (0 on desktop).

## Verification

- **Fixed-probe technique** (reusable): inject `position:fixed;bottom:0` div into the
  suspect ancestor, compare `rect.bottom` to `window.innerHeight` vs the ancestor's bottom.
  Prod (before): probe anchored to wrapper bottom (714 vs viewport 624). Local (after):
  anchored to viewport (467 = 467), wrapper transform `none`.
- Tailwind emitted valid CSS for the no-space `calc(1rem+env(...))` arbitrary value — it
  normalizes math operators (`calc(1rem + env(safe-area-inset-bottom))` in dist). Codex was
  probing exactly this; verified in the built CSS.
- Build + typecheck + vitest green; Codex second review clean (verdict: narrowly scoped, no
  regressions).

## Key decisions / gotchas

- **Delete over patch:** portal-to-body (the PR #224 fix for ApplyConfirmation) treated one
  victim; removing the transform removes the *trap* for all ~14 hand-rolled fixed-position
  components inside routes. Nothing compensated for the trap (content-height-dependent
  breakage can't be calibrated against), so un-trapping is safe.
- Framer-motion v12 CAN clear transforms at rest — but the first-load stall means the
  initial transform never clears on direct loads/refreshes. Don't reason from "at rest it's
  fine"; reason from the stall state.
- The `useScrollDirection` bottom-reveal must be gated on the container being scrollable, or
  jsdom (heights = 0) makes every position "at bottom" and existing tests silently flip.
- iOS user-truth: in a non-scrollable-document app, "toolbar collapsed" never happens — size
  bottom-anchored UI in `dvh`/`svh` and pad with `env(safe-area-inset-bottom)`, never `vh`.
