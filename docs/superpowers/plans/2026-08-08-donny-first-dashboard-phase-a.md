# Donny-First Dashboard — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the business (restaurant) dashboard body with a Donny-first surface — a greeting, what needs the owner's attention, a prompt box and three taps that work — behind a default-off feature flag, preserving today's body verbatim at `/dashboard/business/overview`.

**Architecture:** `BusinessDashboard.tsx` becomes a thin three-way switch (first-run → flag-off → flag-on). Today's body moves verbatim into a new `BusinessOverview` page, reachable at its own route. The new body is `DonnyHome`, a container that mounts three existing data hooks, passes their already-fetched results to a **pure** `buildDonnyProposals()` merge/rank/cap function, and renders two presentational children. Taps and proposal CTAs open the **existing** Donny panel via `openDonnyWithContext()` — no `DonnyStage` change, no shared-context change.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` tokens + the light-app kit), React Query, Vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-08-08-donny-first-dashboard-design.md` (Phase A only).

## Global Constraints

- **Branch:** `feat/donny-first-dashboard` (already checked out; holds the two spec commits stacked on `2066cbf6`). Do not commit to `worktree-dc-improvements-22` — PR #409 is open on it.
- **Feature flag:** `DONNY_FIRST_DASHBOARD_ENABLED` in `src/lib/featureConfig.ts`, default **`false`**. Every new **UI surface** is behind it, and with the flag off the app must render exactly as it does today. The single exception is Task 7's system-prompt rule, which is deliberately not gated: it lives in an edge function that cannot read a frontend constant, and it makes Donny more helpful on every surface rather than introducing a new one. Task 7 states this at its own site too.
- **Nothing is deleted.** Today's body moves; the two rating prompts and the location-setup blocker keep a home. (Spec Goal 4.)
- **Design system:** light app only — `dc-*` tokens, `PageBody` / `AppCard` / `AppChip` / `AppStatusBadge` from `src/components/app/`. **Never a gray background, banner or badge**; `amber` is the allowed warm-neutral status tone. Gray *text* (`text-dc-text-muted`) is fine. Buttons are `rounded-full`.
- **`PageBody` owns page padding** — do not add your own. Pass `className="space-y-4"` only if you need tighter rhythm.
- **Desktop vs mobile are separate targets.** Base (unprefixed) classes = mobile; `lg:`/`xl:` = desktop. Never change one meaning to fix the other.
- **Route CTAs must pass `isKnownDonnyRoute()` before render.** A route that fails validation renders as plain text with no button. (Direct lesson of the twelve dead `/settings/*` CTAs in PR #409.)
- **Vitest environment is `node` globally.** Every React Testing Library file MUST begin with these two lines, in this order, before any other import:
  ```ts
  // @vitest-environment jsdom
  import '@testing-library/jest-dom';
  ```
- **`npm run test` exits 1** because ~103 pre-existing test files fail for unrelated reasons. Judge your work by the `N passed, 0 failed` counts for **your** files, never the process exit code. Run single files with `npx vitest run <path>`.
- **ESLint:** only `console.error` and `console.warn` are allowed. No `any`. Prefix intentionally-unused vars with `_`.
- **Named exports for components**, default export only for pages.
- **Analytics:** exactly the six events in spec §11, no others. `analytics_events` had a firehose incident — do not add per-render or per-scroll events.

---

### Task 1: Route-mirror parity test

The client route allow-list (`src/lib/donnyRoutes.ts`) and the server one (`supabase/functions/donny-orchestrator/routes.ts`) are hand-maintained twins. **Nothing currently asserts they agree.** Task 2 adds a route to both; this test is the guard that makes that safe, so it lands first.

**Correction to spec §12.** The spec says to assert the two arrays are *identical*. They are not, deliberately: the client carries two legacy Crews redirects (`/dashboard/business/groups`, `/dashboard/business/groups/:id`) with a comment in `donnyRoutes.ts` explicitly saying **not** to mirror them server-side — the server list is what Donny may *generate*, and it should only ever emit the new `/crews` path. An identity assertion would fail on the first run.

The invariant that actually matters is directional: **every server template must exist in the client mirror.** The server emits routes; the client validates them before navigating, and `DonnyMessage` drops any route the client rejects — so a route present server-side but missing client-side is a pill that silently disappears. The reverse (client extras) is fine, but only for the two documented legacy paths; a third extra means someone added a client route and forgot the server, which the test should catch.

**Files:**
- Modify: `src/lib/donnyRoutes.ts:13` — add `export` to `const ROUTE_TEMPLATES`
- Modify: `supabase/functions/donny-orchestrator/routes.ts:115` — add `export` to `const ROUTE_TEMPLATES`
- Create: `src/lib/donnyRoutes.parity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ROUTE_TEMPLATES: string[]` exported from **both** modules. Later tasks add entries to both and rely on this test to catch a one-sided edit.

- [ ] **Step 1: Write the failing test**

Create `src/lib/donnyRoutes.parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ROUTE_TEMPLATES as CLIENT_ROUTES } from './donnyRoutes';
import { ROUTE_TEMPLATES as SERVER_ROUTES } from '../../supabase/functions/donny-orchestrator/routes.ts';

// The client mirror may legitimately hold routes the server list does not: the
// server list is what Donny may *generate*, and it must only ever emit the
// current path. These two legacy Crews URLs are served by App.tsx as redirects,
// so a route persisted in an old message is still valid to navigate to — but
// Donny should never emit them fresh. Any OTHER client-only route is a bug:
// somebody added a route to one mirror and forgot the other.
const ALLOWED_CLIENT_ONLY = [
  '/dashboard/business/groups',
  '/dashboard/business/groups/:id',
];

describe('route allow-list mirrors', () => {
  it('every server route exists in the client mirror', () => {
    // A server route missing from the client is invisible, not broken: the
    // client guard rejects it and DonnyMessage drops the pill entirely.
    const missing = SERVER_ROUTES.filter((r) => !CLIENT_ROUTES.includes(r));
    expect(missing, `server routes absent from src/lib/donnyRoutes.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('the only client-only routes are the documented legacy redirects', () => {
    const extra = CLIENT_ROUTES.filter(
      (r) => !SERVER_ROUTES.includes(r) && !ALLOWED_CLIENT_ONLY.includes(r)
    );
    expect(extra, `client routes absent from the server allow-list: ${extra.join(', ')}`).toEqual([]);
  });

  it('neither mirror contains duplicates', () => {
    expect(new Set(CLIENT_ROUTES).size).toBe(CLIENT_ROUTES.length);
    expect(new Set(SERVER_ROUTES).size).toBe(SERVER_ROUTES.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/donnyRoutes.parity.test.ts
```

Expected: FAIL — `ROUTE_TEMPLATES` is not exported from either module (`No matching export`).

- [ ] **Step 3: Export both arrays**

In `src/lib/donnyRoutes.ts`, line 13, change:

```ts
const ROUTE_TEMPLATES: string[] = [
```

to:

```ts
/** Exported so `donnyRoutes.parity.test.ts` can diff this against the server mirror. */
export const ROUTE_TEMPLATES: string[] = [
```

In `supabase/functions/donny-orchestrator/routes.ts`, line 115, change:

```ts
const ROUTE_TEMPLATES: string[] = [
```

to:

```ts
/** Exported so `src/lib/donnyRoutes.parity.test.ts` can diff this against the client mirror. */
export const ROUTE_TEMPLATES: string[] = [
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/donnyRoutes.parity.test.ts
```

Expected: PASS, 3 passed 0 failed.

If the first assertion fails now, the two mirrors have **pre-existing** drift. Do not "fix" it by editing the test — report the diff and stop; adding a genuinely missing route to the client mirror is a separate, reviewable change.

- [ ] **Step 5: Confirm the existing route suite still passes**

```bash
npx vitest run supabase/functions/donny-orchestrator/routes.test.ts
```

Expected: PASS, 12 passed 0 failed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/donnyRoutes.ts src/lib/donnyRoutes.parity.test.ts supabase/functions/donny-orchestrator/routes.ts
git commit -m "test(routes): assert the client and server route mirrors agree

Nothing asserted this before. The server list is what Donny may generate and
the client list is what the client will navigate to, so a route present in one
and absent from the other is a pill that silently disappears.

Directional, not an identity check: the client deliberately carries two legacy
Crews redirects the server must never emit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

---

### Task 2: Extract `BusinessOverview`, add the flag, make `BusinessDashboard` a switch

Move today's body verbatim to its own page and route, add the default-off flag, and reduce `BusinessDashboard` to a switch. **With the flag off this must be a no-op for users** — same rendering, same hooks, same tour.

**Files:**
- Create: `src/pages/BusinessOverview.tsx` (today's `BusinessDashboard` body, verbatim minus the first-run branch)
- Modify: `src/pages/BusinessDashboard.tsx` (whole file replaced by the switch)
- Modify: `src/lib/featureConfig.ts` (append the flag)
- Modify: `src/App.tsx` (lazy import + one route)
- Modify: `src/lib/donnyRoutes.ts` (add `/dashboard/business/overview` to `ROUTE_TEMPLATES`)
- Modify: `supabase/functions/donny-orchestrator/routes.ts` (same route, same place)

**Interfaces:**
- Consumes: `ROUTE_TEMPLATES` exported by Task 1.
- Produces: `DONNY_FIRST_DASHBOARD_ENABLED: boolean` from `@/lib/featureConfig`; `BusinessOverview` as the **default** export of `src/pages/BusinessOverview.tsx`; the route string `/dashboard/business/overview` valid in both mirrors. Task 6 fills in the flag-on branch of the switch.

- [ ] **Step 1: Add the feature flag**

Append to `src/lib/featureConfig.ts`:

```ts
// Donny-first business dashboard (Phase A). The /dashboard/business body becomes
// a greeting + what needs your attention + a prompt box + three taps; today's
// body moves verbatim to /dashboard/business/overview and stays reachable.
//
// OFF until the surface is prod-verified on both viewports. Flipping this to
// true changes ONLY the business dashboard body — the sidebar, mobile bottom
// nav, header and first-run flow are untouched, and /overview keeps working
// either way.
//
// Phase A taps open the EXISTING Donny panel (openDonnyWithContext). Inline
// chat is Phase B — see the design doc §13 for the hazards it must resolve.
export const DONNY_FIRST_DASHBOARD_ENABLED = false;
```

- [ ] **Step 2: Create `BusinessOverview` from today's body**

Create `src/pages/BusinessOverview.tsx`. Copy `src/pages/BusinessDashboard.tsx` **verbatim** and make exactly four changes:

1. Rename the component `BusinessDashboard` → `BusinessOverview`, and the default export accordingly.
2. Delete the `isFirstRun && missions` early-return block (lines 52–61) and the now-unused `useFirstRunMissions` / `FirstRunDashboard` imports. First-run is decided by the switch, before this page renders.
3. Update the header comment on line 1 to `// src/pages/BusinessOverview.tsx`.
4. Nothing else. Same hooks, same JSX, same `data-tour="brief-generator"` anchor, same `DCTour`.

The resulting file starts:

```tsx
// src/pages/BusinessOverview.tsx
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageBody } from '@/components/app/PageBody';
// … every other import from BusinessDashboard.tsx except
// useFirstRunMissions and FirstRunDashboard …

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BusinessOverview = () => {
  const { profile, activeOrgUnit } = useAuth();
  // … unchanged body, minus the first-run early return …
};

export default BusinessOverview;
```

- [ ] **Step 3: Replace `BusinessDashboard` with the switch**

Overwrite `src/pages/BusinessDashboard.tsx` entirely:

```tsx
// src/pages/BusinessDashboard.tsx
//
// A three-way switch, nothing else. The body that used to live here moved
// verbatim to BusinessOverview and is still reachable at
// /dashboard/business/overview.
//
// Order matters: first-run is checked FIRST, so a brand-new owner always gets
// the mission list regardless of the flag.
import { DONNY_FIRST_DASHBOARD_ENABLED } from '@/lib/featureConfig';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
import { DonnyHome } from '@/components/donny/DonnyHome';
import BusinessOverview from './BusinessOverview';

const BusinessDashboard = () => {
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

  if (isFirstRun && missions) {
    return (
      <FirstRunDashboard
        role="business_client"
        missions={missions}
        onCompleteMission={completeMission}
        onSkip={skipMissions}
      />
    );
  }

  if (!DONNY_FIRST_DASHBOARD_ENABLED) {
    return <BusinessOverview />;
  }

  return <DonnyHome />;
};

export default BusinessDashboard;
```

`DonnyHome` does not exist yet — that is expected. Step 4 creates a placeholder so the build passes; Task 6 replaces it.

- [ ] **Step 4: Create a placeholder `DonnyHome` so the build compiles**

Create `src/components/donny/DonnyHome.tsx`:

```tsx
// Placeholder — replaced in full by Task 6. Unreachable while
// DONNY_FIRST_DASHBOARD_ENABLED is false.
export function DonnyHome() {
  return null;
}
```

- [ ] **Step 5: Register the route in `src/App.tsx`**

Beside the other business lazy imports (near line 43), add:

```tsx
const BusinessOverview = lazy(() => import("./pages/BusinessOverview"));
```

Immediately after the `/dashboard/business/settings` route (line 237), add:

```tsx
          {/* Today's dashboard body, kept reachable when the Donny-first body is on. */}
          <Route path="/dashboard/business/overview" element={<ProtectedRoute><BusinessRoute><BusinessOverview /></BusinessRoute></ProtectedRoute>} />
```

- [ ] **Step 6: Add the route to both allow-list mirrors**

In `src/lib/donnyRoutes.ts`, in the `// business (restaurant)` block, directly after `"/dashboard/business/settings",`:

```ts
  "/dashboard/business/overview",
```

In `supabase/functions/donny-orchestrator/routes.ts`, in its `// business (restaurant)` block, in the same position:

```ts
  "/dashboard/business/overview",
```

- [ ] **Step 7: Run the parity + route tests**

```bash
npx vitest run src/lib/donnyRoutes.parity.test.ts supabase/functions/donny-orchestrator/routes.test.ts
```

Expected: PASS, 15 passed 0 failed. If parity fails, you edited only one mirror in Step 6 — that is exactly what Task 1 exists to catch.

- [ ] **Step 8: Typecheck and build**

```bash
npm run typecheck
npm run build
```

Expected: both clean. `noUnusedLocals` is on — if the build complains about an unused import in `BusinessOverview.tsx`, you missed one of the two imports Step 2 removes.

- [ ] **Step 9: Verify the flag-off path by hand**

```bash
npm run dev
```

Open `http://127.0.0.1:8080/dashboard/business` as a restaurant account. Expected: **visually identical to before** — greeting, hero CTA, Needs-your-attention frame, stats, activity, upcoming posts, and the `?` tour button. Then open `/dashboard/business/overview` — the same page renders there too. Check the browser console for errors.

- [ ] **Step 10: Commit**

```bash
git add src/pages/BusinessOverview.tsx src/pages/BusinessDashboard.tsx src/lib/featureConfig.ts src/App.tsx src/lib/donnyRoutes.ts src/components/donny/DonnyHome.tsx supabase/functions/donny-orchestrator/routes.ts
git commit -m "feat(dashboard): extract BusinessOverview, add DONNY_FIRST_DASHBOARD_ENABLED

Today's business dashboard body moves verbatim to its own page and route so it
is preserved rather than replaced. BusinessDashboard becomes a three-way switch
with first-run checked first. Flag defaults off: this commit is a no-op for
users.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

---

### Task 3: `buildDonnyProposals` — the pure merge, rank and cap

The one piece of real logic in Phase A. Pure: it takes already-fetched data plus an injected `now`, and returns what to render. No hooks, no network, no `Date.now()` — so its tests need no mocks and never flake.

**Two decisions this task pins down, because the spec left them open and two implementers would have built two different things:**

1. **Which campaigns can raise a deadline signal.** Only `status === 'published'` or `'active'`. A `draft` has nobody working on it and a `completed` one is done; neither is a "needs you" item. (`useBusinessActiveCampaigns` already filters out `cancelled`.) The spec correctly dropped the "not yet delivered" qualifier — `content_status` is not fetched by this hook — and this is the honest substitute using a field that *is* fetched.
2. **Relative time is formatted by the component, not here.** `formatRelativeTime` (`src/lib/campaignUtils.ts:53`) calls `Date.now()` internally, which would make this function's output non-deterministic. `DonnyProposal.text` therefore carries no timestamp; `occurredAt` rides alongside and the presentational component appends the formatted time.

**Files:**
- Create: `src/lib/donny/buildDonnyProposals.ts`
- Create: `src/lib/donny/buildDonnyProposals.test.ts`

**Interfaces:**
- Consumes: `PendingAction` from `@/hooks/usePendingActions`; `ActiveCampaignItem` from `@/hooks/useBusinessActiveCampaigns`; `isKnownDonnyRoute` from `@/lib/donnyRoutes`.
- Produces, and Tasks 4 and 6 depend on these exact names:
  - `DEADLINE_SOON_DAYS: number` (= 3)
  - `PROPOSAL_CAP: number` (= 3)
  - `type ProposalCta = { kind: 'route'; label: string; route: string } | { kind: 'ask'; label: string; message: string }`
  - `interface DonnyProposal { id; kind; text; occurredAt; cta; priority; dismissible }`
  - `interface DonnyProposalsInput { pendingActions; pendingActionsError; campaigns; readiness; dismissedIds; now }`
  - `interface DonnyProposalsResult { blocker: DonnyProposal | null; proposals: DonnyProposal[]; overflowCount: number; allProposalIds: string[] }`
    — `allProposalIds` is every ranked proposal id **before** the dismissal filter and **before** the cap, blocker excluded. Task 6 needs it to know which localStorage dismissal keys to read. Reading only the capped ids misses a dismissal on a proposal ranked below the cap, and dismissing one row then resurrects it. (Added after Task 6's review found exactly that.)
  - `buildDonnyProposals(input: DonnyProposalsInput): DonnyProposalsResult`
  - `dismissalKey(proposalId: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/donny/buildDonnyProposals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildDonnyProposals,
  DEADLINE_SOON_DAYS,
  PROPOSAL_CAP,
  type DonnyProposalsInput,
} from './buildDonnyProposals';
import type { PendingAction } from '@/hooks/usePendingActions';
import type { ActiveCampaignItem } from '@/hooks/useBusinessActiveCampaigns';

const NOW = new Date('2026-08-08T12:00:00.000Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysFromNow = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

function action(over: Partial<PendingAction> = {}): PendingAction {
  return {
    campaignId: 'c1',
    campaignTitle: 'Taco Tuesday',
    actionType: 'review_application',
    creatorName: 'Ricky Ricardo',
    occurredAt: hoursAgo(2),
    ...over,
  };
}

function campaign(over: Partial<ActiveCampaignItem> = {}): ActiveCampaignItem {
  return {
    id: 'c1',
    title: 'Taco Tuesday',
    status: 'active',
    displayStatus: 'Active',
    deadline: null,
    creatorName: null,
    ...over,
  };
}

const readyLocation = {
  hasActiveLocation: true,
  isReady: true,
  locationName: 'Hoboken',
  missingSocial: false,
  missingStripe: false,
};

function input(over: Partial<DonnyProposalsInput> = {}): DonnyProposalsInput {
  return {
    pendingActions: [],
    pendingActionsError: false,
    campaigns: [],
    readiness: readyLocation,
    dismissedIds: [],
    now: NOW,
    ...over,
  };
}

describe('buildDonnyProposals — pending actions', () => {
  it('turns a pending application into a proposal in Donny\'s voice', () => {
    const { proposals } = buildDonnyProposals(input({ pendingActions: [action()] }));
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('pending_action');
    expect(proposals[0].text).toBe('Ricky Ricardo applied to "Taco Tuesday"');
    expect(proposals[0].occurredAt).toBe(hoursAgo(2));
    expect(proposals[0].dismissible).toBe(true);
    expect(proposals[0].cta).toEqual({
      kind: 'route',
      label: 'Review application',
      route: '/dashboard/business/campaigns/c1',
    });
  });

  it('turns submitted content into its own proposal', () => {
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: [action({ actionType: 'review_content' })] })
    );
    expect(proposals[0].text).toBe('Ricky Ricardo submitted content for "Taco Tuesday"');
    expect(proposals[0].cta).toEqual({
      kind: 'route',
      label: 'Review content',
      route: '/dashboard/business/campaigns/c1',
    });
  });

  it('gives the two action types on ONE campaign distinct ids', () => {
    // The old pendingBannerDismissed_${campaignId} key was campaign-scoped, so
    // dismissing "applied" also silenced "submitted content" for the same
    // campaign — Donny went quiet about delivered work. Not inherited.
    const { proposals } = buildDonnyProposals(
      input({
        pendingActions: [
          action({ actionType: 'review_application' }),
          action({ actionType: 'review_content' }),
        ],
      })
    );
    expect(proposals[0].id).not.toBe(proposals[1].id);
    expect(new Set(proposals.map((p) => p.id)).size).toBe(2);
  });

  it('orders pending actions newest first', () => {
    const { proposals } = buildDonnyProposals(
      input({
        pendingActions: [
          action({ campaignId: 'old', occurredAt: hoursAgo(48) }),
          action({ campaignId: 'new', occurredAt: hoursAgo(1) }),
          action({ campaignId: 'mid', occurredAt: hoursAgo(5) }),
        ],
      })
    );
    expect(proposals.map((p) => p.occurredAt)).toEqual([
      hoursAgo(1),
      hoursAgo(5),
      hoursAgo(48),
    ]);
  });

  it('renders nothing from pending actions when the query errored', () => {
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: undefined, pendingActionsError: true })
    );
    expect(proposals).toEqual([]);
  });

  it('falls back to a generic name rather than printing "undefined"', () => {
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: [action({ creatorName: '' })] })
    );
    expect(proposals[0].text).toBe('A creator applied to "Taco Tuesday"');
  });
});

