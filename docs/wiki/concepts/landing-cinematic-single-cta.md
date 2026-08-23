---
title: Landing Cinematic Single-CTA Redesign
type: concept
created: 2026-08-22
updated: 2026-08-22
sources: [2026-08-22-landing-cinematic-single-cta.md]
tags: [landing, frontend, video, design, tailwind]
---
# Landing Cinematic Single-CTA Redesign

> **UNMERGED (`feat/landing-cinematic-single-cta`), blocked on written permission from ABB and
> Uncle Rocco for their footage.** The build is finished; go-live is not. dragoncandy.io still
> serves [[Landing "Human-driven. AI-assisted." Redesign]] (PR #293) until this merges. Nothing on
> this page describes the live site.

The 2026-08-22 rebuild of the public landing (`src/pages/LandingPage.tsx` +
`src/components/landing/*`) into **one screen**: a fixed logo header, a full-bleed video hero (ten
real restaurant reels rotating behind an eyebrow, a slogan, and a single "Get started" CTA), and a
thin footer. **Supersedes** [[Landing "Human-driven. AI-assisted." Redesign]] as the design this
branch will ship once merged — that page's light, two-door, six-section landing and its contact
form are deleted outright (~20 files), not hidden. It also **revives** the video-backdrop machinery
[[Landing Cinematic Video Redesign]] built and PR #293 had demoted to an opt-in flag: that flag
(`LANDING_VIDEO_BACKDROP_ENABLED`) is gone, and the video *is* the page again — see Known Issues on
that page for why "opt-in" and "deleted" are different postures, not the same idea revisited.

## Key Decisions

- **The role question moved into signup instead of being rebuilt on the landing.** The prior
  landing asked "Business, Creator, or Brand?" via a role-morphing or two-door hero. This one asks
  nothing — one CTA goes to `/auth?mode=signup`, which already has a `role-selection` step for a
  missing `?role=` (built for a different reason, on a prior branch). Deleting the on-landing role
  question cost zero new code; it just moved one screen later, onto a screen already built to ask
  it.
- **Two encodes per reel, selected by viewport orientation, not device class.** Source footage is
  720×1280 portrait phone reels. `landingClips.ts`'s `LandingReel` carries an optional
  `wide`/`widePoster` 16:9 crop alongside the always-present portrait `src`/`poster`;
  `resolveReelSource(clip, isLandscape)` (driven by a new `useIsLandscape` hook) picks wide in
  landscape, portrait otherwise, falling back to portrait when a clip has no wide encode. **The
  crop window for each clip (`y` offset, 300–650 across the ten clips) was chosen by watching the
  clip**, not a blind centre crop — food framed low wants `y≈550`, a face or sign held high wants
  `y≈300`; a centre crop (`y=437`) routinely puts ceiling or tablecloth on screen instead of the
  subject. **Verified live on both surfaces, not assumed from code**: desktop served the `-wide`
  encodes, a 390×844 emulated device served the portrait ones. Full ffmpeg recipe (crop math, the
  `-an`/`yuv420p`/`+faststart` flags and why each is load-bearing, the crop-rounds-to-720×404
  quirk) in `docs/runbooks/landing-video-backdrop-kit.md`.
- **Every reel capped at 12 seconds — and the cap's own justification had a latent bug the
  mandatory second reviewer caught.** `RotatingBackdrop`'s `MAX_DWELL_MS` (15s) is a stall
  *backstop*: it force-advances a clip that neither fires `ended` nor `error`, so an
  undecodable-but-silent codec or a mid-play network stall can never freeze the rotation
  permanently. The 12s cap exists so a healthy clip never brushes that ceiling — but the original
  wiring armed the watchdog on the layer becoming *active* (told to play), not on playback actually
  *starting*. Against a 12s clip that leaves only ~3s of margin, which slow-connection startup
  buffering can exceed — force-advancing a clip that was merely slow to start, not broken. **Codex
  flagged this as a P2** (commit `c0b78766`). Fix: keep arming on layer-active (still the backstop
  for a clip that genuinely never starts), and additionally reset the timer on the layer's
  `playing` event, so a slow-starting clip gets its full 15s dwell measured from real playback
  start. **The tempting one-line fix — arm only on `playing`, not on layer-active — would have been
  worse than the bug it replaced**: a clip that never fires `playing` at all would then never arm a
  timer, converting a bounded 15s stall into a permanent freeze. **The general lesson: a
  mitigation's timing margin is a claim about its inputs, and it needs re-verifying every time one
  of those inputs changes** — here, dropping the assumed clip length from ~6–10s to a strict 12s
  cap silently ate the margin the watchdog's original 15s was sized against.
- **The feature flag was DELETED, not left off-by-default.** `LANDING_VIDEO_BACKDROP_ENABLED`
  made sense when video was optional set-dressing on a light static hero — "off" meant a real,
  functioning fallback page. Here the video **is** the page; an "off" state would ship a blank
  homepage, which is an outage wearing a kill-switch costume, not an actual one. The genuine
  fallback for no-clips / a failed clip / `prefers-reduced-motion` is `RotatingBackdrop`'s own
  poster-still path — **confirmed by observation**: with reduced motion forced, zero `<video>`
  elements mount and the network log shows no media requests, only poster images.
- **A whole-branch review found defects no per-task review could, because each was a mismatch
  BETWEEN files rather than a bug within one** (all landed together in commit `73948f0f`):
  the page **scrolled** despite being designed as one screen (`min-h-screen` stacked with a sticky
  header and a `min-h-[100dvh]` hero — the exact `100vh`-family unit `DESIGN_SYSTEM.md`'s
  bottom-anchored-UI rule forbids — fixed with absolute header + `flex-1` hero + `shrink-0`
  footer); a **cold-load white flash** because both things that paint before the dark landing
  renders (`App.tsx`'s Suspense fallback, `index.html`'s prerendered splash) were still hard-coded
  white from the prior light design (fixed: Suspense fallback → `bg-landing-grape`, splash script
  now flips dark specifically on the three landing routes, unaffected elsewhere); and a
  **spec-vs-plan disagreement that read as a contradiction until scoped correctly** — the spec said
  "thin white footer," the plan said keep `bg-landing-grape,` and both were right because they
  meant different elements (the footer bar vs. the page wrapper behind it). Spec won on the footer
  itself.
- **`generate-anonymous-brief` is orphaned but deliberately left deployed, not undeployed.** Its
  only caller — the landing's brief-preview flow — was deleted with the six sections. It still
  spends real Anthropic tokens per call if reached directly; recorded as a cost-visibility
  follow-up rather than fixed here, since nothing currently links to it and undeploying is a
  separate decision from a landing rebuild.

## Verified

- **The brightest-frame contrast check (design spec §7) has been run.** The spec requires checking
  the slogan's contrast against each clip's brightest frame, not an average frame, because a
  genuinely bright moment (a lit dish, a bright kitchen) can wash out text that reads fine on
  average. Method: all ten reels sampled at their brightest sampled frame in the vertical middle
  band — where the scrim is thinnest (40%) and the slogan sits — composited over
  `landing-grape`, then scored by WCAG contrast ratio. Worst case across the whole library: white
  **6.24:1**, pink (`#F9BFD6`) **4.00:1**, mint (`#7BE3C0`) **4.04:1**; the tightest clip is
  `abb-montauk-monday` (a bright ocean frame). The slogan is large display text (3.0:1 required) —
  every clip clears it with margin, and the white text also clears the stricter 4.5:1 normal-text
  bar. **Caveat: only the PORTRAIT encodes were sampled** (the emulated viewport used for the check
  was portrait); the desktop wide crops are a different subset of the same footage and have not
  been sampled.

## Not Verified

- **Restaurant footage permission is not obtained** — the reason the branch is unmerged. This is a
  go-live gate, not a build gate.

## Known Issues (inherited, still true here)

- `RotatingBackdrop`'s HEVC `.mov` exclusion and dynamic-clip-merge logic
  ([[Landing Cinematic Video Redesign]]) are **not exercised on this branch** — the backdrop is
  curated-only now (no DragonFeed dynamic mixing), so the `.mov`/HEVC guard applies only if a
  future curated source happens to be HEVC-encoded; nothing currently tests that path against the
  new registry.

## See Also

- [[Landing "Human-driven. AI-assisted." Redesign]] — the design this supersedes.
- [[Landing Cinematic Video Redesign]] — the original video-backdrop system this branch revives
  and simplifies (curated-only, orientation-aware, no per-role keys).
- [[Landing Prerendered Shell & Performance]] — the splash/Suspense-fallback flash discipline this
  branch had to reapply in the opposite direction (light→dark this time, not dark→light).
- [[Mobile Viewport & Fixed Positioning]] — the `dvh`-not-`vh` rule this branch's scroll bug
  violated and then corrected.
