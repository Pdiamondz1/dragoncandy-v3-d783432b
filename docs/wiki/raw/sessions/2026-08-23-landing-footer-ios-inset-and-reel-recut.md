# 2026-08-23 — The white band, the one iOS was hiding, and five reels that were talking over the slogan

Branch: `feat/landing-cinematic-single-cta` (PR #459, still UNMERGED — blocked on written footage
permission from ABB and Uncle Rocco). Follows the 2026-08-22 landing rebuild.

## What prompted it

Three separate asks, in order:

1. Merge conflict cleanup after `main` moved ahead by four commits (#455–#458).
2. "Make sure the landing page is clean on mobile webapp, desktop webapp, and iOS app."
3. "Fix the whitespace at the bottom of the landing page where the privacy and legal DragonCandy
   info is. It cannot be a whitespace there."

## The Codex finding I refuted, and then only half-refuted

The PR carried an open Codex round-4 finding: `AppShell` is `flex h-screen` (`100vh`) while the
landing is `min-h-[100dvh]`, so on mobile Safari the difference becomes "unused scrollable space
below the footer." I had recommended a one-word fix (`h-screen` → `h-[100dvh]`) and the founder
approved it.

**I tested it instead of applying it, and it does not reproduce on mobile Safari.** Simulated the
mechanism directly in the browser — shell pinned to `100vh`, wrapper to `100dvh`, at 60/100/140px
of chrome on 390×844. In every case `main.scrollHeight === main.clientHeight`, `main.scrollTop`
refused to move, and the footer's bottom landed exactly at the visible edge. **A container taller
than its content produces no overflow; "unused space" is not "scrollable space."** The probe was
controlled: forcing the wrapper to 2000px produced 1432px of overflow and real scrolling on the
same instruments, so the zeroes were measurements rather than a broken check. Headroom before any
scroll is possible: natural content height 372px at 390px wide, 465px at 320px wide, against a
568px shell on the smallest phone still in use.

The proposed fix would also have been a regression: `DashboardLayout` is `min-h-screen` (`100vh`)
*inside* that container, so shrinking the shell to `100dvh` would have made every short dashboard
page newly scrollable on mobile Safari — trading a non-issue on one page for a real one across the
authenticated app.

**Then the same family of bug turned out to be real on the surface neither of us had tested.** See
below. The durable lesson: *refuting a claim on the surface where it was raised does not refute it
on the surfaces where it was never tested.*

## The footer, and the second white band

The founder saw the shipped page and said the white band at the bottom could not stay. The footer
was `bg-white` with a top border. Changed to fully transparent — no background, no border — and
`RotatingBackdrop` moved from inside `LandingHero` up to the page wrapper so the footage runs edge
to edge behind it. `LandingHero` now paints no background at all.

Legibility measured, not assumed: against the brightest frame in the footer's band across all
twenty encodes, worst case **7.42:1** for `text-white/70` over the scrim's heaviest stop
(`to-landing-grape/95`), against 4.5:1 for normal text. Several reels hit literal pure white in
that band and still cleared it.

**Removing the white footer exposed a second white band, on iOS only, that had been there all
along.** It was clipping the footer's Terms / Privacy / Help links. Measured from inside the real
WKWebView (iPhone 17 Pro simulator, diagnostic injected into the installed app bundle):

```
innerHeight = 840     documentElement.clientHeight = 778
safe-area-inset-top = 62      778 = 840 - 62 exactly
```

`capacitor.config.ts` had `ios.contentInset: 'always'`, under which WebKit shrinks
`documentElement.clientHeight` by the top safe-area inset while `innerHeight`, `100vh` and `100dvh`
all keep reporting the full height. Anything sized to a viewport unit therefore overhangs the
document box — ~96pt here — and the webview's own white background shows through.

Fixed with `contentInset: 'never'`. The app already pays back `env(safe-area-*)` in CSS on every
surface that needs it, so insetting natively as well was two mechanisms solving one problem and
disagreeing about the answer. Afterwards all four numbers agree at 874, the insets still report
62/34 so existing CSS padding is unaffected, and the light `/terms` page renders unchanged.

**The bug was live for every page in the app** — `AppShell` is `h-screen` — and invisible only
because every other surface is white. Changing the palette is what surfaced it. Not reproducible
in any browser or emulator.

## Five reels were talking over the slogan

A cross-surface sweep sampled every reel four times into a contact sheet. **Five of ten carried
burned-in text** from their original social posts. A reel that carries its own text cannot sit
behind the slogan — the viewer reads two headlines and believes neither.

Found this way rather than by watching: captions come and go in under a second and the eye forgives
them in motion in a way it does not when they are frozen behind a headline.

| reel | text | outcome |
|---|---|---|
| `abb-flatbread` | hard subtitles nearly throughout | trimmed to 26.8s +4.4s (fire → pizza) |
| `uncle-rocco-new-menu` | stitched-in meme over the first 3.4s | trimmed to 3.6s +8.5s |
| `uncle-rocco-steak-frites` | "Steak Frites" card at 12.0–12.8s | trimmed to 0.5s +11.5s |
| `uncle-rocco-brunch` | "What I mean by: 'Wanna grab brunch?'" — whole clip | **dropped** |
| `uncle-rocco-pancakes` | "This and an iced latte." — whole clip | **dropped** |

Library goes to eight reels, 5 ABB / 3 Uncle Rocco, so perfect alternation is impossible; the new
order holds only the two adjacencies the split forces and a test pins it.

## Size, and two wrong predictions of mine

Re-encoded at `crf 30`. Library 36 MB → **16.0 MB** actual bytes; the iOS binary, which bundles
`dist`, goes **54 MB → 39 MB** (the reels had been two thirds of the app).

Two things I predicted wrong and corrected in the runbook:

- **CRF moved much less than expected** — only **−31%** at crf 30 on this footage, not the halving
  a two-stop jump suggests, because fire, steam and food close-ups are expensive to encode.
  **Cutting runtime did more than the codec did**: dropping two reels and trimming three cut total
  runtime 27%.
- **`du -sh` over-states this directory badly** — 21 MB reported against 16.0 MB of actual file
  bytes, because it counts allocated blocks across 32 files. Sum the bytes.

crf 30 was accepted by A/B-ing a coal-oven fire frame (the hardest content) against crf 24 at
display size: indistinguishable, and that is before the scrim covers 60% of it.

## The trap in re-cutting: trimming is a contrast change

Re-cutting changed *which frames exist*, and the new windows are brighter — a coal-oven fire, an
outdoor daylight street. Re-running the contrast check caught the pink and mint accent words at
**1.88:1** and **1.90:1** across the brightest tenth of the band behind them, against the 3.0:1
large text requires.

Scrim middle stop raised 40% → **60%**, the lowest value clearing 3.0 on **both** the brightest
frame's mean and that frame's 90th percentile:

| scrim | mean: white / pink / mint | p90: white / pink / mint |
|---|---|---|
| 0.40 | 4.70 / 3.01 / 3.04 | 2.94 / 1.88 / 1.90 |
| 0.50 | 5.87 / 3.76 / 3.80 | 3.87 / 2.48 / 2.50 |
| 0.55 | 6.58 / 4.21 / 4.26 | 4.47 / 2.86 / 2.89 |
| 0.60 | 7.39 / 4.73 / 4.78 | 5.20 / 3.33 / 3.36 |

**Trimming a clip is a contrast change, not just a length change.**

A note on instruments: the first pass at this measurement used the single brightest *pixel* in the
band, which reported every clip failing at ~2.5:1 and was too pessimistic to judge text legibility
— a lone specular highlight is not the background behind the glyphs. Mean and p90 of the brightest
frame are the defensible pair.

## Also fixed

- Merge conflicts with `main` (#455–#458) at the `SHIPPED_LOG.md` / `docs/wiki/log.md` prepend
  points — both files are strictly reverse-chronological, so both resolutions were orderings, not
  rewrites.
- Two `docs/wiki/index.md` entries claimed the spec §7 brightest-frame contrast check "has not been
  run". It had been, during the final whole-branch review, after those entries were written; the
  concept page had it right the whole time.

## Left for the founder

- **Written footage permission from ABB and Uncle Rocco.** The only merge blocker.
- **`uncle-rocco-reopening` contains no food** — storefront and staff only. Already known; now
  more visible with the Uncle Rocco set down to three reels, only one of which is food-forward.
- **Cosmetic, ≤320px only:** the `Eyebrow` marker (an 8×8 `bg-current` square) orphans to the far
  left when the eyebrow text wraps to two lines. Correct at 390px and above. Unfixed because
  `Eyebrow` is shared with the auth and onboarding surfaces.
- **`index.html` uses the deprecated `apple-mobile-web-app-capable`** without the modern
  `mobile-web-app-capable` alongside it; Chrome warns on every load.

## Gotchas worth carrying

- **`npx cap sync ios` run from a git worktree rewrites `ios/App/Podfile`** to worktree-relative
  paths (`../../../../../node_modules`). Never commit that — it breaks the build from the main
  checkout. Revert with `git checkout -- ios/App/Podfile ios/App/Podfile.lock` after any sync.
- **A defect hidden by a coincidence of palette is still a defect.** The iOS white band was
  invisible for as long as every surface above it was also white.
