# Dark-Luxe App Theme — Slice 1 Design

**Date:** 2026-07-17
**Branch:** `worktree-dc-theme-upgrade`
**Status:** Design (pre-implementation)

## 1. Context & Problem

The public landing page (`src/pages/LandingPage.tsx` + `src/components/landing/*`) was
recently rebuilt into a "Dark Luxe / Cinematic" look: a charcoal `#1A1A2A` base, translucent
`bg-white/5` cards with `border-white/10`, a white-opacity text ramp (never flat gray), teal
+ pink brand accents, `.text-gradient` script headlines, and Outfit/Pacifico type. The rest
of the authenticated app is still light — white/gray page bodies, a pink mobile header, and a
bright teal→magenta auth gradient — so a user who signs in feels like they walked into a
different product.

This project makes the whole app visually consistent with the landing, **minus the video
backdrops, which remain landing-only**. Internal/AIOS (`/internal/*`) and the Pitch deck are
already dark and, together with the landing, are the reference for the target look.

**Why it is not a one-line theme flip.** The app runs two parallel color systems:

- **~847 usages** of semantic shadcn tokens (`bg-background`, `bg-card`, `bg-sidebar`,
  `border-border`, `text-muted-foreground`) that already auto-flip to dark under the `.dark`
  class (values defined in `src/index.css:87-128`).
- **~1,900 usages** of hardcoded `dc-*` hex (`tailwind.config.ts:24-42`) plus literal
  `bg-white` / `bg-gray-*` / `text-gray-*` / `dc-pink-bg` utilities that do **not** respond to
  the theme at all.

Flipping the theme flag alone therefore produces a broken half-dark app: the token-driven
sidebar and shadcn primitives go dark while every hardcoded page body, mobile nav, Donny
panel, and auth surface stay white. Matching the landing requires both (a) turning the token
layer dark and (b) mechanically converting the literal light surfaces to the landing's
dark-luxe language.

## 2. Goals & Non-Goals

**Goals (Slice 1):**
- Force the entire app to a single dark-luxe theme; retire the light/dark toggle.
- Convert the first, self-contained user journey end-to-end: **login/sign-up → onboarding →
  the three role dashboards**, plus all **shared chrome** (nav, sidebar, Donny panel) that
  wraps every authenticated page.
- Establish the **foundation** (forced theme, retuned dark tokens) and a **shared primitive
  layer + conversion pattern** that make every subsequent slice cheap and consistent.
- Preserve the teal + pink brand identity exactly.

**Non-Goals:**
- No dual light+dark support. There is one theme.
- No video/cinematic-motion backdrops anywhere outside the landing.
- No conversion of the remaining feature areas in this slice (campaigns, DragonShare,
  messaging, browse, settings, public marketing) — those are separate, later
  spec→plan→build cycles (roadmap in §9).
- No changes to app logic, data, auth flow, routes, or copy — this is a presentational pass.

## 3. Decisions (confirmed with the user)

1. **One dark theme only** — force the app dark, retire the light/dark toggle.
2. **Phased rollout** — this design is **Slice 1**.
3. **Auth background = cinematic dark gradient** (teal→magenta over charcoal, **no video**);
   flat charcoal everywhere else.
4. **Keep teal (`#4DD9C0`) + pink (`#EC4899`/`#F9A8D4`) exactly** — convert only the
   neutrals (white/gray).

## 4. Target Design Language

The concrete "dark luxe" system to apply, derived from the landing:

- **Surfaces:** page root = `bg-dc-dark` (`#1A1A2A`) + `text-white`; cards/panels =
  `rounded-3xl border border-white/10 bg-white/5`; form fields =
  `h-12 rounded-xl border-white/15 bg-white/5 placeholder:text-white/40 focus-visible:ring-dc-teal`.
- **Text ramp (never flat gray):** `text-white` → `/80` → `/60` → `/40`.
- **Accents (unchanged):** teal + pink; `.text-gradient` (`src/index.css:180-183`) on a
  `font-script` headline word; eyebrow = teal dot + `text-xs font-bold uppercase
  tracking-[0.3em] text-dc-teal`; `shadow-glow-teal`/`shadow-glow-pink`; `blur-3xl` glow blobs.
