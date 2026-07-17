# Dark-Luxe App Theme — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force the DragonCandy app to a single "Dark Luxe" theme matching the landing page, converting the login/sign-up, onboarding, shared chrome, and three dashboards (video backdrops stay landing-only).

**Architecture:** Turn the token layer dark once (`forcedTheme="dark"` + a retuned `.dark` CSS-var block re-skins ~847 semantic-token surfaces for free), then mechanically convert the ~1,900 hardcoded light literals (`bg-white`/`bg-gray-*`/`text-gray-*`) to the landing's dark-luxe language using a shared primitive layer and a fixed conversion table. Execute in group order A→B→C→D→E, building after each group.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind CSS (`darkMode:["class"]`), shadcn/ui (Radix), next-themes, class-variance-authority.

**Canonical references (read before editing):**
- Spec: `docs/superpowers/specs/2026-07-17-dark-luxe-app-theme-slice1-design.md` — especially the **§5.3 conversion table**, which is the authoritative literal→dark-luxe mapping. Do not restate it per file; apply it.
- Reference look: `src/pages/LandingPage.tsx` + `src/components/landing/*` (already dark).

**Testing philosophy (deliberate).** This is a presentational pass; there is almost no new
logic, so vitest units would be hollow (YAGNI). The gate for every task is: **(1)** `npm run build`
(typecheck + bundle) passes, **(2)** a **residual grep** over the files the task touched finds no
un-converted light literal, and **(3)** the surface renders correctly in the dev server at **both**
viewports. The one place a unit test earns its keep is the two new presentational components — a
one-line render assertion each. Line/`:NN` anchors below are exploration hints; **grep to confirm
the exact spot before editing.**

**Residual-grep command (reused across tasks)** — run against the paths a task touched:
```bash
# from the worktree root; replace PATHS with the task's files/dirs.
# `bg-white([^/]|$)` matches a bare bg-white but NOT bg-white/5 — POSIX-ERE-safe (no lookahead).
grep -nE 'bg-white([^/]|$)|bg-gray-|text-gray-|border-gray-|text-dc-text|bg-dc-card|bg-dc-pink-bg|from-dc-pink-bg' PATHS
# every hit must be intentionally converted or a verified false positive.
```
(Do NOT use a PCRE lookahead like `bg-white(?![/])` here — `grep -E` is POSIX ERE and would
silently match nothing for the `bg-white` alternative, hiding real un-converted page bodies.)

---

## Group A — Foundation

### Task A1: Force dark theme + kill first-paint flash

**Files:**
- Modify: `src/components/ThemeProvider.tsx`
- Modify: `index.html` (the `<html>` tag)
- Modify: `src/components/ui/sonner.tsx`

- [ ] **Step 1: Force dark in the provider.** In `src/components/ThemeProvider.tsx`, replace the props so it reads:

```tsx
<NextThemesProvider
  attribute="class"
  forcedTheme="dark"
  disableTransitionOnChange={false}
>
  {children}
</NextThemesProvider>
```
(Remove `defaultTheme="light"` and `enableSystem`.)

- [ ] **Step 2: Hardcode the class + color-scheme on `<html>`.** In `index.html`, change the opening tag to `<html lang="en" class="dark" style="color-scheme:dark">` (preserve any existing `lang`/attributes). This prevents a light `bg-background` flash before hydration and fixes native scrollbars/date pickers/autofill.

- [ ] **Step 3: Pin the toast theme.** In `src/components/ui/sonner.tsx`, stop reading `useTheme()` for the theme and pass `theme="dark"` to `<Sonner>` (with `forcedTheme`, the hook can resolve `"system"`). Leave the rest of the component intact.

- [ ] **Step 4: Build.** Run `npm run build`. Expected: PASS (no type errors).

- [ ] **Step 5: Sanity-check in dev.** `npm run dev`; load any authenticated page → the sidebar / shadcn chrome now render dark (page bodies will still be white — expected until later groups). Landing (`/`) must be unchanged.

