# Session — the app icon's black eye was the background showing through a hole (2026-08-26)

Branch `worktree-xcode-app`, PR #532. Two native iOS assets and the tooling to regenerate them.

## What was reported

One word, then a screenshot of the home screen: *"logo"*. Clarified to **"we need to change the
app logo from black background to white"**, and a follow-up mid-session: **"the black color in the
eyes of the Donny icon needs to be white too"**.

## What the repo actually had

- **App icon**: a green pixel dragon on `#1A1A2A` navy. Not the brand mark (`public/logo.webp` is
  the pink DRAGON CANDY wordmark over a mint circle), but deliberate — not a Capacitor default.
- **Splash**: all three `splash-2732x2732*.png` were the **stock Capacitor placeholder**, a blue X
  on white. The app had been launching under another company's logo the whole time. Nobody had
  reported it, because nobody looks at a splash for more than 400ms.
- No `assets/` source folder, `@capacitor/assets` not installed, `node_modules` not installed in
  the worktree at all.

## The eye needed no artwork change

The eye is a **hole in the source's alpha channel**. The `#1A1A2A` it was showing was the navy
background behind it, not paint. Change the background and the eye follows — there was nothing to
recolour, and a session that went looking for "the black pixels in the eye" to edit would have
found none.

Measured over a 140x140 rect at the eye, before and after:

