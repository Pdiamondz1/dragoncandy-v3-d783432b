# Session — AIOS Internal Dashboard UI Polish (PR #179)

**Date:** 2026-06-26
**Branch:** `feat/aios-ui-polish` → merged `main` (squash `83c3eac2`, PR #179)
**Scope:** Presentational only — **no schema, auth, data, RLS, or gating change.**

## What & why

The DragonCandy AIOS (`/internal/*` on `internal.dragoncandy.io`) had grown to **11
navigable sections** but its shell still rendered them as a single wrapping row of nav
pills in the header, with no grouping and no mobile pattern (it just wrapped — ~2 ragged
rows on desktop, ~4 rows eating the top third on a 375px phone). Donny was buried as the
11th pill. Individual pages were fine but inconsistent: ~6 hand-rolled the same
`<h1>/<p>` header and container widths varied randomly (`max-w-3xl…6xl`).

Founder asked to polish desktop + mobile: less clutter, easier navigation, quick access
to Donny.

## Decisions (locked with founder via AskUserQuestion)

- **Desktop nav pattern: persistent left sidebar** (vs. an enhanced grouped top bar).
  Cleanest for 11 sections; content gets a calm single column.
- **Scope: full** — shell + shared primitives + mobile clutter fixes.
- **Donny quick-access = a pinned "Ask Donny" entry in the nav chrome, NOT a floating
  FAB** (honors the standing "no floating Donny button" feedback; the FAB ban was about
  the consumer app, but the same principle applied here — keep it anchored).

## What shipped

### Navigation shell (`src/components/internal/InternalLayout.tsx`)
- Desktop: a sticky left **sidebar** (`w-64`, `lg:flex`) with sections grouped under
  **Monitor** (Overview · Weight · Briefings · Strategy · Workspace) and **Operate**
  (Expenses · Findings · Corrections · Playbooks · Stakeholders), each link carrying a
  lucide icon for scannability. Group config is a `NAV_GROUPS` array; the `admin`-flagged
  group is hidden for the read-only `stakeholder` tier.
- **"Ask Donny"** is a distinct accent-styled pinned entry above the groups (admin-gated,
  like the rest of Operate — Internal Donny is admin-only).
- Mobile: a **sticky top bar** (`lg:hidden`) with logo + an always-visible "Ask Donny" +
  a hamburger that opens a **slide-in drawer** (shadcn `Sheet`, `side="left"`, `w-72`)
  rendering the same `NavBody`; closes on navigate via a controlled `open` state +
  `onNavigate`.
- The single `NavBody` component is shared verbatim by the desktop rail and the mobile
  drawer (logo, Ask Donny, groups, email + Sign out footer) — no duplication.
- Kept: the `document.documentElement.classList.add('dark')` ops-deck toggle and the
  teal/pink blur + blueprint-grid atmosphere background.

### Shared layout primitives (`src/components/internal/layout.tsx` — NEW)
- `PageContainer({ size })` — one centered column with a named width
  (`sm`=3xl, `md`=4xl, `lg`=5xl, `xl`=6xl, `full`), replacing per-page ad-hoc `max-w-*`.
- `PageHeader({ title, subtitle, actions })` — the standard title block, `title`/`subtitle`
  are `ReactNode` so pages can pass an icon-prefixed title or a JSX subtitle, and `actions`
  is the right-aligned slot (e.g. "New playbook", "Disconnect", live timestamp).
- A `Panel` primitive was scaffolded but **removed before commit** (ended up unused — ship
  only what's adopted; YAGNI).
- Adopted across **all 12 internal pages** (Overview, Weight, Briefings, Strategy,
  Workspace, Expenses, Findings, Corrections, Playbooks, PlaybookDetail, Stakeholders,
  Donny).

### Mobile clutter fixes
- Briefings & Strategy (two-column master-detail): the page title was **lifted out of the
  in-page `<aside>`** into a full-width `PageHeader`, and the doc-list height capped on
  mobile (`max-h-64 lg:max-h-[60vh]`) so the list no longer dominates a phone before you
  reach the content.
- Findings: the evidence `<pre>` now `whitespace-pre-wrap break-words` (was horizontal
  scroll only). (Corrections' before/after blocks already wrapped — left as-is.)

## Verification
- `npm run typecheck` ✓ · `npm run lint` ✓ · `npm run build` ✓ · `npm run test` **568
  passed (69 files)**.
- **Codex second review: clean** — "did not identify any discrete, actionable bugs that
  would likely break existing behavior."

## Gotchas / notes
- shadcn `SheetContent` ships a built-in close (X) + a default `bg-background p-6 w-3/4`;
  overrode with `w-72 bg-dc-dark p-4` (twMerge in `cn` lets the later width/bg win). Added
  an `sr-only` `SheetTitle` for a11y (Radix Dialog requires a title).
- The mobile top bar is `sticky top-0` (not `relative`) so the hamburger + Ask Donny stay
  reachable while scrolling — directly serves the quick-Donny goal.
- Worktree gotcha held: shell cwd is the MAIN checkout, so all writes used the explicit
  worktree path and npm ran with the worktree cwd.