- **Buttons:** primary pill `rounded-full bg-dc-teal text-dc-dark hover:bg-dc-teal-dark
  hover:shadow-glow-teal`; ghost pill `rounded-full border border-white/20 bg-white/5 text-white`.

## 5. Architecture

### 5.1 Group A — Foundation (do first; unblocks everything)

- **Force dark** — `src/components/ThemeProvider.tsx`: replace `defaultTheme="light"
  enableSystem` with `forcedTheme="dark"`. `forcedTheme` is the correct primitive: unlike
  `defaultTheme="dark"`, it overrides the `theme:"light"` value returning users have persisted
  in `localStorage`, always applies `.dark`, and makes any stray `setTheme` call a no-op.
  Keep `next-themes` (sonner and the provider still consume it).
- **Kill first-paint flash + fix native controls** — `index.html`: add `class="dark"` and
  `style="color-scheme:dark"` to `<html>`. Guarantees the shell never flashes a light
  `bg-background` before hydration and fixes native scrollbars/date pickers/autofill. The
  prerender splash is already `#1A1A2A`.
- **Retire the toggle** — remove the `ThemeToggle` import + render in
  `src/components/DashboardLayout.tsx` (~lines 30, 227); delete `src/components/ThemeToggle.tsx`
  (confirmed no other consumer).
- **Toasts** — `src/components/ui/sonner.tsx`: hardcode `theme="dark"` (with `forcedTheme`,
  the hook can resolve `"system"`). The token-based radix `<Toaster/>` needs no change.
- **App.tsx literals** — `src/App.tsx`: public loading splash `bg-white` → `bg-dc-dark`
  (~line 432); skip-link `focus:bg-white focus:text-black` → a dark-legible pairing
  (~line 396). `<main id="main-content">` already inherits `body { bg-background }` — no change.
- **Retune the `.dark` token block (highest-leverage single edit)** — `src/index.css:87-128`:
  pin `--background` to `#1A1A2A`; lift `--card`/`--popover` to a `white/5`-over-charcoal feel;
  set `--border`/`--input` to a `white/10–15` feel; set `--muted-foreground` to a `white/60`
  feel. **Leave `--primary` (teal) and `--secondary` (pink) untouched.** This re-skins the
  ~847 token surfaces (desktop glass header, sidebar, and — because the class is on `<html>`
  — every Radix portal) with zero per-file work.
- **Optional accelerator (audit-gated)** — in `tailwind.config.ts`, CSS-var-back only the two
  structural neutral `dc-*` tokens `dc-card` (`#FFFFFF`) and `dc-pink-bg` (`#F9C8E0`) so every
  `bg-dc-card` / `bg-dc-pink-bg` flips globally — **only after** a grep confirms neither is
  used as a `text-*`/foreground color. Do **not** flatten `dc-text`/`dc-text-muted` to a single
  gray (the ramp must stay intentional). `dc-dark` is unchanged.

### 5.2 Group B — Shared dark-luxe primitives

Importless, global vehicles that keep per-file churn low and enforce consistency across this
and every future slice:

- `src/index.css` `@layer components`, with exact declarations (named `.dc-panel`, **not**
  `.dc-card`, to avoid clashing with the existing `dc-card` color token / `bg-dc-card` utility):
  - `.dc-surface` → `min-h-screen bg-dc-dark text-white` (page root; includes `min-h-screen`).
  - `.dc-panel` → `rounded-3xl border border-white/10 bg-white/5` (card/panel surface; radius
    and border are part of the class; callers add their own padding).
  - `.dc-field` → `h-12 rounded-xl border border-white/15 bg-white/5 text-white
    placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-dc-teal` (mirrors the
    landing `FIELD` constant in `StartFreeSection.tsx`).
- `src/components/ui/button.tsx`: add CVA variants `dc-teal-pill` and `dc-ghost-pill`
  (centralizes hover/glow/focus).
- New `src/components/dark/`: `GlowBackdrop.tsx` (two absolutely-positioned `blur-3xl`
  teal/pink blobs — needs child DOM, can't be one class) and `Eyebrow.tsx` (teal dot +
  uppercase kicker). Reuse the existing `.text-gradient` for gradient headings.

Avoid a heavy `DarkCard`-style component layer — it would force JSX-structure refactors
rather than class-string swaps.

### 5.3 Conversion pattern (stated once, applied mechanically per file)

