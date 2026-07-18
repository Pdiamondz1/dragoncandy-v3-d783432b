# Light-Theme Polish Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the light app one consistent, on-brand look — a shared kit (PageBody/AppCard/AppChip/AppStatusBadge + a `dc-secondary` button variant) applied to the highest-traffic surfaces (dashboards, campaigns, browse), plus de-graying and a few quick wins.

**Architecture:** Build 4 small presentational primitives + 1 button variant (TDD, render tests), then mechanically adopt them across the Phase-1 surfaces per a fixed conversion table, gating each group on build + a residual-grep + a both-viewport visual walk.

**Tech Stack:** React 18 + TS (strict), Tailwind, shadcn/ui (class-variance-authority), vitest + @testing-library/react. `cn` at `@/lib/utils`.

**Canonical references (read before editing):**
- Spec: `docs/superpowers/specs/2026-07-17-light-theme-polish-phase1-design.md` — the **§5 de-gray palette** is the authoritative mapping; apply it, don't restate per file.
- Design system: `docs/DESIGN_SYSTEM.md` (teal `#4DD9C0`, `dc-teal-btn` `#0F766E`, `dc-pink-accent` `#EC4899`, `dc-text-muted` `#555`, `shadow-dc-sm`).

**Testing philosophy.** The 4 primitives get real vitest render tests (props/variants/states — worth it). The *application* groups are mechanical class swaps with almost no logic, so their gate is **(1)** `npm run build`, **(2)** a **residual grep** over the touched files, **(3)** a both-viewport dev-server walk. Repo vitest quirk: co-located `*.test.tsx` needs `// @vitest-environment jsdom` + `import "@testing-library/jest-dom"` at the top (see existing `*.test.tsx`).

**Residual-grep command (reused; surfaces/badges/off-brand only — NOT text-gray, which is out of scope):**
```bash
# from the worktree; replace PATHS. bg-gray-800/900 are intentional dark overlays — ignore those.
grep -nE 'bg-gray-(50|100|200|300|400|500)|border-gray-|hover:bg-gray-|bg-(blue|indigo|orange)-(50|100|500|600)|bg-purple-|from-purple-|to-purple-|text-indigo-' PATHS
# every hit → converted per the §5 table, or a verified keep (social-platform gradient / emerald-in-teal). NOT text-gray-*.
```

**Scope note (out of this plan):** dark surfaces (landing/auth/onboarding/internal) and Phase-2/3 surfaces (messaging, DragonShare, settings, org/billing, promotions, outstand, profiles). No layout/behavior/copy changes; spacing/max-width normalization IS an intended visible delta (per spec §7).

---

## Group A — The shared kit

### Task 1: `PageBody`
**Files:** Create `src/components/app/PageBody.tsx`; Test `src/components/app/PageBody.test.tsx`

- [ ] **Step 1: Write the failing test**
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PageBody } from "./PageBody";

test("PageBody renders children and applies the maxWidth class", () => {
  const { container } = render(<PageBody maxWidth="4xl"><p>hi</p></PageBody>);
  expect(screen.getByText("hi")).toBeInTheDocument();
  expect(container.firstChild).toHaveClass("max-w-4xl", "mx-auto", "space-y-8");
});
```
- [ ] **Step 2:** `npx vitest run src/components/app/PageBody.test.tsx` → FAIL (module not found).
- [ ] **Step 3: Implement**
```tsx
import { cn } from "@/lib/utils";

const MAX = { "6xl": "max-w-6xl", "4xl": "max-w-4xl", full: "max-w-full" } as const;

