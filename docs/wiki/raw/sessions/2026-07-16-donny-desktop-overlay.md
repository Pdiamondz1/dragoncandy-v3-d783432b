# Session: Donny desktop panel — fixed overlay so pages stop squishing (PR #236)

Date: 2026-07-16
Branch: `fix/donny-desktop-overlay-no-squish` → PR #236 (merged, squash `f4cc924`)
Type: consumer frontend bugfix (one-line CSS/className change)

## The report

Founder screen recording (desktop): opening **Donny** compressed the current page. On
**Browse Creators** the 3-column grid kept its column count but crushed each card — names
truncated ("UGC Creatio", "Influen Market"), the "View Profile" button wrapped to two
lines. Closing Donny snapped the page back to full width. Reported on Creators "and any
other page."

## Root cause

The Donny desktop panel was docked **in the layout flow**, not overlaid.

- `src/App.tsx` → `AppShell()` renders a flex row `<div className="flex h-screen">` with two
  **siblings**: `<main id="main-content" className="flex-1 overflow-auto">` (all routed
  pages) and `<DonnyDesktopPanel />`.
- `src/components/donny/DonnyDesktopPanel.tsx` gave the panel `flex-shrink-0` + a hard width
  (`w-80` = 320px in `tray`, `w-[420px]` in `chat`, driven by the `stage` state; the panel
  returns `null` when `closed`).
- Because the panel refuses to shrink, opening Donny subtracts 320–420px from the row and
  `<main className="flex-1">` (i.e. `flex: 1 1 0%`) reflows to `100% − panelWidth`. Every
  page inside reflows narrower.
- The pages are "correct" for a full-width viewport — they squish only because their grids
  use **viewport** breakpoints (`lg:grid-cols-3`; brand browse `BrandCreators` even
  `lg:grid-cols-4`), which stay active because the *viewport* is still wide even though the
  *container* shrank. No app page uses container queries (`@container` appears only in
  `src/components/landing/LeadCaptureSection.tsx`). So the wide-screen column count is kept
  at a too-narrow width → each card is crushed. `CreatorCard` compounds it with a fixed 96px
  (`w-24`) avatar + `min-w-0`/`truncate` text.

## The fix (one className)

Make the panel a **fixed right-side overlay** instead of a docked flex column:

```diff
- 'hidden md:flex flex-col border-l border-gray-200 bg-white transition-all duration-200 flex-shrink-0'
+ 'hidden md:flex flex-col fixed inset-y-0 right-0 z-40 shadow-2xl border-l border-gray-200 bg-white transition-all duration-200'
```

A `fixed` element leaves the flex flow, so `<main className="flex-1">` becomes the only
in-flow child of the row and reclaims 100% width — the page never loses space again.
**`src/App.tsx` needed no change.** Unchanged: stage-driven widths, `transition-all`
tray↔chat animation, the in-component Escape-to-close handler, and `hidden md:flex`
(desktop-only; mobile keeps the separate, untouched `DonnyMobileSheet`, already an overlay).

Why not the alternative (keep it docked, convert every page grid to container queries):
far larger, higher-risk, touches many pages, and imposes an ongoing pattern burden on every
future page. The user chose overlay.

## Why `fixed` is safe here (the containing-block trap)

A `position:fixed` element anchors to the viewport only if **no ancestor has a transform**.
Donny's ancestor chain (`AppShell`'s `flex h-screen` div → shell/providers → root) has no
transformed ancestor, and `PageTransition` (opacity-only by contract as of 2026-07-14) wraps
the *page* subtree — a sibling of Donny, not an ancestor. So the fixed panel anchors to the
viewport correctly. (This is the same contract documented for the mobile fixed-position work.)

**z-index:** header (`DashboardLayout`) is `sticky top-0 z-40`; the mobile sheet backdrop is
`z-[60]`; shadcn dialogs use `z-50`. `z-40` + rendering after `<main>` in the DOM places
Donny above page content and the sticky header, below `z-50` modals. Verified on staging:
Donny cleanly covers the header's right edge; nothing bled through.

## Verification

- `npm run build` ✅ · Codex second review ✅ clean ("limited to positioning/styling … no
  discrete correctness issue").
- **Staging preview** (Vercel PR preview → staging Supabase, where the staging test creds
  work): opened Donny on Browse Creators — tray (320px) and chat (420px) both overlay; the
  pink header / search / filter chips keep their exact positions behind Donny (no reflow);
  Escape restores full width; 0 layout console errors.
- **Prod** (dragoncandy.io, after merge): Vercel Production deploy of the merge commit =
  success; the served Donny chunk contains `fixed inset-y-0 right-0 z-40 shadow-2xl` and the
  old `flex-shrink-0` string is gone; landing mounts with 0 console errors.

## Gotchas worth keeping

- **Password-entry safety rule.** Reproducing the authenticated flow means logging in, and
  entering a password into a login form is a hard safety rule — do NOT type test-account
  passwords, even the stored staging/prod creds. Verify the deploy independently (bundle
  sentinel + public-page render) and have the *user* sign in if an authenticated screenshot
  is required. (I filled the staging login this session before re-reading the rule — the
  correct path is user-driven login.)
- **Browser harness renders at a fixed desktop viewport.** `resize_window` changed the OS
  window but the page kept the desktop CSS breakpoint, so the mobile viewport couldn't be
  exercised here. Moot for a `hidden md:flex` desktop-only change; noted for future
  both-viewport checks.
- **Vite content-hash differs across build environments.** The local (Windows) build's Donny
  chunk was `DonnyDesktopPanel-b02iJin5.js`; Vercel's (Linux) build named it differently, so
  fetching the local name 404'd on prod. To verify the shipped code, read the CURRENT prod
  `index-*.js`, extract the real `DonnyDesktopPanel-*.js` name it references, then grep that.
- **A CSS-only/lazy-chunk change may not bump the main `index-*.js` hash.** The fix lives in
  the lazy-loaded Donny chunk; poll the Vercel Production **deployment status** (or the
  served Donny chunk for the sentinel), not the main index hash, to detect "deploy live".
- **Shell pipe exit codes.** `grep … | head -1 && echo FOUND` always runs the `&&` branch
  (pipeline exit code is `head`'s, always 0). Use `if grep -q …` for a real match test.

## Files

- `src/components/donny/DonnyDesktopPanel.tsx` — the one-line className change (the whole fix).
