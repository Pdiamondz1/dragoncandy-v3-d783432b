---
title: Light-App Kit
type: concept
created: 2026-07-18
updated: 2026-07-18
sources: [2026-07-18-light-theme-polish-phase1.md, 2026-07-18-light-theme-polish-phase2.md, 2026-07-18-light-theme-polish-phase3.md, 2026-07-18-light-theme-polish-phase4.md, 2026-07-18-degray-backgrounds-accents.md]
tags: [design-system, ui, tailwind, consistency, frontend, light-theme]
---
# Light-App Kit

The shared primitive kit that gives the **light** working app one consistent, on-brand look —
`src/components/app/`, introduced in the light-theme polish (Phase 1, PR #280, 2026-07-18). Build/restyle
app surfaces with these instead of hand-rolling; that's what keeps it consistent AND de-grayed. (The
app is light; the dark surfaces are landing/auth/onboarding/`/internal` — see [[Dark-Luxe App Theme]].)

## The primitives

- **`PageBody`** — page-body wrapper: `mx-auto max-w-6xl space-y-8` (`maxWidth?: "6xl"|"4xl"|"full"`).
  Owns max-width + section rhythm **only**. The `DashboardLayout` shell owns ALL page padding (incl. the
  `pb-24` mobile-nav clearance), so a page must **not** add its own `px/p/pb/space-y` wrapper — that was
  the source of the double-padding and the `space-y-4…14` drift. Toolbar-style pages pass
  `className="space-y-4"` (or `space-y-0`) when sections are meant to sit close.
- **`AppCard`** — the one canonical card: `rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm`
  (`pad="5"|"6"`; `variant="emphasis"` = 2px teal border for selected/featured; `variant="inset"` =
  `rounded-xl border-dc-teal/10 bg-dc-teal/[0.04]` soft-tint nested panel). Collapses the ~5 hand-rolled
  card-border treatments + the `rounded-xl`/`2xl`/`3xl` drift into one.
- **`AppChip`** — de-grayed filter/segment control (a `<button>`): off = `bg-white border-dc-teal/20
  text-dc-text-muted`, on (`active`) = teal fill.
- **`AppStatusBadge`** — brand-tinted status badge (a `<span>`; `tone="teal|pink|amber|neutral"`, never
  gray).
