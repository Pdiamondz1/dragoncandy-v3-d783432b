# Session — a height comparison has two sides (2026-08-24)

Follow-up to the same day's page-drag session, whose fix (#501) did not resolve the report.
Closed by #504 and **confirmed working on a real phone by the founder**.

## The report, and why it took three tries

Adrian and the founder: the landing still scrolls, white below the footer, a little in portrait and
a lot in landscape, scroll indicator visible in both.

1. **"The content overflows."** Refuted by measurement — zero overflow at every viewport Chrome
   could produce.
2. **"It is the rubber-band."** Plausible, shipped as #501, did not fix it. Worse, the iOS
   simulator had "confirmed" it by showing WebKit *applies* `overscroll-behavior` — a true fact
   about a question nobody had asked, since *applied* was never the same claim as *suppressed*. It
   was then read as support for the wrong diagnosis.
3. **A screenshot settled it in one step.** The white sat **below the app shell**, with a
   scrollbar. That eliminates every mechanism inside the page at once, because nothing under
   `#root` can paint outside the body box.

## The cause

`src/index.css` pinned `html, body { height: 100% }`. A percentage resolves against the **initial
containing block**, which on iOS Safari is the **small** viewport (toolbars showing). `100dvh` is
the **current** dynamic viewport and **grows** as Safari collapses or compacts its toolbars —
aggressively in landscape.

With `AppShell` at `h-[100dvh]` and body pinned to the small height, the shell outgrows body's box
the moment the toolbar moves, body scrolls by exactly that difference, and the strip below the
shell paints body's own white background.

**The repo already held the proof and nobody read it that way.** §9 of the viewport concept page
recorded body `clientHeight` **753** against `100vh` **833** — correctly identifying that the two
elements disagreed — then changed the **shell's** unit from `vh` to `dvh` and left the other side
of the comparison on `%`. That closed the always-80px case and left a gap that opens and shuts with
the toolbar.

> **A height comparison has two sides, and fixing one of them is not fixing it.**

## What shipped

- `html` and `body` at `height: 100dvh`, matching the shell, so both move together. A
  `height: 100%` fallback stays declared **before** it, and `documentOverscroll.test.ts` asserts
  the declaration order — a fallback declared last would win, and the bug would be back with the
  guard still green.
- `html.landing-surface, html.landing-surface body { overflow: hidden }` while the landing is
  mounted. Independent of any unit comparison, and the standard way to stop the iOS rubber-band,
  which cannot fire on a document with no scrollable overflow. **`#main-content` deliberately NOT
  locked** — if content ever genuinely does not fit, `main` can still scroll, so the only CTA can
  never become unreachable. Clipping "Get started" is a worse failure than a scrollbar.
- A **height** breakpoint, `short:` (`max-height: 430px`) in `tailwind.config.ts`, because no width
  breakpoint can see that a phone is held sideways. Landscape genuinely did not fit: hero **277px**
  + footer **78px** = **355** against roughly **310** a phone leaves with toolbars showing. Now
  **195**.

## Verification, and what it could not reach

844x310 and 844x240: body and main overflow both 0, CTA fully visible. 500x760 and 1440x900
unchanged. iOS simulator, throwaway computed-style readout: `innerHeight` 874, `html` **874px**,
`body` **874px** — the three agreeing for the first time — overflow hidden, both overflows 0.

The landing lock lifts on navigation, proven by setting `/how-it-works`' `scrollTop` to 300 and
reading back 300, rather than trusting the overflow property — the lock would break every scrolling
page if it leaked.

Prod CSS confirmed **byte-identical** to the measured build with `cmp`, which is stronger than a
changed hash: it is the same file the measurements were taken against.

**Then confirmed on a real phone.** That was the only instrument that could: Chrome, device
emulation and the Capacitor WebView all report this family absent, because none has a collapsing
toolbar, so ICB `===` dvh and the gap is structurally zero. Third defect in this family (§8, §9,
§11) with exactly that blind spot.

## Gotchas

- **Rebasing dropped three commits as "already upstream"** after the earlier PR was squash-merged.
  Expected, and worth checking `git diff origin/main...HEAD --stat` afterwards so the follow-up PR
  contains only the follow-up.
- **A stray navigation to `/auth?mode=signup` appeared mid-verification** and could not be
  attributed to a tool call. Re-navigated and re-measured rather than reporting the first reading;
  recorded as unexplained rather than assumed harmless.
- **The verification browser would not resize below 1440px wide** on the final pass, so landscape
  was not re-measured against prod directly — it rests on the byte-identical build instead. Stated
  rather than glossed.

## Files

`src/index.css`, `tailwind.config.ts`, `src/components/landing/LandingHero.tsx`,
`src/pages/LandingPage.tsx`, `src/documentOverscroll.test.ts`, `docs/DESIGN_SYSTEM.md`.
No migration, no edge function, no RLS change.