- [ ] **Step 6: Commit.**
```bash
git add src/components/ThemeProvider.tsx index.html src/components/ui/sonner.tsx
git commit -m "feat(theme): force dark theme app-wide + kill first-paint flash"
```

### Task A2: Retire the light/dark toggle

**Files:**
- Modify: `src/components/DashboardLayout.tsx` (remove the `ThemeToggle` import + its render, ~lines 30 and 227)
- Delete: `src/components/ThemeToggle.tsx`

- [ ] **Step 1: Confirm no other consumer.** `grep -rn "ThemeToggle" src` — expect only `DashboardLayout.tsx` + the file itself.
- [ ] **Step 2: Remove** the import and the `<ThemeToggle />` render from `DashboardLayout.tsx`, then delete `src/components/ThemeToggle.tsx`.
- [ ] **Step 3: Build.** `npm run build` → PASS (catches a missed reference).
- [ ] **Step 4: Commit.**
```bash
git add -A
git commit -m "chore(theme): retire the light/dark toggle (single dark theme)"
```

### Task A3: Fix the two literal light spots in App.tsx

**Files:**
- Modify: `src/App.tsx` (public loading splash `bg-white` ~line 432; skip-link `focus:bg-white focus:text-black` ~line 396)

- [ ] **Step 1:** Change the public loading splash container `bg-white` → `bg-dc-dark`. The spinner already uses a teal border — leave it.
- [ ] **Step 2:** Change the skip-link `focus:bg-white focus:text-black` → `focus:bg-dc-dark focus:text-white` (keep it legible on dark). Leave `<main id="main-content">` as-is (it inherits `body { bg-background }`, now dark).
- [ ] **Step 3: Build.** `npm run build` → PASS.
- [ ] **Step 4: Commit.**
```bash
git add src/App.tsx
git commit -m "fix(theme): dark loading splash + skip-link in App shell"
```

### Task A4: Retune the `.dark` token block

**Files:**
- Modify: `src/index.css` (the `.dark { … }` block, ~lines 87-128)

> Note: the current `.dark` values (`--background: 240 23% 13%`, `--card: 240 22% 18%`) are already
> close to target — this is a **fine-tune**, not a from-scratch rewrite. Touch only the neutral lines
> below; leave every teal (`--primary`), pink (`--secondary`), `--ring`, and `--sidebar-*` line exactly.

- [ ] **Step 1: Retune neutrals only** so semantic-token surfaces match the brand charcoal + white-opacity feel. Set (starting values — the frontend-design pass may fine-tune against the landing):
```css
.dark {
  --background: 240 24% 13%;      /* ≈ #1A1A2A brand charcoal */
  --foreground: 0 0% 94%;
  --card: 240 16% 17%;           /* subtle white/5-over-charcoal lift */
  --card-foreground: 0 0% 94%;
  --popover: 240 16% 16%;
  --popover-foreground: 0 0% 94%;
  /* --primary (teal) and --secondary (pink) UNCHANGED */
  --muted: 240 16% 20%;
  --muted-foreground: 240 6% 64%; /* reads like text-white/60 */
  --border: 240 16% 24%;         /* white/10–15 feel */
  --input: 240 16% 24%;
  /* --ring, --sidebar-*, shadows: leave as-is unless visibly off */
}
```
Keep every `--primary`, `--secondary`, `--ring`, and `--sidebar-*` line as it currently is.

- [ ] **Step 2: Build.** `npm run build` → PASS.
- [ ] **Step 3: Visual check (dev).** Sidebar, desktop glass header, and any open dropdown/dialog read as charcoal (not blue-gray); teal/pink accents unchanged.
- [ ] **Step 4: Commit.**
```bash
git add src/index.css
git commit -m "feat(theme): retune .dark tokens to brand charcoal + white-opacity feel"
```

### Task A5 (audit-gated, optional): CSS-var-back `dc-card` + `dc-pink-bg`

**Files:**
- Modify: `tailwind.config.ts` (~lines 24-42) and `src/index.css` (add two vars to `:root`/`.dark` if adopted)

