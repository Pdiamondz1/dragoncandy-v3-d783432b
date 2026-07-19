# Design System

> Screenshots of all screens are in the `/designs` folder. Always reference them when building or modifying UI.

## Theme — Light app, Dark entry surfaces (current, 2026-07-18)

**The working app is LIGHT; only entry surfaces (auth/onboarding/`/internal`) are dark — the public
landing is now LIGHT too.** After a brief experiment that forced the whole app dark (PR #269), founder
feedback was that the dark *app* was too dark, some text unreadable, and the phased-rollout white
patches looked unfinished — so the app was reverted to its **original light theme** (PRs #275 + #277).
**2026-07-18:** the public landing dropped its own scoped `.dark` wrapper as part of the "Human-driven.
AI-assisted." redesign (PR #293) — it now renders on `bg-white` like the rest of the app, so the
dark-marketing carve-out narrowed from four surfaces to three. Build/restyle **app** UI **light** (the
`dc-*` palette below, `bg-white` cards, `dc-text`/`dc-text-muted` on light, pink/gray dashboard headers)
— this now includes the landing (see "Landing's own scoped marketing identity" below for its
additional, additive token/font layer).

**Dark surfaces (only these):**
- **Login/sign-up + auth-adjacent** (`AuthPage`, forgot/update/verify/restore/invite) and **onboarding**
  (`OnboardingWizard`) — each calls the **`useDarkHtml()`** hook (`src/hooks/useDarkHtml.ts`), which adds
  `dark` to `<html>` for the route's lifetime (mirrors `InternalLayout` for `/internal`) and reverts on
  unmount, so `<body>` is dark and their dark literals + glows render correctly.
- **`/internal` AIOS** — `InternalLayout` adds `dark` to `<html>` (dark ops-deck).

`ThemeProvider` = `defaultTheme="light"` (NOT `forcedTheme` — a forced light would fight
`InternalLayout`/`useDarkHtml`'s `<html class="dark">`; a forced dark makes the whole app dark). No
light/dark toggle.

**When building a DARK surface**, the reusable dark-luxe kit lives on: `.dc-surface`/`.dc-panel`/`.dc-field`
classes, `dc-teal-pill`/`dc-ghost-pill` button variants, `GlowBackdrop`/`Eyebrow` (`src/components/dark/`),
the white-opacity text ramp (`text-white`→`/80`→`/60`→`/40`), teal+pink accents, and errors as
`bg-red-500/10 text-red-300`. **Gotchas:** (1) a scoped-div `.dark` alone leaves `<body>` light → the
auth glows composite over white and wash out; use `useDarkHtml()` so `<body>` is dark. (2) `.dc-field`
(a `@layer components` class) loses to a shadcn `<Input>`'s own utilities → use explicit
`border-white/15 bg-white/5 text-white placeholder:text-white/40` there. (3) Dark-fill-as-text trap:
`text-dc-dark`/`text-dc-teal-btn`/`text-dc-pink-accent-btn` are correct **on** a teal/pink/white fill but
invisible as text on a dark page.

Video backdrops remain landing-only, and are now **opt-in** (off by default — see below). Full
mechanics + history: `docs/wiki/concepts/dark-luxe-app-theme.md`.

## Landing's own scoped marketing identity (additive, never leaks into the app)

The public landing (`src/pages/LandingPage.tsx` + `src/components/landing/*`) is light like the rest
of the app, but it is **not** on the shared `dc-*`/Outfit system — it carries its **own** marketing
visual identity, kept strictly additive so it can never regress the authenticated app:

- **Tokens:** a `landing.*` Tailwind color group (`grape`, `pink`, `mint`, `yellow`, `lilac`, plus
  soft/line/ink variants) and matching `landing-pink`/`landing-mint` box-shadow tokens, added to
  `tailwind.config.ts` **alongside**, never in place of, the existing `dc-*` tokens.
- **Fonts:** self-hosted `.woff2` (the existing Outfit/Pacifico pattern — no Google Fonts CDN) —
  **Bricolage Grotesque** (`font-display`, headlines), **Instrument Sans** (`font-sans-alt`/
  `font-instrument`, body), **Silkscreen** (`font-pixel`, eyebrows/step numbers/footer tag). The
  authenticated app keeps Outfit/Pacifico; these fonts are landing-scoped only.
- **Only landing components reference these tokens/fonts**, so nothing needs to be "scoped back out"
  the way the old `.dark` wrapper was — the app was never at risk of inheriting them.
- **Video backdrop is opt-in, off by default.** `LANDING_VIDEO_BACKDROP_ENABLED` (in
  `src/lib/featureConfig.ts`, mirrors `BRAND_ROLE_ENABLED`) gates the entire cinematic-video system
  (`RotatingBackdrop`/`landingClips`/`VideoSlot`/`MediaSlot`) behind a single lazy-loaded
  `HeroVideoBackdrop.tsx`. Default `false` — the shipped landing is a static, illustrative hero;
  flipping the flag (plus real, non-AI footage) re-enables the video experience with zero other code
  changes. See `docs/wiki/concepts/landing-human-driven-redesign.md`.

## Shared light-app kit (use these for the light app)

The light app has **one** consistent, on-brand look, codified in `src/components/app/`. When building or
restyling an app surface, adopt these instead of hand-rolling — that's what keeps it consistent:

- **`PageBody`** — the page-body wrapper (`mx-auto max-w-6xl space-y-8`; `maxWidth` prop). Owns
  max-width + section rhythm. **Do NOT add your own page padding** — the `DashboardLayout` shell owns it
  (incl. the `pb-24` mobile-nav clearance). Toolbar-style pages can pass `className="space-y-4"`.
- **`AppCard`** — the one canonical card: `rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm`
  (`pad="5"|"6"`; `variant="emphasis"` = 2px teal border for selected/featured; `variant="inset"` =
  `bg-dc-teal/[0.04]` soft-tint nested panel). Wrap an existing shadcn `Card`+`CardHeader/CardContent`
  with `<AppCard className="p-0">` (don't double-pad). This is a NEW primitive — do **not** restyle the
  shadcn `ui/card` (it's shared with dark surfaces).
- **`AppChip`** — de-grayed filter/segment control (renders a `<button>`): off = `bg-white
  border-dc-teal/20 text-dc-text-muted`, on (`active`) = teal fill. Never nest inside another
  button/clickable card.
- **`AppStatusBadge`** — brand-tinted status badge (a `<span>`; `tone="teal|pink|amber|neutral"`, never
  gray). Use for non-interactive tags/pills, incl. inside clickable cards (where `AppChip` would make an
  invalid nested button).
- **Buttons:** filled primary → `<Button variant="dc-primary">` (one teal fill, `dc-teal-btn`); pink
  secondary → `variant="dc-secondary"` (white, pink text, teal border — never a gray border/hover).

**De-gray palette (surfaces/badges — the no-gray rule):** gray backgrounds → white / `bg-dc-teal/[0.04]`
inset; gray "off" chips → `AppChip`; gray status badges → `AppStatusBadge`; `border-gray-*` →
`border-dc-teal/15`; gray input fills → `bg-white border-dc-teal/20`; off-brand `bg-blue-*`/purple accents
→ teal/pink. **Gray secondary text (`dc-text-muted`/`text-gray-500`) is fine** — the rule is about
surfaces/badges, not text. `amber` is the allowed warm-neutral status tone. (Applied to dashboards +
campaigns + browse in Phase 1; messaging/settings/DragonShare/etc. follow.)

## Color Palette (Tailwind `dc-*` tokens)

Use the `dc-*` Tailwind tokens defined in `tailwind.config.ts` — never hardcode hex values in components.

| Token | Tailwind class | Hex | Usage |
|-|-|-|-|
| Teal (Primary) | `dc-teal` | `#4DD9C0` | Primary buttons, borders, headings, icons |
| Teal Dark | `dc-teal-dark` | `#00E5CC` | Hover/accent teal |
| Teal Button | `dc-teal-btn` / `dc-teal-btn-hover` | `#0F766E` / `#115E59` | Dark teal button fills |
| Pink (Secondary) | `dc-pink` | `#F9A8D4` | Inbound bubbles, CTA accents |
| Pink Accent | `dc-pink-accent` | `#EC4899` | Secondary button text, links, star ratings |
| Pink Accent Button | `dc-pink-accent-btn` / hover | `#DB2777` / `#BE185D` | Pink button fills |
| Pink Background | `dc-pink-bg` | `#F9C8E0` | Browse Creators, business dashboard header |
| Gray Background | `dc-gray` | `#A8A8A0` | Main app background (most screens) |
| Dark | `dc-dark` | `#1A1A2A` | Dark backgrounds |
| Card | `dc-card` | `#FFFFFF` | Card backgrounds |
| Text | `dc-text` | `#111111` | Headings, bold labels, card titles |
| Text Muted | `dc-text-muted` | `#555555` | Body copy, subtitles, placeholder text |
| Yellow | `dc-yellow` | `#FACC15` | CTA accent strips on campaign cards |

## Typography

| Element | Style |
|-|-|
| Page titles / H1 | ALL CAPS, bold, large — teal (`#4DD9C0`) on dark bg, dark on light bg |
| Section headings / H2 | Title case or ALL CAPS, bold, dark or teal |
| Card titles | Bold, sentence case, dark (`#111111`) |
| Body text | Regular weight, sentence case, gray (`#555555`) |
| Button labels | Bold or semi-bold, sentence case (e.g. "Get Started", "Apply Now") |
| Subtext / captions | Small, light gray, sentence case |
| Stats / numbers | Extra bold, large, black — used for Projects Completed, Reels, etc. |

## Buttons

| Type | Style |
|-|-|
| Primary CTA | Full-width pill shape, teal fill (`#4DD9C0`), white bold text |
| Secondary CTA | Full-width pill shape, white/light fill, pink text (`#EC4899`) with dark border |
| Ghost / Outline | Pill shape, transparent fill, dark border, pink or teal text |
| Action (small) | Pill shape, pink or teal fill, white text — used in cards (e.g. "View Portfolio") |
| Send button | Dark circle with arrow icon (messaging) |
| Add button | Dark circle with `+` icon (bottom nav center) |

## Cards

* White background, large rounded corners (`rounded-2xl` or `rounded-3xl`)
* Subtle shadow or teal border (`border border-teal-300`)
* Consistent internal padding
* Creator cards: thumbnail image (left, rounded) + name + description + action button
* Campaign cards: full-bleed image with dark overlay + text + company avatar at bottom
* Quick action cards: teal border, bold title, short description, centered text

## Navigation

* **Top nav:** Logo (top-left) + hamburger menu (top-right), minimal — no labels
* **Bottom nav:** 7 icons — Home, Favorites, Play/Video, **+ (teal, prominent center)**, Campaigns/List, Megaphone/Promote, Profile
* Active center `+` button: teal circle, larger than other icons, elevated
* Inactive icons: gray (`#888888`)

## Messaging UI

* Background: medium gray (`#A8A8A0`)
* Inbound bubbles: pink (`#F9A8D4`), left-aligned, with sender avatar
* Outbound bubbles: teal (`#4DD9C0`), right-aligned, with user avatar
* Bubble shape: large pill / fully rounded ends
* Top bar: white/light bg, creator name in teal, "Recently Active" subtitle, phone icon (pink circle)
* Input bar: white pill input + dark `+` button (left) + dark send arrow (right)

## Profile & Portfolio Pages

* Hero: full-bleed background image (photo or colored wall)
* Profile card: white pill/rounded card overlaid at bottom of hero — avatar (left, circular with teal border) + name + rating + location
* Stats row: 3 columns separated by pink vertical dividers — large bold number + label
* Reviews: 3-column horizontal scroll, plain text quotes + bold business name attribution
* CTA button: full-width teal pill at bottom

## Page-Specific Backgrounds

The **working app is uniformly white** — pages are `bg-white`, wrapped in the shared `PageBody` (max-width
+ section spacing) inside the `DashboardLayout` shell (which owns padding). Accent color comes from
**cards (teal-bordered), chips, badges, and CTAs — not page washes.** The old per-page pink/gray
backgrounds are retired (they never matched the built app). Only the mobile top-nav keeps a subtle pink
gradient. Login/sign-up/onboarding + `/internal` are dark; the public landing is light on its own
scoped token/font system (see the Theme section).

| Surface | Background |
|-|-|
| All authenticated app pages (dashboards, campaigns, browse, messaging, settings, DragonShare, profiles, …) | White (`#FFFFFF`) |
| Public landing (`/`, `/home`, `/landing`) | White paper (`#FFFFFF`, landing's own `landing-paper` token) |
| Login/sign-up + onboarding + `/internal` (AIOS) | Dark charcoal (`#1A1A2A`) |

## Design Rules

* **Always use Tailwind utility classes** — never hardcode hex colors in inline styles
* **Mobile-first** — all screens designed for mobile (375–430px width)
* **Pill-shaped buttons everywhere** — use `rounded-full` for all buttons
* **Teal borders on interactive cards** — use `border border-teal-300` or `border-2 border-teal-400`
* **Never change the color system** without explicit instruction — teal + pink is the core brand identity
* **Avatar images** always use `rounded-full` with a teal ring (`ring-2 ring-teal-400`)
* **Full-width buttons on mobile** — `w-full` for all primary CTAs
* **Consistent spacing** — use `p-4` or `p-6` for card padding, `gap-4` between elements
* **Never use gray backgrounds/banners/badges** — use brand-adjacent colors (teal, pink, warm neutrals)
* **Opacity variants are permitted** — e.g., `bg-dc-teal/12`, `bg-dc-pink/50` for layering and hover states
* **Desktop and mobile are separate targets** — desktop changes use `lg:` / `xl:` prefixed classes only; mobile changes use base (unprefixed) classes only. Never apply mobile changes to desktop or vice versa. Test both viewports after any UI change.
* **Bottom-anchored mobile UI: `dvh` + safe-area, never `vh`** — the app document never scrolls (h-screen shell + inner overflow-auto main), so iOS Safari toolbars never collapse and `vh` exceeds the visible height. Size bottom sheets with `dvh`/`svh` and pad bottom-fixed footers/navs with `env(safe-area-inset-bottom)`. Never put a transform (or `will-change: transform`) on an ancestor of `position:fixed` UI — `PageTransition` is opacity-only by contract; portal hand-rolled overlays to `document.body`. See `docs/wiki/concepts/mobile-viewport-fixed-positioning.md`.
* **Desktop side-panels/drawers overlay, never steal flex width** — a docked panel meant to coexist with full-width page content (e.g. the Donny desktop panel) must be a **`fixed` overlay** (`fixed inset-y-0 right-0 z-40`), not an in-flow `flex-shrink-0` sibling of the `flex-1` `<main>`. An in-flow panel subtracts its width from `<main>`, and because pages use **viewport** breakpoints (not container queries) the grids keep their wide-screen column counts at a too-narrow width and crush their cards ("squish"). A `fixed` panel leaves the flex flow so `<main>` keeps 100% width. See `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` (§4).
* **App chrome sits BELOW the modal layer — never tie `z-50`** — persistent app chrome (`MobileBottomNav`, `MobileTopNav`, desktop header, `DonnyDesktopPanel`) is **`z-40`**; the Radix modal layer (every `Sheet`/`Dialog`/`AlertDialog`/`Popover`/`Dropdown`/`Tooltip`) is **`z-50`**; `DonnyMobileSheet` is `z-[60]/[61]`; toasts are `z-[100]`. At `z-50` the nav tied the modal layer and (both portal to `<body>`) its opaque bar painted over bottom-sheet action buttons on iOS Safari. A new **non-modal in-page** `fixed`/`sticky` bottom bar that coexists with the nav (e.g. `StickyApplyCTA`) must offset itself above the nav on mobile — `bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-0` (the `6rem` mirrors the content area's `pb-24` nav-clearance) — or live inside a modal. See `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` (§6).
