# Session — Dark-Luxe App Theme, Slice 1 (2026-07-17)

**Branch:** `worktree-dc-theme-upgrade` · **PR:** #269 (merged + deployed to prod 2026-07-17)
**Type:** Consumer frontend theming (presentational). No schema / edge-fn / secret change.

## Goal
Make the authenticated app visually consistent with the already-redesigned "Dark Luxe" landing
page. Force a single dark theme; convert the first end-to-end journey (login/sign-up → onboarding
→ dashboards) + all shared chrome. Video backdrops stay landing-only. **Slice 1 of a phased rollout.**

## The keystone insight — two parallel color systems
The app runs **two** color systems, and this determines the whole approach:
- **~847** usages of semantic shadcn tokens (`bg-background`, `bg-card`, `bg-sidebar`,
  `border-border`, `text-muted-foreground`) that **auto-flip** to dark under the `.dark` class
  (values in `src/index.css`).
- **~1,900** usages of hardcoded `dc-*` hex (`tailwind.config.ts`) + literal `bg-white` /
  `bg-gray-*` / `text-gray-*` / `dc-pink-bg` that do **not** respond to the theme.

So flipping the theme flag alone yields a **broken half-dark app** (dark sidebar, white page
bodies). Matching the landing = (a) turn the token layer dark once + (b) mechanically convert the
literal light surfaces to the landing's dark-luxe language. The landing itself uses **literals**
(`bg-dc-dark` + `bg-white/5` + a white-opacity text ramp), not tokens — so it's the reference.

## Foundation (mechanism)
- `ThemeProvider` → **`forcedTheme="dark"`** (not `defaultTheme="dark"` — returning users have
  `theme:"light"` persisted in localStorage; `forcedTheme` overrides it and neuters any stray
  `setTheme`). Kept `next-themes` (sonner still consumes it; sonner pinned `theme="dark"`).
- `index.html` → `<html class="dark" style="color-scheme:dark">` kills the first-paint flash +
  fixes native controls (scrollbars/date pickers/autofill).
- Retired the light/dark `ThemeToggle` (deleted the component + its DashboardLayout render).
- **Retuned the `.dark` token block** (`src/index.css`) — neutrals only (`--background` to brand
  charcoal `#1A1A2A`, `--card`/`--popover` a `white/5`-over-charcoal feel, `--border`/`--input`
  a `white/10-15` feel, `--muted-foreground` a `white/60` feel). **Left `--primary` (teal),
  `--secondary` (pink), `--ring`, `--sidebar-*` untouched.** This is the highest-leverage single
  edit — re-skins the ~847 token surfaces (sidebar, glass header, every Radix portal) for free.
- **Deliberately SKIPPED the A5 accelerator** (CSS-var-backing `dc-card`/`dc-pink-bg` globally):
  the audit was clean, but a global token flip would darken cards on the **out-of-scope** pages
  (campaigns/messaging/etc.) that still have light bodies until later slices → broken half-states.
  Per-file conversion is the phasing-safe path.

## Shared dark-luxe primitives (importless, low-churn)
- `@layer components` classes: `.dc-surface` (`min-h-screen bg-dc-dark text-white`), `.dc-panel`
  (`rounded-3xl border border-white/10 bg-white/5`), `.dc-field` (dark input).
  **Named `.dc-panel`, not `.dc-card`** — a `.dc-card` component class would clash with the
  `bg-dc-card` color utility.
- `button.tsx` CVA variants: `dc-teal-pill` (`bg-dc-teal text-dc-dark hover:shadow-glow-teal`),
  `dc-ghost-pill`.
- `src/components/dark/`: `GlowBackdrop` (two `blur-3xl` teal/pink blobs, self-clips via its own
  `overflow-hidden`), `Eyebrow` (teal dot + uppercase kicker).

## Conversion pattern (applied mechanically per file)
`bg-white`→`bg-dc-dark`/`.dc-panel`; `bg-gray-50/100`→`bg-white/5`; text ramp
`text-gray-900`→`text-white`, `-700`→`/80`, `-500`→`/60`, `-400`→`/40`; `border-gray-*`→`border-white/10`;
errors `bg-red-50 text-red-600`→`bg-red-500/10 text-red-300 border border-red-500/20`; status pills
`bg-emerald-100 text-emerald-700`→`bg-emerald-500/15 text-emerald-300`; chips
`bg-teal-50 text-teal-600`→`bg-dc-teal/10 text-dc-teal`. **Teal/pink accents unchanged.**

