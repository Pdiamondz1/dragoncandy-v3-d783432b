---
title: iOS App Icon & Launch Image
type: concept
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-ios-app-icon-and-launch-image.md]
tags: [ios, capacitor, design-system, brand, tooling, regression-guards]
---
# iOS App Icon & Launch Image

The two native assets the iPhone app ships — `AppIcon.appiconset` and `Splash.imageset` — and
`npm run cap:assets`, which regenerates both from artwork already in the repo and then asserts
the result. Web-side mark sizing is a different subject and lives in [[Brand Logo Sizing]]; how
the app got onto hardware at all is [[iOS TestFlight First Build]].

## Neither asset's colour is a taste decision

Both are derived from something checkable, which is what makes them defensible a year later.

**The icon background is `#F7F9F7`, off-white.** Not because it helps the artwork read — it does
not. The dragon's pale interior panels are `#C9FCAF`, which measures **1.14:1** against this
off-white and **1.17:1** against pure white. That difference is nothing. Off-white earns its place
by giving the icon a **boundary** on a light home screen and in Settings lists, where a pure-white
icon has no edge at all. Do not "restore" pure white on the theory that the off-white was a
contrast fix; it never was.

**The splash background is `#241332`, and it is copied from the web shell.**
`LaunchScreen.storyboard` fills the screen with the splash image, then the WebView paints
`index.html`'s prerendered shell, whose inline script sets `#241332` whenever `location.pathname`
is `/`, `/home` or `/landing`. Capacitor loads `capacitor://localhost/`, so it is **always** `/`
at first paint. Grape is what appears next; a grape splash hands off invisibly. The intuitive
choice — matching the splash to the new off-white app icon — would flash white → grape on every
launch.

This is also why the splash needs **no dark-mode variant**: the shell paints grape regardless of
appearance.

## The eye is a hole, not paint

The founder reported the dragon's eye as black and asked for it to be white. There were no black
pixels to edit. The eye and nostril are **holes in the source's alpha channel**, so they render in
whatever sits behind them — the `#1A1A2A` on screen was the old navy background showing through.
Change the background and the eye follows.

Measured over a 140×140 rect at the eye:

