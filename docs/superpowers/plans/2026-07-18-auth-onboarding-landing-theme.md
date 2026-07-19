# Auth + Onboarding Landing-Theme Retheme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax.

**Goal:** Retheme all 7 entry surfaces (login/sign-up + 5 auth siblings + onboarding) and their
shared components from the current **dark** look to the shipped **light landing** identity,
"softened for forms" — **presentational only, zero auth-logic changes**.

**Architecture:** A shared light `AuthShell` (soft grape/pink/mint glow on white + `font-instrument`)
wraps every entry surface. Dark-luxe kit usages (`useDarkHtml`, `bg-dc-dark`, `GlowBackdrop`,
`.dc-panel`/`.dc-field`, white-opacity text) are swapped for light landing tokens + the shell +
reused landing primitives (`Eyebrow`, `LandingButton`). The now-dead `useDarkHtml` hook is deleted.

**Tech Stack:** React 18 + TS strict, Tailwind (`landing-*` tokens + `display`/`instrument`/`pixel`
fonts, already global/additive), shadcn/ui (`Input`/`Label`/`Button`), vitest.

**Design source of truth:** the spec `docs/superpowers/specs/2026-07-18-auth-onboarding-landing-theme-design.md`.
Read it before starting.

---

## Global Constraints (bind every task)

- **PRESENTATIONAL ONLY — never touch auth logic.** Do not change any handler, `useEffect`, state
  variable, Supabase call, redirect, role/mode logic, validation, or props contract. Only classes,
  wrapper elements, headings, icons, and swapping a submit `<button>` for `LandingButton type="submit"`
  (same `type`/`disabled`/`onClick` behavior). If a change would alter behavior, it's out of scope.
  CLAUDE.md: "Never modify auth logic without confirming first."
- **The dark → light mapping (apply consistently everywhere):**
  | Dark (remove) | Light (use) |
  |---|---|
  | `useDarkHtml()` call + import | delete both |
  | root `dark … bg-dc-dark text-white` + dark radial gradient | wrap content in `<AuthShell>` (light) |
  | `<GlowBackdrop/>` | (provided by `AuthShell`) |
  | `.dc-panel` / `.dc-surface` card | `rounded-2xl border-2 border-landing-line bg-white shadow-[0_14px_30px_rgba(36,19,50,0.08)] p-8` |
  | `.dc-field` input | shadcn `Input`, or `h-12 rounded-xl border-2 border-landing-line bg-white text-landing-ink placeholder:text-landing-ink-soft focus-visible:ring-landing-mint` |
  | `text-white` | `text-landing-ink` |
  | `text-white/60` `/50` `/40` | `text-landing-ink-soft` |
  | `text-dc-teal` link | `text-landing-pink` (accent link) |
  | submit `bg-dc-teal-btn text-white` (or `dc-teal-pill`) | `<LandingButton type="submit" variant="pink" className="w-full h-12" disabled={loading}>` |
  | `bg-white/15` role chip | `bg-landing-pink-soft text-landing-ink` (business), pastel per role |
  | error `bg-red-500/10 border-red-500/20 text-red-300` | `bg-red-50 border border-red-200 text-red-600` |
  | divider `bg-white/10` | `bg-landing-line` |
  | heading `uppercase text-white` | `font-display text-landing-ink` (+ optional one `Eyebrow`) |
- **Token additivity** — reuse existing `landing-*` tokens/fonts + `Eyebrow`/`LandingButton`; add
  nothing that affects the app. The authenticated app + `/internal` render byte-identical.
- **Fonts:** `AuthShell` sets `font-instrument` (body); headings use `font-display`.
- **Remove now-unused imports alongside removed usages** (`useDarkHtml`, `GlowBackdrop`,
  `dragonCandyLogo`, any dark-kit import). `tsconfig.app.json` has `noUnusedLocals: true`, so a
  leftover unused import is a `tsc --noEmit` **error** (not a warning) — the per-task typecheck will
  fail. Delete the import in the same task that drops its usage.