- [ ] **Step 1: Audit.** `grep -rnE "text-dc-card|fill-dc-card|text-dc-pink-bg|stroke-dc-pink-bg" src`. If **any** hit uses these as a text/foreground color, **skip this task** (the §5.3 fallback rows convert `bg-dc-card`/`bg-dc-pink-bg` manually per file instead).
- [ ] **Step 2 (only if audit clean):** Back `dc-card` and `dc-pink-bg` with CSS vars (e.g. `--dc-card`, `--dc-pink-surface`) whose dark values are `bg-white/5`-equivalent charcoal, so every `bg-dc-card`/`bg-dc-pink-bg` flips globally. Leave `dc-dark`, `dc-text`, `dc-text-muted`, and all teal/pink tokens untouched.
- [ ] **Step 3: Build + commit** (or record in the plan that it was skipped after audit).
```bash
git add tailwind.config.ts src/index.css
git commit -m "feat(theme): flip structural dc-card/dc-pink-bg neutrals to dark (audited)"
```

---

## Group B — Shared dark-luxe primitives

### Task B1: Add `@layer components` surface classes

**Files:**
- Modify: `src/index.css` (add a `@layer components { … }` block near the existing brand utilities)

- [ ] **Step 1:** Add:
```css
@layer components {
  .dc-surface { @apply min-h-screen bg-dc-dark text-white; }
  .dc-panel   { @apply rounded-3xl border border-white/10 bg-white/5; }
  .dc-field   { @apply h-12 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-dc-teal; }
}
```
(Named `.dc-panel`, **not** `.dc-card`, to avoid clashing with the `bg-dc-card` color utility.)
- [ ] **Step 2: Build** (`npm run build` → PASS) and **commit**:
```bash
git add src/index.css
git commit -m "feat(theme): add .dc-surface/.dc-panel/.dc-field dark primitives"
```

### Task B2: Add dark-luxe pill button variants

**Files:**
- Modify: `src/components/ui/button.tsx` (the CVA `variants.variant` map)

- [ ] **Step 1:** Add two variants to the CVA map:
```ts
"dc-teal-pill": "rounded-full bg-dc-teal text-dc-dark font-bold hover:bg-dc-teal-dark hover:shadow-glow-teal",
"dc-ghost-pill": "rounded-full border border-white/20 bg-white/5 text-white hover:border-dc-teal hover:text-dc-teal backdrop-blur",
```
Do not alter existing variants.
- [ ] **Step 2: Build + commit.**
```bash
git add src/components/ui/button.tsx
git commit -m "feat(theme): add dc-teal-pill and dc-ghost-pill button variants"
```

### Task B3: Create `GlowBackdrop` + `Eyebrow` components

**Files:**
- Create: `src/components/dark/GlowBackdrop.tsx`
- Create: `src/components/dark/Eyebrow.tsx`
- Test: `src/components/dark/Eyebrow.test.tsx`

- [ ] **Step 1: `GlowBackdrop.tsx`** — two absolutely-positioned blurred brand blobs (named export, `className` passthrough, `aria-hidden`):
```tsx
import { cn } from "@/lib/utils";

/** Ambient teal/pink glow blobs for dark-luxe surfaces. Non-interactive. */
export function GlowBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-dc-teal/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-dc-pink-accent/15 blur-3xl" />
    </div>
  );
}
```
- [ ] **Step 2: `Eyebrow.tsx`** — the teal-dot uppercase kicker (named export):
```tsx
import { cn } from "@/lib/utils";

/** Section eyebrow: teal dot + uppercase micro-label, dark-luxe. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-dc-teal", className)}>
      <span className="h-2 w-2 rounded-full bg-dc-teal" />
      {children}
    </span>
  );
}
```
- [ ] **Step 3: `Eyebrow.test.tsx`** — one render assertion:
```tsx
import { render, screen } from "@testing-library/react";
import { Eyebrow } from "./Eyebrow";

test("Eyebrow renders its label", () => {
  render(<Eyebrow>How it works</Eyebrow>);
  expect(screen.getByText("How it works")).toBeInTheDocument();
});
```
- [ ] **Step 4:** `npx vitest run src/components/dark/Eyebrow.test.tsx` → PASS; then `npm run build` → PASS.
- [ ] **Step 5: Commit.**
```bash
git add src/components/dark/
git commit -m "feat(theme): add GlowBackdrop + Eyebrow dark-luxe primitives"
```