describe('buildDonnyProposals — cap, overflow and dismissal', () => {
  const five = [1, 2, 3, 4, 5].map((n) =>
    action({ campaignId: `c${n}`, occurredAt: hoursAgo(n) })
  );

  it('caps at PROPOSAL_CAP and reports the overflow', () => {
    const { proposals, overflowCount } = buildDonnyProposals(input({ pendingActions: five }));
    expect(PROPOSAL_CAP).toBe(3);
    expect(proposals).toHaveLength(3);
    expect(overflowCount).toBe(2);
    expect(proposals.map((p) => p.id)).toEqual([
      'pending_action:review_application:c1',
      'pending_action:review_application:c2',
      'pending_action:review_application:c3',
    ]);
  });

  it('promotes the next proposal when one is dismissed', () => {
    const { proposals, overflowCount } = buildDonnyProposals(
      input({ pendingActions: five, dismissedIds: ['pending_action:review_application:c1'] })
    );
    expect(proposals.map((p) => p.id)).toEqual([
      'pending_action:review_application:c2',
      'pending_action:review_application:c3',
      'pending_action:review_application:c4',
    ]);
    expect(overflowCount).toBe(1);
  });

  it('reports no overflow when nothing is hidden', () => {
    const { overflowCount } = buildDonnyProposals(input({ pendingActions: [action()] }));
    expect(overflowCount).toBe(0);
  });
});

