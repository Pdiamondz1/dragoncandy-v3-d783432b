# Session — the page could still be dragged, and the logo had five sizes (2026-08-24)

Branch `worktree-DC-landing-page-fix3`. Two reports from the same day, both against the
landing that shipped in #459 and was already "fixed" once.

## What was reported

**Adrian Vella, from a real phone, with screenshots:** *"Some feedback, you can still
move the page on mobile, looks buggy and would not be good when you add a wrapper."* The
two screenshots show a white band **above** the header in one and **below** the footer in
the other. The founder confirmed the same symptom on desktop.

**The founder, separately:** the logo on the sign-up / log-in pages must be the same size
as the landing, terms, how-it-works and privacy pages, and *"the header logo after you
login or sign-up has to shrink to the same size as well. It needs to be the universal size
throughout the headers on the app."*

## Half 1 — a page with nothing to scroll can still be dragged

**This is not a regression of the 100dvh fix; it is the residual that fix left, named in
writing at the time and deliberately not taken.** `AppShell` going to `h-[100dvh]` removed
the *scrollable gap* that made the screen **jump** mid-gesture. Rubber-band overscroll is a
separate mechanism: a scroll container with nothing to scroll still bounces, on iOS Safari
and on a macOS trackpad alike — which is why one symptom was reported on both viewports
when the previous bug was iOS-only.

**Why the band is white, and why nothing inside the app could fix it.** The elastic strip a
bounce opens sits **outside the body box**, so no element under `#root` can paint it. The
canvas takes its background from `<html>`, falling back to `<body>` only when the root is
transparent — and `body` is `bg-background`, i.e. white. So the one page whose entire
premise is a dark cinematic screen opened a white gutter at both ends.

**Two guards, because they fail differently:**

1. `overscroll-behavior-y: none` on `html` **and** `body` in `src/index.css`. Both,
   because body is this document's scroll container (`height:100%` + `overflow-x:hidden`
   computes `overflow-y` to `auto`) while the value governing the viewport is read off the
   root. **Y axis only** — the shorthand would take X, and X is where iOS Safari's
   edge-swipe-back gesture lives; there is no horizontal scrolling to suppress anyway.
   Known cost, accepted: pull-to-refresh goes away on Android Chrome.
2. `LandingPage` adds `landing-surface` to `documentElement` for its lifetime
   (`html.landing-surface { @apply bg-landing-grape }`), removed on unmount so it cannot
   tint the white page the visitor opens next. This covers what the property cannot reach:
   Safari before 16, and the Capacitor WKWebView, whose bounce is a **native scroll-view
   setting** that no CSS property switches off. There the user sees brand colour rather
   than a band that reads as broken.

Mirrors `InternalLayout`'s `<html>` class toggle, the only other place the app touches
`documentElement`.

## The simulator was the right instrument, and it answered the open question

Running the iOS simulator was the user's suggestion, and it earned its keep. The app was
built (`xcodebuild -scheme App`, **not** `DragonCandy` — see the gotcha below), installed
and launched on an iPhone 17 Pro simulator, with a **throwaway** computed-style readout
injected into `ios/App/App/public/index.html` — the *copied* build output, never source,
restored afterwards with `npx cap sync ios`.

Read off the device:

```
html overscroll-y : none
body overscroll-y : none
landing-surface   : true
html bg           : rgb(36, 19, 50)
innerHeight       : 874
doc clientHeight  : 874
body overflow px  : 0
safe-top          : 62px
```

- **WebKit applies `overscroll-behavior` inside WKWebView.** That was the open question,
  and it is not answerable in Chrome, where the property obviously works.
- `innerHeight === documentElement.clientHeight` — the `contentInset: 'never'` invariant
  from 2026-08-23 still holds after these changes.
- The grape canvas is live natively; `safe-top` 62px confirms the header still pays back
  the notch inset.

**What the simulator did NOT prove, and this is the honest limit:** that the *native*
scroll view refuses to bounce. `overscroll-behavior` being **applied** is not the same
claim as the bounce being **suppressed**, and separating those two is the whole point of
writing this down. A real drag is needed. No drag could be synthesised from the session —
`cliclick` is not installed, and posting `CGEvent`s needs Accessibility permission an agent
cannot grant itself. That is where the investigation was stopped rather than continued.

## Half 2 — the logo had five sizes, and the previous guard could not have caught it

Sizes before: landing and `PublicPageHeader` at `h-12 w-auto lg:h-14` (48/56px), auth at
`w-[100px] md:w-[120px] lg:w-[140px]` (**116/140/163px tall**), `MobileTopNav` at
`w-[64px]` (**74px**), the desktop sidebar at `w-[100px]` (**116px**).