| | Old (navy) | New (off-white) |
|---|---|---|
| near-black pixels (lum < 0.10) | **224** | **0** |
| darkest opaque pixel | `#1A1A2A` (= `dc-dark`) | `#006943` (the dragon's own shadow) |

The generator asserts that count stays at zero, which pins the **reported defect** rather than a
proxy for it.

## Rebuild from the transparent source; never recolour the composed icon

`public/icons/icon-512.png` is the same dragon on transparent. The navy 1024 has its dragon edges
anti-aliased **against navy**, so any background swap applied to that file leaves a dark fringe on
every edge.

The two share a composition exactly — both `0.6699 × 0.9727` of their canvas, identical fractional
insets to four decimal places — which is strong evidence the navy 1024 was itself generated from
the same 512 art. So the 2× upscale costs no detail the old icon had.

## `scaleAspectFill` is what makes the splash geometry non-obvious

`LaunchScreen.storyboard` is one `imageView` with `contentMode="scaleAspectFill"`. Two consequences
that no amount of looking at the 2732 square will reveal:

**One point is 3.207 image pixels.** A square image in a 393×852pt iPhone renders at **852×852pt**,
so the scale factor is `2732/852`. The web shell draws the logo at 132pt, so the splash logo must
be `132 × 3.207` = **423px** to land at the same on-screen size. Verified at `0.1548` of the canvas
= **131.9pt** against the shell's 132.

**Only the central 46% of the width is visible in portrait.** `393/852` = 1260px of 2732. Anything
wider is cropped off on a phone — so the logo cannot simply be made bigger, and the generator
asserts it fits.

Both numbers change if the storyboard's content mode changes. They are properties of the
storyboard, not of the image.

## The generator, and the honest limit of its assertions

`npm run cap:assets` → `scripts/build-app-assets.mjs` (policy: constants, derivations, assertions)
over `scripts/lib/app-assets.swift` (pixels only: compose, and report a PNG's contents as JSON).

It composes from artwork **already in the repo**, so neither mark has a second copy under an
`assets/` folder that drifts. Swift/CoreGraphics rather than `@capacitor/assets` or Node+sharp
because compositing needs an image library and every cross-platform option costs a dependency;
macOS-only is free, since iOS assets can only be built on macOS. Deliberately **not** in CI, which
runs Linux.

**The limit worth knowing before trusting a green run:** most checks compare the output against the
same constants used to build it, so they catch a broken build or a bad copy, **never a wrong
constant**. Only two are genuinely independent — the `index.html` guard and the portrait-band
check. Both were forced to fail before being trusted.

## A guard that matches a hex instead of an assignment enforces nothing

The splash colour is coupled to `index.html`, and nothing on the iOS side references it — the
generator reads that file and refuses to run on a mismatch, which is what makes the coupling
survivable.

The first version checked `indexHtml.includes("#241332")`. **That hex appears twice**: in the real
`splash.style.background` assignment, and in an explanatory HTML comment ten lines above. Repoint
the shell and leave the comment stale — the likeliest way it would actually happen — and the check
passes while the generator builds a splash that flashes. `DESIGN_SYSTEM.md` had already been
written claiming the guard held that invariant. Caught by the mandatory Codex second review as a
P2 — the gate earning its place, since eight rounds of my own checking had not seen it.

It now matches the **assignment** and compares the captured value, and fails **closed** if the
assignment is renamed or moved into a variable.

Generalises past this file: **a guard that greps for a value will match the value's own
documentation.** Match the thing that *does* the work — the assignment, the call site, the export —
not a string that also appears where the behaviour is merely described. Sibling of the
[[Account Completeness Engine]]'s rule that a pin holding a value nothing reads is worse than no
pin because it looks green.

## Two claims corrected mid-session, both by measuring

**A predicted regression that did not happen.** The contrast maths said the dragon would become "a
green line drawing" on off-white. It does not — the body mint stays clearly solid, because the
shape is fully enclosed by a `#1D9E63` outline at **3.43:1** and the maths compared two flat
colours while ignoring the enclosure. Withdrawn after looking at the render.

**A file-size alarm that was a measurement artifact.** The assets grew ~1.4MB, so a dithered fill
was suspected; a 400×400 crop of flat background came back **236KB**, which looked like proof.
It was a `sips` re-encode artifact — measured directly, the region holds **exactly 1 distinct
colour**. The growth is legitimate lossless PNG cost for the logo's gradients. Recorded, not fixed:
no optimizer is installed and adding one would undo the zero-dependency decision. Same family as
[[Mobile Viewport & Fixed Positioning]]'s rule that a probe returning a number must be shown
capable of returning a different one.

## Verified on hardware (2026-08-26)

Both assets were confirmed by the founder on a physical **iPhone 15 Pro Max**: the launch image
renders the brand mark on grape, and the home-screen icon renders the dragon on off-white with a
light eye. This closes the two questions that no amount of local measurement could answer — the
icon's legibility at real size on a light home screen, and that the splash asset is the one
actually installed.

**The splash→shell handoff is confirmed seamless** — *"no flash, it went straight to the app."*
This was asked for as a separate observation rather than folded into "the splash looks right", and
it is the one that actually validates both derivations. The launch image is a PNG drawn by
`LaunchScreen.storyboard`; the screen that replaces it is HTML drawn by `index.html`'s prerendered
shell. Two unrelated technologies painting what has to look like one picture. A wrong `SPLASH_BG`
shows up here as a colour flash, and a wrong logo width as the mark jumping size — **nowhere else**,
which is why a correct-looking screenshot could never have settled it.

If a flash ever does appear, the cause is `SPLASH_BG` disagreeing with what the shell paints, and
the generator's `index.html` guard is what should have caught it before the build.

**Getting it onto the device was the hard part, and it was not a build problem.** See "Three copies
on disk" below.

## Three copies of this project exist on disk, and Xcode cannot tell them apart

The founder rebuilt, reinstalled and deleted the app repeatedly while still seeing the old icon.
None of that could have worked: Xcode's DerivedData recorded that the build came from
`.claude/worktrees/DC-apple-IOS/`, a **different worktree**, whose `AppIcon-512@2x.png` hashes
`6664f0ad…` — byte-identical to the old navy icon. The changes live in
`.claude/worktrees/xcode-app/` (`198e948d…`).

Two lessons worth more than the CSS:

- **"The app didn't update" is a path question before it is a caching question.** The icon cache is
  real but it is the *second* hypothesis. `plutil -extract WorkspacePath raw
  ~/Library/Developer/Xcode/DerivedData/<App-*>/info.plist` answers the first one in one command,
  and hashing the asset in the built-from directory settles it beyond argument.
- **Every worktree's workspace is called `App.xcworkspace`**, so Xcode's Recents list shows several
  identical entries. Open it by absolute path (`open <path>/ios/App/App.xcworkspace`) rather than
  choosing from Recents, and confirm with **File → Show in Finder** before building.

Related: the app then built and launched on the **Simulator** while the founder waited for it on
the phone — the run destination defaults to a simulator, and `xcrun devicectl list devices`
confirming `available (paired)` is how you tell a destination mistake from a pairing problem.

## Known Issues
- **Assets add ~1.4MB** to a binary this project had worked down 54MB → 39MB (icon 294KB → 557KB;
  splash 41KB → 411KB, ×3, since Capacitor registers one image at 1×/2×/3×).
- **ESLint does not lint `scripts/**/*.mjs`.** `scripts/` is not ignored, but the rule block matches
  `**/*.{ts,tsx}`, so the file is unmatched and skipped — `npx eslint <file>` exiting 0 is not
  evidence it is clean.
- **On iPad the splash logo renders relatively smaller** (different aspect-fill maths). Normal for
  a single splash asset, not a defect.

## See Also

- [[Brand Logo Sizing]] — the same mark's size in **web** chrome, and why a guard watching the pair
  you already fixed cannot see the ones you did not
- [[iOS TestFlight First Build]] — getting the app onto hardware; the safe-area defect that only a
  real WKWebView could show
- [[Mobile Viewport & Fixed Positioning]] — `dvh`, safe areas, and the "prove the probe could have
  returned non-zero" rule
