# Donny on Every Dashboard (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The creator and brand dashboards answer inline the same way the business one does.

**Architecture:** `DonnyHome` today takes no props and hardcodes the business role in seven places. This plan turns it into a role-configured component driven by one `Record<UserRole, DonnyHomeConfig>` map, then extracts each role's existing dashboard body to its own `/overview` page — the same move `#410` made for business — so nothing is lost when the Donny body takes over. Each dashboard becomes the same three-way switch `BusinessDashboard` already is.

**Tech Stack:** React 18 + TypeScript (strict), React Router, Vitest + RTL, one Deno edge function (the server-side route allow-list).

## Global Constraints

- **Adding a route means updating THREE tables, or Donny's links 404.** `src/lib/donnyRoutes.ts:9-11` states the obligation itself: `src/App.tsx` (the real router), `src/lib/donnyRoutes.ts` (the client allow-list), and `supabase/functions/donny-orchestrator/routes.ts` (the server allow-list). **The third one means this phase is not frontend-only — it requires an edge-function deploy.** Merging does not deploy it (`project_pr402_security_fix_merged_not_deployed`).
- Role strings are exactly `'business_client' | 'content_creator' | 'brand'` (`src/types/user.ts:1`). Note the parallel, *different* vocabulary `business_profiles.account_type ∈ 'restaurant' | 'brand'` used by the route guards — do not conflate them.
- There are **two separately-declared `UserRole` aliases** with identical unions (`src/types/user.ts:1` and `src/types/firstRun.ts:3`). Import the one from `@/types/user` for anything in this plan.
- `isKnownDonnyRoute`'s allow-list guards only routes the **LLM invents** — it has never caught a hardcoded link (`project_known_route_guard_blind_spot`). Every route this plan hardcodes must be checked by eye against `App.tsx`.
- Desktop changes use `lg:`/`xl:` prefixes; mobile uses base classes. Test both viewports.
- Tailwind `dc-*` tokens; no gray surfaces/badges.
- Every RTL test file starts with `// @vitest-environment jsdom` then `import '@testing-library/jest-dom';` as the first two lines.
- Vitest baseline: **12 files / 129 tests passing** (plus whatever Phase 2 added). No task may reduce it.

## Verified preconditions (checked 2026-08-09 — do not re-assume)