| Current literal | Dark-luxe replacement |
|---|---|
| page `min-h-screen bg-white` | `min-h-screen bg-dc-dark text-white` (`.dc-surface`) |
| card `bg-white` / `bg-white border-dc-teal/15` | `bg-white/5 border border-white/10` (`.dc-panel`) |
| `bg-dc-card` (if accelerator skipped) | `bg-white/5` (manual) |
| `bg-dc-pink-bg` header wash (if accelerator skipped) | `bg-dc-dark` + pink moved to an accent |
| `bg-gray-50` / `bg-gray-100` fills & inputs | `bg-white/5` (fields → `.dc-field`) |
| `text-gray-900` / `text-dc-text` | `text-white` |
| `text-gray-700` | `text-white/80` |
| `text-gray-500` / `text-dc-text-muted` | `text-white/60` |
| `text-gray-400` / placeholders | `text-white/40` |
| `border-gray-200/100` / `border-dc-teal/15` | `border-white/10` (fields `border-white/15`) |
| mobile top-nav `from-dc-pink-bg to-pink-50` | `bg-dc-dark/80 backdrop-blur-xl border-b border-white/10` |
| error `bg-red-50 text-red-600` | `bg-red-500/10 text-red-300 border border-red-500/20` |
| chip `bg-teal-50 text-teal-600` / `bg-pink-50 …` | `bg-dc-teal/10 text-dc-teal` / `bg-dc-pink-accent/10 text-dc-pink-accent` |
| disabled `disabled:bg-gray-200 text-gray-400` | `disabled:bg-white/10 disabled:text-white/30` |
| hover `hover:bg-gray-100/200` | `hover:bg-white/10` |
| auth `from-[#1A5C5C] via-[#2D7A7A] to-[#9B5A8A]` | `bg-dc-dark` + layered `from-dc-teal/15 via-dc-dark to-dc-pink-accent/15` + `<GlowBackdrop/>` (no video) |
| **any `dc-teal*` / `dc-pink*` accent** | **unchanged** |

### 5.4 Group C — Shared chrome (highest reach)

`src/components/DashboardLayout.tsx` (glass header is token-based → mostly free after §5.1;
convert `topNavBgClass` ~166-169), `src/components/MobileTopNav.tsx`,
`src/components/MobileBottomNav.tsx` (**literal `bg-white`, portaled to `document.body` — must
be explicit**), `src/components/donny/DonnyDesktopPanel.tsx` (`bg-white`→dark),
`src/components/donny/DonnyMobileSheet.tsx` (verify portaled literals).

### 5.5 Group D — Auth + onboarding

- `src/pages/AuthPage.tsx` (cinematic dark gradient + `<GlowBackdrop/>`; the four `verify_email`
  / error blocks), `src/components/auth/AuthForm.tsx` (white card, `bg-gray-100` inputs,
  dividers, social buttons), `RoleSelection.tsx` (3 role cards + `from-gray-*` icon tiles),
  `AuthModeToggle.tsx`, `AuthHeader.tsx`.
- Auth-adjacent pages sharing the template: `ForgotPassword.tsx`, `UpdatePassword.tsx`,
  `VerifyEmail.tsx`, `RestoreAccountPage.tsx`, `InviteAcceptPage.tsx`.
- Onboarding (keep the teal/pink role-accent branching): `src/components/onboarding/OnboardingWizard.tsx`
  + `steps/*` + `TapGrid.tsx` + `OnboardingProgress.tsx` + `src/pages/ProfileSetup.tsx`.

### 5.6 Group E — 3 dashboards + shared building blocks

Converting the shared blocks once re-skins all three dashboards.

- Page roots: `src/pages/BusinessDashboard.tsx`, `BrandDashboard.tsx`, `CreatorDashboard.tsx`
  (`min-h-screen bg-white` → `.dc-surface`).
- Shared blocks: `src/components/dashboard/DashboardGreeting.tsx`, `StatsRow.tsx`,
  `NeedsAttentionSection.tsx`, `RecentActivitySection.tsx`, `HeroPrimaryAction.tsx`,
  `SectionHeader.tsx`, `BrandFreeTrioHero.tsx`, `SocialMediaManagerTile.tsx`.
