---
title: Dark-Luxe App Theme
type: concept
created: 2026-07-17
updated: 2026-07-17
sources: [2026-07-17-dark-luxe-app-theme-slice1.md, 2026-07-17-app-light-marketing-dark-pivot.md]
tags: [theme, dark-mode, design-system, tailwind, next-themes, frontend]
---
# Dark-Luxe App Theme

**Current state: the working app is LIGHT; only the marketing/entry surfaces are dark.** This page
covers both the current design *and* the short-lived experiment that got us here, because the
mechanics learned (two color systems, the scoped-dark gotchas) are durable.

## Current design (as shipped)

- **Light:** the entire authenticated/working app — dashboards, chrome/nav, Donny panel + chat,
  campaigns, messaging, settings, DragonShare, etc. Build app UI light (`dc-*` palette, `bg-white`
  cards, `dc-text`/`dc-text-muted`).
- **Dark:** only **landing**, **login/sign-up (+ forgot/update/verify/restore/invite)**, **onboarding**,
  and **`/internal` (AIOS)**.
- **Theme wiring:** `ThemeProvider` = `defaultTheme="light"` (next-themes), **no toggle**. Dark surfaces
  opt in per-route:
  - Landing **self-scopes** `.dark` on its root `<div>` (see [[Landing Redesign & Public Lead Capture]]).
  - Auth + onboarding call **`useDarkHtml()`** (`src/hooks/useDarkHtml.ts`) — a `useEffect` that adds
    `dark` to `<html>` for the route's lifetime and removes it on unmount.
  - `/internal` does the same via `InternalLayout`.

## Why not `forcedTheme`

`ThemeProvider` must **not** force a theme:
- `forcedTheme="dark"` = the whole app dark (the reverted experiment).
- `forcedTheme="light"` actively re-asserts `<html class="light">` and **fights** `InternalLayout` /
  `useDarkHtml`, breaking the dark `/internal` + auth surfaces on direct load/refresh (a Codex catch).
- `defaultTheme="light"` gives fresh users light (system-dark users included — the default is "light",
  not "system") while letting route-level effects add `<html class="dark">` that *sticks*.

## The washed-auth gotcha (keystone)

A scoped-div `.dark` (just adding `dark` to the page's own root) is **not enough** for a dark page when
the app is light. `<body>` stays light (white `bg-background`), and the auth page's **translucent
teal+pink glow layers** (two radial gradients + `GlowBackdrop`) composite over the white body and
**wash the page out to gray**. It only looked dark during the force-dark experiment because the whole
`<body>` was dark. **Fix:** `useDarkHtml()` makes `<body>` dark (via the `.dark` `--background` token),
so the glows sit on dark — restoring the rich look. Verified: with `useDarkHtml`, the auth root's
`<body>` is dark and the page renders charcoal; without it, washed gray.

## The two-color-system insight (still true, and why the revert was clean)

The app runs two color systems:
- ~847 semantic shadcn tokens (`bg-background`/`bg-card`/`bg-sidebar`/`border-border`) that flip under
  `.dark`.
- ~1,900 hardcoded `dc-*`/`bg-white`/`text-gray` literals that don't.

The dark experiment converted the literals surface-by-surface; the revert simply restored those files to
their pre-experiment light versions (`git checkout <pre-dark-sha> -- <files>` — a clean per-file revert,
verified no other PR had touched them). Because the literals never depended on the theme, the light app
came back exactly as it was.

## Reusable dark-luxe kit (for the dark surfaces)

`.dc-surface`/`.dc-panel`/`.dc-field` (`@layer components`), `dc-teal-pill`/`dc-ghost-pill` button
variants, `GlowBackdrop`/`Eyebrow` (`src/components/dark/`), the white-opacity text ramp
(`text-white`→`/80`→`/60`→`/40`), teal+pink accents, errors as `bg-red-500/10 text-red-300`.

## Traps

- **Scoped-div `.dark` needs a dark `<body>`** — use `useDarkHtml()` (above), or glows wash out.
- **`.dc-field` loses to a shadcn `<Input>`** — a `@layer components` class is overridden by the
  component's own `@layer utilities`; use explicit `border-white/15 bg-white/5 text-white
  placeholder:text-white/40` on shadcn inputs.
- **Dark-fill-as-text contrast trap:** `text-dc-dark`/`text-dc-teal-btn`/`text-dc-pink-accent-btn` are
  correct **on** a teal/pink/white fill (e.g. `bg-dc-teal text-dc-dark`) but invisible as text on a dark
  page. The literal residual-grep doesn't catch these — judge by the element's own background.

## Deploy mechanics
`git push` hangs in this environment (send-pack), so branches land via the `gh` REST
blob→tree→commit→ref workaround (`git fetch` works). Blobs must be created with
`jq --rawfile … | gh api …/git/blobs --input -` (`-f content=@-` sends **empty** blobs); always
sanity-check `gh api compare/main...branch` shows the expected additions/deletions before the PR. See
the project-memory REST-push recipe.

## See Also
- The `DESIGN_SYSTEM.md` core doc — "Theme — Light app, Dark marketing/entry".
- [[Landing Redesign & Public Lead Capture]] — the scoped-`.dark` landing (self-scopes on its div).
- [[Landing Cinematic Video Redesign]] — the dark landing look the marketing surfaces share.
- [[AIOS Internal Shell]] — `/internal`'s `InternalLayout` html-dark pattern that `useDarkHtml` mirrors.
- [[Mobile Viewport & Fixed Positioning]] — fixed-overlay/portal rules the chrome relies on.
