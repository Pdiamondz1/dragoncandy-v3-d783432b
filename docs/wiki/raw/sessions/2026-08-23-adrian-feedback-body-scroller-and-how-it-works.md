# 2026-08-23 — Adrian's three notes, and the scroller I measured twice without finding

Branch: `feat/landing-adrian-feedback`. Follows #459 (the cinematic single-CTA landing), merged
earlier the same day.

## What prompted it

Adrian Vella looked at the shipped landing page and sent three notes:

1. Put Log in in the middle near "Get started", in a different colour — "as if you are already
   registered it becomes very relevant".
2. A small "Learn more" button at the bottom by terms, for someone who wants to read about what we
   offer.
3. "When going on it on mobile I see the screen jumps if I scroll up or down, I think it's a bug."

The third one is the interesting one, because I had already declared it not a bug.

## The jump was real, and it was the finding I refuted

PR #459 carried an open Codex round-4 finding: `AppShell` is `h-screen` (`100vh`) while the landing
is `min-h-[100dvh]`, leaving "unused scrollable space below the footer" on mobile Safari. The
founder approved the one-word fix. **I tested it, reported that it did not reproduce, and talked
him out of it.** Adrian then reported the symptom from a real phone.

My refutation was wrong in two independent ways, and either alone would have been enough to produce
a false negative:

- **I measured the wrong element.** I checked `main.scrollHeight` vs `main.clientHeight` and
  `main.scrollTop`. `main` is not the document's scroll container. `src/index.css` sets
  `body { height: 100%; overflow-x: hidden }`, and per spec an `overflow-x` of `hidden` against a
  visible `overflow-y` computes `overflow-y` to **`auto`** — so **body** is a fixed-height scroll
  box, and anything taller than it scrolls body.
- **I measured in an emulator.** Device-emulation mode has no collapsing URL bar, so `100vh` and
  `100dvh` are always equal and the gap under test is structurally zero. The bug cannot appear
  there at all.

Measured properly this time, by forcing the shell 80px over its container and then asking *every*
candidate which one moves:

| element | scrollHeight | clientHeight | overflow | scrollTop after scroll |
|---|---|---|---|---|
| `html` | 753 | 753 | 0 | 0 |
| **`body`** | **833** | **753** | **80** | **80** |
| `#root` | 833 | 833 | 0 | 0 |
| shell | 833 | 833 | 0 | 0 |
| `main` | 833 | 833 | 0 | 0 |

`window.scrollY` stayed **0** throughout. A window-level or `main`-level check reads this as "no
scrolling" — which is exactly what it did, twice.

**Mechanism.** On iOS Safari `100vh` is the URL-bar-COLLAPSED height. `h-screen` therefore stood
~60–90px taller than body's box, body scrolled by that amount, and scrolling collapsed the URL bar,
which grew `100dvh`, which resized the page under the user's finger. That is the jump.

**Fix:** `AppShell` → `h-[100dvh]`. `DashboardLayout`'s two `min-h-screen` move with it — they sit
inside `main`, so they never scrolled body, but a `100vh` child of a `100dvh` `main` hands every
short dashboard page the same dead scroll one container down. That regression was my original
argument for not doing the fix; it is fixed by doing it in **both** places, not in neither. The
landing's own Suspense fallback moved too — at `100vh` it re-opened the overflow for the duration
of the chunk load, on the exact page reported.

**`DESIGN_SYSTEM.md` asserted the false premise in writing**: "the app document never scrolls
(h-screen shell + inner overflow-auto main), so iOS Safari toolbars never collapse". The shell
being `h-screen` is precisely what made the document scroll; `main` being `overflow-auto` only
means `main` is not the *document's* scroller. Corrected in place, because a rule that carries a
false justification will be re-derived wrongly by the next person.

**Durable lesson, and it is not "test on a real device".** It is: *when a probe returns zero, prove
the probe could have returned non-zero.* The forced-overflow control here took one extra line and
would have caught both errors at once — it identifies the scroller AND demonstrates the instrument
responds. Pair it with the `contentInset` lesson from the day before: that one was invisible in
emulators too, and this is the second time in two days an emulator has confidently reported the
absence of an iOS-only defect.

## Log in, in the middle

A plain underlined link under the CTA, not a second pill. The page's premise is one call to action;
a co-equal mint button beside the pink one makes it two. Underlined because colour alone is never
an affordance, and over moving footage it is the least reliable cue available.

**The colour is size-dependent, which was not obvious.** The slogan's `landing-mint-line-bright`
(`#7BE3C0`) is the mint chosen for text over video — but that choice was made for *large* text at
a 3.0:1 bar. This link is small text at 4.5:1. Measured across all sixteen encodes in the link's
own band (**0.603–0.635 of viewport height**, read off the rendered page, where the scrim
interpolates to **0.672**):

| colour | worst mean | worst p90 | 4.5:1? |
|---|---|---|---|
| white/90 (the lead-in) | 7.26 | 5.27 | yes |
| `#7BE3C0` mint-line-bright | 5.49 | **3.91** | **no** |
| `#B8ECDA` mint-line | 6.49 | **4.62** | yes |

