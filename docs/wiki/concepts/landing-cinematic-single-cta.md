---
title: Landing Cinematic Single-CTA Redesign
type: concept
created: 2026-08-22
updated: 2026-08-23
sources: [2026-08-22-landing-cinematic-single-cta.md, 2026-08-23-landing-footer-ios-inset-and-reel-recut.md, 2026-08-23-adrian-feedback-body-scroller-and-how-it-works.md]
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
transparent footer the footage runs behind. **Supersedes** [[Landing "Human-driven. AI-assisted." Redesign]] as the design this
branch will ship once merged — that page's light, two-door, six-section landing and its contact
form are deleted outright (~20 files), not hidden. It also **revives** the video-backdrop machinery
[[Landing Cinematic Video Redesign]] built and PR #293 had demoted to an opt-in flag: that flag
(`LANDING_VIDEO_BACKDROP_ENABLED`) is gone, and the video *is* the page again — see Known Issues on
that page for why "opt-in" and "deleted" are different postures, not the same idea revisited.

## One CTA, and the two secondary ways out (2026-08-23, from Adrian Vella's feedback)

The single-CTA premise survived contact with its first real critique, but it needed two additions
and neither is a fill — a second filled button would make the page two calls to action.

**"Already have an account? Log in"**, a plain underlined link directly under the pill. The note
that prompted it was *"as if you are already registered it becomes very relevant"*, and it is
correct: the header's Log in is small, top-right, and easy to miss on a page whose entire
composition pulls the eye to the centre. Underlined rather than colour-only — colour is never an
affordance by itself, and over moving footage it is the least reliable cue there is.

**The mint here is not the slogan's mint, and that is the durable point.**
`landing-mint-line-bright` (`#7BE3C0`) was chosen for text over video — but chosen for *large*
text at a 3.0:1 bar. This link is small text at 4.5:1. Measured across all sixteen encodes in the
link's own band (**0.603–0.635 of viewport**, read off the rendered page; scrim interpolates to
**0.672** there):

| colour | worst mean | worst p90 | clears 4.5:1? |
|---|---|---|---|
| white/90 (lead-in) | 7.26 | 5.27 | yes |
| `#7BE3C0` | 5.49 | **3.91** | **no** |
| `#B8ECDA` | 6.49 | **4.62** | yes |

So it uses `landing-mint-line` (`#B8ECDA`) — the token the design system calls "too pale against
skin/food tones on video". **That judgement is about headlines and inverts for small text**: paler
means more contrast against a bright frame. Both notes are now in `DESIGN_SYSTEM.md` so neither
gets "corrected" into the other. Same apparatus as the scrim sweep — brightest frame, mean and p90,
never the single brightest pixel.

**"How it works"**, a bordered pill in the footer beside the legal links. **It shipped as "Learn
more" and had to be renamed**: Lighthouse's `link-text` audit fails that string outright — it is
the canonical non-descriptive link text — which took the landing's SEO score to **0.92** against
the CI gate's **0.95**, on that one item. Name the destination rather than masking it with an
`aria-label`. The hard part was not the
button but the destination: this redesign **deleted** the six-section marketing page, so someone
who wanted to read before signing up had nowhere to go — `/pricing` answers what it costs, `/help`
is written as post-signup support. Rather than point at the nearest wrong thing, it points at a new
**`/how-it-works`**: how a campaign runs, who it is for, and what Donny does and does not do. Light,
on `PublicPageHeader`, the same shell as `/terms` and `/pricing`; the landing stays the one dark
public surface, and the register change is the same accepted seam as the signup screen.

**Auditing the new page found a defect on every page of the site.** The Lighthouse gate covers only
`/landing`. Run against `/how-it-works`, it returned 0.92 there too on a different item: **two
conflicting `<link rel="canonical">` tags**. `index.html` carried a hardcoded canonical pointing at
`/landing` and a hardcoded `og:url` of the bare origin; `SEO.tsx` emits the correct per-route
values, but Helmet **appends** rather than replacing a static tag it did not create. So every page
except `/landing` served two canonicals that disagreed — and conflicting canonicals are discarded,
not resolved. `/landing` passed only because it is the one page where the static value is right.
Both removed; `/how-it-works` now scores **100 accessibility / 100 best practices / 100 SEO** and
the landing keeps SEO 1.00. See [[Domain Migration .io → .com]], whose claim that `SITE_URL` drives
*every* canonical is corrected there. **A gate that tests one URL is evidence about one URL.**

Also fixed on the new page: `dc-pink-accent` (`#EC4899`) as text on white is **3.52:1** against the
4.5:1 small-text bar (four instances) → `dc-pink-accent-btn` (`#DB2777`, **4.60:1**). **Found and
deliberately not fixed:** the landing's own "Get started" pill is white on `#F43F7F` at **3.58:1**
at 18px — pre-existing (it is why Lighthouse scores the landing 96 on accessibility), and fixing it
means darkening the brand pink or changing the CTA's weight, which is a brand decision.