describe('buildDonnyProposals — the deadline signal', () => {
  it('fires inside the window', () => {
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: daysFromNow(2) })] })
    );
    expect(DEADLINE_SOON_DAYS).toBe(3);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('signal');
    expect(proposals[0].id).toBe('signal:deadline:c1');
    expect(proposals[0].text).toBe('"Taco Tuesday" is due in 2 days');
    expect(proposals[0].dismissible).toBe(false);
  });

  it('says "today" and "tomorrow" rather than "in 0 days"', () => {
    const today = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: new Date(NOW + 3_600_000).toISOString() })] })
    );
    expect(today.proposals[0].text).toBe('"Taco Tuesday" is due today');

    const tomorrow = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: daysFromNow(1) })] })
    );
    expect(tomorrow.proposals[0].text).toBe('"Taco Tuesday" is due tomorrow');
  });

  it('does not fire outside the window, on a past deadline, or with no deadline', () => {
    for (const deadline of [daysFromNow(4), daysFromNow(-1), null]) {
      const { proposals } = buildDonnyProposals(input({ campaigns: [campaign({ deadline })] }));
      expect(proposals, String(deadline)).toEqual([]);
    }
  });

  it('only fires for published or active campaigns', () => {
    for (const status of ['published', 'active'] as const) {
      const { proposals } = buildDonnyProposals(
        input({ campaigns: [campaign({ status, deadline: daysFromNow(1) })] })
      );
      expect(proposals, status).toHaveLength(1);
    }
    for (const status of ['draft', 'completed', 'cancelled'] as const) {
      const { proposals } = buildDonnyProposals(
        input({ campaigns: [campaign({ status, deadline: daysFromNow(1) })] })
      );
      expect(proposals, status).toEqual([]);
    }
  });

  it('renders nothing from campaigns when the query errored', () => {
    const { proposals } = buildDonnyProposals(input({ campaigns: undefined }));
    expect(proposals).toEqual([]);
  });
});

describe('buildDonnyProposals — the location-setup blocker', () => {
  const unready = {
    hasActiveLocation: true,
    isReady: false,
    locationName: 'Hoboken',
    missingSocial: true,
    missingStripe: false,
  };

  it('is returned separately from the capped list, so it can never be crowded out', () => {
    // It blocks campaign creation, promotions AND DragonShare. Ranked below
    // three pending applications it would vanish, which is a regression.
    const { blocker, proposals } = buildDonnyProposals(
      input({
        readiness: unready,
        pendingActions: [1, 2, 3, 4].map((n) => action({ campaignId: `c${n}` })),
      })
    );
    expect(blocker).not.toBeNull();
    expect(blocker!.id).toBe('signal:location_setup');
    expect(blocker!.dismissible).toBe(false);
    expect(proposals).toHaveLength(3);
    expect(proposals.every((p) => p.id !== 'signal:location_setup')).toBe(true);
  });

  it('names what is actually missing', () => {
    expect(buildDonnyProposals(input({ readiness: unready })).blocker!.text).toBe(
      'Hoboken needs at least one social media account before you can create campaigns, promotions, or use DragonShare'
    );
    expect(
      buildDonnyProposals(
        input({ readiness: { ...unready, missingSocial: false, missingStripe: true } })
      ).blocker!.text
    ).toBe(
      'Hoboken needs a connected Stripe account before you can create campaigns, promotions, or use DragonShare'
    );
    expect(
      buildDonnyProposals(input({ readiness: { ...unready, missingStripe: true } })).blocker!.text
    ).toBe(
      'Hoboken needs a connected Stripe account and at least one social media account before you can create campaigns, promotions, or use DragonShare'
    );
  });

  it('falls back to "This location" when the name is missing', () => {
    const { blocker } = buildDonnyProposals(
      input({ readiness: { ...unready, locationName: null } })
    );
    expect(blocker!.text).toMatch(/^This location needs/);
  });

  it('is absent when the location is ready or there is no active location', () => {
    expect(buildDonnyProposals(input()).blocker).toBeNull();
    expect(
      buildDonnyProposals(input({ readiness: { ...unready, hasActiveLocation: false } })).blocker
    ).toBeNull();
  });

  it('is not affected by the overflow count', () => {
    const { overflowCount } = buildDonnyProposals(
      input({ readiness: unready, pendingActions: [action()] })
    );
    expect(overflowCount).toBe(0);
  });
});

