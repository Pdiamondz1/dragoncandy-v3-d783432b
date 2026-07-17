---
title: Dark-Luxe App Theme
type: concept
created: 2026-07-17
updated: 2026-07-17
sources: [2026-07-17-dark-luxe-app-theme-slice1.md]
tags: [theme, dark-mode, design-system, tailwind, next-themes, frontend]
---
# Dark-Luxe App Theme

Bringing the whole authenticated app into visual consistency with the "Dark Luxe" landing page
by forcing a **single dark theme** and converting the hardcoded light surfaces to the landing's
dark-luxe language. Shipped in **phased slices** — Slice 1 (PR #269, 2026-07-17) = foundation +
auth/onboarding + shared chrome + dashboards. Video backdrops stay landing-only.

## Key Decisions

### Two parallel color systems (the insight that shapes everything)
The app runs two color systems, and only one responds to the theme:
- **~847** semantic shadcn tokens (`bg-background`, `bg-card`, `bg-sidebar`, `border-border`,
  `text-muted-foreground`) — **auto-flip** to dark under the `.dark` class (`src/index.css`).
- **~1,900** hardcoded `dc-*` hex + literal `bg-white`/`bg-gray-*`/`text-gray-*`/`dc-pink-bg` —
  do **not** respond to the theme.

**Flipping the theme flag alone = a broken half-dark app** (dark sidebar, white page bodies).
The fix is two-part: (a) turn the token layer dark once, and (b) mechanically convert the literal
light surfaces. The landing itself uses **literals** (`bg-dc-dark` + `bg-white/5` + a
white-opacity text ramp), not tokens — so it is the reference, and its scoped-`.dark` technique
(see [[Landing Redesign & Public Lead Capture]]) generalizes here to a **global** `<html class="dark">`.

### Force dark with `forcedTheme`, not `defaultTheme`
`ThemeProvider` uses `forcedTheme="dark"`. `defaultTheme="dark"` only affects users with no stored
preference — a returning user who once toggled Light has `theme:"light"` in localStorage and would
still render light. `forcedTheme` overrides stored + system values and neuters any stray `setTheme`.
`<html class="dark" style="color-scheme:dark">` in `index.html` kills the first-paint flash and
fixes native controls. The light/dark toggle is retired.

### Retune the `.dark` token block — highest-leverage single edit
Retuning the neutral `.dark` CSS vars (`--background` to brand charcoal `#1A1A2A`, `--card`/`--popover`
a `white/5`-over-charcoal feel, `--border`/`--input` a `white/10-15` feel, `--muted-foreground` a
`white/60` feel) — **leaving `--primary` (teal), `--secondary` (pink), `--ring`, `--sidebar-*`
untouched** — re-skins all ~847 token surfaces (sidebar, glass header, **every Radix portal**) for
free. Because the class is on `<html>` (not a subtree), token-based portals inherit dark automatically;
only **literal-painted** portaled surfaces (e.g. `MobileBottomNav`) need manual conversion.

### Global token flips fight a phased rollout
The optional "accelerator" (CSS-var-backing `dc-card`/`dc-pink-bg` so every `bg-dc-card` flips
globally) was **deliberately skipped**: it would darken cards on the **out-of-scope** pages that still
have light bodies until their slices land → broken half-states. Per-file conversion is the
phasing-safe path. (Corollary: out-of-scope pages stay **coherent light pages** because their literal
classes ignore `.dark` — the app is temporarily two-toned but readable, not broken.)

### Shared primitives keep churn low
Importless, global vehicles so leaf files just swap class strings: `@layer components` classes
`.dc-surface` / `.dc-panel` / `.dc-field` (named `.dc-panel` **not** `.dc-card`, to avoid clashing
with the `bg-dc-card` utility); `button.tsx` CVA variants `dc-teal-pill` / `dc-ghost-pill`; and
`GlowBackdrop` + `Eyebrow` components in `src/components/dark/`.

## Known Issues / Traps

### The contrast trap — dark-fill-as-text
`text-dc-dark`, `text-dc-teal-btn` (#0F766E), `text-dc-pink-accent-btn` (#DB2777) are **dark fills**.
Used as a **text color on the dark page/panel** they are invisible / low-contrast. Convert to
`text-white` / `text-dc-teal` / `text-dc-pink-accent`. **BUT** on a teal/pink/white **fill** they are
correct (e.g. `bg-dc-teal text-dc-dark` button text — the landing's own pattern; the `dc-teal-pill`
variant relies on it). Judge by the element's own background. This bit `ActivityFeedCard` (invisible
`text-dc-dark` title), `PendingActionBanners`, the `RecentActivitySection` active tab, and the
`dc-primary` button (its `dark:text-dc-dark` was a latent bug that forcing-dark exposed app-wide —
fixed by dropping the override so white text applies in all modes). **The literal residual-grep does
NOT catch these** — run a whole-branch `text-dc-dark|text-dc-teal-btn|text-dc-pink-accent-btn` sweep
and judge each hit on-fill vs on-dark.

### Named file lists miss children — grep the tree
A per-group completeness grep over the touched *directory* (`bg-white([^/]|$)|bg-gray-|text-gray-|
text-dc-dark|…`, using `bg-white([^/]|$)` so `bg-white/5` opacity variants don't false-positive)
caught two dashboard blocks the task list didn't enumerate (`ActivityFeedCard`, `PendingActionBanners`)
and the first-run children (`MissionChecklist`/`MissionItem`). A "white hole" on a shared component
looks broken; grep the directory, don't trust a hand-written file list.

### Shared chrome includes the Donny interior
The Donny chat panel is docked on **every** authenticated page, so converting only the panel container
leaves a white chat box everywhere — its interior (messages, input, tray, chips, rich cards) is shared
chrome and belongs in the same slice.

## Verification notes
Login/sign-up screens are **public** → screenshot-verifiable on prod (deploy confirmed via the
`.dc-panel`/`.dc-surface`/`.dc-field` sentinels in the prod CSS bundle — Tailwind emits custom classes
literally, unlike minified JS). Authenticated dashboards need the **user to sign in** (Claude cannot
type passwords). The browser MCP window-resize does **not** reflow to a true mobile viewport (fixed
~1568px capture) → mobile is on-device / CDP device-metrics.

## Deploy mechanics
`git push` hangs in this environment (send-pack, after the pre-push build hook), so the branch landed
via the `gh` REST blob→tree→commit→ref workaround. **Gotcha:** `gh api …/git/blobs -f content=@-`
silently sends **empty** blobs (every SHA becomes the empty-blob `e69de29b…`); use
`jq -n --rawfile c <b64file> '{content:$c,encoding:"base64"}' | gh api …/git/blobs --input -`
(a big base64 passed as a command `--arg` also throws `Argument list too long`). Always sanity-check
`gh api compare/main...branch` shows the expected additions/deletions **before** opening the PR.

## See Also
- The `DESIGN_SYSTEM.md` core doc — the `dc-*` tokens + the "dark is now the default" rule.
- [[Landing Redesign & Public Lead Capture]] — the scoped-`.dark` technique this generalizes to a global force.
- [[Landing Cinematic Video Redesign]] — the landing look this makes the app consistent with.
- [[Donny Chat UX]] — the Donny panel whose interior is converted here as shared chrome.
- [[Mobile Viewport & Fixed Positioning]] — the fixed-overlay / portal rules the chrome relies on.