So the link uses the **paler** mint — the one `DESIGN_SYSTEM.md` calls "too pale against skin/food
tones on video". That judgement is about headlines and **inverts for small text**: paler means more
contrast against a bright frame. Both notes now sit in the design system so neither gets "corrected"
into the other.

## Learn more, and somewhere for it to go

Adrian asked for a button; the harder half was that it had nowhere to point. The six-section
marketing page was deleted in #459's rebuild, so a visitor who wanted to read before signing up had
no destination at all — `/pricing` answers what it costs and `/help` is written as post-signup
support. Rather than point at the nearest wrong thing, this adds **`/how-it-works`**: how a
campaign runs (three steps), who it is for (three roles), and what Donny does and does not do.

Light, on `PublicPageHeader` — the same shell as `/terms`, `/privacy` and `/pricing`. The landing
stays the one dark public surface. The footer link is a bordered pill, not a fill: a second fill
would be a second CTA.

## Also corrected

`DESIGN_SYSTEM.md` still described the landing as **unmerged**, playing **ten** reels (five/five)
across **twenty** encodes. #459 shipped eight (five ABB, three Uncle Rocco) across sixteen and
merged the same day. Three stale claims in the file I was already editing, about the exact surface
I was changing.

## Verification

- Both viewports, real browser: `body` overflow **0** on the landing, and **0** on a 2148px
  `/how-it-works` which scrolls inside `main` as designed.
- `npm run typecheck`, `npm run build`, `npm run lint` (0 errors) all clean.
- Full suite: 2468 passed, 45 failed — **the same 45 fail on a clean `origin/main`**, checked out
  detached and re-run. Documented Node 26 / jsdom `localStorage` issue; CI runs Node 24.
- Codex second review: clean, no actionable defects.
- **Not verified:** the iOS-Safari half. No browser, emulator or simulator can show it — the
  WKWebView shell has no URL bar either, so `100vh === 100dvh` there too. Needs a real phone, and
  Adrian is the person who saw it.

## CI caught two more, and one of them was site-wide

The Lighthouse gate failed the PR at **SEO 0.92** against a 0.95 minimum — consistently across all
three runs, and the first failure this workflow has had. It was mine, and it was one item:
Lighthouse's **`link-text`** audit fails the string **"Learn more"** outright. It is the canonical
non-descriptive link text — it tells a crawler nothing, and it reads to a screen reader, out of the
link list, as a link to nowhere in particular. Renamed to **"How it works"**, which names the
destination and is better copy anyway. An `aria-label` would also have satisfied the audit; naming
the thing fixes it for the reason the audit exists.

**Then auditing the new page — which CI does not cover — found a defect on every page of the site.**
The gate only tests `/landing`. Running the same audit against `/how-it-works` returned SEO 0.92
there too, on a different item: **two conflicting `<link rel="canonical">` tags**.

`index.html` carried a hardcoded `canonical` pointing at `https://dragoncandy.com/landing`, and a
hardcoded `og:url` pointing at the bare origin. `SEO.tsx` (react-helmet-async) emits the correct
per-route values — but Helmet **appends**; it does not replace a static tag it did not create. So
every page on the site except `/landing` shipped two canonicals that disagreed, and conflicting
canonicals are discarded rather than resolved, which threw away the correct per-route value
site-wide. `/landing` passed only because it is the one page where the static value happens to be
right.

Both static tags removed. The landing keeps SEO 1.00; `/how-it-works` goes to **100 accessibility,
100 best practices, 100 SEO**.

**The generalisable bit: a gate that tests one URL is evidence about one URL.** This one had been
green on every previous run precisely because the only page it checks is the only page the bug
spared.

Also fixed on the new page: `dc-pink-accent` (`#EC4899`) as text on white measures **3.52:1**
against the 4.5:1 small-text bar — four instances, the three step numbers and the "See pricing"
link. Moved to `dc-pink-accent-btn` (`#DB2777`, **4.60:1**). The design system lists the lighter
token for "links, secondary button text", which is wrong for text on a white page.

**Found and deliberately not fixed:** the landing's "Get started" pill is white on `#F43F7F` at
**3.58:1**, at 18px so the large-text allowance does not apply. Pre-existing — Lighthouse has
scored the landing 96 on accessibility for this since before the rebuild — and fixing it means
darkening the brand pink or changing the CTA's weight, which is a brand decision rather than a
drive-by in a feedback PR.

## Left open

- If the jump persists on a real phone, the remaining candidate is iOS rubber-band overscroll,
  which is a different mechanism and would want `overscroll-behavior-y: none` on `body` — an
  app-wide behavioural change, deliberately not bundled into a landing fix.
- The landing's "Get started" CTA contrast (3.58:1) — a brand decision, see above.
- The Lighthouse gate still tests only `/landing`. `/how-it-works` is new and uncovered; adding
  URLs to `lighthouserc.cjs` would have caught the canonical bug years earlier.
- 119 other `min-h-screen`/`h-screen` usages remain across `src/`. They are all inside `main` and
  none can scroll `body`; sweeping them would be a batch change with no reported symptom behind it.