/** Standard page body: max-width + section rhythm only. The DashboardLayout shell owns page padding. */
export function PageBody({
  children, maxWidth = "6xl", className,
}: { children: React.ReactNode; maxWidth?: keyof typeof MAX; className?: string }) {
  return <div className={cn("mx-auto w-full space-y-8", MAX[maxWidth], className)}>{children}</div>;
}
```
- [ ] **Step 4:** run test → PASS; `npm run build` → PASS.
- [ ] **Step 5: Commit** `git add src/components/app/PageBody.tsx src/components/app/PageBody.test.tsx && git commit -m "feat(polish): add PageBody primitive"`

### Task 2: `AppCard`
**Files:** Create `src/components/app/AppCard.tsx`; Test `src/components/app/AppCard.test.tsx`

- [ ] **Step 1: Failing test** — assert default vs emphasis vs inset classes + pad:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AppCard } from "./AppCard";

test("AppCard: default border + pad, emphasis + inset variants", () => {
  const { rerender, container } = render(<AppCard>x</AppCard>);
  expect(container.firstChild).toHaveClass("border-dc-teal/15", "bg-white", "rounded-2xl", "p-5");
  rerender(<AppCard variant="emphasis" pad="6">x</AppCard>);
  expect(container.firstChild).toHaveClass("border-2", "border-dc-teal", "p-6");
  rerender(<AppCard variant="inset">x</AppCard>);
  expect(container.firstChild).toHaveClass("bg-dc-teal/[0.04]", "rounded-xl");
  expect(screen.getByText("x")).toBeInTheDocument();
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
```tsx
import { cn } from "@/lib/utils";

const VARIANT = {
  default: "rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm",
  emphasis: "rounded-2xl border-2 border-dc-teal bg-white shadow-dc-sm",
  inset: "rounded-xl border border-dc-teal/10 bg-dc-teal/[0.04]",
} as const;
const PAD = { "5": "p-5", "6": "p-6" } as const;

/** Canonical light-app content card. NOT the shadcn ui/card (that's shared with dark surfaces). */
export function AppCard({
  children, variant = "default", pad = "5", className, ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof VARIANT; pad?: keyof typeof PAD }) {
  return (
    <div className={cn(VARIANT[variant], PAD[pad], className)} {...props}>
      {children}
    </div>
  );
}
```
- [ ] **Step 4:** test → PASS; `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(polish): add AppCard primitive`

### Task 3: `AppChip`
**Files:** Create `src/components/app/AppChip.tsx`; Test `src/components/app/AppChip.test.tsx`

- [ ] **Step 1: Failing test** — active vs inactive classes + click:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppChip } from "./AppChip";

test("AppChip toggles style by active + fires onClick", () => {
  const onClick = vi.fn();
  const { rerender } = render(<AppChip onClick={onClick}>All</AppChip>);
  const btn = screen.getByRole("button", { name: "All" });
  expect(btn).toHaveClass("bg-white", "border-dc-teal/20", "text-dc-text-muted", "rounded-full");
  fireEvent.click(btn); expect(onClick).toHaveBeenCalled();
  rerender(<AppChip active>All</AppChip>);
  expect(screen.getByRole("button", { name: "All" })).toHaveClass("bg-dc-teal/10", "border-dc-teal", "text-dc-teal-btn");
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
```tsx
import { cn } from "@/lib/utils";

/** De-grayed filter/segment chip. off = white + teal-tint border; on = teal fill. */
export function AppChip({
  children, active = false, className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors",
        active
          ? "bg-dc-teal/10 border-dc-teal text-dc-teal-btn"
          : "bg-white border-dc-teal/20 text-dc-text-muted hover:bg-dc-teal/5",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```
- [ ] **Step 4:** test → PASS; `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(polish): add AppChip primitive`

### Task 4: `AppStatusBadge`
**Files:** Create `src/components/app/AppStatusBadge.tsx`; Test `src/components/app/AppStatusBadge.test.tsx`

- [ ] **Step 1: Failing test** — tone → class:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AppStatusBadge } from "./AppStatusBadge";

test("AppStatusBadge maps tone to brand classes (never gray)", () => {
  const { rerender } = render(<AppStatusBadge tone="teal">Active</AppStatusBadge>);
  expect(screen.getByText("Active")).toHaveClass("bg-dc-teal/10", "text-dc-teal-btn", "rounded-full");
  rerender(<AppStatusBadge tone="pink">New</AppStatusBadge>);
  expect(screen.getByText("New")).toHaveClass("bg-dc-pink-accent/10", "text-dc-pink-accent");
  rerender(<AppStatusBadge tone="neutral">Draft</AppStatusBadge>);
  expect(screen.getByText("Draft")).toHaveClass("bg-dc-teal/5", "text-dc-text-muted");
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
```tsx
import { cn } from "@/lib/utils";

const TONE = {
  teal: "bg-dc-teal/10 text-dc-teal-btn",
  pink: "bg-dc-pink-accent/10 text-dc-pink-accent",
  amber: "bg-amber-50 text-amber-700",
  neutral: "bg-dc-teal/5 text-dc-text-muted",
} as const;

/** Brand-tinted status badge — never gray. */
export function AppStatusBadge({
  children, tone = "neutral", className,
}: { children: React.ReactNode; tone?: keyof typeof TONE; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone], className)}>
      {children}
    </span>
  );
}
```
- [ ] **Step 4:** test → PASS; `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(polish): add AppStatusBadge primitive`

### Task 5: `dc-secondary` button variant
**Files:** Modify `src/components/ui/button.tsx` (the cva `variants.variant` map)

- [ ] **Step 1:** Add to the variant map (do not alter existing variants):
```ts
"dc-secondary":
  "bg-white text-dc-pink-accent border-2 border-dc-teal/30 hover:bg-dc-teal/5 transition-[color,background-color] duration-150",