- **Buttons** — filled primary → the `dc-primary` `<Button>` variant (one teal fill, `dc-teal-btn`
  #0F766E — the accessible one, not the light `dc-teal` #4DD9C0); pink secondary → the new
  **`dc-secondary`** variant (white, pink text, teal border — never a gray border/hover).

## Three durable gotchas

1. **Nested-button trap.** `AppChip` renders a `<button>`. Putting it inside another `<button>`/
   clickable card yields **invalid nested buttons** (the browser splits/hoists them, breaking the card's
   click zone). For a non-interactive tag/pill inside a clickable card, use **`AppStatusBadge`** (a
   `<span>`). `AppChip` is only for genuinely interactive filter/segment controls not nested in a button.
2. **`AppCard` over a shadcn `Card`.** When a surface already uses shadcn `Card`+`CardHeader`/
   `CardContent`, wrap with `<AppCard className="p-0">` (don't flatten into `AppCard` children) — else
   `AppCard`'s `p-5` stacks on the `CardHeader`/`CardContent` padding → double-pad. **`AppCard` is a NEW
   primitive, NOT a restyle of shadcn `ui/card`** (that's shared with the dark surfaces — leave it).
3. **`AppCard` is not a `forwardRef` component** (Phase 2, `PublicBusinessProfile`). It doesn't forward a
   `ref`, so converting a card that needs one (scroll anchor, measurement, focus target — e.g. a
   `reviewsRef` scroll-to-reviews click target) would **silently drop the ref** and break the behavior.
   When a card needs a `ref`, keep the `ref` on a plain wrapping `<div>` (leave that one node
   un-migrated, or nest the `AppCard` inside the ref'd div) rather than converting the ref'd node itself.

## The de-gray palette (surfaces + badges only)

The "no gray" rule targets **backgrounds / badges / off-state chips**, not text (`dc-text-muted` #555 is
a gray by design and reads fine on white):

| Gray | Becomes |
|---|---|
| gray page/section/card fill | white / `AppCard` / `bg-dc-teal/[0.04]` inset |
| gray "off" chip | `AppChip` |
| gray status badge | `AppStatusBadge` |
| `border-gray-*` | `border-dc-teal/15` |
| gray input fill | `bg-white border-dc-teal/20` |
| off-brand `bg-blue-*` / pink→purple gradient | teal / pink |
| **gray secondary text** | **unchanged** |

`amber` is the allowed warm-neutral status tone. Defensible keeps: emerald *inside* teal gradients,
social-platform (Instagram/Facebook) colors, the green **"Available"** availability badge (green = the
"available now" semantic; only the neutral **Busy** state moves to `AppStatusBadge tone="neutral"`),
and the messaging **chat bubbles** (pink inbound / teal outbound — the messaging brand identity).

## Watch for: invisible `text-white`
On now-white surfaces, `text-white` that isn't on a teal/pink/colored fill is **invisible** (a leftover
from the [[App Theme Pivot Session]] dark→light revert). Convert to `text-dc-text`/`text-dc-text-muted`;
keep `text-white` that sits on a colored button/badge/avatar.

## Rollout
- **Phase 1** (shipped, PR #280): the shared kit + adoption across the 3 dashboards, campaigns (builder +
  list/details/marketplace), browse + the full-page-gray/off-brand-button quick wins.
- **Phase 2** (shipped, PR #282, [[Light-Theme Polish Phase 2 Session]]): **messaging** (retired the
  `bg-teal-50` "teal island" page bg → white + `PageBody`; `teal-50` wash panels → `bg-dc-teal/[0.04]`
  inset tint), the **DragonShare + Dragon Feed** pair (`PageBody`/`AppCard`/`AppChip`), and **public
  profiles** (`AppCard`/`AppStatusBadge`; pink hero untouched) — surfaced the third gotcha (`AppCard`
  is not `forwardRef`).
- **Phase 3** (shipped, PR #285, [[Light-Theme Polish Phase 3 Session]]): **Settings** (the shared
  `SettingsSection` wrapper de-grayed — cascades across every settings section AND promotions'
  `CGCPostingPreferences`; `StripeConnectSetup` chrome-only), **Promotions** (cards → `AppCard`, tabs →
  `AppChip`, pills → `AppStatusBadge`), and **Org/Billing/Payments** (money-flow styling-only; failure
  red + semantic payment colors kept; tier badges de-grayed with starter/growth kept distinct).
- **Phase 4** (shipped, PR #288, [[Light-Theme Polish Phase 4 Session]]): the **Outstand**
  social-integration surface (~47 files, 6 reviewed sub-batches). Its blue/purple/red are a MIX of
  social-platform BRAND colors (KEEP) + off-brand accents (convert), so it needed **per-instance judgment,
  not find-replace** — the reason it was its own phase. Chart data-viz colors and money-flow (DragonDash
  rush) preserved. **With Phase 4, all four surface groups are on the kit.**
- **Backgrounds + off-brand-accents cleanup** (shipped, PR #289,
  [[De-gray Backgrounds & Off-Brand Accents]]): a cross-app pass after the phases, prioritizing the two
  highest-impact categories the surfaces/badges rule left — **panel `bg-muted`/`bg-gray-*` backgrounds** →
  `bg-dc-teal/[0.04]` inset and **off-brand blue/purple/indigo accents** → teal/pink (keystone: the
  blue/indigo sponsorship cards). Extended the palette to `bg-muted` (but NOT inside shadcn `ui/*`).
  **With this, the entire light app — every panel and accent, not just cards/badges — is on-brand.**

## The de-gray palette also covers `bg-muted`
`bg-muted`/`bg-muted/NN` is a shadcn semantic token that resolves to a near-white **warm gray** in light
mode, so a `bg-muted` PANEL fill reads as an unstyled gray surface → convert to `bg-dc-teal/[0.04]` inset
(or `AppCard variant="inset"`). **Exception: `bg-muted` inside `src/components/ui/*` primitives stays** —
those are theme-aware base components shared with the dark surfaces. And a `bg-dc-teal/[0.04]` inset tint
is calibrated for a WHITE surface — over a colored bubble/fill it vanishes, so use a translucent overlay
(`bg-white/40` on a light bubble, mirroring `bg-white/15` on a dark one) there instead.

## See Also
- The `DESIGN_SYSTEM.md` core doc — "Shared light-app kit" section + the clean-white background table.
- [[Dark-Luxe App Theme]] — the dark marketing/entry surfaces (the light/dark split).
- [[App Theme Pivot Session]] — the pivot that made the app light (why this polish followed).
