# Session: landing page rebuilt as one dark, video-led screen with a single CTA

**Branch:** `feat/landing-cinematic-single-cta` — **UNMERGED**. Blocked on written permission from
the two restaurants whose footage the reels use (ABB, Uncle Rocco); the build is finished, go-live
is not. Nothing in this session or its output should be read as "live" — dragoncandy.io still
serves the light, two-door "Human-driven. AI-assisted." landing (PR #293) until this merges.

**Commits (16, `main..HEAD`):**
`d45cd859` design · `2454975e` plan · `05183f1f` docs fix · `24b31e14` `landing-mint-line-bright`
token · `2fbef1b3` curated reel registry · `21caeaf8` fix trim to 12s cap · `efb4b4b6` orientation
encode selection · `f7952209` single-screen hero · `3f53fe7c` fix orientation resume ·
`9c838050` real reel assets replace AI footage · `c5a7422e` one-screen page · `2e5256a3` delete six
sections + flag · `40d525c3` docs correction (DESIGN_SYSTEM.md, runbook) · `73948f0f` final-review
fix wave · `c0b78766` watchdog arm-on-playing fix.

## What shipped

The public landing collapsed from six scrollable sections (hero, "See it work", How it works, Pick
your lane, Proof, Start free) plus a contact form to **one screen**: a fixed header (logo only), a
full-bleed video hero (ten real restaurant reels rotating behind an eyebrow, a slogan, and one
"Get started" button), and a thin footer (legal-entity line + Terms/Privacy/Help). No scroll, no
role doors, no contact form.

**~20 files of dead code deleted**, not merely unused: `DonnySection`, `FinalCTASection`,
`HeroDoors`, `HeroSection` (replaced by `LandingHero`), `HowItWorks`, `PositioningBand`, `Reveal`,
`ValuesSection`, `VideoSlot`/`MediaSlot` (superseded by `RotatingBackdrop` rendering directly),
`heroRole.ts` (no more per-role hero — the role question moved into signup), and
`useLandingBackdropPlaylist` (the DragonFeed dynamic-clip merge — the backdrop is curated-only now,
no user-upload mixing). `pendingBrief.ts`/`.test.ts` went in the final-review wave once its only
producer (the deleted brief flow) was gone — a consumer left with no producer.

The net diff is 129 files, +2353/−3894.

## Key decisions

**1. The role question moved, it wasn't rebuilt.** The old hero had a role switcher
(`Business · Creator · Brand`) baked into the landing itself. The new hero has one CTA pointing at
`/auth?mode=signup`, and `AuthPage` already has a `role-selection` step for a missing `?role=` —
built for a different reason, reused here with zero new code. Deleting the two doors just moved the
question one screen later, into a screen already built to ask it.

**2. Two encodes per reel, chosen by viewport orientation — proven live on both surfaces, not
just coded.** Source footage is 720×1280 portrait phone reels (ABB + Uncle Rocco, ten clips,
alternating so five in a row never reads as one restaurant's showreel). Desktop gets a per-clip
16:9 crop (`crop=720:405:0:$Y`, rounds to 720×404 under mandatory `yuv420p`); phones get the
uncropped as-shot file. **The crop window (`$Y`, ranging 300–650 across the ten clips) was chosen
by watching each clip**, not a blind centre crop (`y=437`) — food framed low in the source wants
`y≈550`, a face or sign held high wants `y≈300`; a centre crop routinely puts ceiling or tablecloth
on screen instead of the food. `resolveReelSource(clip, isLandscape)` picks `wide`/`widePoster` in
landscape, falling back to portrait when a clip has no wide encode. Verified in the browser, not
assumed from the code: desktop served the `-wide` encodes; a 390×844 emulated device served the
portrait ones.

**3. Every reel trimmed to a 12-second cap — and the reasoning behind that cap had a bug, caught
by the mandatory second reviewer.** `RotatingBackdrop`'s `MAX_DWELL_MS` (15s) force-advances any
clip that neither fires `ended` nor `error`, as a stall backstop against an undecodable-but-silent
codec or a mid-play network stall. The 12s cap exists so a healthy clip never brushes that 15s
ceiling. **That reasoning covered clip DURATION but not STARTUP LATENCY.** The original wiring
armed the watchdog the instant a layer became *active* (told to play), not when it actually started
playing — against a 12s clip, only ~3s of margin sits between "active" and "12s of playback", which
slow-connection buffering can exceed, force-advancing a clip that was still healthy, just slow to
start. **Codex flagged this as a P2.** The fix keeps arming on layer-active (the backstop for a
clip that never starts at all) and *additionally* resets the timer on the layer's `playing` event,
so a slow-starting clip gets its full 15s dwell from real playback start, while a clip that truly
never starts still times out on the original schedule. **The naive fix — moving the arming to
`playing` alone — would have converted a bounded stall into a permanent freeze**, because a clip
that never fires `playing` would then never arm a timer at all. This is the single most transferable
lesson on the branch: a mitigation's timing assumption (here, "3s of margin is enough") needs
re-checking every time an input it depends on (clip length) changes, and a fix that only patches the
common case can be worse than the bug it replaces.

Separately, one clip (`uncle-rocco-new-menu`) was originally encoded believing it already met the
12s cap; its actual duration was 12.066s, silently over. Caught by `ffprobe`-checking every output
rather than trusting the encode command, re-cut with an explicit `-t 12` (commit `21caeaf8`).

**4. The feature flag was DELETED, not flipped off-by-default.** `LANDING_VIDEO_BACKDROP_ENABLED`
existed because the previous redesign (PR #293) made video opt-in — an "off" state there just meant
"no video, plain hero," a real fallback. On this branch the video backdrop **is** the page; an
"off" state would ship a blank homepage, which is not a kill switch, it's an outage. The real
fallback for no-clips / a failed clip / `prefers-reduced-motion` is `RotatingBackdrop`'s own
poster-still path — verified by observation, not just by reading the code: with reduced motion
forced, zero `<video>` elements mounted and the network log showed no media requests, only the
poster images.

**5. A whole-branch review (post per-task reviews) caught defects no single task's review could
see, because each was a mismatch BETWEEN files, not a bug within one.** Applied together in the
final-review commit (`73948f0f`):
   - **The page scrolled**, despite being designed as one screen. Four causes stacked: the header
     was `sticky` inside a page that also had a `min-h-screen` wrapper (the exact `100vh` unit the
     design system forbids — see `DESIGN_SYSTEM.md`'s bottom-anchored-UI rule), plus the hero used
     `min-h-[100dvh]` *in addition to* that wrapper, so total layout height could exceed the
     viewport. Fixed by an absolute header + `flex-1` hero + `shrink-0` footer, replacing the
     min-h-screen/sticky/min-h-[100dvh] combination.
   - **Cold-load white flash.** Two places paint before the now-dark landing renders — `App.tsx`'s
     Suspense fallback and `index.html`'s prerendered splash — and both were still hard-coded
     `bg-white`/`#FFFFFF` from when the landing was light. Fixed: Suspense fallback flipped to
     `bg-landing-grape`; the inline splash script in `index.html` now flips the splash dark
     specifically on the three landing routes (`/`, `/home`, `/landing`), leaving the splash light
     everywhere else (auth/onboarding are still light and unaffected).
   - **A spec-vs-plan conflict that only a whole-branch read could catch.** The design spec said
     "thin white footer"; the plan said keep `bg-landing-grape`. Both were talking about different
     elements — the spec meant the footer bar itself, the plan meant the page wrapper behind it —
     but a per-task implementer reading only one document at a time could easily have picked either
     without noticing the other document said something different about a different scope. Spec won
     (the footer is white, one row, no logo/tagline, legal-entity line + Terms/Privacy/Help).
   - A new `RotatingBackdrop.test.tsx` case was added to cover the previously-untested two-layer
     orientation-change path (rotation index survives a live orientation flip) — this had shipped
     as working code with no test proving it.

**6. `generate-anonymous-brief` is now orphaned, and was deliberately left deployed rather than
undeployed.** Its only caller, the landing's "see it work" brief-preview flow, was deleted along
with the six sections. The function still spends real Anthropic tokens per call if reached directly
(it has no caller-side gate now that the caller is gone, though nothing links to it). Recorded as a
cost-visibility follow-up in the spec rather than fixed here — undeploying is a separate decision
from a landing rebuild, and the function costs nothing when nobody calls it.

## Not verified — recorded explicitly, do not imply otherwise

**The brightest-frame contrast check (spec §7) has NOT been run.** The spec requires verifying the
slogan's contrast against the brightest frame of the brightest clip, not an average frame — footage
brightness varies enough that an average-frame check could pass while a genuinely bright moment
(a lit dish, a bright kitchen) washes out the text. This check was specified but never executed in
this session. Anyone treating contrast as settled on this branch is overclaiming; it needs a manual
pass across all ten clips (or their brightest frames) before this can be called accessibility-clean
on that axis.

**Footage permission is not obtained.** ABB's and Uncle Rocco's footage is used under the assumption
work-in-progress use is fine; written permission for public, live use has not been secured. This
gates the merge, not the build — the branch is finished and unmerged specifically because of this.

## Affected files (non-exhaustive, see `git diff --stat main..HEAD` for the full 129)

- `src/pages/LandingPage.tsx` — now 58 lines (was ~124): `Header` + `LandingHero` + footer, no
  section list.
- `src/components/landing/LandingHero.tsx` (new, replaces `HeroSection.tsx`) — the single-screen
  hero: eyebrow, slogan (`landing-mint-line-bright` for "Creators", `landing-pink-line` for
  "Restaurants"), one CTA, `RotatingBackdrop` full-bleed behind it.
- `src/components/landing/landingClips.ts` — rewritten: `LANDING_REELS` (10-entry curated registry,
  `LandingReel { src, poster, wide?, widePoster? }`) + `resolveReelSource(clip, isLandscape)`. The
  old semantic-key (`hero.business`) / `resolveLandingClip` / dynamic-merge API is gone — no more
  per-role keys, no more DragonFeed dynamic-clip mixing.
- `src/components/landing/RotatingBackdrop.tsx` — orientation-aware source resolution
  (`useIsLandscape`, new hook) + the watchdog arm-on-playing fix (commit `c0b78766`).
- `src/components/landing/useIsLandscape.ts` (new) — viewport-orientation hook driving the
  encode-selection decision.
- `src/lib/featureConfig.ts` — `LANDING_VIDEO_BACKDROP_ENABLED` deleted.
- `src/lib/pendingBrief.ts`/`.test.ts` — deleted (orphaned producer).
- `src/components/onboarding/OnboardingWizard.tsx` — its `pendingBrief` call site removed.
- `index.html`, `src/App.tsx` — dark cold-load fix (splash + Suspense fallback).
- `tailwind.config.ts` — new `landing-mint-line-bright` (`#7BE3C0`) token: the brand-fill mint
  (`#2FC796`) vanishes against a lit dish or bright frame, and the existing `mint-line`
  (`#B8ECDA`) reads too pale against food/skin tones on moving video, so a third step was added
  specifically for text-over-video legibility.
- `vercel.json` — cache-control rule added for `/landing/reels/` (Vercel does not read
  `public/_headers`, so caching had to be declared in `vercel.json` directly).
- `docs/DESIGN_SYSTEM.md`, `docs/runbooks/landing-video-backdrop-kit.md` — corrected in-branch
  (commit `40d525c3`) to describe the dark, video-led landing instead of the light two-door one;
  already reflects this session's ship, not something this knowledge-sync needs to redo.
- `public/landing/reels/*` — 40 files (10 clips × 4: portrait mp4/poster, wide mp4/poster), ~38MB
  total, sourced from a founder-shared Google Drive folder not reachable via the Drive MCP
  connection (had to be pulled through the browser).

## Spec and plan

`docs/superpowers/specs/2026-08-22-landing-page-cinematic-single-cta-design.md` (design, 350 lines)
and `docs/superpowers/specs/2026-08-22-landing-cinematic-single-cta.md` (plan, 937 lines, ten tasks,
each leaving the tree green — the old and new hero coexisted until one task switched
`LandingPage.tsx` over, and deletion of the old sections happened last).