| | Old | New |
|---|---|---|
| near-black pixels (lum < 0.10) | **224** | **0** |
| darkest opaque pixel | `#1A1A2A` (= `dc-dark`) | `#006943` (the dragon's own shadow) |

## Rebuilt from the transparent source, not recoloured

`public/icons/icon-512.png` is the same dragon with a transparent background. Used that rather
than recolouring the navy 1024, whose dragon edges are anti-aliased **against navy** — any
background swap on that file leaves a dark fringe around every edge.

The two turned out to share a composition **exactly**: both `0.6699 x 0.9727` of their canvas,
identical fractional insets to four decimal places. That is strong evidence the navy 1024 was
itself generated from this same 512 art, which is also why the 2x upscale costs no detail the old
icon had. Compared eye crops from both at 160x160: comparable sharpness.

## Off-white, and an honest correction about why

Shipped `#F7F9F7`. The reasoning given first was **wrong and was corrected to the founder before
they chose**: off-white does *not* rescue the dragon's pale interior panels. `#C9FCAF` measures
**1.14:1** against `#F7F9F7` versus **1.17:1** against pure white — no meaningful difference. What
off-white actually buys is an **icon boundary** on a light home screen and in Settings lists,
where a pure-white icon has no edge at all.

A second prediction was also too pessimistic and was withdrawn after looking at the render: the
dragon does *not* become "a green line drawing". Its main body mint stays clearly solid; only the
palest belly scales lighten. The contrast maths described a worse outcome than the eye sees,
because it compares two flat colours and ignores that the shape is fully enclosed by a `#1D9E63`
outline at **3.43:1**.

## A suspicion that was checked and turned out to be nothing

The source carries **102 fully-opaque pure-black pixels**. On navy they were invisible; the fear
was that they would become visible specks on off-white. Mapped all 64 clusters: every one sits
**inside the dragon's own dark-green outline**, not on open background. Zoomed and confirmed. Non
-issue — but only because it was checked rather than assumed either way.

## The splash colour is derived from what paints next, not chosen

`LaunchScreen.storyboard` is a single `imageView` with `contentMode="scaleAspectFill"` filling the
screen. Then the WebView paints `index.html`'s prerendered shell, whose inline script sets the
background to `#241332` whenever `location.pathname` is `/`, `/home` or `/landing`. Capacitor
loads `capacitor://localhost/`, so it is **always** `/` at first paint.

So grape is what appears next, and a grape splash hands off invisibly. An off-white splash
matching the new app icon — the intuitive choice, and the one nearly taken — would flash
white -> grape on every launch.

## The splash logo width is derived too

`scaleAspectFill` on a square image in a 393x852pt iPhone renders it **852x852pt**, so one point
is `2732/852` = **3.207 image px**. The web shell draws the logo at **132pt**. Therefore
`132 x 3.207` = **423px** in the 2732 canvas puts the native logo at the identical on-screen size
as the shell's.

Verified after the fact: the logo occupies `0.1548` of the canvas width = `0.1548 x 852` =
**131.9pt** against the shell's 132.

The same maths gives the crop: only the central `393/852` = **46%** of the image width (1260px) is
visible in portrait. Anything wider is cropped off on a phone.

Source was `src/assets/Transparent_DragonCandy_logo.webp` (400x465) rather than
`public/logo.webp` (280x326) — a 1.06x upscale instead of 1.51x. Note `brandLogo.ts` documents
400x465 for the **.webp**; the `.png` beside it is actually 275x320, which is not a doc error but
is an easy misread.

## Made repeatable — `npm run cap:assets`

Chosen over `@capacitor/assets` and over Node+sharp: composes from artwork **already in the repo**,
so neither mark gets a second copy under `assets/` that drifts. Swift/CoreGraphics because
compositing needs an image library and every cross-platform option costs a dependency; macOS-only
is free here since iOS assets can only be built on macOS. Deliberately **not** in CI, which runs
Linux.

Split: `scripts/lib/app-assets.swift` does pixels only (compose, and report what is in a PNG, as
JSON); `scripts/build-app-assets.mjs` holds policy — the constants, their derivations, and the
assertions.

## The generator asserts, and most of its assertions are weaker than they look

A generator that reliably produces the **wrong** asset is worse than none, because it looks like a
control. But: **most checks compare the output against the same constants used to build it**, so
they catch a broken build or a bad copy, never a wrong constant. Only two are genuinely
independent — the `index.html` guard (external source of truth) and the portrait-band check
(derived geometry). Both were forced to fail before being trusted.

## Codex found the coupling guard enforced nothing (P2, real)

First version read `index.html` and checked `includes("#241332")`. That hex appears **twice**:
once in the real `splash.style.background` assignment on line 106, and once in an explanatory HTML
comment ten lines above. Repoint the shell to a new colour and leave the comment stale — the
likeliest way it would actually happen — and the substring check passes while the generator builds
a splash that flashes.

Worse, `DESIGN_SYSTEM.md` had already been written claiming the guard held that invariant.

Fixed to match the **assignment** and compare the captured value, naming both colours in the
error. Fails **closed** if the assignment is renamed or moved into a variable. Both branches
forced: changing only line 106 gives *"The shell paints #0A0A0A; this generator builds #241332"*;
renaming the property gives the cannot-find message. Neither wrote a file; `index.html` restored
byte-identical.

Codex clean at round 2.

## A measurement that was confounded, and the correction

The diff stat showed splash 41KB -> 411KB (x3) and icon 294KB -> 557KB, so ~1.4MB added to a
binary this project had worked to cut 54MB -> 39MB. Suspected a dithered fill. Cropped a 400x400
region of flat background: **236KB**, which looked damning.

That was a `sips` re-encode artifact. Measured directly, the region contains **exactly 1 distinct
colour**. The size is legitimate lossless PNG cost for the logo's gradients. No optimizer is
installed and adding one would undo the zero-dependency decision, so the growth is recorded rather
than fixed.

## Gotchas worth keeping

- **`sips` can crop and scale but cannot composite**, so it cannot build either of these assets.
- **CoreGraphics has no unpremultiplied 8bpc RGBA context** — `CGImageAlphaInfo.last` returns nil
  and the process traps. Use `premultipliedLast` and only judge colour on opaque pixels.
- **`CGImageAlphaInfo.noneSkipLast` is what makes the PNG encoder emit RGB**, which is how the app
  icon ends up with no alpha channel. App Store submission rejects one that has it.
- **ESLint did not lint the new `.mjs` at all.** `scripts/` is not in the ignore list, but the rule
  block matches `**/*.{ts,tsx}`, so the file is unmatched and skipped. `npx eslint <file>` exiting
  0 is **not** evidence it is clean — it was never read. (`no-console` therefore does not apply to
  `.mjs` here, consistent with `install-hooks.mjs` already using `console.log`.)
- **The worktree could not build the app at all** until this session: no `node_modules`, and no
  `ios/App/App/public/` — the web bundle had never been copied in. Running the review gates
  (`npm ci`, `npm run build`) plus `npx cap sync ios` fixed both as a side effect.

## Why the founder's phone showed the old app

Not the icon cache, and not a build failure. **These changes exist only on this branch.** Building
from the main checkout — the habitual place — builds the old assets forever, no matter how many
times the app is deleted and reinstalled. This is the worktree-staleness trap `CLAUDE.md` warns
about, arriving as "the app didn't update".

## Verification

- 224 -> 0 near-black pixels in the eye rect, with the darkest pixel named in both states
- icon 1024x1024, `hasAlpha: no`; splash 2732x2732, corner exactly `#241332`
- logo 423px wide, insets 1155 / 1154 (centred to 1px), inside the 1260px visible band
- all three splash files byte-identical
- generator **deterministic**: regenerating after a forced control reproduced `b72c76ac...`, the
  identical hash from before the control
- `npm run build` clean; **3493 tests across 314 files pass**
- Codex clean at round 2 (one P2, real, fixed)

## Not verified

**Nothing has run on a device or simulator.** The colour match rests on reading `index.html` and
reasoning that Capacitor loads `/`. The open questions on first launch are whether the
splash-to-shell handoff is genuinely seamless, and whether the icon reads well at real size on a
light home screen.

## Files

- `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732{,-1,-2}.png`
- `scripts/lib/app-assets.swift` (new)
- `scripts/build-app-assets.mjs` (new)
- `package.json` — `cap:assets`
- `docs/DESIGN_SYSTEM.md` — two rules