**A third note in the same message was a real bug, on every page rather than this one** — "the
screen jumps if I scroll up or down" on mobile. `AppShell` was `h-screen`, `body` is the document's
scroll container, and `100vh` overhangs it on iOS Safari. See
[[Mobile Viewport & Fixed Positioning]] §9, including why the review finding that predicted it was
wrongly refuted.

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
  itself — **and was overruled the next day by the founder**, who saw the shipped page and said the
  white band could not stay. The footer is now transparent with the video running behind it; the
  backdrop moved from `LandingHero` up to the page wrapper so the footage spans the full screen.
  Worth keeping as a lesson about the ruling, not the pixel: a controller ruling settled a conflict
  between two documents, and neither document was the authority that mattered. The spec said white
  because the spec's author (me) proposed white; the founder had approved a mockup, not a
  rendering. **A design decision inherited from a spec is still only as good as the eyes that have
  seen it on a screen.**
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

- **The `AppShell` `100vh` vs `100dvh` finding does not reproduce, and the "obvious" fix would have
  been a regression.** Codex round 4 reported that `AppShell`'s `<div className="flex h-screen">`
  (`100vh`) wrapping the landing's `min-h-[100dvh]` leaves "unused scrollable space below the
  footer" on mobile Safari, potentially exposing the shell background. The mechanism was
  simulated directly — shell pinned to `100vh`, wrapper to `100dvh`, at 60/100/140px of chrome on a
  390×844 viewport — and in every case `main.scrollHeight === main.clientHeight`, `main.scrollTop`
  refused to move, and the footer's bottom landed exactly at the visible edge. **A container taller
  than its content produces no overflow; "unused space" is not "scrollable space."** The dead region
  between `100dvh` and `100vh` sits *under* Safari's toolbar, where it is not visible, and it is
  `body`'s white beneath what was, at the time of that measurement, an already-white footer (the
  footer has since been made transparent, which changes what the band would look like on mobile
  Safari but not whether it is reachable — it still is not). The probe was controlled — forcing the wrapper to
  2000px produced 1432px of overflow and genuine scrolling on the same instruments — so the zeroes
  are measurements, not a broken check. Headroom before any scroll is possible: natural content
  height is 372px at 390px wide and 465px at 320px wide, against a 568px shell on the smallest
  phone still in use. **And the one-word fix would have been worse than the defect:**
  `DashboardLayout` is `min-h-screen` (`100vh`) *inside* that container, so shrinking the shell to
  `100dvh` would make every short dashboard page newly scrollable on mobile Safari — trading a
  non-issue on one page for a real one across the authenticated app. The portable lesson is the one
  this project keeps relearning from the other direction ([[Mobile Viewport & Fixed Positioning]]):
  a reviewer's mechanism can be plausible, internally consistent, and still false — and the only
  instrument that settles it is execution, not agreement.

  **Addendum, same day — the finding was wrong about the browser and right about the family.** A
  cross-surface pass on the real iOS shell (iPhone 17 Pro simulator, not an emulated viewport)
  found a genuine "viewport unit is taller than the document box" bug — just not the one Codex
  described, on a surface Codex never mentioned. `capacitor.config.ts` had `ios.contentInset:
  'always'`, under which WebKit shrinks `documentElement.clientHeight` by the top safe-area inset
  while `innerHeight` / `100vh` / `100dvh` all keep reporting the full height: measured 840 vs
  **778**, with `safe-area-inset-top` 62 (778 = 840 − 62). Content sized to `100dvh` therefore
  overhung the document box and the webview's **white** background showed through beneath it,
  clipping the footer's legal links. Fixed by `contentInset: 'never'` — the app already pays back
  `env(safe-area-*)` in CSS everywhere, so insetting natively as well was two mechanisms solving
  one problem and disagreeing on the answer. Afterwards all four numbers agree at 874.
  **Two things worth keeping.** First, the bug had been live for every page in the app (`AppShell`
  is `h-screen`) and was invisible purely because every other surface is white — *a defect hidden
  by a coincidence of palette is still a defect, and changing the palette is what surfaced it*.
  Second, and more uncomfortable: I refuted Codex's finding on mobile Safari, correctly and with
  measurements, and then treated the whole class as closed. It was not. **Refuting a claim on the
  surface where it was raised does not refute it on the surfaces where it was never tested.**

- **Cosmetic, ≤320px only:** the `Eyebrow` marker (an 8×8 `bg-current` square) orphans to the far
  left when the eyebrow text wraps to two lines. Single-line and correctly inline at 390px and
  above. Unfixed on purpose — `Eyebrow` is shared with the auth and onboarding surfaces, so it is
  its own small change, not a drive-by in a landing branch.

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
