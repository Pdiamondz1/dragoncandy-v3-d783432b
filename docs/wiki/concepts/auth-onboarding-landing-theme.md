---
title: Auth + Onboarding Landing-Theme Retheme
type: concept
created: 2026-07-19
updated: 2026-07-19
sources: [2026-07-19-auth-onboarding-landing-theme.md]
tags: [auth, onboarding, theme, design-system, tailwind, frontend]
---
# Auth + Onboarding Landing-Theme Retheme

A **presentational-only** retheme (PR #299, 2026-07-19) of all 7 entry surfaces — login/sign-up
(`AuthPage`), the 5 auth siblings (`ForgotPassword`, `UpdatePassword`, `VerifyEmail`,
`RestoreAccountPage`, `InviteAcceptPage`), and the onboarding wizard + steps, plus their shared
components (`AuthForm`, `AuthModeToggle`, `RoleSelection`) — from the old **dark** look to the
shipped **light "Human-driven. AI-assisted."** landing identity
([[Landing "Human-driven. AI-assisted." Redesign]], PR #293), "softened for forms." It closes the
gap the landing redesign left open: a visitor who clicked "Get started" on the bright landing
still dropped into a dark auth screen. Zero auth-logic changes — every handler, effect, redirect,
and Supabase call is byte-identical to before.

## Key Decisions

- **Presentational-only, by explicit constraint.** Per CLAUDE.md's "never modify auth logic
  without confirming first," every change is scoped to classNames, wrappers, headings, and the
  submit `<button>` → `LandingButton` swap. Verified at the per-task review stage, the whole-branch
  Opus review, and the Codex second review (all independently confirming byte-identical
  handlers/effects/Supabase calls).
- **"Landing look, softened for forms," not the app's `dc-*` look.** Founder-confirmed direction:
  reuse the landing's chunky primary buttons and a single Bricolage/Silkscreen accent per screen,
  but keep form fields calm and standard (shadcn `Input`/`Label`, `border-landing-line`, mint/pink
  focus rings) rather than pixel-everywhere. This closed the previously parked PR #279 (which had
  rethemed these surfaces toward the app's `dc-*` look instead) as superseded.
- **New shared `AuthShell`** (`src/components/auth/AuthShell.tsx`) is the only new component: a
  white base with a soft grape/pink/mint radial glow, replacing the dark `bg-dc-dark` root +
  `GlowBackdrop`. It reuses the landing's already-shipped, additive `landing-*` tokens/fonts and
  the `Eyebrow`/`LandingButton` primitives — no new tokens, so the authenticated app (still
  `dc-*`/Outfit) is unaffected.
- **Both dark triggers removed together.** Each of the 7 surfaces called `useDarkHtml()` *and*
  applied a literal `dark`/`bg-dc-dark` wrapper class on its root — removing only one would have
  left a half-migrated dark wrapper, so both were deleted from every surface in the same pass.
- **`useDarkHtml` deleted as dead code** (`src/hooks/useDarkHtml.ts`). Once all 7 callers went
  light, nothing referenced the hook anymore. `/internal` (`InternalLayout`) has always applied
  dark via its own independent inline `useEffect` (`documentElement.classList.add('dark')`), never
  via the shared hook — so the deletion is a no-op there. **`/internal` is now the only dark
  surface left in the app**, narrowing the scope [[Dark-Luxe App Theme]] established (landing +
  auth/onboarding + `/internal` dark) down to just `/internal`.

## The AuthShell `isolate` gotcha

The first version of `AuthShell` wrapped `children` in a `relative z-10` slot so the glow layer's
`-z-10` would paint behind it. That slot became a shrink-wrapping **flex item** whenever a caller
centers its content via `flex items-center justify-center` — true of `InviteAcceptPage`,
`RestoreAccountPage`, and `OnboardingWizard` — collapsing their `w-full max-w-*` cards down to
content width.

**Fix:** the landing's own `isolate` pattern — `isolate` on the `AuthShell` root (its own stacking
context), the glow layer stays at `-z-10`, and `children` render directly with no wrapping div.
`isolate` alone keeps the background behind content without touching the children's own
flex/block layout. Both the whole-branch Opus review and the Codex second review independently
caught this before merge; `AuthShell.test.tsx` now regression-locks a centered flex parent not
shrinking the shell's children. This is a second instance of the same class of stacking-context
trap [[Landing Cinematic Video Redesign]] hit reactively (`.relative` beats `.absolute` when
later-defined) — here caught proactively via the landing's established `isolate` fix.

## Process

Spec (`docs/superpowers/specs/2026-07-18-auth-onboarding-landing-theme-design.md`) → plan
(`docs/superpowers/plans/2026-07-18-auth-onboarding-landing-theme.md`) → subagent-driven
implementation, per-task reviewed → whole-branch Opus review (caught the `isolate` bug) → Codex
second review (clean). No edge-fn/schema change, so `edge-function-reviewer`/`careful`'s deploy
gate did not apply — frontend-only.

## Known Issues / Gotchas

- **Sibling chrome-bar headings stayed `font-sans`** rather than picking up `font-display`
  (Bricolage) — a deferred cosmetic follow-up, not a defect.
- **Onboarding doesn't yet visibly "soften toward the app"** as the wizard progresses toward the
  dashboard handoff — flagged as a future nice-to-have.
- `docs/DESIGN_SYSTEM.md` was updated **in the same PR** (not a separate knowledge-sync step) to
  document the marketing+entry identity now covering auth/onboarding, the `useDarkHtml` deletion,
  and this gotcha — see its "Marketing + entry's own scoped identity" section.

## See Also

- [[Landing "Human-driven. AI-assisted." Redesign]] — the light identity this retheme carries
  into the entry flow; the direct predecessor (PR #293).
- [[Dark-Luxe App Theme]] — the app-wide light/dark scoping decision this retheme narrows further:
  dark now covers only `/internal`, down from landing + auth/onboarding + `/internal`.
- [[Landing Cinematic Video Redesign]] — the prior session that hit the same class of
  stacking-context bug reactively; this session applied the same `isolate` fix proactively.
- [[Light-App Kit]] — the authenticated app's own separate light design-token system, never mixed
  with the landing/entry `landing-*` tokens this retheme reuses.