- After each task: `npm run build` + `npm run typecheck` + relevant `npx vitest run` green, commit.
- **Verify on PROD** after deploy that the computed `<body>`/root bg is LIGHT (the washed-auth gotcha
  showed only on prod).

---

## File Structure

**Create:** `src/components/auth/AuthShell.tsx` (light glow wrapper).
**Modify:** `src/pages/AuthPage.tsx`, `ForgotPassword.tsx`, `UpdatePassword.tsx`, `VerifyEmail.tsx`,
`RestoreAccountPage.tsx`, `InviteAcceptPage.tsx`; `src/components/auth/AuthForm.tsx`,
`AuthModeToggle.tsx`, `RoleSelection.tsx`; `src/components/onboarding/OnboardingWizard.tsx`,
`OnboardingProgress.tsx`, `TapGrid.tsx`, `steps/*`; `docs/DESIGN_SYSTEM.md`; touched test files.
**Delete:** `src/hooks/useDarkHtml.ts` (after all callers removed — Task 8).
**Untouched:** `AuthenticationModal.tsx` (0 dark-kit matches), `/internal`, the app, `GlowBackdrop.tsx`
(still used by dark surfaces elsewhere — leave it).

---

## Task 1: AuthShell (light glow wrapper)

**Files:** Create `src/components/auth/AuthShell.tsx` + `AuthShell.test.tsx`.

- [ ] **Step 1 (TDD):** test renders children + is a light container (asserts it does NOT add `dark`
  and uses a light bg class).
- [ ] **Step 2:** Implement `AuthShell` — a `min-h-screen w-full overflow-x-hidden bg-white
  text-landing-ink font-instrument relative` wrapper with a **soft light glow** (two low-opacity
  radial blobs, e.g. `bg-landing-pink/15` top-left + `bg-landing-mint/15` bottom-right, `blur-3xl`,
  `pointer-events-none absolute`, echoing the dark `GlowBackdrop` but light) behind a
  `relative z-10` content slot. Props: `children`, optional `className`. Do NOT add `.dark` or call
  `useDarkHtml`.
- [ ] **Step 3:** vitest + build green; commit.

---

## Task 2: AuthForm retheme (keystone — logic frozen)

**Files:** Modify `src/components/auth/AuthForm.tsx` (+ its test if any).