```
(The base cva already applies `rounded-full`, so it's omitted here.)
- [ ] **Step 2:** `npm run build` → PASS (cva typing still compiles).
- [ ] **Step 3: Commit** `feat(polish): add dc-secondary button variant`

---

## Group B — Dashboards

### Task 6: Dashboards adopt the kit
**Files:** `src/pages/{BusinessDashboard,CreatorDashboard,BrandDashboard}.tsx` + `src/components/dashboard/*` (shared blocks drive all three).

- [ ] Wrap each dashboard body in `<PageBody>`; remove the pages' own `px-*`/`pt-*`/`pb-*`/`space-y-*` wrappers (shell owns padding). Convert the shared `components/dashboard/*` card frames to `<AppCard>` (the `border border-dc-teal/15 bg-white shadow-dc-sm` frames already match `AppCard default` — swap to the component; kill any `rounded-xl`/`rounded-3xl` drift). Standardize any `bg-dc-teal` button fill → the `dc-primary` variant (`dc-teal-btn`). De-gray `ActivityFeedCard` blue/indigo accents → teal (`AppStatusBadge`/`text-dc-teal`) per §5.
- [ ] `npm run build`; residual-grep the touched files; both-viewport dev walk of all 3 dashboards (populated + first-run). Commit `feat(polish): dashboards adopt the light kit`.

---

## Group C — Campaigns (two sub-batches; touch only components rendered by the 5 pages)

### Task 7: Campaigns — creator/builder flow
**Files:** `src/pages/CampaignCreator.tsx` + `src/components/campaign-creator/*` + `src/components/campaigns/*` reached from the builder (e.g. `CampaignAIPreviewStep`, `CostBreakdown`, `CampaignFinalizeStep`, `DeliverableBuilder`, `CampaignVisualsStep`).
- [ ] Adopt `PageBody`/`AppCard`; **kill the `rounded-xl` builder-card family → `AppCard`** (uniform `rounded-2xl`); de-gray chips (`IdeaCard`/`CampaignPreviewCard`/`CampaignEditor` `bg-gray-100` chips → `AppChip`), inputs (`bg-gray-100` → `bg-white border-dc-teal/20`), and the `bg-orange-50`/`bg-blue-50` info boxes → `AppCard inset` or a brand tone. Build + grep + both-viewport walk of the builder + commit `feat(polish): campaign builder flow adopts the light kit`.

### Task 8: Campaigns — list / details / marketplace
**Files:** `src/pages/{CampaignsPage,CampaignDetailsPage,CreatorCampaignMarketplace,MyCampaignsPage}.tsx` + `src/components/campaigns/*` + `src/components/campaign-details/*` reached from them (e.g. `BrandCampaignCard`, `CampaignSwipeCard`, `CampaignDetailModal`, `campaign-details/sections/*`, `CampaignApplyForm`, `OneTapApplySheet`).
- [ ] Adopt `PageBody`/`AppCard`; **fix the same-file card mismatch `CreatorCampaignMarketplace.tsx:378` (`border-gray-100`) vs `:413` (`border-teal-200`) → both `AppCard`**; unify the `border-2 border-dc-teal` vs `border-dc-teal/15` cards to `AppCard` (`emphasis` only for selected/featured); de-gray category/platform/requirement pills → `AppChip`/`AppStatusBadge`; fix the `CreatorCampaignMarketplace.tsx:489` secondary CTA (`text-pink-500 border-gray-200 hover:bg-gray-50`) → `dc-secondary` variant; standardize the `bg-dc-teal` vs `bg-dc-teal-btn` fills. Build + grep + walk + commit `feat(polish): campaign list/details/marketplace adopt the light kit`.

---

## Group D — Browse

### Task 9: Browse adopts the kit
**Files:** `src/pages/CreatorBrowse.tsx` + `src/components/creator-browse/*` (`CreatorCard`, `CreatorBrowseHeader`).
- [ ] `CreatorBrowse` root stays `bg-white` (drop the double `p-4 sm:p-6 lg:p-8` — use `PageBody`); `CreatorCard` gray border (`border border-gray-200`) → `AppCard`; `CreatorBrowseHeader` search field + filter pills (`bg-gray-100 rounded-full`) → `bg-white border-dc-teal/20` field + `AppChip` filters. Build + grep + both-viewport walk + commit `feat(polish): browse adopts the light kit`.

---

## Group E — Quick wins

### Task 10: Full-page grays + off-brand buttons
**Files:** `src/pages/BrandStylePicker.tsx`, `src/components/first-run/FirstRunDashboard.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/campaigns/CampaignAnalysisDisplay.tsx`, `src/components/reviews/RatingPrompt.tsx`, `src/components/projects/StartContentButton.tsx`.
- [ ] `BrandStylePicker` `bg-gray-400` → `bg-white`; `FirstRunDashboard` `bg-gray-100` → `bg-white` (keep the readable teal chrome from the earlier fix); `ErrorBoundary` `bg-gray-50` → `bg-white`. `CampaignAnalysisDisplay`/`RatingPrompt` `bg-blue-600` buttons → `dc-primary` variant (+ its ~7 blue accents → teal). `StartContentButton` `from-pink-500 to-purple-600` → `from-dc-pink-accent to-dc-teal`. Build + grep + commit `feat(polish): de-gray full-page surfaces + off-brand buttons`.

---

## Group F — Docs

### Task 11: Refresh DESIGN_SYSTEM.md
**Files:** `docs/DESIGN_SYSTEM.md`
- [ ] Rewrite the stale "Page-Specific Backgrounds" table to the clean-white reality (app = white; landing/auth/onboarding/internal = dark). Add a "Shared light-app kit" subsection documenting `PageBody`/`AppCard`/`AppChip`/`AppStatusBadge` + `dc-secondary` + the de-gray palette (from spec §5). Commit `docs(polish): refresh DESIGN_SYSTEM to the clean-white light kit`.

---

## Final verification (before finishing the branch)
- [ ] `npm run build` clean; the 4 primitive test files pass (`npx vitest run src/components/app`).
- [ ] `npm run dev` — walk **both viewports** across the Phase-1 surfaces (3 dashboards incl. first-run, the full campaign flow, browse): confirm ONE consistent card/chip/button/spacing language, no gray surfaces/badges, no off-brand buttons, no double-padding, and **no behavior/layout regression** (content all present, mobile-nav clearance intact).
- [ ] Full residual grep over `src/pages/{*Dashboard,Campaign*,CreatorCampaignMarketplace,MyCampaignsPage,CreatorBrowse}.tsx` + `src/components/{dashboard,campaign-creator,campaign-details,creator-browse}` + the quick-win files — no un-converted gray surfaces / off-brand buttons remain.
- [ ] `codex-review` (mandatory) → fix → re-run until clean. Open PR. After deploy, `verify-prod` (both viewports) — auth for the dashboards is user-gated, so verify the public surfaces + have the founder sign in for the dashboards. Then `knowledge-sync`.

## Out of scope (Phase 2/3 — do NOT touch here)
Messaging, DragonShare pages, settings, org/billing, promotions, outstand, public profiles; all dark surfaces; the ~1,350 `text-gray-*` secondary text.