- Dashboard DragonShare tiles: `src/components/dragonshare/DragonShareStatTile.tsx`,
  `DragonPointsCard.tsx`, `DragonShareActivityCard.tsx`, `BriefPerformanceCard.tsx`.
- **`src/components/first-run/FirstRunDashboard.tsx`** — renders instead of the normal
  dashboard for new accounts; must be converted or every new user hits a white hole.

## 6. Risks & Gotchas

- **Radix portals — mostly free.** Because `.dark` is on `<html>` (not a subtree like the
  landing), token-based portals (Dialog/Sheet/Popover/Dropdown/Toast, all `bg-background`/
  `bg-popover`) flip automatically. Only **literal-painted** portaled surfaces need manual
  work: `MobileBottomNav`, `DonnyMobileSheet`.
- **Pink identity → accent, not surface.** Do not paint dashboards or the top-nav pink on dark
  (it fights the luxe charcoal). Preserve the pink signal via existing accents (greeting tick,
  pink secondary CTAs, count pills).
- **Errors stay semantic red** (`red-500/10` + `red-300`), never remapped to brand pink.
- **Disabled/placeholder contrast** must map to `white/10`/`white/30`/`white/40` so state
  stays legible.
- **Images/avatars on dark:** the logo is already proven on charcoal; consider
  `ring-1 ring-white/10` on user-uploaded thumbnails; convert RoleSelection `from-gray-*` tiles.
- **Third-party/native surfaces:** spot-check `<Calendar/>` (react-day-picker) and any Stripe/
  Maps frames; `color-scheme:dark` helps native controls.
- **Keep the landing unchanged** — it self-scopes `.dark`; the global force is redundant but
  harmless there.
- **Line-number anchors drift.** The `~line` / `file:NN-NN` references in this spec are hints
  from exploration; the implementer must grep to confirm the exact location before editing.
- **Bulk-change discipline:** this repo has broken builds on large sweeps before. Execute in
  the group order A→B→C→D→E, building after each group.

## 7. Testing / Verification

- **Per-group residual grep (mechanical completeness gate).** After each group A→E, grep the
  files touched by that group for residual light literals — `bg-white`, `bg-gray-`, `text-gray-`,
  `border-gray-`, `text-dc-text`, `bg-dc-card`, `bg-dc-pink-bg` — and confirm every hit is
  either intentionally converted or a false positive (e.g. `bg-white/5`). This catches an
  unlisted sub-component before the manual walk.
- `npm run build` (typecheck + bundle — catches the `ThemeToggle` deletion, the new button
  variants, and the CSS).
- `npm run dev`, then walk **both viewports** (desktop + mobile devtools): landing unchanged;
  `/auth` in all three states (role-selection, signup-form, login) including the `verify_email`
  error block; onboarding for a creator (teal) and a business (pink) path; all three dashboards
  in **first-run and populated** states; desktop header + sidebar + avatar dropdown (portal
  darkness); mobile top-nav sheet + bottom nav; the Donny desktop panel; one toast. Confirm: no
  white flash on route change or on the loading splash; focus rings visible on dark; no console
  errors; portaled menus/dialogs render dark.
- After deploy, run the **`verify-prod`** skill (prod desktop + mobile screenshots + console
  capture). Run the mandatory **Codex second review** before opening the PR.

## 8. Existing code to reuse

- `.text-gradient` and the reveal/animation utilities already in `src/index.css`.
- `Reveal` scroll primitive (`src/components/landing/Reveal.tsx`) — reusable, non-video.
- Landing pattern constants (`FIELD` in `StartFreeSection.tsx`, the eyebrow and glow-blob
  patterns) as the source for the new primitives.
- The existing `button.tsx` CVA structure (already carries a `dc-primary` variant with
  `dark:text-dc-dark`) — extend it rather than adding a parallel button.

## 9. Follow-on slices (separate cycles, not this design)

2. Campaigns (creation, details, marketplace, proposals, sponsorships)
3. DragonShare + DragonFeed
4. Browse creators + crews + public profiles
5. Messaging
6. Settings + org/billing/payments + notifications + reviews + calendar/social + promotions
7. Public marketing (Pricing, Legal, Help) — decide dark vs. keep light per surface

## 10. Open Questions

None blocking. The auth gradient exact stops and the `.dark` token retune values are visual
tuning to be settled during the frontend-design implementation pass against the landing.
