---
title: AIOS Internal Shell
type: concept
created: 2026-06-26
updated: 2026-06-26
sources: [2026-06-26-aios-ui-polish.md]
tags: [aios, internal, navigation, ui, design, mobile, donny]
---
# AIOS Internal Shell

How the DragonCandy AIOS (`/internal/*` on `internal.dragoncandy.io`) is navigated and
laid out. The AIOS is a single role-gated React surface that had grown to **11 sections**;
this is the shell + page chrome that keeps that many sections calm and one-tap navigable
on both desktop and mobile. It is the dark "ops-deck" counterpart to the light consumer
app (see [[Donny Chat UX]] for the shared-component light-vs-dark rule).

## The shell (`src/components/internal/InternalLayout.tsx`)

- **Desktop = persistent left sidebar** (`w-64`, sticky, `lg:flex`). Sections are grouped
  under labels — **Monitor** (Overview · Weight · Briefings · Strategy · Workspace) and
  **Operate** (Expenses · Findings · Corrections · Playbooks · Stakeholders) — driven by a
  `NAV_GROUPS` array; each link carries a lucide icon for scannability. The `admin`-flagged
  group is hidden for the read-only `stakeholder` tier (access is purely `user_roles` —
  `admin` ⇒ everything, `stakeholder` ⇒ the Monitor group only).
- **Mobile = sticky top bar + slide-in drawer.** A `lg:hidden` sticky header holds the
  logo, an always-visible "Ask Donny", and a hamburger that opens a shadcn `Sheet`
  (`side="left"`, `w-72`) rendering the *same* nav. The drawer closes on navigate via a
  controlled `open` state + an `onNavigate` callback.
- **One `NavBody`** (logo · Ask Donny · groups · email + Sign out footer) is shared verbatim
  by the desktop rail and the mobile drawer — no duplication.
- **Ops-deck theme** is applied by toggling `document.documentElement.classList`'s `dark`
  while any internal page is mounted (removed on unmount; the consumer app stays light), over
  a teal/pink blur + blueprint-grid atmosphere background.

## Donny is pinned, not floating

Quick Donny access is a **distinct accent-styled "Ask Donny" entry anchored in the nav
chrome** (top of the sidebar on desktop; always-visible in the mobile top bar) — admin-gated,
because Internal Donny is admin-only. This deliberately is **not** a floating FAB: the
standing "no floating Donny button" feedback applies here too — keep the entry anchored.

## Shared page primitives (`src/components/internal/layout.tsx`)

Every internal page composes two primitives instead of hand-rolling chrome, so the surface
reads as one dashboard:

- **`PageContainer({ size })`** — a centered column with a *named* width (`sm`=3xl, `md`=4xl,
  `lg`=5xl, `xl`=6xl, `full`), replacing ad-hoc per-page `max-w-*`.
- **`PageHeader({ title, subtitle, actions })`** — the standard title block. `title`/`subtitle`
  are `ReactNode` (so a page can pass an icon-prefixed title or a JSX subtitle), and `actions`
  is the right-aligned slot (a "New playbook" button, a "Disconnect" button, a live timestamp).

Shared `StatCard` / `SectionHeading` / `ErrorCard` continue to live in
`src/components/internal/stats.tsx`.

## Key Decisions

- **Sidebar over a top bar** for 11+ sections — grouping + a single calm content column beats
  a cramped wrapping pill row.
- **Pin Donny, don't float it** — anchored nav entry, admin-gated.
- **Primitives are adopted, not just authored** — a scaffolded `Panel` primitive was deleted
  before commit because nothing used it (ship only what's adopted; [[Musk's Algorithm]]).

## Known Issues

- None functional. Presentational change only — no schema/auth/data/RLS/gating impact; Codex
  second review clean; 568 tests pass.

## See Also
- [[Donny Chat UX]] — the shared chat components and the light-vs-dark theme rule across the
  consumer + internal surfaces.
- [[Google Workspace]] — the AIOS "Workspace" section reached from this shell.