---

## Group C — Shared chrome (wraps every authenticated page)

For each task: read the file, apply the **§5.3 conversion table**, keep all teal/pink accents, then build + residual-grep the touched files + commit. Pink stays as accents, never a surface wash.

### Task C1: `DashboardLayout.tsx`
- [ ] Convert `topNavBgClass` (`from-dc-pink-bg to-pink-50` ~166-169) → `bg-dc-dark/80 backdrop-blur-xl border-b border-white/10`; convert any remaining literal grays. The desktop glass header (`bg-background/80`) is already token-driven — verify it reads dark. Build + grep + commit (`feat(theme): dark-luxe DashboardLayout chrome`).

### Task C2: `MobileTopNav.tsx`
- [ ] Convert `text-gray-*`, `hover:bg-red-50 text-red-600` (sign-out), any `bg-white`. The `SheetContent` inherits the dark token — confirm it renders dark. Build + grep + commit.

### Task C3: `MobileBottomNav.tsx` (portaled literal — must be explicit)
- [ ] Convert `bg-white border-gray-100` → `bg-dc-dark/95 backdrop-blur border-t border-white/10`; inactive `text-gray-400` → `text-white/50`, active stays `text-dc-teal`. It portals to `document.body`, so literals are required (tokens would inherit, but it uses literals today). Build + grep + commit.

### Task C4: `DonnyDesktopPanel.tsx` + `DonnyMobileSheet.tsx`

**Files:**
- Modify: `src/components/donny/DonnyDesktopPanel.tsx`
- Modify: `src/components/donny/DonnyMobileSheet.tsx`

- [ ] `DonnyDesktopPanel`: `bg-white border-gray-200` → `bg-dc-dark border-l border-white/10` (keep the `fixed inset-y-0 right-0 z-40` overlay behavior). `DonnyMobileSheet`: verify/convert portaled literals to dark. Build + grep + commit.

---

## Group D — Auth + onboarding

### Task D1: `AuthPage.tsx` — cinematic dark gradient
- [ ] Replace the root `bg-gradient-to-br from-[#1A5C5C] via-[#2D7A7A] to-[#9B5A8A]` with a dark-luxe cinematic gradient over charcoal and drop in `<GlowBackdrop/>`:
```tsx
<div className="relative min-h-screen flex flex-col bg-dc-dark text-white
     bg-[radial-gradient(120%_120%_at_20%_0%,rgba(77,217,192,0.18),transparent_45%),radial-gradient(120%_120%_at_80%_100%,rgba(236,72,153,0.18),transparent_45%)]">
  <GlowBackdrop />
  {/* existing content, now above the glow via relative/z-10 wrappers */}
```
(Exact stops are tunable against the landing — no video.) Convert the four `verify_email`/error blocks: `bg-red-50 text-red-600` → `bg-red-500/10 text-red-300 border border-red-500/20`; the white `h1`s already read on dark. Build + commit.

### Task D2: `AuthForm.tsx` + `RoleSelection.tsx` + `AuthModeToggle.tsx` + `AuthHeader.tsx`
- [ ] `AuthForm`: white card → `.dc-panel`; `bg-gray-100` inputs → `.dc-field`; labels → `text-white`; dividers `border-white/10`; social buttons `bg-white border-gray-200` → `bg-white/5 border border-white/15 text-white`; keep the teal submit (or move to `dc-teal-pill`). `RoleSelection`: 3 role cards → `.dc-panel` with kept teal/pink accent borders; convert `from-gray-*` icon tiles to `bg-dc-teal/10`/`bg-dc-pink-accent/10`; text ramp. `AuthModeToggle`/`AuthHeader`: text ramp, keep teal/pink link colors. Build + grep + commit.