**Sizing by width is the defect, not the numbers.** Both assets are stacked badges taller
than they are wide — `public/logo.webp` is 280x326 (aspect 0.859),
`src/assets/Transparent_DragonCandy_logo.webp` is 400x465 (0.860) — so a width class does
not cap the height, it multiplies it. And because the two aspects agree to within 0.001,
one height class renders an identical size on every surface regardless of which file it
imports, which is what made a single shared constant possible at all.

**The durable lesson is about the guard, not the CSS.** The 2026-08-23 pass fixed the
landing and `PublicPageHeader` and pinned them **to each other by hand** — a test asserting
both files contained the same literal class string. A day later the founder reported the
identical defect on the three headers that pass never enumerated, while that test reported
green the whole time. *A guard that watches the pair you already repaired cannot see the
four you did not.* The size now lives in `src/lib/brandLogo.ts`
(`HEADER_LOGO_CLASS`, plus `RAIL_LOGO_CLASS` for the 56px collapsed sidebar rail), and
`src/lib/brandLogo.test.ts` re-derives the header list and fails if any of them hardcodes a
size. `/internal` is deliberately outside the system — an internal tool with denser chrome.

`width`/`height` attributes are each asset's real intrinsic size. They exist to reserve the
box before load; at the wrong aspect they reserve the wrong shape and cause the layout
shift they exist to prevent (`PublicPageHeader` carried 140x47 against a real 0.859).

## Also fixed: the same defect one page over

`AuthPage` and `AuthShell` were `min-h-screen`. Inside `main` that is ~60–90px of dead
scroll on iOS Safari — the same class as the `AppShell`/`DashboardLayout` fix, on the page
the landing's only CTA leads to. **The other 113 `h-screen`/`min-h-screen` usages in `src/`
were left alone**: a sweep is a different change, and this project's own rule forbids batch
edits.

## Gotchas worth keeping

- **`capacitor.config.ts` names an Xcode scheme that does not exist.** `ios.scheme:
  'DragonCandy'`, but the workspace ships only `App` (no `DragonCandy.xcscheme` anywhere,
  shared or per-user), so `npx cap run ios` fails and `xcodebuild -scheme DragonCandy`
  errors outright. Build with `-scheme App`. Not fixed here — flagged.
- **`npm run dev` cannot boot without an opt-in on this machine.** The #451 local-prod
  guard throws at import time, no staging key exists locally, and the tracked `.env` points
  at prod — so the app never mounts and the page you are looking at is the static shell in
  `index.html`, which has its own logo and its own `<title>`. That is a *very* convincing
  false reading: computed styles come back unstyled (`overscroll-behavior: auto`,
  transparent backgrounds) because `main.tsx` threw before importing `index.css`. Verified
  with `VITE_ALLOW_PROD_FROM_LOCAL=true`, anonymous public pages only, no writes.
- **A pre-existing test caught a real omission in the docs.**
  `supabase/functions/_shared/chunk-doc.test.ts` uses `PublicPageHeader.test.tsx` as a
  marker string that must survive chunking past the old 24,000-char cut of
  `DESIGN_SYSTEM.md`. Rewriting the logo rule deleted that filename, and the RAG chunking
  test failed. The doc now names both tests — which is more accurate anyway, since the
  render-level check still lives there.
- **Rebasing found a parallel PR.** `#500` (onboarding slices 3–4) landed on `origin/main`
  mid-session touching `src/components` and `src/pages`, but no file this branch edits.
  Checked by path per the `[scope-paths]` lesson, not assumed.

## Verification

- 3056 tests, typecheck, lint (0 errors, 127 pre-existing `no-console` warnings), build.
- `overscroll-behavior-y:none` and `html.landing-surface{...background-color:rgb(36 19 50)}`
  confirmed present in the **built** CSS bundle, not only in source.
- Browser, with a **forced control**: `documentElement.style.overscrollBehaviorY='auto'`
  read back `auto`, then `none` after clearing — so the "none" reading is a live style, not
  a constant the probe echoes. Landing and auth logos both 48x56; the class added on mount
  and removed on SPA-navigate away; canvas grape on the landing and white after it; zero
  overflow on html, body and main; no new console errors.
- Codex second review clean at round 1.

**Not verified:** the bounce itself on real iOS Safari (needs Adrian's phone) or by drag in
the simulator; and the two post-login headers on screen — **no test-account credentials
exist**, despite `CLAUDE.md` saying they are in the memory system, so those two are pinned
at class level only.

## Files

`src/index.css`, `src/pages/LandingPage.tsx`, `src/lib/brandLogo.ts` (new),
`src/lib/brandLogo.test.ts` (new), `src/documentOverscroll.test.ts` (new),
`src/components/landing/Header.tsx`, `src/components/PublicPageHeader.tsx` (+ its test),
`src/pages/AuthPage.tsx`, `src/components/auth/AuthShell.tsx`,
`src/components/MobileTopNav.tsx`, `src/components/DashboardLayout.tsx`,
`docs/DESIGN_SYSTEM.md`. No migration, no edge function, no RLS change.