describe('buildDonnyProposals — CTA route validation', () => {
  it('every route CTA it emits is a real in-app route', async () => {
    const { isKnownDonnyRoute } = await import('@/lib/donnyRoutes');
    const { blocker, proposals } = buildDonnyProposals(
      input({
        pendingActions: [action(), action({ campaignId: 'c2', actionType: 'review_content' })],
        campaigns: [campaign({ deadline: daysFromNow(1) })],
        readiness: {
          hasActiveLocation: true,
          isReady: false,
          locationName: 'Hoboken',
          missingSocial: true,
          missingStripe: true,
        },
      })
    );
    for (const p of [blocker!, ...proposals]) {
      if (p.cta?.kind === 'route') {
        expect(isKnownDonnyRoute(p.cta.route), `${p.id} → ${p.cta.route}`).toBe(true);
      }
    }
  });

  it('drops the button rather than shipping a dead link', () => {
    // PR #409: twelve /settings/* CTAs shipped as 404s because nothing
    // validated a hardcoded route. A proposal whose route does not resolve
    // renders as text with no button.
    //
    // NOTE the id used here. An EMPTY campaignId does not work as a fixture:
    // it yields "/dashboard/business/campaigns/", and isKnownDonnyRoute strips
    // the trailing slash, so it normalizes to the real campaigns-list route and
    // validates TRUE. An id containing a slash is the case that actually fails.
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: [action({ campaignId: 'a/b' })] })
    );
    expect(proposals[0].cta).toBeNull();
    expect(proposals[0].text).toContain('Ricky Ricardo applied');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/donny/buildDonnyProposals.test.ts
```

Expected: FAIL — `Failed to load .../buildDonnyProposals`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/donny/buildDonnyProposals.ts`:

```ts
// Pure merge/rank/cap for the Donny-first dashboard body.
//
// Pure on purpose: it takes already-fetched query results plus an injected
// `now` and returns exactly what to render. No hooks, no network, no
// Date.now() — so the tests need no mocks and never flake on a clock.
//
// Relative time is NOT formatted here: formatRelativeTime() reads Date.now()
// internally, which would make this output non-deterministic. `occurredAt`
// rides alongside the text and the presentational component formats it.
import { isKnownDonnyRoute } from '@/lib/donnyRoutes';
import type { PendingAction } from '@/hooks/usePendingActions';
import type { ActiveCampaignItem } from '@/hooks/useBusinessActiveCampaigns';

/** How close a deadline has to be to be worth mentioning. A first guess — revisit against the §11 metrics rather than defending it. */
export const DEADLINE_SOON_DAYS = 3;

/** Never show more than this many proposals at once. Matches the banner cap it replaces. */
export const PROPOSAL_CAP = 3;

const MS_PER_DAY = 86_400_000;

export type ProposalCta =
  | { kind: 'route'; label: string; route: string }
  | { kind: 'ask'; label: string; message: string };

export interface DonnyProposal {
  /** `${kind}:${actionType}:${campaignId}` for actions, `signal:${key}` for signals. Stable across renders — it is the dismissal key. */
  id: string;
  kind: 'pending_action' | 'signal';
  /** Donny's voice, plain language, no timestamp. */
  text: string;
  /** ISO string when this happened, or null for signals. The component formats it. */
  occurredAt: string | null;
  /** null when the CTA's route failed validation: render the text, drop the button. */
  cta: ProposalCta | null;
  priority: number;
  dismissible: boolean;
}

export interface LocationReadinessInput {
  hasActiveLocation: boolean;
  isReady: boolean;
  locationName: string | null;
  missingSocial: boolean;
  missingStripe: boolean;
}

export interface DonnyProposalsInput {
  /** `undefined` means loading or errored — either way, nothing to show. */
  pendingActions: PendingAction[] | undefined;
  pendingActionsError: boolean;
  campaigns: ActiveCampaignItem[] | undefined;
  readiness: LocationReadinessInput;
  /** Proposal ids the user has already dismissed (localStorage + this session). */
  dismissedIds: string[];
  /** Injected so the deadline window is deterministic in tests. */
  now: number;
}

export interface DonnyProposalsResult {
  /** Cap-exempt, rendered above the list. Blocks campaign creation, promotions and DragonShare. */
  blocker: DonnyProposal | null;
  /** At most PROPOSAL_CAP, ranked. */
  proposals: DonnyProposal[];
  /** How many ranked proposals the cap hid. Never counts the blocker. */
  overflowCount: number;
}

/** localStorage key for a dismissed proposal. Deliberately NOT the old campaign-scoped `pendingBannerDismissed_` key. */
export function dismissalKey(proposalId: string): string {
  return `donnyProposalDismissed_${proposalId}`;
}

/** Route CTA, downgraded to null if the path is not real. */
function routeCta(label: string, route: string): ProposalCta | null {
  return isKnownDonnyRoute(route) ? { kind: 'route', label, route } : null;
}

function duePhrase(deadline: string, now: number): string | null {
  const days = Math.floor((new Date(deadline).getTime() - now) / MS_PER_DAY);
  if (days < 0 || days > DEADLINE_SOON_DAYS) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function pendingProposal(action: PendingAction): DonnyProposal {
  const who = action.creatorName?.trim() || 'A creator';
  const isApplication = action.actionType === 'review_application';
  const route = `/dashboard/business/campaigns/${action.campaignId}`;
  return {
    id: `pending_action:${action.actionType}:${action.campaignId}`,
    kind: 'pending_action',
    text: isApplication
      ? `${who} applied to "${action.campaignTitle}"`
      : `${who} submitted content for "${action.campaignTitle}"`,
    occurredAt: action.occurredAt,
    cta: routeCta(isApplication ? 'Review application' : 'Review content', route),
    priority: 0,
    dismissible: true,
  };
}

function deadlineProposals(
  campaigns: ActiveCampaignItem[],
  now: number
): DonnyProposal[] {
  // draft has nobody working on it; completed is done. Neither is a "needs you"
  // item. `cancelled` is already filtered out by useBusinessActiveCampaigns.
  const live = campaigns.filter((c) => c.status === 'published' || c.status === 'active');
  const out: DonnyProposal[] = [];
  for (const c of live) {
    if (!c.deadline) continue;
    const phrase = duePhrase(c.deadline, now);
    if (!phrase) continue;
    out.push({
      id: `signal:deadline:${c.id}`,
      kind: 'signal',
      text: `"${c.title}" is due ${phrase}`,
      occurredAt: null,
      cta: routeCta('Open campaign', `/dashboard/business/campaigns/${c.id}`),
      priority: 10,
      dismissible: false,
    });
  }
  return out;
}

function locationBlocker(readiness: LocationReadinessInput): DonnyProposal | null {
  if (!readiness.hasActiveLocation || readiness.isReady) return null;
  const parts: string[] = [];
  if (readiness.missingStripe) parts.push('a connected Stripe account');
  if (readiness.missingSocial) parts.push('at least one social media account');
  const needs = parts.join(' and ');
  const where = readiness.locationName?.trim() || 'This location';
  return {
    id: 'signal:location_setup',
    kind: 'signal',
    text: `${where} needs ${needs} before you can create campaigns, promotions, or use DragonShare`,
    occurredAt: null,
    cta: routeCta('Finish setup', '/dashboard/business/settings'),
    priority: -1,
    dismissible: false,
  };
}

export function buildDonnyProposals(input: DonnyProposalsInput): DonnyProposalsResult {
  const dismissed = new Set(input.dismissedIds);

  const pending = input.pendingActionsError ? [] : (input.pendingActions ?? []);
  const pendingProposals = pending
    .map(pendingProposal)
    // newest first
    .sort((a, b) => Date.parse(b.occurredAt ?? '') - Date.parse(a.occurredAt ?? ''));

  const signals = deadlineProposals(input.campaigns ?? [], input.now).sort(
    (a, b) => a.priority - b.priority
  );

  const ranked = [...pendingProposals, ...signals].filter((p) => !dismissed.has(p.id));

  return {
    blocker: locationBlocker(input.readiness),
    proposals: ranked.slice(0, PROPOSAL_CAP),
    overflowCount: Math.max(0, ranked.length - PROPOSAL_CAP),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/donny/buildDonnyProposals.test.ts
```

Expected: PASS, 0 failed. Every describe block green.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/donny/buildDonnyProposals.ts src/lib/donny/buildDonnyProposals.test.ts
git commit -m "feat(donny): pure buildDonnyProposals — merge, rank, cap, dismiss

Takes already-fetched query results plus an injected now, returns what to
render. The location-setup blocker is returned SEPARATELY from the capped list
so three pending applications can never crowd out the thing blocking campaign
creation. Route CTAs are validated through isKnownDonnyRoute and downgraded to
text rather than shipping a dead link.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

---

### Task 4: `DonnyHomeProposals` — the presentational list

Renders the blocker, the capped proposals, the overflow line and the dismiss control. Pure presentation: every input is a prop, every action is a callback. No hooks except `useNavigate`.

**Files:**
- Create: `src/components/donny/DonnyHomeProposals.tsx`
- Create: `src/components/donny/DonnyHomeProposals.test.tsx`

**Interfaces:**
- Consumes: `DonnyProposal`, `DonnyProposalsResult` from `@/lib/donny/buildDonnyProposals`; `formatRelativeTime` from `@/lib/campaignUtils`; `NeedsAttentionSection` from `@/components/dashboard/NeedsAttentionSection`.
- Produces, used by Task 6:
  ```ts
  interface DonnyHomeProposalsProps {
    result: DonnyProposalsResult;
    isLoading: boolean;
    onDismiss: (proposalId: string) => void;
    onTap: (proposal: DonnyProposal) => void;
    /** Extra "needs you" rows appended as trailing slots INSIDE the same frame. */
    children?: React.ReactNode;
  }
  export function DonnyHomeProposals(props: DonnyHomeProposalsProps): JSX.Element | null;
  ```
  `onTap` fires for **every** CTA activation — the container decides whether that means navigate or ask, and records the analytics event.

  `children` exists because `NeedsAttentionSection`'s whole purpose is to consolidate every "needs you" banner into **one** framed list, and Task 6 has two more to contribute (the rating prompts). Without it they render as orphaned rows beside the frame.

- [ ] **Step 1: Write the failing test**

Create `src/components/donny/DonnyHomeProposals.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import type { DonnyProposal, DonnyProposalsResult } from '@/lib/donny/buildDonnyProposals';

function proposal(over: Partial<DonnyProposal> = {}): DonnyProposal {
  return {
    id: 'pending_action:review_application:c1',
    kind: 'pending_action',
    text: 'Ricky Ricardo applied to "Taco Tuesday"',
    occurredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    cta: { kind: 'route', label: 'Review application', route: '/dashboard/business/campaigns/c1' },
    priority: 0,
    dismissible: true,
    ...over,
  };
}

function result(over: Partial<DonnyProposalsResult> = {}): DonnyProposalsResult {
  return { blocker: null, proposals: [], overflowCount: 0, ...over };
}

const noop = () => {};

describe('DonnyHomeProposals', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(
      <DonnyHomeProposals result={result()} isLoading={false} onDismiss={noop} onTap={noop} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows skeletons while loading, not a spinner', () => {
    render(
      <DonnyHomeProposals result={result()} isLoading onDismiss={noop} onTap={noop} />
    );
    expect(screen.getByTestId('donny-home-proposals-loading')).toBeInTheDocument();
  });

  it('renders a proposal with its relative time appended', () => {
    render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()] })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText(/Ricky Ricardo applied to "Taco Tuesday"/)).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review application' })).toBeInTheDocument();
  });

  it('calls onTap with the proposal when the CTA is pressed', () => {
    const onTap = vi.fn();
    const p = proposal();
    render(
      <DonnyHomeProposals
        result={result({ proposals: [p] })}
        isLoading={false}
        onDismiss={noop}
        onTap={onTap}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review application' }));
    expect(onTap).toHaveBeenCalledWith(p);
  });

  it('renders text with no button when the CTA failed route validation', () => {
    render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal({ cta: null })] })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText(/Ricky Ricardo applied/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review/ })).not.toBeInTheDocument();
  });

  it('offers dismiss only on dismissible proposals', () => {
    render(
      <DonnyHomeProposals
        result={result({
          proposals: [proposal(), proposal({ id: 'signal:deadline:c1', kind: 'signal', dismissible: false, occurredAt: null })],
        })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1);
  });

  it('calls onDismiss with the proposal id', () => {
    const onDismiss = vi.fn();
    render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()] })}
        isLoading={false}
        onDismiss={onDismiss}
        onTap={noop}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('pending_action:review_application:c1');
  });

  it('renders the overflow line, pluralized', () => {
    const { rerender } = render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()], overflowCount: 2 })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText('+ 2 more need your attention')).toBeInTheDocument();

    rerender(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()], overflowCount: 1 })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText('+ 1 more needs your attention')).toBeInTheDocument();
  });

  it('renders the blocker above the list even when the list is full', () => {
    const blocker = proposal({
      id: 'signal:location_setup',
      kind: 'signal',
      text: 'Hoboken needs a connected Stripe account before you can create campaigns, promotions, or use DragonShare',
      occurredAt: null,
      cta: { kind: 'route', label: 'Finish setup', route: '/dashboard/business/settings' },
      dismissible: false,
    });
    render(
      <DonnyHomeProposals
        result={result({ blocker, proposals: [proposal(), proposal({ id: 'x' }), proposal({ id: 'y' })] })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    const texts = screen.getAllByTestId('donny-proposal').map((el) => el.textContent ?? '');
    expect(texts[0]).toContain('Hoboken needs a connected Stripe account');
    expect(texts).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/donny/DonnyHomeProposals.test.tsx
```

Expected: FAIL — cannot resolve `./DonnyHomeProposals`.

- [ ] **Step 3: Write the implementation**

Create `src/components/donny/DonnyHomeProposals.tsx`:

```tsx
// Presentational half of the Donny-first dashboard body: what needs the owner's
// attention right now. Every input is a prop and every action is a callback —
// the container owns the data, the navigation and the analytics.
import { AlertTriangle, Clock, Eye, X } from 'lucide-react';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { NeedsAttentionSection } from '@/components/dashboard/NeedsAttentionSection';
import { formatRelativeTime } from '@/lib/campaignUtils';
import type { DonnyProposal, DonnyProposalsResult } from '@/lib/donny/buildDonnyProposals';

interface DonnyHomeProposalsProps {
  result: DonnyProposalsResult;
  isLoading: boolean;
  onDismiss: (proposalId: string) => void;
  onTap: (proposal: DonnyProposal) => void;
}

function ProposalIcon({ proposal }: { proposal: DonnyProposal }) {
  if (proposal.id === 'signal:location_setup') {
    return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />;
  }
  if (proposal.id.startsWith('pending_action:review_content')) {
    return <Eye className="h-4 w-4 text-dc-pink-accent shrink-0 mt-0.5" aria-hidden="true" />;
  }
  return <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />;
}

function ProposalRow({
  proposal,
  onDismiss,
  onTap,
}: {
  proposal: DonnyProposal;
  onDismiss: (id: string) => void;
  onTap: (p: DonnyProposal) => void;
}) {
  return (
    <div
      data-testid="donny-proposal"
      className="flex items-start gap-3 px-4 py-2.5 border-l-2 border-l-amber-400"
    >
      <ProposalIcon proposal={proposal} />
      <p className="text-sm text-dc-text flex-1 min-w-0">
        {proposal.text}
        {proposal.occurredAt && (
          <span className="text-dc-text-muted"> {formatRelativeTime(proposal.occurredAt)}</span>
        )}
        {proposal.cta && (
          <>
            {' — '}
            <button
              onClick={() => onTap(proposal)}
              className="font-semibold text-dc-teal-btn hover:underline"
            >
              {proposal.cta.label}
            </button>
          </>
        )}
      </p>
      {proposal.dismissible && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(proposal.id);
          }}
          className="text-dc-text-muted hover:text-dc-text shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function DonnyHomeProposals({
  result,
  isLoading,
  onDismiss,
  onTap,
}: DonnyHomeProposalsProps) {
  if (isLoading) {
    return (
      <div data-testid="donny-home-proposals-loading" className="space-y-2">
        <DCSkeleton variant="list-row" count={2} />
      </div>
    );
  }

  const { blocker, proposals, overflowCount } = result;
  // NeedsAttentionSection hides itself when every slot is empty, but returning
  // null here keeps the DOM clean and makes the "nothing to say" case explicit.
  if (!blocker && proposals.length === 0) return null;

  return (
    <NeedsAttentionSection>
      {blocker && (
        <ProposalRow proposal={blocker} onDismiss={onDismiss} onTap={onTap} />
      )}
      {proposals.length > 0 && (
        <div className="divide-y divide-dc-teal/10">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} onDismiss={onDismiss} onTap={onTap} />
          ))}
          {overflowCount > 0 && (
            <p className="text-xs text-amber-600 font-medium px-4 py-2">
              + {overflowCount} more {overflowCount === 1 ? 'needs' : 'need'} your attention
            </p>
          )}
        </div>
      )}
    </NeedsAttentionSection>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/donny/DonnyHomeProposals.test.tsx
```

Expected: PASS, 0 failed.

If the blocker-ordering test fails on element count, check that `NeedsAttentionSection` wraps each child in its own `data-attention-slot` div — it uses `Children.map`, so the blocker and the list are two slots, and all four `data-testid="donny-proposal"` rows are still found in document order.

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/DonnyHomeProposals.tsx src/components/donny/DonnyHomeProposals.test.tsx
git commit -m "feat(donny): DonnyHomeProposals — the presentational attention list

Blocker above the capped list, overflow line kept, dismiss only where the
proposal allows it, and a CTA that failed route validation renders as text
rather than a dead button.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

---

### Task 5: `DonnyHomePrompt` — the prompt box and the three taps

The body's centre of gravity: a text input that hands whatever the owner types to Donny, and three curated taps constrained to the tools that verifiably work on prod.

**Why only three.** Phase 0 established that exactly four Donny tools work on prod: `prepare_campaign`, `find_creators`, `web_search`, `read_url`. Anything routing to `social_*` is 0/7, and the analytics claims were already walked back once. **A tap that produces a shrug is worse than no tap.**

**This component deliberately does not render `useDonnyQuickChips`.** That hook matches `/dashboard/business` exactly and returns a "📊 Campaign stats" chip — precisely the analytics claim excluded above. Rendering it would silently re-introduce what the spec rules out.

**Files:**
- Create: `src/lib/donny/donnyHomeSuggestions.ts`
- Create: `src/components/donny/DonnyHomePrompt.tsx`
- Create: `src/components/donny/DonnyHomePrompt.test.tsx`

**Interfaces:**
- Consumes: `AppChip` from `@/components/app/AppChip`; `Button` from `@/components/ui/button`.
- Produces, used by Task 6:
  ```ts
  // donnyHomeSuggestions.ts
  export interface DonnySuggestion { label: string; message: string; }
  export const BUSINESS_SUGGESTIONS: DonnySuggestion[];

  // DonnyHomePrompt.tsx
  interface DonnyHomePromptProps {
    suggestions: DonnySuggestion[];
    onSubmit: (text: string) => void;
    onSuggestionTap: (suggestion: DonnySuggestion) => void;
  }
  export function DonnyHomePrompt(props: DonnyHomePromptProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/donny/DonnyHomePrompt.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { BUSINESS_SUGGESTIONS } from '@/lib/donny/donnyHomeSuggestions';

const noop = () => {};

describe('BUSINESS_SUGGESTIONS', () => {
  it('ships exactly the three taps backed by working tools', () => {
    // prepare_campaign, find_creators, web_search. Anything routing to social_*
    // is 0/7 on prod and analytics claims were already walked back once.
    expect(BUSINESS_SUGGESTIONS).toHaveLength(3);
    expect(BUSINESS_SUGGESTIONS.map((s) => s.message)).toEqual([
      'Create a campaign for my restaurant',
      'Find creators near me',
      "What's trending for restaurants near me?",
    ]);
  });

  it('never offers a stats or analytics tap', () => {
    for (const s of BUSINESS_SUGGESTIONS) {
      expect(`${s.label} ${s.message}`.toLowerCase()).not.toMatch(/stats|analytics|roi/);
    }
  });
});

describe('DonnyHomePrompt', () => {
  it('carries the tour anchor the RESTAURANT_TOUR targets', () => {
    // Replacing the body removed HeroPrimaryAction, which owned this anchor.
    // Step 2 of RESTAURANT_TOUR targets [data-tour='brief-generator'] and would
    // silently break without it.
    const { container } = render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
    );
    expect(container.querySelector("[data-tour='brief-generator']")).toBeInTheDocument();
  });

  it('submits what the owner typed and clears the box', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: 'set up a taco promo' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('set up a taco promo');
    expect(input).toHaveValue('');
  });

  it('ignores an empty or whitespace-only submit', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.submit(input.closest('form')!);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trims before submitting', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('renders one tap per suggestion and reports which was tapped', () => {
    const onSuggestionTap = vi.fn();
    render(
      <DonnyHomePrompt
        suggestions={BUSINESS_SUGGESTIONS}
        onSubmit={noop}
        onSuggestionTap={onSuggestionTap}
      />
    );
    for (const s of BUSINESS_SUGGESTIONS) {
      expect(screen.getByRole('button', { name: s.label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: BUSINESS_SUGGESTIONS[1].label }));
    expect(onSuggestionTap).toHaveBeenCalledWith(BUSINESS_SUGGESTIONS[1]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/donny/DonnyHomePrompt.test.tsx
```

Expected: FAIL — neither module resolves.

- [ ] **Step 3: Write the suggestions**

Create `src/lib/donny/donnyHomeSuggestions.ts`:

```ts
// The curated taps on the Donny-first dashboard.
//
// Constrained to the tools Phase 0 verified WORK on prod (2026-08-08):
// prepare_campaign, find_creators, web_search, read_url. Deliberately excluded:
// anything routing to social_* (0/7 on prod, and it blames the user's
// connection when it fails) and any analytics claim (the honest-analytics work
// already had to walk those back). A tap that produces a shrug is worse than no
// tap — do not add one without re-running the capability audit.
//
// v1 is curated, not ranked. Real "frequently used" ranking off donny_messages
// is a follow-up.
export interface DonnySuggestion {
  /** What the chip says. Short, plain language, no jargon. */
  label: string;
  /** What actually gets sent to Donny. */
  message: string;
}

export const BUSINESS_SUGGESTIONS: DonnySuggestion[] = [
  { label: 'Create a campaign', message: 'Create a campaign for my restaurant' },
  { label: 'Find creators near me', message: 'Find creators near me' },
  { label: "What's trending?", message: "What's trending for restaurants near me?" },
];
```

- [ ] **Step 4: Write the prompt component**

Create `src/components/donny/DonnyHomePrompt.tsx`:

```tsx
// The prompt box and the curated taps. Presentational: the container decides
// what "submit" means and records the analytics.
import React from 'react';
import { ArrowUp } from 'lucide-react';
import { AppChip } from '@/components/app/AppChip';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';

interface DonnyHomePromptProps {
  suggestions: DonnySuggestion[];
  onSubmit: (text: string) => void;
  onSuggestionTap: (suggestion: DonnySuggestion) => void;
}

export function DonnyHomePrompt({
  suggestions,
  onSubmit,
  onSuggestionTap,
}: DonnyHomePromptProps) {
  const [text, setText] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    // RESTAURANT_TOUR step 2 targets this anchor. It used to live on
    // HeroPrimaryAction, which this body replaces.
    <div data-tour="brief-generator" className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Ask Donny"
          placeholder="Ask Donny anything…"
          className="w-full rounded-full border border-dc-teal/20 bg-white py-3.5 pl-5 pr-14 text-base text-dc-text placeholder:text-dc-text-muted focus:border-dc-teal focus:outline-none focus:ring-2 focus:ring-dc-teal/30"
        />
        <button
          type="submit"
          aria-label="Send to Donny"
          disabled={!text.trim()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-dc-teal-btn text-white transition-colors hover:bg-dc-teal-btn-hover disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <AppChip key={s.message} onClick={() => onSuggestionTap(s)}>
            {s.label}
          </AppChip>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/components/donny/DonnyHomePrompt.test.tsx
```

Expected: PASS, 0 failed.

`AppChip` spreads `React.ButtonHTMLAttributes<HTMLButtonElement>`, so `onClick` passes straight through, and it already sets `type="button"` — it will not submit the form it sits beside. Do **not** nest it inside another button.

**One thing to look at during the visual check in Task 6, Step 8:** `AppChip`'s inactive state is `text-dc-text-muted` on white, because it was built as a *filter* control. These three chips are the page's primary affordance, and muted-on-white may read as disabled to exactly the non-tech-savvy owner this design is for. Do not pre-emptively invent a new primitive — look at it on a real screen first, and if it is too quiet, raise it then.

- [ ] **Step 6: Commit**

```bash
git add src/lib/donny/donnyHomeSuggestions.ts src/components/donny/DonnyHomePrompt.tsx src/components/donny/DonnyHomePrompt.test.tsx
git commit -m "feat(donny): DonnyHomePrompt — prompt box plus three working taps

Three taps only, each backed by a tool the Phase 0 audit verified works on
prod. No social_* and no analytics claim: a tap that produces a shrug is worse
than no tap. Carries the brief-generator tour anchor the replaced hero owned.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

---

### Task 6: `DonnyHome` — the container

Mounts the data hooks, owns dismissal state, wires taps to `openDonnyWithContext`, fires the six analytics events, keeps the tour working, and gives the two rating prompts a home.

**The honest note on cost.** An earlier draft claimed these signals were free "because the page already fetches this data." That was false by construction — those hooks were mounted by the body being replaced. `DonnyHome` mounts them itself. They are the *same queries* with the same React Query keys, so there is no net new load versus today, but the accurate statement is "same queries, newly owned by this component."

**Files:**
- Create: `src/components/donny/DonnyHome.tsx` (replaces the Task 2 placeholder)
- Create: `src/components/donny/DonnyHome.test.tsx`
- Create: `src/lib/donny/proposalDismissal.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 3, 4 and 5; `useAuth`, `useDonnyContext`, `useAnalyticsContext`, `useTour`, `usePendingActions`, `useBusinessActiveCampaigns`, `useLocationReadiness`.
- Produces: `export function DonnyHome(): JSX.Element` — already imported by `BusinessDashboard` from Task 2.

- [ ] **Step 1: Write the dismissal store**

Create `src/lib/donny/proposalDismissal.ts`:

```ts
// 24-hour localStorage dismissal, keyed on the PROPOSAL id.
//
// Deliberately not the old `pendingBannerDismissed_${campaignId}` key: that one
// was campaign-scoped, so dismissing an "applied" prompt also hid the
// "submitted content" prompt for the same campaign and Donny went quiet about
// delivered work. The separate prefix also means dismissing here does not
// silence the banner on /dashboard/business/overview, which is still live.
import { dismissalKey } from './buildDonnyProposals';

const TTL_MS = 24 * 60 * 60 * 1000;

/** Ids dismissed within the TTL. Returns [] if localStorage is unavailable. */
export function readDismissedProposalIds(candidateIds: string[]): string[] {
  const out: string[] = [];
  for (const id of candidateIds) {
    try {
      const raw = localStorage.getItem(dismissalKey(id));
      if (!raw) continue;
      if (Date.now() - new Date(raw).getTime() < TTL_MS) out.push(id);
    } catch {
      return [];
    }
  }
  return out;
}

export function writeDismissedProposalId(id: string): void {
  try {
    localStorage.setItem(dismissalKey(id), new Date().toISOString());
  } catch {
    /* localStorage unavailable — dismissal is session-only, which is fine */
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/components/donny/DonnyHome.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Imported as a type only — `React.ReactNode` inside a vi.mock factory would
// otherwise resolve to the UMD global, which TS rejects inside a module.
import type { ReactNode } from 'react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const openDonnyWithContextMock = vi.fn();
vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({ openDonnyWithContext: openDonnyWithContextMock }),
}));

const trackEventMock = vi.fn();
vi.mock('@/components/analytics/AnalyticsProvider', () => ({
  useAnalyticsContext: () => ({ trackEvent: trackEventMock }),
}));

const profileMock = { value: { full_name: 'Joe Castelo', role: 'business_client' } as { full_name: string | null; role: string } | null };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: profileMock.value, activeOrgUnit: { id: 'ou1' } }),
}));

const pendingMock = { data: [] as unknown[], isLoading: false, isError: false };
vi.mock('@/hooks/usePendingActions', () => ({
  usePendingActions: () => pendingMock,
}));

vi.mock('@/hooks/useBusinessActiveCampaigns', () => ({
  useBusinessActiveCampaigns: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/hooks/useLocationReadiness', () => ({
  useLocationReadiness: () => ({
    isReady: true,
    missingSocial: false,
    missingStripe: false,
    locationName: 'Hoboken',
    hasActiveLocation: true,
  }),
}));

vi.mock('@/hooks/useTour', () => ({
  useTour: () => ({
    showTour: false,
    tourSteps: [],
    completeTour: vi.fn(),
    skipTour: vi.fn(),
    triggerTour: vi.fn(),
  }),
}));

// Both hit Supabase directly; render nothing so this suite stays a unit test.
vi.mock('@/components/reviews/RatingPromptManager', () => ({
  RatingPromptManager: () => <div data-testid="rating-prompt" />,
}));
vi.mock('@/components/reviews/SponsorshipRatingPromptManager', () => ({
  SponsorshipRatingPromptManager: () => <div data-testid="sponsorship-rating-prompt" />,
}));
vi.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/org/LocationBadge', () => ({ LocationBadge: () => null }));

import { DonnyHome } from './DonnyHome';
import { BUSINESS_SUGGESTIONS } from '@/lib/donny/donnyHomeSuggestions';

function renderHome() {
  return render(
    <MemoryRouter>
      <DonnyHome />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  profileMock.value = { full_name: 'Joe Castelo', role: 'business_client' };
  pendingMock.data = [];
  pendingMock.isLoading = false;
  pendingMock.isError = false;
});

describe('DonnyHome — greeting', () => {
  it('greets the owner by name', () => {
    renderHome();
    expect(screen.getByText(/Joe Castelo/)).toBeInTheDocument();
  });

  it('never prints "undefined" when there is no name', () => {
    profileMock.value = { full_name: null, role: 'business_client' };
    renderHome();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
    expect(screen.getByText(/there/)).toBeInTheDocument();
  });
});

describe('DonnyHome — taps and prompt', () => {
  it('sends a tapped suggestion to Donny and records it', async () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: BUSINESS_SUGGESTIONS[0].label }));
    expect(openDonnyWithContextMock).toHaveBeenCalledWith(BUSINESS_SUGGESTIONS[0].message);
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_suggestion_tapped', {
        label: BUSINESS_SUGGESTIONS[0].label,
      })
    );
  });

  it('sends a typed prompt to Donny and records it', async () => {
    renderHome();
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: 'plan my week' } });
    fireEvent.submit(input.closest('form')!);
    expect(openDonnyWithContextMock).toHaveBeenCalledWith('plan my week');
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_prompt_submitted', {})
    );
  });
});

describe('DonnyHome — proposals', () => {
  const action = {
    campaignId: 'c1',
    campaignTitle: 'Taco Tuesday',
    actionType: 'review_application' as const,
    creatorName: 'Ricky Ricardo',
    occurredAt: new Date(Date.now() - 7_200_000).toISOString(),
  };

  it('renders a pending action and navigates on tap', async () => {
    pendingMock.data = [action];
    renderHome();
    const cta = screen.getByRole('button', { name: 'Review application' });
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/dashboard/business/campaigns/c1');
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_proposal_tapped', {
        proposal_kind: 'pending_action',
        cta_kind: 'route',
      })
    );
  });

  it('hides a dismissed proposal and remembers it', async () => {
    pendingMock.data = [action];
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByText(/Ricky Ricardo applied/)).not.toBeInTheDocument()
    );
    expect(
      localStorage.getItem('donnyProposalDismissed_pending_action:review_application:c1')
    ).toBeTruthy();
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_proposal_dismissed', {
        proposal_kind: 'pending_action',
      })
    );
  });
});

describe('DonnyHome — page-level behaviour', () => {
  it('records the view exactly once, even across re-renders', async () => {
    const { rerender } = renderHome();
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );
    await waitFor(() => {
      const views = trackEventMock.mock.calls.filter((c) => c[0] === 'donny_home_viewed');
      expect(views).toHaveLength(1);
      expect(views[0][1]).toMatchObject({ role: 'business_client', has_pending: false });
    });
  });

  it('keeps the rating prompts, which have no other home for this role', () => {
    renderHome();
    expect(screen.getByTestId('rating-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('sponsorship-rating-prompt')).toBeInTheDocument();
  });

  it('links to the full dashboard and records it', async () => {
    renderHome();
    const link = screen.getByRole('link', { name: /view full dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard/business/overview');
    fireEvent.click(link);
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_overview_opened', {})
    );
  });

  it('keeps the tour replay button', () => {
    renderHome();
    expect(screen.getByRole('button', { name: /show tour/i })).toBeInTheDocument();
  });

  it('renders the prompt and taps even with nothing else to say', () => {
    renderHome();
    expect(screen.getByRole('textbox', { name: /ask donny/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Create a campaign|Find creators|trending/ }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/components/donny/DonnyHome.test.tsx
```

Expected: FAIL — the placeholder `DonnyHome` renders `null`, so every query fails.

- [ ] **Step 4: Write the container**

Overwrite `src/components/donny/DonnyHome.tsx`:

```tsx
// The Donny-first business dashboard body.
//
// A container: it mounts the data hooks, owns dismissal state, and hands
// already-fetched results to the pure buildDonnyProposals(). The two children
// below it are presentational.
//
// Cost note: these are the SAME React Query keys the replaced body used, so
// there is no net new load versus today — but this component now owns them
// rather than inheriting them for free.
//
// Phase A opens the EXISTING Donny panel. Inline chat is Phase B; see the
// design doc §13 for the seven hazards it has to resolve first.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useAnalyticsContext } from '@/components/analytics/AnalyticsProvider';
import { useTour } from '@/hooks/useTour';
import { usePendingActions } from '@/hooks/usePendingActions';
import { useBusinessActiveCampaigns } from '@/hooks/useBusinessActiveCampaigns';
import { useLocationReadiness } from '@/hooks/useLocationReadiness';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageBody } from '@/components/app/PageBody';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { LocationBadge } from '@/components/org/LocationBadge';
import { DCTour } from '@/components/guidance/DCTour';
import { TourButton } from '@/components/guidance/TourButton';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { BUSINESS_SUGGESTIONS, type DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';
import { buildDonnyProposals, type DonnyProposal } from '@/lib/donny/buildDonnyProposals';
import {
  readDismissedProposalIds,
  writeDismissedProposalId,
} from '@/lib/donny/proposalDismissal';

const OVERVIEW_ROUTE = '/dashboard/business/overview';

export function DonnyHome() {
  const { profile, activeOrgUnit } = useAuth();
  const navigate = useNavigate();
  const { openDonnyWithContext } = useDonnyContext();
  const { trackEvent } = useAnalyticsContext();
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour();

  const pending = usePendingActions();
  const campaigns = useBusinessActiveCampaigns(activeOrgUnit?.id);
  const readiness = useLocationReadiness();

  const [sessionDismissed, setSessionDismissed] = React.useState<string[]>([]);

  const isLoading = pending.isLoading || campaigns.isLoading;

  // Two passes: build once to learn the candidate ids, read localStorage for
  // just those, then build again with the dismissals applied. Cheap — the
  // function is pure and the lists are capped at 5 rows each.
  // useLocationReadiness returns a fresh object literal every render, so
  // depending on it directly would defeat the memo. Depend on its primitives.
  const { hasActiveLocation, isReady, locationName, missingSocial, missingStripe } = readiness;

  const result = React.useMemo(() => {
    const base = {
      pendingActions: pending.data,
      pendingActionsError: pending.isError,
      campaigns: campaigns.data,
      readiness: { hasActiveLocation, isReady, locationName, missingSocial, missingStripe },
      // Captured when the deps change, not on every render. Note React Query's
      // structural sharing: a refetch returning identical rows keeps the SAME
      // data reference, so this does not recompute and `now` stays frozen at
      // mount. A deadline crossing the 3-day line in a long-lived open tab
      // therefore will not surface until the data genuinely changes or the
      // component remounts. Deliberately no interval and no focus listener —
      // the blast radius is small and it self-heals on navigation.
      now: Date.now(),
    };
    // Read dismissals against the FULL ranked set, not the capped one. Reading
    // only the visible three misses a dismissal on a proposal ranked below the
    // cap, and dismissing one row would then resurrect it.
    const candidates = buildDonnyProposals({ ...base, dismissedIds: [] });
    const stored = readDismissedProposalIds(candidates.allProposalIds);
    return buildDonnyProposals({
      ...base,
      dismissedIds: [...stored, ...sessionDismissed],
    });
  }, [
    pending.data,
    pending.isError,
    campaigns.data,
    hasActiveLocation,
    isReady,
    locationName,
    missingSocial,
    missingStripe,
    sessionDismissed,
  ]);

  const viewRecorded = React.useRef(false);
  React.useEffect(() => {
    if (viewRecorded.current || isLoading) return;
    viewRecorded.current = true;
    void trackEvent('donny_home_viewed', {
      role: profile?.role ?? 'unknown',
      proposal_count: result.proposals.length,
      has_pending: result.proposals.some((p) => p.kind === 'pending_action'),
    });
  }, [isLoading, result.proposals, profile?.role, trackEvent]);

  const handleProposalTap = (proposal: DonnyProposal) => {
    if (!proposal.cta) return;
    void trackEvent('donny_home_proposal_tapped', {
      proposal_kind: proposal.kind,
      cta_kind: proposal.cta.kind,
    });
    if (proposal.cta.kind === 'route') {
      navigate(proposal.cta.route);
    } else {
      openDonnyWithContext(proposal.cta.message);
    }
  };

  const handleDismiss = (proposalId: string) => {
    const proposal = result.proposals.find((p) => p.id === proposalId);
    writeDismissedProposalId(proposalId);
    setSessionDismissed((prev) => (prev.includes(proposalId) ? prev : [...prev, proposalId]));
    void trackEvent('donny_home_proposal_dismissed', {
      proposal_kind: proposal?.kind ?? 'unknown',
    });
  };

  const handleSuggestionTap = (suggestion: DonnySuggestion) => {
    void trackEvent('donny_home_suggestion_tapped', { label: suggestion.label });
    openDonnyWithContext(suggestion.message);
  };

  const handlePromptSubmit = (text: string) => {
    void trackEvent('donny_home_prompt_submitted', {});
    openDonnyWithContext(text);
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <PageBody>
          <DashboardGreeting
            roleLabel="Restaurant Dashboard"
            userName={profile?.full_name || 'there'}
            badge={<LocationBadge />}
            subtitle="Tell me what you need and I'll take it from here."
          />

          <DonnyHomePrompt
            suggestions={BUSINESS_SUGGESTIONS}
            onSubmit={handlePromptSubmit}
            onSuggestionTap={handleSuggestionTap}
          />

          {/* The rating prompts go INSIDE the attention frame, not beside it.
              `NeedsAttentionSection` exists to consolidate every "needs you"
              banner into ONE quiet framed list — the replaced body put all four
              in a single instance. Rendering these as siblings would produce one
              framed list plus two orphaned rows under it. */}
          <DonnyHomeProposals
            result={result}
            isLoading={isLoading}
            onDismiss={handleDismiss}
            onTap={handleProposalTap}
          >
            {/* Kept from the replaced body: these have no other home for this role. */}
            <RatingPromptManager variant="row" />
            <SponsorshipRatingPromptManager variant="row" />
          </DonnyHomeProposals>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Link
              to={OVERVIEW_ROUTE}
              onClick={() => void trackEvent('donny_home_overview_opened', {})}
              className="text-sm font-semibold text-dc-teal-btn hover:underline"
            >
              View full dashboard →
            </Link>
            <TourButton onClick={triggerTour} />
          </div>
        </PageBody>
        {showTour && tourSteps.length > 0 && (
          <DCTour steps={tourSteps} onComplete={completeTour} onSkip={skipTour} />
        )}
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/components/donny/DonnyHome.test.tsx
```

Expected: PASS, 0 failed.

If the view-once test sees two `donny_home_viewed` calls, the `useRef` guard is being reset — confirm it is `React.useRef` at component scope, not inside the effect.

- [ ] **Step 6: Run every test this plan added**

```bash
npx vitest run src/lib/donny src/components/donny src/lib/donnyRoutes.parity.test.ts supabase/functions/donny-orchestrator/routes.test.ts
```

Expected: all pass. Note `src/components/donny` also runs the pre-existing `DonnyMessage.test.tsx` — it must stay green.

- [ ] **Step 7: Typecheck, lint and build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: typecheck and build clean. The repo carries pre-existing lint warnings, so judge `npm run lint` by whether any reported file is one of yours — none of the files this plan creates or modifies may appear.

- [ ] **Step 8: Verify both viewports with the flag ON, locally**

Temporarily set `DONNY_FIRST_DASHBOARD_ENABLED = true` in `src/lib/featureConfig.ts`, then:

```bash
npm run dev
```

As a restaurant account at `http://127.0.0.1:8080/dashboard/business`, check:
- Greeting shows the owner's name; never "undefined".
- Prompt box accepts text; submitting opens the Donny panel with that text.
- Each of the three taps opens the panel with its message.
- "View full dashboard →" reaches the old body.
- The `?` button replays the tour, and its step 2 highlights the prompt box.
- **Mobile viewport** (real narrow window, not just DevTools' device toolbar — resizing the emulator does not change `innerWidth` in this environment): the bottom nav is not overlapped, the prompt box is reachable above the keyboard, and the chips wrap rather than scroll off-screen.
- Console has no errors.

**Revert the flag to `false` before committing.**

- [ ] **Step 9: Commit**

```bash
git add src/components/donny/DonnyHome.tsx src/components/donny/DonnyHome.test.tsx src/lib/donny/proposalDismissal.ts
git commit -m "feat(donny): DonnyHome container — hooks, dismissal, taps, analytics

Mounts the three data hooks the replaced body used (same query keys, newly
owned here), hands their results to the pure builder, and opens the existing
Donny panel on every tap. Keeps the tour anchor, the tour replay button and
both rating prompts, which have no other home for this role.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

---

### Task 7: Goal 3 — Donny names where a thing lives instead of shrugging

Spec Goal 3: *"No path where Donny shrugs — if it cannot do a thing, it says where the thing lives."* The three taps satisfy this by construction (spec §8 ships only tools the audit verified work). The **free-text prompt box** is the path where a shrug is still possible, so this is where Goal 3 needs an actual change.

**This is the only task that touches an edge function.** Tasks 1–6 are a clean frontend-only stack; this one is deliberately last so it can be dropped without unpicking anything, at the cost of leaving Goal 3 uncovered.

**What this task does NOT do.** Line 61 of the current prompt tells Donny to use the `social_` tools for social, analytics and scheduling questions — and those are **0/7 on prod**, so that line actively routes owners into the shrug. That is one of the four Phase 0 bugs the spec lists under §5 Non-goals. **Leave it alone here.** Fixing it means either repairing the tools or removing the instruction, and both need their own investigation.

**Files:**
- Modify: `supabase/functions/donny-orchestrator/index.ts:53-65` (the `stable` half of `buildSystemPrompt`)

**Interfaces:**
- Consumes: `isKnownRoute` (already imported at `index.ts:20`) and the route allow-list, which Task 2 extended with `/dashboard/business/overview`.
- Produces: no new symbols. Behavioural change only.

- [ ] **Step 1: Add the rule to the system prompt**

`callClaude` places exactly ONE `cache_control` breakpoint, at the end of the whole `stable`
block (`index.ts` around line 187) — there is no per-bullet or mid-string breakpoint. Any
byte-change to `stable` invalidates that single cached prefix once, for every user, regardless of
where in the string the change lands. So position within `stable` is a **semantic** choice (put
the rule where it reads in context, next to the bullet it qualifies), not a caching one — do not
default to appending just to "protect the cache." Add these two bullets immediately after the
existing `- Only use routes that appear in a tool result…` bullet (line 64), before the
`web_search` bullet, because the first new bullet's escape hatch only makes sense read next to
that routes bullet (see the rationale after the snippet):

```
- Never end on a dead end. If you cannot do something yourself, say plainly what you cannot do and then name the page where the user can do it — in one short sentence, in the words a restaurant owner would use ("your Social Media page", not "the Outstand connection manager"). Only name a page you actually know exists; if you do not know where something lives, say so plainly and offer what you CAN do instead — never invent a page name to avoid a dead end. "I can't help with that" on its own is a bug
- Never apologize generically or repeat the request back. Say what you CAN do next
```

**Why the first bullet carries its own escape hatch.** The routes bullet directly above it states its own fallback ("If no route is available, omit suggested_actions rather than making one up"). Without a matching clause, "name the page where the user can do it" pushes a model that hits a real capability gap toward asserting a plausible page name in **prose** — a channel with no `isKnownRoute` filter behind it. That is the twelve-dead-`/settings/*`-CTAs failure relocated to the reply text, where nothing can catch it. Task 7's review found this; the guard must stay local to the bullet that creates the risk, not two rules away.

- [ ] **Step 2: Verify the prompt still compiles as a Deno module**

The prompt is a backtick-delimited template literal. A stray backtick inside it silently breaks the Deno bundle in a way `npm run build` does NOT catch — this has bitten the project before.

```bash
npx tsc --noEmit --allowJs --checkJs false --target es2022 --moduleResolution bundler --module esnext supabase/functions/donny-orchestrator/index.ts 2>&1 | head -20
```

Expected: no *syntax* errors. Deno-specific import and global errors (`https://` specifiers, `Deno` namespace) are expected here and are not failures — you are checking that the file parses, not that it typechecks under Node.

Then confirm no backtick was introduced inside the literal:

```bash
git diff supabase/functions/donny-orchestrator/index.ts | grep '^+' | grep '`'
```

Expected: no output.

- [ ] **Step 3: Run the edge-function reviewer**

Dispatch the read-only `edge-function-reviewer` subagent against `supabase/functions/donny-orchestrator/index.ts`, per the project rule that it runs **before** any edge-function deploy. Resolve every finding before continuing.

- [ ] **Step 4: Run the route suites, which this file depends on**

```bash
npx vitest run supabase/functions/donny-orchestrator/routes.test.ts src/lib/donnyRoutes.parity.test.ts
```

Expected: PASS, 15 passed 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-orchestrator/index.ts
git commit -m "feat(donny): never shrug — name the page instead of dead-ending

Spec Goal 3. The taps ship only tools the Phase 0 audit verified work, so the
free-text prompt box is the remaining path where Donny can shrug. Appended to
the stable prompt prefix rather than inserted, so the prompt cache holds.

Does NOT touch the line routing social/analytics questions into the social_
tools — those are 0/7 on prod and that is a separate, listed Phase 0 bug.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

---

### Task 8: Review gates and PR

No new code. This is the project's mandated path from "it works" to "it ships", and it is a task because each gate can reject the work.

**Files:** none created or modified except in response to findings.

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: a PR against `main` from `feat/donny-first-dashboard`.

- [ ] **Step 1: Simplify**

Run `/simplify` over the six new/changed source files. Apply the project's own review standards: functions over 30 lines, logic duplicated more than twice, any `any`, components with more than three props that could be grouped, missing error handling on async work.

- [ ] **Step 2: Confirm the full suite is no worse than baseline**

```bash
npm run test 2>&1 | tail -40
```

`npm run test` **exits 1** — roughly 103 test files fail for reasons that predate this work. Read the summary counts, not the exit code. Compare the failed-file count against `main`'s; it must not have grown.

- [ ] **Step 3: Codex second review**

Mandatory independent second reviewer. From the worktree:

```bash
codex review --base main --title "Donny-first business dashboard (Phase A)"
```

**Run `data-exposure-reviewer` first** — the `codex-review` skill requires it whenever a branch touches `supabase/functions/`, and Task 7 does. Give it the changed-file list. The expected verdict is PASS: the three `supabase/` changes are an `export` keyword, one route string, and two English sentences in a prompt — no query, no RLS policy, no service-role call, no migration. Run it anyway; a cheap confirmation beats an assumption, and a skipped gate is the thing this project keeps getting bitten by.

A **blank** Codex run is a failed gate, not a pass. If Codex flags real issues, fix them and re-run until clean. Relay Codex's summary verdict verbatim.

- [ ] **Step 4: Commit any review fixes**

```bash
git add -A
git commit -m "fix(donny): address review findings on the Phase A dashboard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/donny-first-dashboard
gh pr create --base main --title "feat(dashboard): Donny-first business dashboard (Phase A, flag-off)" --body "$(cat <<'EOF'
## What

The `/dashboard/business` body becomes Donny: a greeting, what needs the owner's attention right now, a prompt box, and three taps that work. Today's body moves **verbatim** to `/dashboard/business/overview` and stays reachable.

Behind `DONNY_FIRST_DASHBOARD_ENABLED`, **default off** — merging this changes nothing for users.

Design: `docs/superpowers/specs/2026-08-08-donny-first-dashboard-design.md` (Phase A).

## Why

A restaurant owner opens the dashboard and fiddles. The acceptance bar is the Mom Test: a 75-year-old who is not tech savvy should log in and comfortably get something done, without being taught and without opening a help page.

## Grounded in the Phase 0 audit, not assumption

- `usePendingActions` already produces state-derived proposals — the hard part was built, just buried.
- Only **four** Donny tools verifiably work on prod, so the body ships **three** taps. Anything routing to `social_*` (0/7) and every analytics claim is excluded. A tap that produces a shrug is worse than no tap.
- `donny_nudges` is a notification feed with 33 rows and 0 acted on. This does not build on it.

## Notable

- **New route-mirror parity test** — nothing previously asserted the client and server route allow-lists agree. It is directional, not an identity check: the client deliberately carries two legacy Crews redirects the server must never emit.
- **The location-setup blocker is returned separately from the capped list**, so three pending applications can never crowd out the thing blocking campaign creation, promotions and DragonShare.
- **Dismissal is keyed per proposal, not per campaign.** The old key was campaign-scoped, so dismissing an "applied" prompt also silenced "submitted content" for the same campaign.
- **Two signals, not four.** The 14-day one was cut: the hook it was specified against selects `id, title, status, deadline` — there is no `created_at`.
- **One prompt change in `donny-orchestrator`** so Donny names the page instead of dead-ending on the free-text path (Goal 3). **Needs its own edge-function deploy after merge** — merging ships the frontend only.

## Testing

`buildDonnyProposals` is pure and fixture-driven (merge, rank, cap, promotion-on-dismiss, cap-exemption, route validation). Both presentational components and the container are covered under RTL. Route parity and the existing route suite both green.

Flag-off path verified by hand: `/dashboard/business` is byte-identical to before.

## Deferred

Phase B (inline chat) with its seven hazards is specified in §13 of the design doc. Creator and brand roles follow after prod verification.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01QoCQobKfhKVQJhe1ZRmu3U
EOF
)"
```

- [ ] **Step 6: After merge — flip the flag, verify prod, sync knowledge**

These are separate, sequenced actions, not part of the PR:

1. **Deploy `donny-orchestrator`.** Merging to `main` deploys the **frontend only** — an edge function needs its own deploy, and Task 7's prompt change lives in one. Use the `careful` skill to gate it, then:
   ```bash
   supabase functions deploy donny-orchestrator --project-ref zocahiffooqdybdhguqv
   ```
   Confirm the new version number afterwards. **Merged is not deployed**, and this project has shipped a "fixed" edge function that was still running the old code.
2. Flip `DONNY_FIRST_DASHBOARD_ENABLED` to `true` in its own small PR.
3. Run the `verify-prod` skill against dragoncandy.io — screenshot **desktop and mobile**, check the console on both. Also fold in the both-viewport visual pass that PR #382 never got.
4. Read the §11 metrics before starting Phase B or touching creator/brand. **The number to beat is 0%** — `donny_nudges`' lifetime action rate.
5. Run the `knowledge-sync` skill.

---

## Notes for the implementer

**Where this deviates from the spec, and why.** Three places, all recorded above at the point of use:

1. **Route parity is directional, not an identity check** (Task 1). The spec's version fails on the first run because the client deliberately holds two legacy routes the server must not emit.
2. **`DonnyProposal.cta` is `ProposalCta | null`**, not `ProposalCta` (Task 3). The spec requires "renders as text without a button" for a route that fails validation, which the non-nullable type cannot express.
3. **The deadline signal only fires for `published` or `active` campaigns** (Task 3). The spec left the status filter unstated; a `draft` has nobody working on it and a `completed` one is done.

**What Phase A deliberately does not do.** For one release the dashboard *launches* Donny rather than *being* Donny — the founder accepted this trade explicitly. Answers open the existing panel. Do not reach for `DonnyChatView`, `setInline()`, or any `DonnyStage` change; §13 of the design doc lists seven verified hazards that Phase B must resolve first, including two that put two Donnys on one screen.