| Fact | Status |
|---|---|
| `DonnyHome` props | **none** — `DonnyHome.tsx:45` is `export function DonnyHome()` |
| Business hardcodes in `DonnyHome` | lines 36, 43, 158, 177, 189-191, 204, 254 |
| `donnyHomeSuggestions.ts` | one flat `BUSINESS_SUGGESTIONS` array — **not role-keyed** |
| `/dashboard/creator/overview` | **does not exist** (no route, no page) |
| `/dashboard/brand/overview` | **does not exist** (no route, no page) |
| Business precedent | `BusinessOverview.tsx` (217 lines) + `App.tsx:44, 241`, from `0f41c2a5` (#410) |
| `BusinessDashboard.tsx` | a 37-line three-way switch — the exact shape to copy |
| Creator hero to replace | `CreatorDashboard.tsx:160-173` |
| Brand hero to replace | `BrandDashboard.tsx:142-153` |
| `DONNY_FIRST_DASHBOARD_ENABLED` | `true` (`featureConfig.ts:51`); its comment block (lines 33-51) is **stale** — it says taps open the panel, which Phase 1 replaced |
| Role-keyed map precedent | `useDonnyQuickChips.ts:12` (`Record<path, Record<role, …>>`) and `FirstRunHero.tsx:10` (`Record<UserRole, …>`) |

### `BRAND_ROLE_ENABLED` does NOT hide the brand dashboard — brand IS verifiable

The flag is `false` (`featureConfig.ts:1`), but every one of its 10 call sites gates **signup and sponsorship UI**: the role picker (`RoleSelection.tsx:49`), the signup route map (`AuthPage.tsx:28`), the landing CTAs (`FinalCTASection.tsx:96,227`), and the sponsorship surfaces (`CampaignSponsorshipToggle.tsx:18`, `CampaignFinalizeStep.tsx:579`, `CampaignDetailsPage.tsx:519`, the two application cards).

`/dashboard/brand` is registered **unconditionally** at `App.tsx:237`, guarded only by `BrandRoute` (`account_type === 'brand'`). So an existing brand account reaches it normally, and the project memory holds a brand test login for dragoncandy.io. **Do not skip the brand half of the verification pass on the belief that it is unreachable.**

### Scoped OUT of v1, deliberately: creator and brand proposals

`buildDonnyProposals.ts` is business-only all the way down — not just its routes (lines 134, 165, 185) but its inputs. All three feeding hooks resolve "yours" as *campaigns you own*: `usePendingActions.ts:36,66` and `useUpcomingCampaignDeadlines.ts:61` both filter `.eq('user_id', user.id)`, and `useLocationReadiness.ts:6` defaults to `accountType = 'restaurant'`. A creator owns no campaigns, so every one of those returns empty — the attention list would render blank, not wrong.

A real creator attention list (applications awaiting a response, content due, payouts pending) is a different data layer and its own piece of work. **v1 ships creator and brand with no attention list**, which is honest, rather than a fabricated one. `DonnyHomeConfig.proposalsEnabled` makes the gap explicit in code instead of implicit.

---

### Task 1: Extract `CreatorOverview` and `BrandOverview`

Pure extraction, exactly as `#410` did for business: the body moves **verbatim** so nothing is lost, and the dashboard file is left importing it.

**Files:**
- Create: `src/pages/CreatorOverview.tsx`
- Create: `src/pages/BrandOverview.tsx`
- Modify: `src/pages/CreatorDashboard.tsx`, `src/pages/BrandDashboard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/donnyRoutes.ts`
- Modify: `supabase/functions/donny-orchestrator/routes.ts`

**Interfaces:**
- Produces: `export default function CreatorOverview()` / `BrandOverview()`, and the routes `/dashboard/creator/overview`, `/dashboard/brand/overview`. Task 4 links to both.

- [ ] **Step 1: Move each body verbatim**

Copy the whole render of `CreatorDashboard.tsx` (including its first-run, error and loading branches and its `DashboardLayout userRole="content_creator"` wrapper) into `CreatorOverview.tsx` as the default export. **Do not take the opportunity to tidy it** — a verbatim move is reviewable by inspection; a move-plus-edit is not. Same for brand.

Head each new file with the comment the business one carries:

```tsx
// The pre-Donny creator dashboard body, moved here verbatim so it stays
// reachable at /dashboard/creator/overview once the Donny body takes over.
```

- [ ] **Step 2: Register the routes in all three tables**

`src/App.tsx` — beside the existing business pair (line 44 / 241):

```tsx
const CreatorOverview = lazy(() => import("./pages/CreatorOverview"));
const BrandOverview = lazy(() => import("./pages/BrandOverview"));
// …
<Route path="/dashboard/creator/overview" element={<ProtectedRoute><CreatorOverview /></ProtectedRoute>} />
<Route path="/dashboard/brand/overview" element={<ProtectedRoute><BrandRoute><BrandOverview /></BrandRoute></ProtectedRoute>} />
```

> Match each role's **existing** guard exactly. Creator routes use `ProtectedRoute` alone — there is no `CreatorRoute` component anywhere in `src/`. Brand uses `BrandRoute`. Do not "fix" that asymmetry here.

`src/lib/donnyRoutes.ts` — add `/dashboard/creator/overview` to the creator block (lines 83-97) and `/dashboard/brand/overview` to the brand block (lines 65-82).

`supabase/functions/donny-orchestrator/routes.ts` — add both to the server allow-list. Read the file first; the client file's comment at lines 45-50 records that some legacy redirects are deliberately **not** mirrored, so the two lists are not a blind copy.

- [ ] **Step 3: Test the route table stayed in sync**

```ts
// src/lib/donny/donnyRoutes.test.ts (extend if it exists, create if not)
it('knows both new overview routes', () => {
  expect(isKnownDonnyRoute('/dashboard/creator/overview')).toBe(true);
  expect(isKnownDonnyRoute('/dashboard/brand/overview')).toBe(true);
});
```

And in the edge function's own suite (`routes.test.ts` already exists, 145 lines) add the mirrored assertion. A route present in one list and absent from the other is the exact failure this pair of tests exists to catch.

- [ ] **Step 4: Point each dashboard at its extracted page**

For now `CreatorDashboard.tsx` / `BrandDashboard.tsx` simply render the extracted component — behaviour is byte-identical. Task 4 turns them into switches.

- [ ] **Step 5: Verify**

```bash
npx vitest run src/lib/donny/ supabase/functions/donny-orchestrator/routes.test.ts
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/pages src/App.tsx src/lib/donny supabase/functions/donny-orchestrator/routes.ts
git commit -m "refactor(dashboard): extract CreatorOverview and BrandOverview behind their own routes"
```

---

### Task 2: Audit what Donny can actually do for a creator and a brand, then write the taps

**Do the audit before writing a single chip.** `donnyHomeSuggestions.ts:3-8` records why: the business set was cut to the four tools *verified working on prod*, and anything touching `social_*` (0/7) or an analytics claim was deliberately excluded. Its closing line is the standard — *"A tap that produces a shrug is worse than no tap — do not add one without re-running the capability audit."* `find_creators` and `prepare_campaign` are business verbs; handing them to a creator is exactly the shrug that comment forbids.

**Files:**
- Modify: `src/lib/donny/donnyHomeSuggestions.ts`
- Modify: `src/lib/donny/donnyHomeSuggestions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const BUSINESS_SUGGESTIONS: DonnySuggestion[];   // unchanged
  export const CREATOR_SUGGESTIONS: DonnySuggestion[];
  export const BRAND_SUGGESTIONS: DonnySuggestion[];
  export const SUGGESTIONS_BY_ROLE: Record<UserRole, DonnySuggestion[]>;
  ```

- [ ] **Step 1: Run the audit on prod, signed in as the creator test account**

Ask Donny each candidate prompt and record the verbatim answer in the task report. A candidate ships only if the answer is genuinely useful. Candidates to try, and what disqualifies each:

| Candidate | Ships only if |
|---|---|
| "What's trending for creators near me?" | `web_search` returns something specific, not a generic list |
| "Find paid work near me" | it returns real open campaigns, not an apology |
| "Help me write a pitch for this campaign" | it produces usable copy without needing data it cannot reach |
| "How do I get paid faster?" | it answers from real product knowledge, not invention |

Repeat for brand with the brand test account. **Never type the credentials yourself** — they are in the project memory system and the founder enters them.

- [ ] **Step 2: Write the failing test**

```ts
import { SUGGESTIONS_BY_ROLE, CREATOR_SUGGESTIONS, BRAND_SUGGESTIONS } from './donnyHomeSuggestions';

describe('SUGGESTIONS_BY_ROLE', () => {
  it('covers all three roles with a non-empty, bounded set', () => {
    for (const role of ['business_client', 'content_creator', 'brand'] as const) {
      expect(SUGGESTIONS_BY_ROLE[role].length).toBeGreaterThan(0);
      expect(SUGGESTIONS_BY_ROLE[role].length).toBeLessThanOrEqual(3);
    }
  });

  it('makes no analytics or ROI claim in any role', () => {
    // The honest-analytics work had to walk these back once already.
    for (const set of Object.values(SUGGESTIONS_BY_ROLE)) {
      for (const s of set) {
        expect(`${s.label} ${s.message}`).not.toMatch(/stats|analytics|roi/i);
      }
    }
  });

  it('never offers a creator a business-only verb', () => {
    for (const s of CREATOR_SUGGESTIONS) {
      expect(s.message).not.toMatch(/create a campaign for my restaurant|find creators/i);
    }
  });

  it('gives every role a distinct set', () => {
    const msg = (set: DonnySuggestion[]) => set.map(s => s.message).join('|');
    expect(msg(CREATOR_SUGGESTIONS)).not.toBe(msg(BRAND_SUGGESTIONS));
  });
});
```

Keep the existing `BUSINESS_SUGGESTIONS` describe block **unchanged** — it is the guard that survived Task 8 of Phase 1.

- [ ] **Step 3: Run and watch it fail**

- [ ] **Step 4: Implement**

Add the two arrays from the audit's *passing* candidates only, plus `SUGGESTIONS_BY_ROLE`. Carry the audit date in a comment above each new array, exactly as the business one does, so the next person knows when it was last true.

- [ ] **Step 5: Run and watch it pass, then commit**

```bash
npx vitest run src/lib/donny/donnyHomeSuggestions.test.ts
git add src/lib/donny/donnyHomeSuggestions.ts src/lib/donny/donnyHomeSuggestions.test.ts
git commit -m "feat(donny): per-role dashboard taps, each one audited against prod"
```

---

### Task 3: Make `DonnyHome` role-configured

**Files:**
- Create: `src/lib/donny/donnyHomeConfig.ts`
- Create: `src/lib/donny/donnyHomeConfig.test.ts`
- Modify: `src/components/donny/DonnyHome.tsx`
- Modify: `src/components/donny/DonnyHome.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface DonnyHomeConfig {
    role: UserRole;
    roleLabel: string;              // 'Restaurant Dashboard' | 'Creator Dashboard' | 'Brand Dashboard'
    overviewRoute: string;
    suggestions: DonnySuggestion[];
    proposalsEnabled: boolean;      // business only in v1 — see the scoped-out note
    displayName: (profile: Profile | null) => string;
  }
  export const DONNY_HOME_CONFIG: Record<UserRole, DonnyHomeConfig>;
  ```
  `DonnyHome` gains one optional prop: `{ role?: UserRole }`, defaulting to the caller's own `profile.role`.

- [ ] **Step 1: Write the failing config test**

```ts
it('points each role at its own real overview route', () => {
  expect(DONNY_HOME_CONFIG.business_client.overviewRoute).toBe('/dashboard/business/overview');
  expect(DONNY_HOME_CONFIG.content_creator.overviewRoute).toBe('/dashboard/creator/overview');
  expect(DONNY_HOME_CONFIG.brand.overviewRoute).toBe('/dashboard/brand/overview');
});

it('keeps every overview route inside the Donny allow-list', () => {
  // A dead "← Dashboard" link is the #409 defect class, and isKnownRoute never
  // catches a hardcoded one — so assert it here.
  for (const cfg of Object.values(DONNY_HOME_CONFIG)) {
    expect(isKnownDonnyRoute(cfg.overviewRoute)).toBe(true);
  }
});

it('enables the attention list for business only in v1', () => {
  expect(DONNY_HOME_CONFIG.business_client.proposalsEnabled).toBe(true);
  expect(DONNY_HOME_CONFIG.content_creator.proposalsEnabled).toBe(false);
  expect(DONNY_HOME_CONFIG.brand.proposalsEnabled).toBe(false);
});

it('reads each role\'s own display name field', () => {
  expect(DONNY_HOME_CONFIG.content_creator.displayName(
    { creator_name: 'Ada', full_name: 'Ada L' } as Profile)).toBe('Ada');
  expect(DONNY_HOME_CONFIG.brand.displayName(
    { business_name: 'Acme' } as Profile)).toBe('Acme');
});
```

- [ ] **Step 2: Write the failing component tests**

```tsx
it('renders the creator label, taps and overview link when role is content_creator', () => {
  renderHome('content_creator');
  expect(screen.getByText(/creator dashboard/i)).toBeInTheDocument();
  // enter the thread, then check the one link
  expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/creator/overview');
});

it('mounts no proposals for a creator even when the hooks return rows', () => {
  // usePendingActions mocked to return one action
  renderHome('content_creator');
  expect(screen.queryByTestId('donny-proposals')).not.toBeInTheDocument();
});

it('still renders proposals for a business', () => {
  renderHome('business_client');
  expect(screen.getByTestId('donny-proposals')).toBeInTheDocument();
});
```

> The middle test is the load-bearing one. Without it, `proposalsEnabled` can be deleted and every other test stays green.

- [ ] **Step 3: Run and watch them fail**

- [ ] **Step 4: Implement**

Replace each of the seven hardcodes with its config lookup: line 36's import → `SUGGESTIONS_BY_ROLE`; line 43's `OVERVIEW_ROUTE` → `cfg.overviewRoute`; lines 158/177's `userRole="business_client"` → `cfg.role`; lines 189-191's copy → `cfg.roleLabel`; line 204 → `cfg.suggestions`; line 254 → `cfg.overviewRoute`.

Gate the three business-only hooks behind `cfg.proposalsEnabled`. **Do not call them conditionally** — that violates the rules of hooks. Call them unchanged and skip the *render*, or pass `enabled: cfg.proposalsEnabled` through to their React Query options; prefer the latter so a creator's dashboard issues no pointless queries.

- [ ] **Step 5: Run and watch them pass**

```bash
npx vitest run src/components/donny/ src/lib/donny/
npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/donny/donnyHomeConfig.ts src/lib/donny/donnyHomeConfig.test.ts src/components/donny/
git commit -m "feat(donny): DonnyHome is configured by role instead of hardcoding the business one"
```

---

### Task 4: Turn the two dashboards into switches

**Files:**
- Modify: `src/pages/CreatorDashboard.tsx`, `src/pages/BrandDashboard.tsx`
- Create: `src/pages/CreatorDashboard.test.tsx`, `src/pages/BrandDashboard.test.tsx`
- Modify: `src/lib/featureConfig.ts` (comment only)

- [ ] **Step 1: Write the failing tests**

```tsx
it('shows the first-run missions before anything else', () => {
  // isFirstRun true AND the flag on
  renderCreatorDashboard();
  expect(screen.getByTestId('first-run')).toBeInTheDocument();
});

it('falls back to the overview body when the flag is off', () => { /* … */ });
it('renders the Donny body when the flag is on and it is not first run', () => { /* … */ });
```

> Order matters and is the reason for the first test: `BusinessDashboard.tsx:7-8` records it — *"first-run is checked FIRST, so a brand-new owner always gets the mission list regardless of the flag."* A brand-new creator must not land in an empty Donny canvas.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

Copy `BusinessDashboard.tsx`'s 37-line shape exactly, swapping the role string, the overview import, and `<DonnyHome role="content_creator" />` / `role="brand"`.

- [ ] **Step 4: Correct the stale flag comment**

`featureConfig.ts:33-51` still says the taps open the existing Donny panel and that inline chat is "Phase B". Phase 1 shipped the inline canvas, and this task extends it to three roles. Rewrite the block to say what is now true. A comment that describes a design two phases out of date is how the next person gets it wrong.

- [ ] **Step 5: Verify**

```bash
npx vitest run src/pages/ src/components/donny/ src/lib/donny/
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/pages src/lib/featureConfig.ts
git commit -m "feat(dashboard): the creator and brand dashboards answer inline too"
```

---

### Task 5: Gates, deploy, verify

- [ ] **Step 1: `edge-function-reviewer`** over `donny-orchestrator` — this phase changes its route allow-list, so the deploy hazards apply (`_shared` bundling in particular).

- [ ] **Step 2: `/simplify`** over the changed files.

- [ ] **Step 3: Codex second review**

```bash
codex review --base main --title "Donny on every dashboard (Phase 3)"
```
Re-run until clean. **A blank run is a failed gate, not a pass.**

- [ ] **Step 4: Deploy the edge function.** Merging ships the frontend only.

```bash
supabase functions deploy donny-orchestrator --project-ref zocahiffooqdybdhguqv
```
Then confirm the **deployed source** contains `/dashboard/creator/overview`. A version bump is not evidence.

- [ ] **Step 5: `verify-prod`, both viewports, all three roles.** Sign in as each test account in turn (the founder enters credentials — never type them). Per role:
  1. The dashboard shows that role's label, its taps, and the composer.
  2. A tap sends and the answer renders inline — no panel opens.
  3. "← Dashboard" reaches that role's `/overview`, and the overview body is intact.
  4. A first-run account still gets the mission list.
  5. No console errors.

  Brand is reachable despite `BRAND_ROLE_ENABLED` being false — see the note above. Do not skip it.

- [ ] **Step 6: `knowledge-sync`** — wiki session source, `/wiki-ops ingest`, prepend to `docs/SHIPPED_LOG.md`, update `PROJECT_CONTEXT.md` §4 + its §5 index line, then sync Donny's RAG after merge.

---

## Out of scope

- A creator or brand attention list — see the scoped-out note. `proposalsEnabled` marks the seam.
- Changing `buildDonnyProposals` to be role-aware.
- Any change to the sidebar, mobile bottom nav, header or first-run flow.
- Launching the brand role (`BRAND_ROLE_ENABLED` stays `false` — this plan does not touch signup).
- Fixing `BrandDashboard.tsx:151`'s pre-existing cross-role link to `/dashboard/business/campaigns/create`.
- Ranked or personalised suggestions off `donny_messages` — still the follow-up `donnyHomeSuggestions.ts:10-11` names.
