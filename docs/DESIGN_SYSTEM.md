# Design System

> Screenshots of all screens are in the `/designs` folder. Always reference them when building or modifying UI.

## Theme — Landing is dark and video-led; entry stays light; `/internal` stays dark (current, 2026-08-22)

**This section used to say the public landing was light and shared one visual identity with
login/sign-up and onboarding, and that `/internal` was the only surface still dark. Both claims
are now false.** The landing was rebuilt as one full-bleed cinematic video screen
(`feat/landing-cinematic-single-cta`, **merged 2026-08-23** as #459 — this said "**unmerged**,
blocked on written permission" until the founder confirmed permission and it shipped). The landing
is now a dark surface alongside `/internal`. **Login/sign-up and onboarding are
unaffected by this — still light, unchanged from before.**

**The landing (`/`, `/home`, `/landing`).** `LandingPage.tsx`'s root is `bg-landing-grape`
(`#241332`), not white — the file's own comment explains why: the hero's backdrop is dark video,
so a white page background would flash behind it before the first frame paints. The page is one
screen (`Header` + `LandingHero` + a transparent footer) and does not scroll: the page wrapper is
`min-h-[100dvh]` (never `vh` — see the safe-area rule below, still load-bearing here), the header
is an absolute overlay, `LandingHero` is `flex-1`, and the footer is `shrink-0`. **The page not
scrolling depends on `AppShell` being `h-[100dvh]` too** — at `h-screen` the shell overhung `body`
on iOS Safari and the whole screen scrolled anyway; see the shell rule under Design Rules.
**One CTA, plus two secondary ways out.** "Get started" is the only pill. Under it sits a plain
underlined "Already have an account? **Log in**" in `landing-mint-line` (`#B8ECDA`, *not* the
slogan's `#7BE3C0` — small text needs 4.5:1, and the brighter mint measures 3.91 at p90 in that
band against the paler one's 4.62), and the footer carries a bordered "Learn more" pill to
`/how-it-works`. Neither is filled: a second fill makes the page two calls to action and the
single-CTA premise is gone.
`RotatingBackdrop` plays **eight** real reels — **five ABB, three Uncle Rocco** (this said ten,
five and five until 2026-08-23; two Uncle Rocco reels were dropped for burned-in captions, so
perfect alternation is arithmetically impossible and `landingClips.ts` holds a minimum-adjacency
order that a test pins) — full-bleed behind the whole page (`-z-20`), under a `landing-grape`
gradient scrim (`-z-10`) that darkens top and bottom so the eyebrow, headline, CTA and footer stay
legible over a bright frame.

**The backdrop is mounted on the PAGE, not on the hero, and the footer paints nothing.** It used
to sit inside `LandingHero` with an opaque `bg-white` footer beneath it, which drew a hard white
band across the bottom of a page whose entire premise is one full-bleed cinematic screen. The
footer now carries no background and no top border — either one re-draws that seam — and its text
is `text-white/70`, legible off the scrim's heaviest stop (`to-landing-grape/95`). Measured, not
assumed: against the brightest frame in the footer's band across all **sixteen** encodes (eight reels × portrait + wide; this said twenty), the worst
case is **7.42:1**, versus the 4.5:1 WCAG requirement for normal-size text. There is no feature flag gating this anymore: `LANDING_VIDEO_BACKDROP_ENABLED` was
**deleted**, not flipped — with the video AS the page, an "off" state would ship a blank homepage.
The real fallback for no-clips / a failed clip / `prefers-reduced-motion` is `RotatingBackdrop`'s
own poster-still path, not a flag. Pipeline for producing the reels:
`docs/runbooks/landing-video-backdrop-kit.md`.

**Login/sign-up + onboarding stay light, on the same `landing-*` token/font system as before —
nothing about them changed.** `AuthShell` (`src/components/auth/AuthShell.tsx`) is still
`bg-white`; the 6 auth pages and `OnboardingWizard` still render on it. So the `landing-*` token
system is still one shared identity across landing + entry — what changed is that the landing
surface now paints those tokens **dark** while entry keeps painting them **light on white paper**.
They are no longer one continuous visual surface, and that split is deliberate, not drift:

**The seam between the dark video landing and the white signup screen is known and accepted, not
an oversight.** The CTA ("Get started") goes to `/auth?mode=signup`, which already has its own
role-selection step. Going from full-bleed dark video to a plain white form is a register change —
marketing moment to transactional form — not a continuity bug waiting to be fixed.

**`landing-mint-line-bright` (`#7BE3C0`) is the mint that survives as text over moving footage.**
The brand fill `landing-mint` (`#2FC796`) vanishes against a lit dish or a bright frame; the
existing `mint-line` (`#B8ECDA`) is brighter but reads too pale against skin/food tones on video.
**That judgement is about HEADLINES, and it inverts for small text.** Paler means more contrast
against a bright frame, and small text needs 4.5:1 where large text needs 3.0:1 — so the hero's
"Log in" link uses `#B8ECDA` (4.62 worst p90) precisely because `#7BE3C0` does not clear the bar
there (3.91). Pick the mint by the text size and re-measure; do not "correct" one to match the
other.
The hero slogan uses it for "Creators" (`landing-pink-line` `#F9BFD6` for "Restaurants") — see
`tailwind.config.ts`'s `landing.*` group for the full ramp and the inline comment recording why the
extra step exists.

**Dark surfaces (now two, by two different mechanisms):**
- **The landing hero** — a plain `bg-landing-grape` page root (`LandingPage.tsx`), not
  `<html class="dark">`. It does **not** use the reusable dark-luxe kit below (`.dc-surface` /
  `GlowBackdrop` / etc.) — it's the same `landing-*` token system entry uses, just applied dark, via
  its own components (`Eyebrow`, `LandingButton`) local to `src/components/landing/`.
- **`/internal` AIOS** — unchanged. `InternalLayout` adds `dark` to `<html>` via its own inline
  `useEffect` (`documentElement.classList.add('dark')`) for the route's lifetime. This is still the
  **only** place `<html class="dark">` is ever set. The shared `useDarkHtml()` hook that used to
  also drive auth/onboarding (`src/hooks/useDarkHtml.ts`) remains deleted — once those 7 surfaces
  (the 6 auth pages + `OnboardingWizard`) went light, nothing else ever called it; `/internal`'s
  toggle was always its own independent mechanism, so the hook staying gone is a no-op for
  `/internal`.

`ThemeProvider` = `defaultTheme="light"` (NOT `forcedTheme` — a forced light would fight
`InternalLayout`'s `<html class="dark">`; a forced dark makes the whole app dark, including the
authenticated app the landing/`/internal` split above does not touch). No light/dark toggle.

**When building a NEW dark surface**, the reusable dark-luxe kit still lives in the codebase
(currently unused by anything shipped — the landing hero and `/internal` each built their own dark
treatment instead): `.dc-surface`/`.dc-panel`/`.dc-field` classes, `dc-teal-pill`/`dc-ghost-pill`
button variants, `GlowBackdrop`/`Eyebrow` (`src/components/dark/`), the white-opacity text ramp
(`text-white`→`/80`→`/60`→`/40`), teal+pink accents, and errors as `bg-red-500/10 text-red-300`.
**Gotchas:** (1) a scoped-div `.dark` alone leaves `<body>` light → glows composite over white and
wash out — apply `dark` to `<html>` (mirror `InternalLayout`'s inline `useEffect`), not just a
wrapper div. (2) `.dc-field` (a `@layer components` class) loses to a shadcn `<Input>`'s own
utilities → use explicit `border-white/15 bg-white/5 text-white placeholder:text-white/40` there.
(3) Dark-fill-as-text trap: `text-dc-dark`/`text-dc-teal-btn`/`text-dc-pink-accent-btn` are correct
**on** a teal/pink/white fill but invisible as text on a dark page.

Full mechanics + history: `docs/wiki/concepts/dark-luxe-app-theme.md` (predates this rebuild — read
the landing-specific detail above first) and
`docs/wiki/concepts/landing-cinematic-video-redesign.md` (describes the superseded, flag-gated,
per-role static-hero design this replaced).

## Marketing + entry's own scoped identity (additive, never leaks into the app)

The public landing (`src/pages/LandingPage.tsx` + `src/components/landing/*`) **and** the entry flow —
login/sign-up (`src/pages/AuthPage.tsx` + the 5 siblings, `src/components/auth/*`) and onboarding
(`src/components/onboarding/**`) — are **not** on the shared `dc-*`/Outfit system used by the
authenticated app — together they carry **one** marketing visual identity (tokens + fonts), kept
strictly additive so it can never regress the authenticated app. **The landing now paints that
identity dark; entry still paints it light** — see the Theme section above for the split and why
the seam between them is intentional, not an inconsistency to fix:

- **Tokens:** a `landing.*` Tailwind color group (`grape`, `pink`, `mint`, `yellow`, `lilac`, plus
  soft/line/ink variants) and matching `landing-pink`/`landing-mint` box-shadow tokens, added to
  `tailwind.config.ts` **alongside**, never in place of, the existing `dc-*` tokens.
- **Fonts:** self-hosted `.woff2` (the existing Outfit/Pacifico pattern — no Google Fonts CDN) —
  **Bricolage Grotesque** (`font-display`, headlines), **Instrument Sans** (`font-sans-alt`/
  `font-instrument`, body), **Silkscreen** (`font-pixel`, eyebrows/step numbers/footer tag). The
  authenticated app keeps Outfit/Pacifico; these fonts are landing + entry scoped only.
- **Entry surfaces reuse landing primitives rather than duplicating them:** a shared
  `AuthShell` wrapper (`src/components/auth/AuthShell.tsx`) gives auth/onboarding the white base +
  soft grape/pink/mint glow (a light echo of the old dark `GlowBackdrop`); forms reuse
  `LandingButton` for primary actions and `Eyebrow` (from `@/components/landing/Eyebrow`) as a
  one-per-screen brand accent above headings. Fields stay calm/standard (shadcn `Input`/`Label`,
  `border-landing-line`, mint/pink focus rings) — "softened for forms," not pixel-everywhere.
- **Only landing + entry components reference these tokens/fonts**, so nothing needs to be "scoped
  back out" the way the old `.dark` wrapper was — the app was never at risk of inheriting them.
- **The video backdrop is no longer a flag — it IS the landing.** `LANDING_VIDEO_BACKDROP_ENABLED`
  and the old flag-gated wrapper machinery (`HeroVideoBackdrop.tsx`, `VideoSlot`, `MediaSlot`) are
  **deleted**, not toggled off — `LandingHero` renders `RotatingBackdrop` directly and
  unconditionally, full-bleed behind the content. This section previously said the flag defaulted
  off and the shipped landing was a static, illustrative hero; that was true through
  `docs/wiki/concepts/landing-human-driven-redesign.md`'s redesign and is no longer true. Still
  landing-only — auth/onboarding never carry it. Production pipeline for the reels themselves:
  `docs/runbooks/landing-video-backdrop-kit.md`.

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
  **It is a filter primitive, and its off state is muted *on purpose* — so it recedes behind the
  content it filters.** That makes it the wrong default when a chip **is** the content: as the
  primary affordance on a page, muted grey on white reads as *disabled*, which is exactly backwards
  for a user who is not tech savvy. Every other documented interactive label in this system is
  coloured (primary = teal fill + white text; secondary = pink text; ghost/outline = pink or teal
  text). For action chips, override at the **call site** — `className="text-dc-teal-btn
  border-dc-teal/30"` — or use `<Button variant="dc-secondary" size="sm" className="rounded-full">`.
  Do **not** restyle `AppChip` itself; it is shared with genuine filter surfaces where muted is
  correct. (Surfaced by the Donny-first dashboard's three taps, 2026-08-09.)
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
gradient. **The public landing is the one exception now:** it's a dark, full-bleed video screen on its
own `landing-*` tokens (see the Theme section above). Login/sign-up and onboarding stay light on that
same token/font system, unaffected; `/internal` stays dark.

| Surface | Background |
|-|-|
| All authenticated app pages (dashboards, campaigns, browse, messaging, settings, DragonShare, profiles, …) | White (`#FFFFFF`) |
| Public landing (`/`, `/home`, `/landing`) | Dark (`landing-grape` `#241332`, full-bleed rotating video) |
| Login/sign-up + onboarding | White paper (`#FFFFFF`, the shared `landing-*`/`AuthShell` token/font system) |
| `/internal` (AIOS) | Dark charcoal (`#1A1A2A`) |

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
* **Bottom-anchored mobile UI: `dvh` + safe-area, never `vh`** — `vh` exceeds the visible height on iOS Safari, because `100vh` is the URL-bar-COLLAPSED height. **This line used to justify that with "the app document never scrolls (h-screen shell + inner overflow-auto main)", and that premise was false — it is what hid the bug in the next rule below.** The shell being `h-screen` is precisely what made the document scroll; `main` being `overflow-auto` only means `main` is not the *document's* scroller. The rule survives its reasoning: use `dvh`, and use it on the shell too. Size bottom sheets with `dvh`/`svh` and pad bottom-fixed footers/navs with `env(safe-area-inset-bottom)`. Never put a transform (or `will-change: transform`) on an ancestor of `position:fixed` UI — `PageTransition` is opacity-only by contract; portal hand-rolled overlays to `document.body`. See `docs/wiki/concepts/mobile-viewport-fixed-positioning.md`.
* **Top-anchored chrome needs `env(safe-area-inset-top)` — and only the NATIVE app can show you** — `index.html` sets `viewport-fit=cover`, so the layout viewport extends **under** the status bar and Dynamic Island. Every element that is genuinely at the top of the viewport (`fixed top-0`, or a `sticky top-0` that is page chrome rather than an in-page section header) must pay that back: `pt-[env(safe-area-inset-top)]` when it has no top padding of its own, or `pt-[calc(<existing>+env(safe-area-inset-top))]` to preserve it. **This is invisible on the web** — mobile Safari's URL bar occupies that space, so the page never sits under the status bar and `viewport-fit=cover` costs nothing. It appears only in a chromeless `WKWebView`, which is why it survived until the first physical-device build (2026-08-14) and why no amount of browser testing would have caught it. Applied to `MobileTopNav`, `landing/Header`, `PublicPageHeader`, `UpdateBanner` and the mobile `ui/toast` viewport. **Do NOT pad in-page `sticky top-0` headers** (`AgendaView`, `CampaignMetricsBar`, `CampaignBrowseContent`, `BrandCreators`, `HelpBriefPage`) — they stick *inside* a scroll container below the real nav, so an inset there inserts a gap mid-page. For a viewport that moves side to side by breakpoint (the toast is `top-0` at base, `sm:top-auto sm:bottom-0`), scope the inset to the breakpoint where it is actually on top and reset it after (`sm:pt-4`). The mirror of the bottom rule above.
* **Desktop side-panels/drawers overlay, never steal flex width** — a docked panel meant to coexist with full-width page content (e.g. the Donny desktop panel) must be a **`fixed` overlay** (`fixed inset-y-0 right-0 z-40`), not an in-flow `flex-shrink-0` sibling of the `flex-1` `<main>`. An in-flow panel subtracts its width from `<main>`, and because pages use **viewport** breakpoints (not container queries) the grids keep their wide-screen column counts at a too-narrow width and crush their cards ("squish"). A `fixed` panel leaves the flex flow so `<main>` keeps 100% width. See `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` (§4).
* **In the iOS shell, `contentInset` must be `'never'` — the CSS owns the safe areas, or the native
  layer does, never both.** `capacitor.config.ts` set `ios.contentInset: 'always'`, which makes
  WebKit shrink `documentElement.clientHeight` by the top inset while `innerHeight`, `100vh` and
  `100dvh` all keep reporting the full height. Measured on an iPhone 17 Pro simulator:
  `innerHeight` **840**, `documentElement.clientHeight` **778**, `safe-area-inset-top` **62** —
  778 = 840 − 62 exactly. Anything sized to a viewport unit is therefore taller than the document
  box, and the webview's own **white** background shows through beneath it (~96pt), clipping
  whatever sits at the bottom of the page. This affects **every** page — `AppShell` is `h-screen`
  — but it is invisible on the app's white surfaces and only became visible when the landing
  footer stopped being white. With `'never'` all four numbers agree (874) and `env(safe-area-*)`
  still reports 62/34, so the existing CSS padding keeps doing the work it already did. **This is
  not reproducible in any browser or emulator** — it needs the real WKWebView.
* **`AppShell` must be `h-[100dvh]`, and `body` — not `<html>`, not `<main>` — is the document's
  scroll container.** `src/index.css` sets `body { height: 100%; overflow-x: hidden }`, and per spec an
  `overflow-x` of `hidden` against a visible `overflow-y` computes `overflow-y` to `auto`. So body is a
  fixed-height scroll box, and anything taller than it makes **body** scroll. At `h-screen` the shell was
  `100vh` — the URL-bar-collapsed height on iOS Safari — so it stood ~60–90px taller than body's box, body
  scrolled by exactly that, and scrolling collapsed the URL bar, which grew `100dvh`, which resized the page
  mid-gesture. Reported from a real phone on 2026-08-23 as "the screen jumps if I scroll up or down".
  **Measured, with the shell forced 80px over:** `body.scrollHeight` **833** vs `clientHeight` **753**, and
  `body.scrollTop` moves to **80** — while `html`, `#root`, the shell and `main` all report overflow **0**
  and refuse to scroll, and `window.scrollY` stays **0** throughout. **Probe the right element**: a
  `window.scrollY` or `main.scrollTop` check reads this as "no scrolling", and did, twice.
  **Invisible in every emulator and device-emulation mode** — with no collapsing URL bar `100vh === 100dvh`
  and the gap is structurally 0, the same reason the `contentInset` band below needed a real WKWebView.
  Anything *inside* `main` (`DashboardLayout`, page wrappers) cannot scroll body, but a `100vh` child of a
  `100dvh` `main` hands short pages the same dead scroll one container down — so `DashboardLayout` tracks
  the shell. Pinned by `src/layoutViewportHeight.test.ts`, as a text assertion, because jsdom has no layout
  engine to evaluate a CSS length. See `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` (§9).
* **App chrome sits BELOW the modal layer — never tie `z-50`** — persistent app chrome (`MobileBottomNav`, `MobileTopNav`, desktop header, `DonnyDesktopPanel`) is **`z-40`**; the Radix modal layer (every `Sheet`/`Dialog`/`AlertDialog`/`Popover`/`Dropdown`/`Tooltip`) is **`z-50`**; `DonnyMobileSheet` is `z-[60]/[61]`; toasts are `z-[100]`. At `z-50` the nav tied the modal layer and (both portal to `<body>`) its opaque bar painted over bottom-sheet action buttons on iOS Safari. A new **non-modal in-page** `fixed`/`sticky` bottom bar that coexists with the nav (e.g. `StickyApplyCTA`) must offset itself above the nav on mobile — `bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-0` (the `6rem` mirrors the content area's `pb-24` nav-clearance) — or live inside a modal. See `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` (§6).
