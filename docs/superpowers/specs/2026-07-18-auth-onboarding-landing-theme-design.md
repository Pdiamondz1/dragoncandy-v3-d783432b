# Auth + Onboarding — Landing Theme Retheme

> **Design spec.** Retheme the login/sign-up, the 5 auth siblings, and the onboarding
> flow from their current **dark** look to the new **light "Human-driven. AI-assisted."
> landing** identity — softened for functional forms. Presentational only; the auth flow
> logic is untouched. Follows the shipped landing redesign
> (`docs/wiki/concepts/landing-human-driven-redesign.md`, PR #293).

**Status:** Design approved (founder), pending spec review + founder spec read.
**Date:** 2026-07-18
**Branch:** `feat/auth-onboarding-landing-theme` (fresh off `origin/main` incl. #293/#294)

---

## 1. Context & Goal

The public landing now ships Joe's light "Human-driven. AI-assisted." design (PR #293).
But the entry flow a new user hits right after — **login/sign-up + onboarding** — is still
**dark** (each surface calls `useDarkHtml()` + uses the dark-luxe kit: `bg-dc-dark`,
`GlowBackdrop`, `.dc-surface`/`.dc-panel`/`.dc-field`, white-opacity text). So the moment a
visitor clicks "Get started" on the bright landing, they drop into a dark auth screen — a
jarring, inconsistent handoff.

**Goal:** Retheme all entry surfaces to the landing's identity — **light**, Bricolage
headings, grape/pink/mint accents, chunky primary buttons — but **softened for forms** (calm,
standard input fields; the pixel/chunky flavor used as accent, not everywhere). This makes the
landing → auth → app journey visually continuous, with the entry flow as a graceful bridge.

**Founder decisions (2026-07-18):**
1. **Direction: "landing look, softened for forms"** (not full pixel/chunky everywhere; not the
   app's dc-* look).
2. **Scope: ALL auth + onboarding** — login/sign-up `AuthPage`, the 5 siblings
   (`ForgotPassword`, `UpdatePassword`, `VerifyEmail`, `RestoreAccountPage`, `InviteAcceptPage`),
   their shared components, and the onboarding wizard + steps. (7 surfaces total call
   `useDarkHtml`: the 6 auth pages + `OnboardingWizard`.)

**Non-goals / out of scope:**
- **The auth flow LOGIC** — mode/role state, redirect/`checkProfileCompletion`, OAuth return,
  email verification/resend, Supabase calls. Per CLAUDE.md "never modify auth logic," this
  retheme is **presentational only** (classes, wrappers, headings, primitives).
- The authenticated app (dashboards, chrome) — stays light `dc-*` / Outfit, untouched.
- `/internal` (AIOS) — keeps its dark treatment (`InternalLayout` applies dark via its own inline
  `useEffect`, independent of the deleted `useDarkHtml` hook).
- Any backend / schema / edge-fn / Supabase-auth-config change.

---

## 2. Theme treatment ("landing look, softened for forms")

Carry from the landing (`landing-*` tokens + fonts are already global + additive — no app
impact), applied via a shared light **auth shell**:

- **Ground:** light. A shared `AuthShell` wrapper — white/paper base with a **soft** grape/pink/
  mint radial glow (a light echo of the landing; replaces the dark `bg-dc-dark` +
  `GlowBackdrop`). `font-instrument` on the wrapper so body/inputs read as Instrument Sans;
  headings use `font-display` (Bricolage).
- **Headings:** Bricolage (`font-display`), dark ink (`text-landing-ink`). Optionally **one**
  Silkscreen pixel `Eyebrow` per screen as the brand signature (e.g. a small "WELCOME BACK" /
  "JOIN DRAGONCANDY" eyebrow above the title) — reuse the landing `Eyebrow`. Keep it to one;
  "softened" ≠ pixel-everything.
- **Primary buttons:** chunky pink `LandingButton` (reuse from the landing — it now has
  `cn`/tailwind-merge + a `type` default from the landing fix wave, so it's form-safe) for the
  main action (Log in / Create account / Continue / Send reset). Secondary = ghost/link.
- **Form fields (the "softened" part):** calm, standard shadcn `Input`/`Label` — white,
  `border-landing-line`, mint or pink focus ring (`focus-visible:ring-landing-mint`), dark-ink
  text. **No** pixel/chunky styling on inputs. Replace every `.dc-field` / dark-field literal.
- **Errors:** light semantic — `bg-red-50 border-red-200 text-red-600` (replacing the dark
  `bg-red-500/10 … text-red-300`). Keep the same copy + structure.
- **Cards / panels:** white with `border-landing-line`, rounded (`rounded-2xl`), soft shadow —
  replacing `.dc-surface`/`.dc-panel`.
- **RoleSelection door-cards:** restyle to the landing's pastel doors — pink-soft / mint-soft
  tiles with pixel eyebrows + Bricolage titles (echo `HeroDoors`), for Business / Creator (brand
  gated). Keep the same `onSelectRole` behavior.

---

## 3. Mechanics

- **Remove BOTH dark triggers** from the 7 surfaces (6 auth pages + `OnboardingWizard`): the
  `useDarkHtml()` call AND the literal `dark`/`bg-dc-dark` wrapper class on the root (`AuthPage`
  line ~260 and `OnboardingWizard` line ~283 apply dark BOTH ways — removing only one leaves a
  half-migrated dark wrapper). With both gone, `<html>`/`<body>` stay light (the app default
  `ThemeProvider defaultTheme="light"`). Because every surface goes fully light, the
  dark-glow-over-white "washed-auth" artifact ([[project_dark_luxe_app_theme]]) simply can't occur
  — no scoped-theme hack needed.
- **`useDarkHtml` becomes dead code — delete it.** After this change NOTHING calls the hook:
  `/internal` (`InternalLayout`) applies dark via its OWN inline `useEffect`
  (`documentElement.classList.add('dark')`), not the hook. So removing the hook cannot affect
  `/internal` (an independent, duplicated mechanism). Delete `src/hooks/useDarkHtml.ts`.
- **Swap the dark-luxe kit → light** everywhere in these files: `GlowBackdrop` (dark) → the light
  `AuthShell` glow; `.dc-surface`/`.dc-panel`/`.dc-field` → white cards + light fields;
  `dc-teal-pill`/`dc-ghost-pill` → `LandingButton`; `text-white`/`/80`/`/60`/`/40` →
  `text-landing-ink`/`text-landing-ink-soft`; `bg-dc-dark`/dark radial gradients → the light shell.
- **Reuse** the landing primitives (`Eyebrow`, `LandingButton`), the `landing-*` tokens + fonts,
  and add ONE small shared `src/components/auth/AuthShell.tsx` (light glow + wrapper) consumed by
  all auth pages (DRY; onboarding can reuse or use a lighter variant).
- **Logo:** use a light-appropriate logo. Current dark auth uses `Transparent_DragonCandy_logo.webp`
  (tuned for dark). On white, use `/logo.webp` (the landing/footer logo) — verify it reads on the
  light shell during build.
- **DESIGN_SYSTEM.md:** extend the landing-identity note — the marketing identity now covers
  **marketing + ENTRY** (landing + auth + onboarding); the authenticated app stays `dc-*` / Outfit.

---

## 4. Surfaces (files)

**Auth pages** (`src/pages/`): `AuthPage.tsx` (login + signup-role + signup-form),
`ForgotPassword.tsx`, `UpdatePassword.tsx`, `VerifyEmail.tsx`, `RestoreAccountPage.tsx`,
`InviteAcceptPage.tsx`. Each: remove `useDarkHtml`, wrap in `AuthShell`, restyle heading/errors/
links to light. **Do not alter their logic/handlers/effects.**

**Shared auth components** (`src/components/auth/`): `AuthForm.tsx` (light fields + chunky
submit — the keystone, used by login + signup), `AuthHeader.tsx`, `AuthModeToggle.tsx` (light
toggle), `RoleSelection.tsx` (pastel door-cards). `AuthenticationModal.tsx` — **out of scope**
(verified: uses none of the dark kit — `dc-field`/`dc-panel`/`bg-dc-dark`/`GlowBackdrop`/`text-white`
all 0 matches).

**Onboarding** (`src/components/onboarding/`): `OnboardingWizard.tsx` (remove `useDarkHtml`, light
shell, Bricolage step headings, chunky Continue), `OnboardingProgress.tsx` (light progress),
`TapGrid.tsx`, and `steps/*` (`WelcomeStep`, `IdentityStep`, `BioStep`, …) — light + Joe accents,
softening toward the app as the wizard progresses (it's the handoff point).

**New:** `src/components/auth/AuthShell.tsx` (light glow wrapper).

---

## 5. Testing & verification

- Update any theme-asserting unit tests (search these files' tests for dark-class assertions:
  `bg-dc-dark`, `text-white`, `useDarkHtml`). Auth **behavior** tests must stay green untouched
  (logic unchanged) — if any break, it's a signal the retheme leaked into logic; fix the retheme,
  not the test.
- `npm run build` + `npm run typecheck` + `npm run lint` + `npm run test`.
- **Both viewports** on the Vercel preview: login, sign-up (role-selection + form), the 5
  siblings, and the onboarding flow all render light + on-brand, forms legible, no dark remnants,
  no white-on-white. **Verify `<body>`/root computed bg is light** and screenshot on **prod**
  after deploy (the washed-auth gotcha showed only on prod, not local dev).
- `/internal` still dark (regression check — it applies dark via its OWN inline `useEffect` in
  `InternalLayout`, independent of the now-deleted `useDarkHtml` hook).
- Reviews: subagent-driven per-task + whole-branch Opus + **Codex second review**. No edge-fn →
  `careful`/`edge-function-reviewer` not needed (frontend only).

---

## 6. Risks / watch-items

- **Auth-logic safety** — the #1 risk. The retheme touches files dense with auth logic
  (`AuthPage`, `AuthForm`). Every task must change ONLY presentation; reviewers verify the
  handlers/effects/Supabase calls are byte-identical.
- **Washed-auth gotcha** ([[project_dark_luxe_app_theme]]) — going fully light + removing
  `useDarkHtml` avoids it; verify the computed `<body>` bg is light on prod.
- **Token additivity** — reuse existing `landing-*`; add no app-affecting tokens.
- **PR #279 disposition** — the parked light-retheme did these surfaces toward the *app* dc-*
  look (the rejected option C). Build **fresh** here (Joe's look); close #279 as superseded.
- **Logo on light** — confirm the chosen logo reads on the light shell.

---

## 7. Reuse summary (what does NOT change)

No schema / RLS / edge-fn / secret / Supabase-auth-config change. All auth flow logic, redirects,
verification, and Supabase calls are byte-identical. This is a **frontend presentational** change
reusing the landing's already-shipped tokens, fonts, and primitives.
