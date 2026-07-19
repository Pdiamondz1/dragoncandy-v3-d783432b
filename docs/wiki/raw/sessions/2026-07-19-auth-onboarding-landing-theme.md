# Session: Auth + Onboarding Landing-Theme Retheme (PR #299)

**Date:** 2026-07-19 (spec dated 2026-07-18; merged + live 2026-07-19)
**Branch:** `feat/auth-onboarding-landing-theme`
**PR:** #299 — merged to `main`, deployed to dragoncandy.io via Vercel
**Type:** Presentational-only frontend retheme. No schema/RLS/edge-fn/secret/Supabase-auth-config
change.

## What shipped

Retheme of all 7 entry surfaces from the old **dark** look to the shipped light
**"Human-driven. AI-assisted."** landing identity ([[Landing "Human-driven. AI-assisted."
Redesign]], PR #293), "softened for forms":

- **Login/sign-up:** `src/pages/AuthPage.tsx` (login + signup-role + signup-form).
- **5 auth siblings:** `ForgotPassword.tsx`, `UpdatePassword.tsx`, `VerifyEmail.tsx`,
  `RestoreAccountPage.tsx`, `InviteAcceptPage.tsx`.
- **Onboarding:** `OnboardingWizard.tsx`, `OnboardingProgress.tsx`, `TapGrid.tsx`, and the step
  components (`WelcomeStep`, `IdentityStep`, `BioStep`, …).
- **Shared auth components:** `AuthForm.tsx` (the keystone — shared by login + signup),
  `AuthModeToggle.tsx`, `RoleSelection.tsx` (door-cards). `AuthenticationModal.tsx` was verified
  out of scope (zero matches on any dark-kit class).

New shared **`AuthShell`** (`src/components/auth/AuthShell.tsx`) replaces the dark `bg-dc-dark`
root + `GlowBackdrop`: a white base with a soft grape/pink/mint radial glow, `font-instrument`
body. It reuses the landing's already-shipped, additive `landing-*` tokens/fonts and the
`Eyebrow`/`LandingButton` primitives — nothing new was added to the token system, so the
authenticated app is untouched.

Style mapping applied across all 7 surfaces:
- `GlowBackdrop` (dark) → `AuthShell`'s light glow.
- `.dc-surface`/`.dc-panel`/`.dc-field` → white cards + calm shadcn `Input`/`Label` fields
  (`border-landing-line`, mint/pink focus rings) — "softened," not pixel-everywhere.
- `dc-teal-pill`/`dc-ghost-pill` submit buttons → `LandingButton`.
- `text-white`/`/80`/`/60`/`/40` → `text-landing-ink`/`text-landing-ink-soft`.
- Dark errors (`bg-red-500/10 text-red-300`) → light semantic (`bg-red-50 border-red-200
  text-red-600`).
- `RoleSelection` door-cards → pastel pink-soft/mint-soft tiles with pixel eyebrows + Bricolage
  titles, echoing the landing's `HeroDoors`.

**Both dark triggers removed** from all 7 surfaces: the `useDarkHtml()` call AND the literal
`dark`/`bg-dc-dark` wrapper class on the root. Both had to go together — removing only one would
have left a half-migrated dark wrapper.

**`useDarkHtml` deleted** (`src/hooks/useDarkHtml.ts`). Once the 7 auth/onboarding surfaces went
light, nothing called it anymore — `/internal` (`InternalLayout`) has always applied dark via its
own independent inline `useEffect` (`documentElement.classList.add('dark')`), never via the
shared hook, so deleting it is a no-op for `/internal`. **`/internal` is now the only dark surface
in the app.**

## Key decisions

- **Presentational only, by explicit design constraint.** Per CLAUDE.md "never modify auth logic
  without confirming first," every task changed ONLY classNames/wrappers/headings/the submit
  `<button>` → `LandingButton` swap. Every handler/effect/Supabase call is byte-identical —
  verified 8× at the per-task review stage, then again at the whole-branch Opus review and the
  Codex second review.
- **"Landing look, softened for forms," not the app's `dc-*` look, not full pixel-everywhere.**
  Founder-confirmed direction (2026-07-18): reuse the landing's chunky primary buttons and one
  Bricolage/Silkscreen accent per screen, but keep form fields calm and standard so they stay
  legible and usable.
- **Reuse over duplication.** `AuthShell` is the only new component; everything else (tokens,
  fonts, `Eyebrow`, `LandingButton`) is the landing's already-shipped, additive `landing-*`
  system — zero new tokens, zero app-affecting changes.
- **Closed PR #279** (the previously parked light-retheme option) as superseded — that attempt
  reskinned auth/onboarding toward the app's `dc-*` look, which the founder rejected in favor of
  the landing identity built here.

## The AuthShell isolate gotcha (Codex + whole-branch catch)

The first version of `AuthShell` wrapped `children` in a `relative z-10` slot so the glow's `-z-10`
background would paint behind it. That slot became a shrink-wrapping **flex item** whenever a
caller centers its content via `flex items-center justify-center` — true of `InviteAcceptPage`,
`RestoreAccountPage`, and `OnboardingWizard` — collapsing their `w-full max-w-*` cards down to
content width instead of the intended max-width.

**Fix:** apply the landing's own `isolate` pattern instead — put `isolate` on the `AuthShell` root
(making it its own stacking context), keep the glow layer at `-z-10`, and render `children`
directly with no wrapping div. `isolate` alone is sufficient to keep the `-z-10` glow layer behind
content without ever touching the children's own flex/block layout. Both the whole-branch Opus
review and the Codex second review independently flagged this before merge; a regression test
(`AuthShell.test.tsx`) now locks in that a centered flex parent does not shrink the shell's
children.

## Deploy / verify

Frontend-only, on the `careful` skill's "presentational, no edge-fn/schema" fast path — no edge
function deploy, no migration. Merged to `main`, Vercel auto-deployed. Verify per the spec:
screenshot login, sign-up (both role-selection and form), the 5 siblings, and onboarding on both
desktop and mobile on prod, confirm no dark remnants / no white-on-white, and confirm `/internal`
is still the only dark surface (regression check — it applies dark independently of the deleted
hook).

## Deferred / left as-is

- The 5 sibling pages' own chrome-bar headings kept `font-sans` rather than picking up
  `font-display` — a cosmetic follow-up, not fixed in this pass.
- Onboarding doesn't yet visibly "soften toward the app" as the wizard progresses toward the
  dashboard handoff — flagged as a future nice-to-have, out of scope here.
- `docs/DESIGN_SYSTEM.md` was updated **in the same PR** (not a knowledge-sync follow-up) to
  document the marketing+entry identity extending to auth/onboarding, the `useDarkHtml` deletion,
  and the `AuthShell` gotchas.

## Affected files

```
docs/DESIGN_SYSTEM.md
docs/superpowers/plans/2026-07-18-auth-onboarding-landing-theme.md
docs/superpowers/specs/2026-07-18-auth-onboarding-landing-theme-design.md
src/components/auth/AuthForm.tsx
src/components/auth/AuthModeToggle.tsx
src/components/auth/AuthShell.test.tsx
src/components/auth/AuthShell.tsx
src/components/auth/RoleSelection.tsx
src/components/onboarding/OnboardingProgress.tsx
src/components/onboarding/OnboardingWizard.tsx
src/components/onboarding/TapGrid.tsx
src/components/onboarding/steps/BioStep.tsx
src/components/onboarding/steps/IdentityStep.tsx
src/components/onboarding/steps/WelcomeStep.tsx
src/hooks/useDarkHtml.ts (deleted)
src/pages/AuthPage.tsx
src/pages/ForgotPassword.tsx
src/pages/InviteAcceptPage.tsx
src/pages/RestoreAccountPage.tsx
src/pages/UpdatePassword.tsx
src/pages/VerifyEmail.tsx
```

## See also

- [[Landing "Human-driven. AI-assisted." Redesign]] — the light identity this retheme carries
  into the entry flow.
- [[Dark-Luxe App Theme]] — the app-wide light/dark scoping decision this retheme narrows further
  (dark now covers only `/internal`).