- [ ] **Step 1:** Apply the mapping to `AuthForm.tsx`, **changing ONLY presentation**:
  - Role badge (`bg-white/15` + `text-white`) → light chip (`bg-landing-pink-soft text-landing-ink`;
    "Change" link → `text-landing-ink-soft`).
  - Card `dc-panel p-8` → white card (mapping).
  - `Label` `text-white` → `text-landing-ink`.
  - The 3 `<input className="dc-field …">` (fullName/email/password) → light field classes (mapping);
    keep every other attribute (`id`/`type`/`value`/`onChange`/`required`/`autoComplete`/`disabled`/
    `aria-*`) byte-identical. Password show/hide button `text-white/40` → `text-landing-ink-soft`.
  - "Forgot password?" `text-dc-teal` → `text-landing-pink`.
  - Submit button (`bg-dc-teal-btn text-white`) → `<LandingButton type="submit" variant="pink"
    className="w-full h-12 disabled:opacity-60" disabled={loading}>{same label logic}</LandingButton>`
    (import `LandingButton` from `@/components/landing/LandingButton`; the `disabled:opacity-60`
    preserves the original's disabled-while-loading look). Keep the exact loading-label ternary.
  - Divider (`bg-white/10`, `text-white/60`) → `bg-landing-line`, `text-landing-ink-soft`.
  - Social buttons: `border-white/15 bg-white/5` → `border-landing-line bg-white hover:bg-landing-lilac`;
    keep the Apple `bg-black` + Facebook `#1877F2` brand fills + all SVGs + `handleSocialClick`.
  - **DO NOT touch** `handleSubmit`, the signup/login/verification logic, `getRoleDisplay`, state, or
    the props interface.
- [ ] **Step 2:** build + typecheck; if an `AuthForm` test exists, keep it green (logic unchanged);
    a light render test may assert the submit renders + fields present. Commit.

---

## Task 3: AuthModeToggle + RoleSelection retheme

**Files:** Modify `src/components/auth/AuthModeToggle.tsx`, `RoleSelection.tsx` (+ tests).

- [ ] **Step 1:** `AuthModeToggle` — light restyle (mapping); keep the `mode`/`onModeChange`/`loading`
  behavior. The toggle/link text → `text-landing-ink`/`text-landing-pink`.
- [ ] **Step 2:** `RoleSelection` — restyle the role cards to the landing's **pastel door-cards**
  (echo `src/components/landing/HeroDoors.tsx`): Business = `bg-landing-pink-soft border-2
  border-landing-pink-line` with a pink `Eyebrow` + `font-display` title; Creator = `bg-landing-mint-soft
  border-2 border-landing-mint-line` + mint eyebrow; Brand card stays gated by `BRAND_ROLE_ENABLED`.
  Keep the exact `onSelectRole(role)` / `onBackToLogin` calls + the role enum values. Heading "Join
  DragonCandy" → `font-display` (+ optional pixel eyebrow).
- [ ] **Step 3:** build + typecheck; keep/adjust tests; commit.

---

## Task 4: AuthPage retheme (logic frozen)

**Files:** Modify `src/pages/AuthPage.tsx` (+ test if theme-asserting).

- [ ] **Step 1:** Remove `useDarkHtml()` (call + import). Replace the root
  `<div className="dark … bg-dc-dark text-white bg-[radial-gradient(...)]">` + `<GlowBackdrop/>` with
  `<AuthShell>` wrapping the existing content (keep the inner `relative z-10 flex flex-1 flex-col`
  structure). Logo: swap `Transparent_DragonCandy_logo.webp` → `/logo.webp` (reads on light; keep the
  `<Link to="/">` + sizing). Headings ("Welcome to DragonCandy" / "Create Account") → `font-display
  text-landing-ink` (+ optional one `Eyebrow`). Error blocks (`bg-red-500/10 … text-red-300`) → light
  (mapping); resend link `text-dc-teal` → `text-landing-pink`; dismiss `text-white/60` →
  `text-landing-ink-soft`.
  - **DO NOT touch** any handler/effect/state: `initialMode`/`initialRole` parsing, `checkProfileCompletion`,
    `handleOAuthReturn`, the verification/resend logic, `handleModeChange`/`handleSelectRole`/etc., the
    `ALLOWED_REDIRECT_ORIGINS` set, or the mode/step conditional rendering structure.
- [ ] **Step 2:** build + typecheck + lint; update `AuthPage` test if it asserts dark classes; commit.

---

## Task 5: ForgotPassword + UpdatePassword

**Files:** Modify `src/pages/ForgotPassword.tsx`, `src/pages/UpdatePassword.tsx` (+ tests).

- [ ] **Step 1:** For EACH: read the file, remove `useDarkHtml()` (call + import) + the dark root
  wrapper, wrap the content in `<AuthShell>`, apply the mapping to headings/cards/fields/buttons/
  errors/links. Submit buttons → `LandingButton` pink. **Logic (reset-email send, password-update
  submit, token handling, redirects) byte-identical.**
- [ ] **Step 2:** build + typecheck; keep behavior tests green; commit.

---

## Task 6: VerifyEmail + RestoreAccountPage + InviteAcceptPage

**Files:** Modify `src/pages/VerifyEmail.tsx`, `src/pages/RestoreAccountPage.tsx`,
`src/pages/InviteAcceptPage.tsx` (+ tests).

- [ ] **Step 1:** For EACH: remove `useDarkHtml()` + dark wrapper, wrap in `<AuthShell>`, apply the
  mapping (status icons/messages/buttons → light landing tokens; the teal/green/red status colors →
  light semantic equivalents where they were dark-opacity). **Verification/restore/invite-accept
  logic byte-identical.** (`RestoreAccountPage` uses `text-teal-500`/`bg-teal-500` restore button —
  restyle to `LandingButton` mint/pink; keep `handleRestore`.)
- [ ] **Step 2:** build + typecheck; keep behavior tests green; commit.

---

## Task 7: Onboarding (wizard + progress + steps)

**Files:** Modify `src/components/onboarding/OnboardingWizard.tsx`, `OnboardingProgress.tsx`,
`TapGrid.tsx`, `steps/*` (+ tests).

- [ ] **Step 1:** `OnboardingWizard` — remove `useDarkHtml()` (call + import) + the dark root wrapper;
  wrap in `<AuthShell>` (or a light equivalent); Bricolage step headings (`font-display`); the primary
  "Continue"/"Next" button → `LandingButton` pink. **Wizard state/step logic + Supabase saves
  unchanged.**
- [ ] **Step 2:** `OnboardingProgress` (light progress indicator — landing tokens), `TapGrid` (light
  tiles), and each `steps/*` (`WelcomeStep`, `IdentityStep`, `BioStep`, …) — apply the mapping; soften
  toward the app as steps progress (calmer accents). Keep each step's field/selection logic + props.
- [ ] **Step 3:** build + typecheck + lint; keep behavior tests green; commit.

---

## Task 8: Delete dead hook + DESIGN_SYSTEM + final sweep

**Files:** Delete `src/hooks/useDarkHtml.ts`; Modify `docs/DESIGN_SYSTEM.md`.

- [ ] **Step 1:** Grep the repo for `useDarkHtml` — confirm ZERO importers remain (all 7 surfaces
  converted). Then delete `src/hooks/useDarkHtml.ts`.
- [ ] **Step 2:** Grep the auth/onboarding files for leftover dark remnants: `bg-dc-dark`,
  `text-white`, `text-white/`, `dc-field`, `dc-panel`, `dc-surface`, `GlowBackdrop`, `useDarkHtml`,
  `dark ` root class — must be none (except intentional white-on-colored-fill, e.g. `LandingButton`
  pink text). Fix any stragglers.
- [ ] **Step 3:** `docs/DESIGN_SYSTEM.md` — extend the theme note: the marketing identity now covers
  **marketing + entry** (landing + auth + onboarding) — light, `landing-*` tokens + Bricolage/
  Instrument/Silkscreen; `/internal` stays dark (own inline toggle); the authenticated app stays
  `dc-*` / Outfit.
- [ ] **Step 4:** Full verify — `npm run build` + `npm run typecheck` + `npm run lint` + `npm run test`
  all green; commit.

---

## Task 9: Whole-branch verification

- [ ] **Step 1:** `npm run test` full suite green (fix any test still asserting old dark classes).
- [ ] **Step 2:** Manual on the Vercel preview, BOTH viewports: login, sign-up (role-selection +
  form), the 5 siblings, and the onboarding flow all light + on-brand, forms legible, no dark
  remnants / white-on-white; the app + `/internal` visually unchanged (regression). **Confirm computed
  `<body>` bg is LIGHT.**
- [ ] **Step 3:** Spot-check a login + a sign-up actually work (logic-intact smoke) against staging.

---

## Reviews & finish

- Per-task: superpowers:subagent-driven-development two-stage review (spec compliance + quality) —
  **every task review must explicitly confirm the auth logic/handlers/effects are byte-identical.**
- Whole-branch Opus review + **Codex second review** (required); fix + re-run until clean.
- No edge-fn/schema → `careful`/`edge-function-reviewer` not needed (frontend only).
- On finish: `knowledge-sync` (note: session detail now PREPENDS to `docs/SHIPPED_LOG.md`, PROJECT_CONTEXT
  §5 is a one-line index — per PR #294); open the PR via the REST overlay (git push blocked); **close
  PR #279** as superseded.