### Task D3: Auth-adjacent pages
- [ ] Apply the conversion table to `ForgotPassword.tsx`, `UpdatePassword.tsx`, `VerifyEmail.tsx`, `RestoreAccountPage.tsx`, `InviteAcceptPage.tsx` (all share the `min-h-screen bg-white` + white-card template). Build + grep + commit.

### Task D4: Onboarding
- [ ] Convert `OnboardingWizard.tsx` (`bg-white md:from-gray-50…` root, gray back button, `text-gray-900/400`, disabled grays) — **keep the teal/pink `accentColor` role branching intact**. Convert `steps/IdentityStep.tsx`, `steps/BioStep.tsx`, `steps/WelcomeStep.tsx`, `TapGrid.tsx`, `OnboardingProgress.tsx`, and `ProfileSetup.tsx`. Build + grep + commit.

---

## Group E — Dashboards + shared building blocks

Convert shared blocks first (they re-skin all three dashboards), then the page roots, then first-run.

### Task E1: Dashboard shared building blocks
- [ ] Apply the conversion table to `src/components/dashboard/`: `DashboardGreeting.tsx` (keep the `bg-dc-pink` accent tick), `StatsRow.tsx` (`text-dc-text`→white, `divide-dc-teal/10`→`divide-white/10`), `NeedsAttentionSection.tsx` + `RecentActivitySection.tsx` (card frames → `.dc-panel`), `HeroPrimaryAction.tsx` (primary → `dc-teal-pill`, keep pink secondary), `SectionHeader.tsx`, `BrandFreeTrioHero.tsx`, `SocialMediaManagerTile.tsx`. Build + grep + commit.

### Task E2: Dashboard DragonShare tiles
- [ ] Convert `src/components/dragonshare/DragonShareStatTile.tsx`, `DragonPointsCard.tsx`, `DragonShareActivityCard.tsx`, `BriefPerformanceCard.tsx` (card frames → `.dc-panel`, text ramp, keep teal/pink). Build + grep + commit.

### Task E3: Dashboard page roots
- [ ] `BusinessDashboard.tsx`, `BrandDashboard.tsx`, `CreatorDashboard.tsx`: `min-h-screen bg-white` → `.dc-surface`; convert any inline literals. Build + grep + commit.

### Task E4: First-run dashboard
- [ ] Convert `src/components/first-run/FirstRunDashboard.tsx` (renders instead of the normal dashboard for new accounts — a white hole if missed). Build + grep + commit.

---

## Final verification (before finishing the branch)

- [ ] `npm run build` clean.
- [ ] `npm run dev` — walk **both viewports** (desktop + mobile devtools): landing unchanged; `/auth` in all three states incl. the `verify_email` error; onboarding for a **creator (teal)** and a **business (pink)** path; all three dashboards in **first-run and populated** states; desktop header + sidebar + avatar dropdown (portal darkness); mobile top-nav sheet + bottom nav; Donny desktop panel; one toast. Confirm: no white flash, focus rings visible on dark, no console errors, portaled menus/dialogs dark.
- [ ] Full residual grep over `src/pages/Auth*`, `src/components/auth`, `src/components/onboarding`, `src/components/dashboard`, `src/components/dragonshare` (dashboard tiles), and the chrome files — no un-converted light literals remain.
- [ ] `codex-review` (mandatory second reviewer) → fix → re-run until clean.
- [ ] Open PR. After deploy, run `verify-prod` (prod desktop + mobile screenshots + console). Then `knowledge-sync`.

## Out of scope (later slices — do NOT touch here)
Campaigns, DragonShare/DragonFeed pages, browse creators/crews/public profiles, messaging, settings/org/billing/notifications/reviews/calendar/promotions, and public marketing (Pricing/Legal/Help). The landing, Internal/AIOS, and Pitch are already dark — leave them.