## Surfaces converted (Slice 1)
Auth page (cinematic dark gradient + `GlowBackdrop`) + form + role selection + toggles; auth-adjacent
(forgot/update/verify/restore/invite); onboarding wizard + steps (role-accent teal/pink branching
preserved); shared chrome (DashboardLayout, MobileTop/BottomNav, DonnyDesktopPanel/MobileSheet + the
**Donny chat interior** — the panel is docked on every page so its interior is shared chrome); the 3
dashboards + shared blocks (greeting/stats/activity/hero/…) + DragonShare dashboard tiles + first-run
(incl. MissionChecklist/MissionItem children).

## Two durable traps found
1. **The contrast trap (dark-fill-as-text).** `text-dc-dark`, `text-dc-teal-btn` (#0F766E),
   `text-dc-pink-accent-btn` (#DB2777) are **dark fills**. As a **text color on the dark page**
   they're invisible/low-contrast → convert to `text-white` / `text-dc-teal` / `text-dc-pink-accent`.
   BUT **on a teal/pink/white FILL they're correct** (e.g. `bg-dc-teal text-dc-dark` button text —
   the landing's own pattern). Judge by the element's own background. Found in `ActivityFeedCard`
   (`text-dc-dark` title, invisible), `PendingActionBanners`, `RecentActivitySection` active tab, and
   the `dc-primary` button (`dark:text-dc-dark` — a latent bug forcing-dark exposed app-wide, fixed
   by dropping the override so white text applies in all modes). The residual-grep pattern does NOT
   catch these — a whole-branch `text-dc-dark|text-dc-*-btn` sweep is required.
2. **The completeness grep catches unlisted children.** A per-group residual grep over the touched
   directory (`bg-white([^/]|$)|bg-gray-|text-gray-|text-dc-dark|...`) caught two dashboard blocks the
   task list didn't enumerate (`ActivityFeedCard`, `PendingActionBanners`) and the first-run children.
   Named-file lists miss children; grep the tree.

## Intermediate state (phased rollout)
Out-of-scope pages stay **coherent light pages** (their literal classes don't respond to `.dark`) —
the app is temporarily two-toned but readable everywhere, not broken (verified on prod `/pricing`).
Follow-on slices: campaigns, DragonShare pages, browse/crews/profiles, messaging, settings/org/billing,
public marketing.

## Process / gotchas
- Full brainstorm→spec(reviewed)→plan(reviewed)→subagent-driven execution (Groups A–E, per-group
  build+grep+commit) → Opus whole-branch review (APPROVED) → **Codex second review clean** (1 P2:
  auth `overflow-hidden` clipped the form on short viewports → `overflow-x-hidden`; `GlowBackdrop`
  self-clips so the root doesn't need it).
- 936 tests pass. 60 files, +905/−333.
- **git push hangs in this env** (send-pack, after the pre-push build hook) → landed via the `gh`
  REST blob→tree→commit→ref workaround. **Gotcha: `-f content=@-` sent EMPTY blobs** (every SHA was
  the empty-blob `e69de29b…`) — must use `jq -n --rawfile c <file> '{content:$c,encoding:"base64"}' |
  gh api …/git/blobs --input -` (a big base64 as a command `--arg` also hits `Argument list too long`).
  Always sanity-check `gh api compare/main...branch` shows the expected additions/deletions before the PR.
- **Auth verification:** login/sign-up screens are public → screenshot-verifiable; authenticated
  dashboards need the user to sign in (Claude cannot type passwords). The browser MCP resize does NOT
  reflow to a true mobile viewport (fixed ~1568px capture) → mobile is on-device/CDP.

## Files
Foundation: `ThemeProvider.tsx`, `index.html`, `ui/sonner.tsx`, `App.tsx`, `index.css`, deleted
`ThemeToggle.tsx`. Primitives: `index.css` (`@layer components`), `ui/button.tsx`, `components/dark/*`.
Surfaces: `pages/AuthPage.tsx` + `components/auth/*` + auth-adjacent pages; `components/onboarding/*`;
`DashboardLayout.tsx`, `MobileTopNav.tsx`, `MobileBottomNav.tsx`, `components/donny/*`;
`pages/{Business,Brand,Creator}Dashboard.tsx` + `components/dashboard/*` + `components/dragonshare/*`
(dashboard tiles) + `components/first-run/*`.

Spec: `docs/superpowers/specs/2026-07-17-dark-luxe-app-theme-slice1-design.md`.
Plan: `docs/superpowers/plans/2026-07-17-dark-luxe-app-theme-slice1.md`.
