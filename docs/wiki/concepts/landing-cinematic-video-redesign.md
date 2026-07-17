---
title: Landing Cinematic Video Redesign
type: concept
created: 2026-07-16
updated: 2026-07-16
sources: [2026-07-16-landing-cinematic-video-redesign.md]
tags: [landing, frontend, video, design, tailwind]
---
# Landing Cinematic Video Redesign

The 2026-07-16 evolution of the public landing (`src/components/landing/*` +
`src/pages/LandingPage.tsx`) from the Dark-Luxe rebuild ([[Landing Redesign & Public Lead Capture]])
into a **cinematic, kinetic, 6-section** page with a **morphing per-role hero** and a **swappable
AI-video backdrop**. Frontend-only — no schema/edge-fn/secret change.

## Key Decisions

- **Morphing role switcher (R2).** One cinematic hero with `Business · Creator · Brand` pills;
  tapping a pill re-films headline + backdrop clip + CTA. Keeps a single captivating statement
  while making each role feel addressed. Role logic (`heroRole.ts`) is pure + unit-tested:
  `visibleRoles(brandEnabled)`, a `HERO_CONTENT` map, and `parseRoleParam` (own-property-guarded
  like `AuthPage` — rejects `?role=constructor`; a gated/unknown role no-ops to business, so a
  flag-hidden role is never reachable from the hero).
- **Lean 6 sections.** Hero → See it work ([[Anonymous Brief Generator]], elevated as early proof)
  → How it works → Pick your lane → Proof → Start free. Copy is headline-plus-one-line. Six
  components retired.
- **Honest Proof band.** Pre-revenue, so the merged Stories+Rewards band ships `testimonials: []`
  (a founder-fillable slot, no fabricated quotes) + verifiable trust chips only. The rewards
  teaser is `useDragonRewardsEnabled()`-gated to its own sub-block.
- **Swappable clip-source seam (the keystone).** `landingClips.ts` maps semantic keys
  (`hero.business`, …) → `{ src, poster }` via `resolveLandingClip`/`useLandingClip`. v1 ships an
  **empty** registry so `VideoSlot` degrades to its gradient (**ship-before-clips** — the redesign
  goes live before any clip exists; the founder pastes Cloudflare Stream URLs into one file to turn
  on video). Source-agnostic by design: a future **DragonFeed adapter** ([[Dragon Feed]]) swaps the
  source behind the same hook with zero component changes — the landing then dogfoods real creator
  content.
- **Clip pipeline (founder, outside code):** control-the-still-then-animate — Nano Banana Pro
  stills → image-to-video (Veo 3.1 for hero money-shots; Kling / Runway for the many reels) →
  4–8s silent loops + posters → serve via **Cloudflare Stream** (Bunny = cheaper fallback) behind
  the seam. Serving cost, not AI spend.
- **`VideoSlot variant="backdrop"`** — additive full-bleed, controls-less variant; the default
  framed player is byte-unchanged. All hardening kept (see [[Landing Prerendered Shell & Performance]]).

## Known Issues / Gotchas

- **Tailwind position-utility ordering.** Never put both `relative` and `absolute` on one element.
  Tailwind emits them `static, fixed, absolute, relative, sticky`, so the **later-defined utility
  wins** at equal specificity — `.relative` beats `.absolute`. The backdrop `VideoSlot` originally
  emitted `relative` while the hero passed `absolute inset-0`, so it computed to `relative` (in-flow,
  ~half width) and was NOT full-bleed. Masked in the empty-clip state; would have broken the moment
  a real clip URL was added (the go-live path, outside any review gate). Fix: the backdrop variant
  **self-positions `absolute inset-0`**, guarded by a regression test. (Caught by the Opus
  whole-branch review, not the per-task reviews.)
- **Size a tall logo by HEIGHT, not width.** `/logo.webp` is a tall badge (~0.9 h/w). Width-sizing
  (`w-[168px]`) made it ~150px tall and overlapped the hero content. Cap by height
  (`h-16 lg:h-20 w-auto`). Only visible in a browser pass.
- **A fixed *transparent* header is illegible over bright scrolled content.** Make it
  **scroll-aware**: transparent over the hero, fade in `bg-dc-dark/80 backdrop-blur-xl border-b`
  once scrolled past ~16px (passive scroll listener). Pure always-transparent leaves dark nav
  illegible over bright sections — proven in the browser pass.
- **Verifying a logged-out landing.** `LandingPage` redirects authed users to `/dashboard`; to see
  the landing on local dev, clear the `sb-*-auth-token` localStorage keys for the `127.0.0.1:8080`
  origin only (reversible; prod untouched). `resize_window` may not reflow below the `md`
  breakpoint — true-mobile needs verify-prod / on-device.

## See Also
- [[Landing Redesign & Public Lead Capture]] — the Dark-Luxe base this evolves; the scoped `.dark`
  wrapper + Reveal/MediaSlot/VideoSlot primitives + `leads`/`capture-lead` pipeline (all retained).
- [[Landing Prerendered Shell & Performance]] — the perf discipline (shared-observer Reveal,
  reduced-motion, code-split) the redesign preserves.
- [[Anonymous Brief Generator]] — the "See it work" interactive proof section.
- [[Dragon Feed]] — the future clip source behind the `landingClips` seam.
