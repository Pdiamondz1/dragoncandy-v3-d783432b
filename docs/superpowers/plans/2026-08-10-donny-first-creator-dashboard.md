# Donny-First Creator Dashboard (Phase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the creator role the same Donny-first dashboard the business role has — greeting, attention list, prompt box, taps — with today's creator body preserved verbatim at `/dashboard/creator/overview`.

**Architecture:** `DonnyHome` is split into a role-agnostic conversation hook plus a props-driven layout shell, then each role gets a thin container supplying its own hooks, proposals builder and suggestions. Separate containers because hooks cannot be conditional — one component with a `role` prop would fire the business-scoped `usePendingActions` for every creator.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind, React Query, Vitest + @testing-library/react. No migration, no edge-function deploy.

**Spec:** `docs/superpowers/specs/2026-08-10-donny-first-creator-dashboard-design.md` — read §4 before starting. It passed three review iterations; its section numbers are cited throughout below.

## Global Constraints

- **Creator role only.** Brand is out of scope — `BRAND_ROLE_ENABLED` is `false` and cannot be prod-verified. Build components role-generic anyway (spec D6).
- **No migration, no RLS change, no edge-function deploy.** One edge-function *source* file gains one string (`ROUTE_TEMPLATES`); it is not deployed. See spec D4.
- **`DonnyHome.test.tsx` has 37 `it()` cases across 8 `describe` blocks and must pass UNCHANGED through Tasks 1 and 2.** That is the only proof the extraction is a move and not a rewrite. If a test needs editing, the extraction changed behaviour — stop and fix the code, not the test.
- **Element depth is pinned by tests.** `DonnyHome.test.tsx:493-495` reaches the conversation block via `getByRole('log').parentElement.parentElement`; `:460-483` uses `compareDocumentPosition`. **Add no wrapper elements** around `DonnyThreadRegion` or the composer.
- **Conversation block sizing is founder-verified: `max-h-[calc(100dvh-12rem)] min-h-[20rem]`.** Copy it verbatim. Do not re-derive it.
- **`DonnyThreadRegion` and `DonnyHomePrompt` are reused byte-unchanged.** Do not fork or edit them.
- **Copy rule (spec D5):** an invitation is a nudge to apply, never an assignment. No Accept button, no "you've been selected", no implied priority. One row per invitation.
- **`select *` is forbidden.** Name every column. Every hook handles its own error; an errored query contributes NO proposal, never a zero.
- **`.maybeSingle()`, never `.single()`**, for any per-user row that may not exist.
- **Desktop and mobile are separate targets** — `lg:`/`xl:` for desktop, unprefixed for mobile.
- **No gray surfaces or badges.** Light-app kit + `dc-*` tokens. Muted *text* is fine.
- **RTL test files need `// @vitest-environment jsdom` as line 1 and `import '@testing-library/jest-dom';` as line 2.** jsdom is per-file here, not global.
- **`npm run test` exits 1 from pre-existing failures in the main checkout; from this worktree the suite is green.** Red here is a real regression.
- Run all commands from the worktree: `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\dc-donny-1st-creators`. **Never `cd` to the main checkout** — it locks both shells for the session.

---

## File Structure

**Created:**
| File | Responsibility |
|---|---|
| `src/hooks/donny/useDonnyHomeConversation.ts` | All conversation machinery, moved verbatim from `DonnyHome`. Role-agnostic. |
| `src/components/donny/DonnyHomeShell.tsx` | Layout only: hero, two-arrangement wrapper, thread region, prompt, skeleton, overview link, tour. No conversation state. |
| `src/components/donny/CreatorDonnyHome.tsx` | Creator container: creator hooks + `buildCreatorProposals` + `CREATOR_SUGGESTIONS`. |
| `src/pages/CreatorOverview.tsx` | Today's `CreatorDashboard` body, verbatim except two tour anchors. |
| `src/lib/donny/buildCreatorProposals.ts` | Pure merge/rank/cap for the creator attention list. |
| `src/lib/donny/buildCreatorProposals.test.ts` | The bulk of the new test coverage. |
| `src/hooks/useCreatorAttentionInvitations.ts` | Item D input. |
| `src/hooks/useCreatorContentTodo.ts` | Item A input. |
| `src/hooks/useCreatorPendingApplications.ts` | Item B input. |
| `src/hooks/useCreatorPayoutState.ts` | Item C input + the conditioning rule's collaboration count. |
| `src/lib/tours/creatorTourAnchors.test.tsx` | Tour parity test (§4.6). |

**Modified:**
| File | Change |
|---|---|
| `src/components/donny/DonnyHome.tsx` | Becomes the business container over the shell. |
| `src/pages/CreatorDashboard.tsx` | Reduced to a three-way switch. |
| `src/App.tsx` | Lazy route `/dashboard/creator/overview`. |
| `src/lib/donnyRoutes.ts` | Add the route to the client mirror. |
| `supabase/functions/donny-orchestrator/routes.ts` | Add the route to the server mirror (parity test is bidirectional). **Not deployed.** |
| `src/lib/donny/donnyHomeSuggestions.ts` | Add `CREATOR_SUGGESTIONS`. |
| `src/lib/tours/role-tours.ts` | Re-point `CREATOR_TOUR`'s three body steps. |
| `src/lib/featureConfig.ts` | Widen the `DONNY_FIRST_DASHBOARD_ENABLED` comment — it now gates two roles. |

---

### Task 1: Extract the conversation machinery into a hook

**Files:**
- Create: `src/hooks/donny/useDonnyHomeConversation.ts`
- Modify: `src/components/donny/DonnyHome.tsx:65-264` (remove the moved code, call the hook)
- Test: `src/components/donny/DonnyHome.test.tsx` — **unchanged**, used as the regression net

**Interfaces:**
- Consumes: `useDonnyContext()` from `src/contexts/DonnyProvider.tsx`
- Produces:
```ts
export interface DonnyHomeConversation {
  ask: (text: string) => void;
  hasConversation: boolean;
  isBusy: boolean;
  historyUnavailable: boolean;
  composerRef: React.RefObject<HTMLDivElement>;
  thread: {
    messages: DonnyMessage[];
    avatarState: DonnyAvatarState;
    streamingContent: string;
    error: string | null;   // the DERIVED threadError
    retry: () => void;      // the DERIVED threadRetry
    userRole: UserRole;
  };
}
export function useDonnyHomeConversation(): DonnyHomeConversation;
```

- [ ] **Step 1: Establish the baseline — run the suite before touching anything**

```bash
npx vitest run src/components/donny/DonnyHome.test.tsx
```
Expected: `Tests  37 passed (37)`. Write that number down. If it is not 37, stop and report — the plan's regression net is wrong.

- [ ] **Step 2: Create the hook file**

Move — do not retype — `DonnyHome.tsx:65-264` into the new file. That range is: the `useDonnyContext()` destructure, the `registerInlineConversation` effect, `queuedAsk`, `visitBaselineId`, `dispatch`, `visitMessages`, the flush effect, `isBusy`, `askedHere`, `historyUnavailable`, `threadError`, `threadRetry`, `hasConversation`, `composerRef`, `userAskedHere` + its scroll effect, and `ask`.

**Keep every comment.** They record four Codex rounds of defects and are the reason the code is shaped as it is.

```ts
// src/hooks/donny/useDonnyHomeConversation.ts
import React from 'react';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import type { DonnyMessage, DonnyAvatarState } from '@/types/donny';
import type { UserRole } from '@/types/user';

export interface DonnyHomeConversation {
  ask: (text: string) => void;
  hasConversation: boolean;
  isBusy: boolean;
  historyUnavailable: boolean;
  composerRef: React.RefObject<HTMLDivElement>;
  thread: {
    messages: DonnyMessage[];
    avatarState: DonnyAvatarState;
    streamingContent: string;
    error: string | null;
    retry: () => void;
    userRole: UserRole;
  };
}

export function useDonnyHomeConversation(): DonnyHomeConversation {
  // ... the moved body, verbatim, comments included ...

  return {
    ask,
    hasConversation,
    isBusy,
    historyUnavailable,
    composerRef,
    thread: {
      messages: visitMessages,   // THIS VISIT's messages, not the whole conversation
      avatarState,
      streamingContent,
      error: threadError,        // derived, not the raw context error
      retry: threadRetry,        // derived, not the raw context retry
      userRole,
    },
  };
}
```

- [ ] **Step 3: Rewire `DonnyHome` to call the hook**

Delete the moved lines from `DonnyHome.tsx` and replace with:
```tsx
const { ask, hasConversation, isBusy, historyUnavailable, composerRef, thread } =
  useDonnyHomeConversation();
```
The JSX keeps `isStreaming={isBusy && !historyUnavailable}` on `DonnyThreadRegion` exactly as it is today (`DonnyHome.tsx:484`) — a typing indicator over an error is a lie about what is happening. Spread the rest from `thread`.

- [ ] **Step 4: Run the regression net**

```bash
npx vitest run src/components/donny/DonnyHome.test.tsx
```
Expected: `Tests  37 passed (37)` — the same number as Step 1, with **no edits to the test file**. If any test fails, the extraction changed behaviour: fix the hook, not the test.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/donny/useDonnyHomeConversation.ts src/components/donny/DonnyHome.tsx
git commit -m "refactor(donny): extract the home conversation machinery into a hook

A move, not a rewrite — DonnyHome.test.tsx's 37 cases pass unchanged, which is
the only thing that proves it. Comments carried over verbatim; they record the
defects that shaped this code."
```

---

### Task 2: Extract the layout into `DonnyHomeShell`

**Files:**
- Create: `src/components/donny/DonnyHomeShell.tsx`
- Modify: `src/components/donny/DonnyHome.tsx` (becomes the business container)
- Test: `src/components/donny/DonnyHome.test.tsx` — **still unchanged**

**Interfaces:**
- Consumes: `DonnyHomeConversation` from Task 1
- Produces: `DonnyHomeShell` with the props below. Task 6 renders it for the creator role.

- [ ] **Step 1: Create the shell with the full prop surface**

```tsx
// src/components/donny/DonnyHomeShell.tsx
import React, { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageBody } from '@/components/app/PageBody';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { DonnyAvatar } from './DonnyAvatar';
import { DonnyThreadRegion } from './DonnyThreadRegion';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { TourButton } from '@/components/guidance/TourButton';
import { DCTour } from '@/components/guidance/DCTour';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';
import type { UserRole } from '@/types/user';
import type { DonnyHomeConversation } from '@/hooks/donny/useDonnyHomeConversation';

interface DonnyHomeShellProps {
  userRole: UserRole;
  roleLabel: string;
  greetingName: string;
  subtitle: string;
  badge?: ReactNode;
  overviewRoute: string;
  onOverviewOpen: () => void;
  suggestions: DonnySuggestion[];
  onSubmit: (text: string) => void;
  onSuggestionTap: (s: DonnySuggestion) => void;
  profileLoaded: boolean;
  children: ReactNode;
  /** Per-role tour anchors for the two elements the SHELL owns (§4.6).
   *  Business passes nothing; creator passes both. Applied to elements that
   *  ALREADY EXIST — add no wrapper, the tests pin element depth. */
  tourAnchors?: { prompt?: string; overview?: string };
  conversation: DonnyHomeConversation;
  tour: {
    showTour: boolean;
    tourSteps: TourStep[];
    completeTour: () => void;
    skipTour: () => void;
    triggerTour: () => void;
  };
}
```

The body is `DonnyHome.tsx:374-534` moved verbatim, with these substitutions only:
- `<DashboardLayout userRole="business_client">` → `userRole={userRole}` (**both** sites, :376 and :395)
- `"Restaurant Dashboard"` → `{roleLabel}` (both the collapsed and expanded hero)
- `<LocationBadge />` → `{badge}`
- `Welcome back, {profile?.full_name || 'there'}` → `Welcome back, {greetingName}`
- the subtitle string → `{subtitle}`
- `OVERVIEW_ROUTE` → `{overviewRoute}`, and the inline `trackEvent` → `onOverviewOpen`
- `BUSINESS_SUGGESTIONS` → `{suggestions}`
- `<DonnyHomeProposals .../>` → `{children}`
- `!profile` → `!profileLoaded`
- `data-tour={tourAnchors?.prompt}` on the **existing** `<div ref={composerRef}>` (`DonnyHome.tsx:491`)
- `data-tour={tourAnchors?.overview}` on the **existing** overview `<Link>` (`:519`)

Keep `max-h-[calc(100dvh-12rem)] min-h-[20rem]` verbatim. Keep the wrapper rendered in both states so the composer holds slot 1 and never remounts.

- [ ] **Step 2: Rewire `DonnyHome` as the business container**

It keeps `usePendingActions`, `useUpcomingCampaignDeadlines`, `useLocationReadiness`, the two-pass `buildDonnyProposals` memo, dismissal state, the four `trackEvent` calls and `handleProposalTap` — and renders `<DonnyHomeShell>` with `<DonnyHomeProposals>` as `children`. It passes **no** `tourAnchors`, so its tree stays byte-identical.

- [ ] **Step 3: Run the regression net**

```bash
npx vitest run src/components/donny/DonnyHome.test.tsx
```
Expected: `Tests  37 passed (37)`, test file still unedited. The two depth-pinning tests (`:460-483`, `:493-495`) are the ones most likely to catch a stray wrapper.

- [ ] **Step 4: Typecheck and build**

```bash
npm run typecheck && npm run build
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/DonnyHomeShell.tsx src/components/donny/DonnyHome.tsx
git commit -m "refactor(donny): extract DonnyHomeShell, DonnyHome becomes the business container

Same 37 tests, still unedited. Business passes no tourAnchors, so its rendered
tree is byte-identical."
```

---

### Task 3: `CreatorOverview` page, route, and the dashboard switch

**Files:**
- Create: `src/pages/CreatorOverview.tsx`
- Modify: `src/pages/CreatorDashboard.tsx`, `src/App.tsx`, `src/lib/donnyRoutes.ts`, `supabase/functions/donny-orchestrator/routes.ts`, `src/lib/featureConfig.ts`
- Test: `src/lib/donnyRoutes.parity.test.ts` — existing, must pass

**Interfaces:**
- Produces: the route `/dashboard/creator/overview`, which Task 6 passes to the shell as `overviewRoute`.

- [ ] **Step 1: Create `CreatorOverview.tsx`**

Move `CreatorDashboard.tsx:42-273` verbatim — every hook, `DashboardGreeting`, `HeroPrimaryAction`, `FeedOptInCard`, `NeedsAttentionSection`, `StatsRow`, the DragonShare tiles, "Donny tools", `RecentActivitySection`, the calendar disclosure, `UpcomingPostsWidget`, the tour. Rename the component to `CreatorOverview`, default-export it. **Drop the `useFirstRunMissions` branch** — it moves to the switch in Step 2.

Two anchors change here, per §4.6 (the rest stay): `data-tour="profile-completion"` → `data-tour="creator-attention"` moved onto the `NeedsAttentionSection`, and `data-tour="dragonshare-nav"` → `data-tour="creator-secondary"`. `data-tour="browse-campaigns"` stays exactly where it is on `HeroPrimaryAction`.

- [ ] **Step 2: Reduce `CreatorDashboard.tsx` to the switch**

```tsx
// src/pages/CreatorDashboard.tsx
//
// A three-way switch, nothing else. The body that used to live here moved
// verbatim to CreatorOverview and is still reachable at
// /dashboard/creator/overview.
//
// Order matters: first-run is checked FIRST, so a brand-new creator always gets
// the mission list regardless of the flag.
import { DONNY_FIRST_DASHBOARD_ENABLED } from '@/lib/featureConfig';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
import { CreatorDonnyHome } from '@/components/donny/CreatorDonnyHome';
import CreatorOverview from './CreatorOverview';

const CreatorDashboard = () => {
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

  if (isFirstRun && missions) {
    return (
      <FirstRunDashboard
        role="content_creator"
        missions={missions}
        onCompleteMission={completeMission}
        onSkip={skipMissions}
      />
    );
  }

  if (!DONNY_FIRST_DASHBOARD_ENABLED) {
    return <CreatorOverview />;
  }

  return <CreatorDonnyHome />;
};

export default CreatorDashboard;
```

`CreatorDonnyHome` does not exist until Task 6. Stub it now so this compiles:
```tsx
// src/components/donny/CreatorDonnyHome.tsx — replaced wholesale in Task 6
export function CreatorDonnyHome() { return null; }
```

- [ ] **Step 3: Register the route in all three places**

`src/App.tsx` — beside the existing `BusinessOverview` route at :241:
```tsx
const CreatorOverview = lazy(() => import("./pages/CreatorOverview"));
// ...
<Route path="/dashboard/creator/overview" element={<ProtectedRoute><CreatorOverview /></ProtectedRoute>} />
```
Creators have no role guard; `ProtectedRoute` is what every other `/dashboard/creator/*` route uses.

`src/lib/donnyRoutes.ts` — add `"/dashboard/creator/overview",` to `ROUTE_TEMPLATES` beside the other creator routes (:84-97).

`supabase/functions/donny-orchestrator/routes.ts` — add the same string to its `ROUTE_TEMPLATES` beside `/dashboard/business/overview` (:137). The parity test is **bidirectional**; a client-only addition fails it. **Do not deploy** — see spec D4 for why no redeploy is needed and why the resulting skew is harmless.

- [ ] **Step 4: Widen the feature-flag comment**

In `src/lib/featureConfig.ts`, update `DONNY_FIRST_DASHBOARD_ENABLED`'s comment: it is shared and already `true`, so it now gates the creator dashboard as well as the business one, and merging is the launch for both. There is no per-role switch.

- [ ] **Step 5: Run the parity test and typecheck**

```bash
npx vitest run src/lib/donnyRoutes.parity.test.ts && npm run typecheck
```
Expected: parity passes both directions; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CreatorOverview.tsx src/pages/CreatorDashboard.tsx src/App.tsx \
  src/lib/donnyRoutes.ts supabase/functions/donny-orchestrator/routes.ts \
  src/lib/featureConfig.ts src/components/donny/CreatorDonnyHome.tsx
git commit -m "feat(creator): extract CreatorOverview and add /dashboard/creator/overview

Mirrors #411's BusinessOverview extraction. Both route mirrors move together
because the parity test is bidirectional; the orchestrator is NOT redeployed —
nothing emits this route, so the skew is inert."
```

---

### Task 4: The four creator data hooks

**Files:**
- Create: `src/hooks/useCreatorAttentionInvitations.ts`, `src/hooks/useCreatorContentTodo.ts`, `src/hooks/useCreatorPendingApplications.ts`, `src/hooks/useCreatorPayoutState.ts`

**Interfaces:**
- Produces — Task 5 consumes these exact shapes:
```ts
export interface CreatorInvitation { invitationId: string; campaignId: string; campaignTitle: string; businessName: string; createdAt: string; }
export interface CreatorContentTodo { collaborationId: string; campaignId: string; campaignTitle: string; createdAt: string; }
export interface CreatorPendingApplication { applicationId: string; campaignId: string; campaignTitle: string; createdAt: string; }
export interface CreatorPayoutState { hasStripeAccount: boolean; onboardingComplete: boolean; pendingBalance: number; collaborationCount: number; }
```
Each hook returns React Query's `{ data, isLoading, isError }`.

- [ ] **Step 1: `useCreatorAttentionInvitations`**

Query key `['creator-attention-invitations', user?.id]`, `enabled: !!user`.

Two reads. First the invitations, with `campaigns!inner` so a non-published campaign's invitation is excluded **server-side** — a plain embed returns the row with a `null` campaign:
```ts
const { data, error } = await supabase
  .from('campaign_invitations')
  .select('id, campaign_id, created_at, campaigns!inner(id, title, status, user_id)')
  .eq('creator_id', user.id)
  .eq('status', 'pending')
  .eq('campaigns.status', 'published')
  .order('created_at', { ascending: false });
if (error) throw error;
```
Deliberately **no `expires_at` filter** (spec D1): all 17 pending invitations on prod are expired, yet every campaign is still `published` and applying still works, and `useCreateApplication` ignores expiry too. Gating the nudge on a column that does not gate the action would hide 17 live opportunities.

Then exclude campaigns the creator already applied to. PostgREST cannot express a not-exists against a sibling table in one request, so read the creator's own rows and filter client-side:
```ts
const { data: applied } = await supabase
  .from('campaign_applications')
  .select('campaign_id')
  .eq('creator_id', user.id);
const appliedIds = new Set((applied ?? []).map((a) => a.campaign_id));
```
Resolve `businessName` from `business_profiles.business_name` keyed on the campaign's `user_id`, falling back to `profiles.full_name` then `'A business'` — the same shape `useCreatorPendingInvitations` already uses at `useCampaignInvitations.ts:127-145`.

- [ ] **Step 2: `useCreatorContentTodo`**

```ts
.from('campaign_collaborations')
.select('id, campaign_id, created_at, campaigns(title)')
.eq('creator_id', user.id)
.eq('status', 'active')
.eq('content_status', 'pending')
```
`status='active'` is **required**, mirroring `usePendingActions.ts:64-65`. Without it a cancelled collaboration still sitting at `content_status='pending'` renders as "content not started".

- [ ] **Step 3: `useCreatorPendingApplications`**

```ts
.from('campaign_applications')
.select('id, campaign_id, created_at, campaigns(title)')
.eq('creator_id', user.id)
.eq('status', 'pending')
```

- [ ] **Step 4: `useCreatorPayoutState`**

```ts
const { data: cp, error } = await supabase
  .from('creator_profiles')
  .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
  .eq('user_id', user.id)
  .maybeSingle();
if (error) throw error;
const { count } = await supabase
  .from('campaign_collaborations')
  .select('id', { count: 'exact', head: true })
  .eq('creator_id', user.id);
return {
  hasStripeAccount: !!cp?.stripe_account_id,
  onboardingComplete: cp?.stripe_onboarding_complete === true,
  pendingBalance: Number(cp?.pending_balance ?? 0),
  collaborationCount: count ?? 0,
};
```
**`.maybeSingle()` is load-bearing.** Three of the 18 creators on prod have no `creator_profiles` row; `.single()` throws on zero rows and the error would be indistinguishable from a real failure. A missing row correctly yields `hasStripeAccount: false`.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCreatorAttentionInvitations.ts src/hooks/useCreatorContentTodo.ts \
  src/hooks/useCreatorPendingApplications.ts src/hooks/useCreatorPayoutState.ts
git commit -m "feat(creator): data hooks for the Donny-first attention list

usePendingActions is business-scoped (campaigns.user_id = auth.uid()), so the
creator surface needs its own reads. All four run under the creator's own RLS."
```

---

### Task 5: `buildCreatorProposals` (TDD — tests first)

**Files:**
- Create: `src/lib/donny/buildCreatorProposals.ts`, `src/lib/donny/buildCreatorProposals.test.ts`

**Interfaces:**
- Consumes: the four shapes from Task 4
- Produces: `buildCreatorProposals(input): DonnyProposalsResult` — the **same** result type `DonnyHomeProposals` already renders, imported from `buildDonnyProposals.ts`.

```ts
export interface CreatorProposalsInput {
  invitations: CreatorInvitation[] | undefined;
  invitationsError: boolean;
  contentTodo: CreatorContentTodo[] | undefined;
  contentTodoError: boolean;
  applications: CreatorPendingApplication[] | undefined;
  applicationsError: boolean;
  payout: CreatorPayoutState | undefined;
  payoutError: boolean;
  dismissedIds: string[];
  now: number;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/donny/buildCreatorProposals.test.ts
import { describe, it, expect } from 'vitest';
import { buildCreatorProposals } from './buildCreatorProposals';

const EMPTY = {
  invitations: [], invitationsError: false,
  contentTodo: [], contentTodoError: false,
  applications: [], applicationsError: false,
  payout: { hasStripeAccount: false, onboardingComplete: false, pendingBalance: 0, collaborationCount: 0 },
  payoutError: false,
  dismissedIds: [] as string[],
  now: Date.parse('2026-08-10T16:00:00Z'),
};
const invite = (id: string) => ({
  invitationId: `i${id}`, campaignId: `c${id}`, campaignTitle: `Campaign ${id}`,
  businessName: 'Joe\'s Pizza', createdAt: '2026-08-02T14:00:00Z',
});
const ids = (r: ReturnType<typeof buildCreatorProposals>) => r.proposals.map((p) => p.id);

describe('item C — payouts', () => {
  it('is absent when onboarding is complete', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: true, onboardingComplete: true, pendingBalance: 0, collaborationCount: 2 } });
    expect(ids(r).some((i) => i.startsWith('creator:payout'))).toBe(false);
  });

  it('leads with the money when a balance exists, whatever the flag says', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: true, onboardingComplete: false, pendingBalance: 360, collaborationCount: 1 } });
    expect(ids(r)[0]).toBe('creator:payout');
    expect(r.proposals[0].text).toContain('$360');
    expect(r.proposals[0].text).not.toContain('Finish');
  });

  it('is SILENT when an account exists, the flag is false, and there is no balance', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: true, onboardingComplete: false, pendingBalance: 0, collaborationCount: 0 } });
    expect(ids(r).some((i) => i.startsWith('creator:payout'))).toBe(false);
  });

  it('says set up payouts when there is no stripe account', () => {
    const r = buildCreatorProposals(EMPTY);
    expect(ids(r)).toContain('creator:payout');
  });

  it('ranks BELOW find-work when there is no money and no work', () => {
    const r = buildCreatorProposals(EMPTY);
    expect(ids(r)).toEqual(['creator:find_work', 'creator:payout']);
  });

  it('ranks FIRST when a collaboration exists', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: false, onboardingComplete: false, pendingBalance: 0, collaborationCount: 1 },
      contentTodo: [{ collaborationId: 'k1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', createdAt: '2026-08-01T00:00:00Z' }] });
    expect(ids(r)[0]).toBe('creator:payout');
  });
});

describe('item D — invitations', () => {
  it('emits ONE row per invitation, not an aggregate', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1'), invite('2')] });
    expect(ids(r)).toContain('creator:invitation:c1');
    expect(ids(r)).toContain('creator:invitation:c2');
  });

  it('never implies an assignment', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1')] });
    const text = r.proposals.find((p) => p.id === 'creator:invitation:c1')!.text;
    expect(text).toContain('asked you to apply');
    expect(text).not.toMatch(/selected|accept|assigned/i);
  });
});

describe('item E — find work', () => {
  it('fires only when nothing is in flight', () => {
    expect(ids(buildCreatorProposals(EMPTY))).toContain('creator:find_work');
  });

  it('does not fire when an invitation exists', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1')] });
    expect(ids(r)).not.toContain('creator:find_work');
  });

  it('does not fire when a collaboration exists', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, collaborationCount: 1 } });
    expect(ids(r)).not.toContain('creator:find_work');
  });
});

describe('errors and contract', () => {
  it('an errored input contributes no proposal, never a zero', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: undefined, invitationsError: true });
    expect(ids(r).some((i) => i.startsWith('creator:invitation'))).toBe(false);
  });

  it('blocker is always null for creators', () => {
    expect(buildCreatorProposals(EMPTY).blocker).toBeNull();
  });

  it('allProposalIds holds the full pre-cap list so a dismissal below the cap is not resurrected', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      invitations: [invite('1'), invite('2'), invite('3'), invite('4')] });
    expect(r.proposals.length).toBe(3);
    expect(r.allProposalIds.length).toBeGreaterThan(3);
    expect(r.overflowCount).toBeGreaterThan(0);
  });

  it('respects dismissals', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1')],
      dismissedIds: ['creator:invitation:c1'] });
    expect(ids(r)).not.toContain('creator:invitation:c1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/donny/buildCreatorProposals.test.ts
```
Expected: FAIL — `Failed to resolve import "./buildCreatorProposals"`.

- [ ] **Step 3: Implement**

Mirror `buildDonnyProposals.ts`: pure, injected `now`, no `Date.now()`, reuse its `routeCta()` so an unknown route downgrades to text rather than a dead button. Export the result type from there.

Ranking (spec §4.4) — five item types share `PROPOSAL_CAP = 3`, and `buildDonnyProposals` deliberately does not rank across kinds, so state the order explicitly:
```ts
const hasMoneyOrWork = payout.pendingBalance > 0 || payout.collaborationCount > 0;
const ranked = hasMoneyOrWork
  ? [...payoutProposals, ...contentProposals, ...applicationProposals, ...invitationProposals]
  : [...contentProposals, ...applicationProposals, ...invitationProposals, ...findWorkProposals, ...payoutProposals];
```
Within a type, newest first on `occurredAt`. `occurredAt` sources: A → `campaign_collaborations.created_at`; B → `campaign_applications.created_at`; D → `campaign_invitations.created_at`; **C and E carry `null`**, like every business signal — so no null ever reaches a comparator (the business builder's `Date.parse(x ?? '')` yields `NaN`, which would make a mixed sort non-deterministic).

Item C's four states, in order:
```ts
if (payout.onboardingComplete) return [];                       // disappears for the 3 already set up
if (payout.pendingBalance > 0)
  return [proposal(`You have ${formatMoney(payout.pendingBalance)} waiting — check your payout setup`)];
if (!payout.hasStripeAccount)
  return [proposal('Set up payouts so you can get paid')];
return [];                                                      // ambiguous: account set, flag false, no balance
```
The last branch is silent on purpose: the flag is known to go stale-false (#173), the only verifier calls Stripe from the backend, and telling someone who is already set up to go set up is the #357 false-"verify your email" class — on the top item of the page.

`formatMoney` is local to this module and takes whole dollars (`creator_profiles.pending_balance` is `numeric` in dollars, not cents — verified on prod, the live row holds `360`):
```ts
const formatMoney = (dollars: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
```

Item D copy, one row per invitation: `` `${businessName} asked you to apply to "${campaignTitle}"` ``. Item E: `'Nothing on your plate — find your next campaign'`, `occurredAt: null`, **no count** — it takes no query, deriving purely from the absence of A/B/D and any collaboration.

`kind`/`dismissible`: A, B, D are `'pending_action'` and dismissible; C and E are `'signal'` and **not** dismissible. `blocker` is always `null` — nothing in the creator flow is blocked the way an unready business location blocks campaign creation.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/donny/buildCreatorProposals.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donny/buildCreatorProposals.ts src/lib/donny/buildCreatorProposals.test.ts
git commit -m "feat(creator): buildCreatorProposals — the creator attention list

Same result contract as buildDonnyProposals, so DonnyHomeProposals renders it
unchanged. Payout ranks top only when money or work is in flight, and is silent
in the one state the client cannot resolve."
```

---

### Task 6: `CREATOR_SUGGESTIONS` and the `CreatorDonnyHome` container

**Files:**
- Modify: `src/lib/donny/donnyHomeSuggestions.ts`
- Replace: `src/components/donny/CreatorDonnyHome.tsx` (the Task 3 stub)

**Interfaces:**
- Consumes: `useDonnyHomeConversation` (Task 1), `DonnyHomeShell` (Task 2), the four hooks (Task 4), `buildCreatorProposals` (Task 5)

- [ ] **Step 1: Add the suggestions**

```ts
// Two taps, not three. Only rewards_agent is proven creator-real: its own read,
// dre_user_aggregates, returns real standing for real creators on prod.
// billing_agent reads `organizations` and would hand a creator the RESTAURANT
// subscription catalog, and NO agent can answer "find work" — find_creators
// returns creators, campaign_agent returns only campaigns the creator is
// already in. Both became route-based attention items instead.
//
// The wording is load-bearing, not decorative: nothing role-gates the tool list,
// so a tap's phrasing is the only thing steering the model's choice. Keep the
// distinctive nouns, and keep every tap NON-money-shaped so billing_agent is
// unreachable from this row.
//
// Do not add a third without re-running the capability audit — and note that
// donny_tool_executions CANNOT be the instrument: its insert sits inside the
// isSocialTool() branch, so no sub-agent has ever been logged, for any role.
export const CREATOR_SUGGESTIONS: DonnySuggestion[] = [
  { label: 'My DC Points', message: "How many DC Points do I have and what's my creator standing?" },
  { label: 'My applications', message: "What's happening with my campaign applications?" },
];
```

- [ ] **Step 2: Write the container**

Mirror `DonnyHome`'s structure: call `useDonnyHomeConversation()`, the four creator hooks, `useTour`, `useAnalyticsContext`, `useAuth`; hold `sessionDismissed` state; run the same two-pass memo (build once for `allProposalIds`, read `readDismissedProposalIds` for those, build again with dismissals applied) — the two-pass shape exists so dismissing a proposal ranked below the cap does not resurrect it.

Render:
```tsx
<DonnyHomeShell
  userRole="content_creator"
  roleLabel="Creator Dashboard"
  greetingName={profile?.creator_name || profile?.full_name || 'there'}
  subtitle="Tell me what you need and I'll take it from here."
  overviewRoute="/dashboard/creator/overview"
  onOverviewOpen={() => void trackEvent('donny_home_overview_opened', {})}
  suggestions={CREATOR_SUGGESTIONS}
  onSubmit={handlePromptSubmit}
  onSuggestionTap={handleSuggestionTap}
  profileLoaded={!!profile}
  tourAnchors={{ prompt: 'browse-campaigns', overview: 'creator-secondary' }}
  conversation={conversation}
  tour={tour}
>
  <div data-tour="creator-attention">
    <DonnyHomeProposals result={result} isLoading={isLoading} onDismiss={handleDismiss} onTap={handleProposalTap}>
      <RatingPromptManager variant="row" />
    </DonnyHomeProposals>
  </div>
</DonnyHomeShell>
```
No `badge` — `LocationBadge` is org-scoped and creators have no org. No `SponsorshipRatingPromptManager` — that is a business concern.

`handleProposalTap` routes `cta.kind === 'route'` through `navigate()` and `cta.kind === 'ask'` through `conversation.ask()`, exactly as `DonnyHome.tsx:340-353` does.

- [ ] **Step 3: Typecheck and build**

```bash
npm run typecheck && npm run build
```
Expected: both clean.

- [ ] **Step 4: Full suite — nothing else regressed**

```bash
npx vitest run
```
Expected: green from this worktree. Investigate any red; it is a real regression here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donny/donnyHomeSuggestions.ts src/components/donny/CreatorDonnyHome.tsx
git commit -m "feat(creator): Donny-first creator dashboard body

Two taps, both proven at the data layer. Find-work and get-paid are route-based
attention items rather than asks — no agent can answer the first, and the second
would route a creator into the restaurant subscription catalog."
```

---

### Task 7: Re-point `CREATOR_TOUR` and add the parity test

**Files:**
- Modify: `src/lib/tours/role-tours.ts:32-53`
- Create: `src/lib/tours/creatorTourAnchors.test.tsx`

- [ ] **Step 1: Write the failing parity test**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { CREATOR_TOUR } from './role-tours';

// Chrome selectors are OUT OF SCOPE: donny-help lives in DonnyNavButton inside
// DashboardLayout, which these tests mock — asserting it would fail against a
// mock rather than a real regression. Same reasoning covers org-switcher and
// bottom-nav-add on the business side.
const CHROME = ["[data-tour='donny-help']"];

describe('CREATOR_TOUR anchors resolve on both creator pages', () => {
  it('every page-owned step is present on the Donny dashboard and the overview', () => {
    const bodySteps = CREATOR_TOUR.filter((s) => !CHROME.includes(s.target));
    expect(bodySteps.length).toBe(3);
    for (const step of bodySteps) {
      expect(renderCreatorDonnyHome().container.querySelector(step.target), 
        `${step.target} missing from CreatorDonnyHome`).not.toBeNull();
      expect(renderCreatorOverview().container.querySelector(step.target),
        `${step.target} missing from CreatorOverview`).not.toBeNull();
    }
  });
});
```
The two render helpers go above that `describe`, in the same file. `vi.mock` calls hoist, so they must sit at module scope:

```tsx
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { stubMatchMedia } from '@/test/stubMatchMedia';
import type { ReactNode } from 'react';

// DonnyHomePrompt's textarea branches on useIsMobile, which subscribes to
// window.matchMedia on mount; jsdom has none.
stubMatchMedia();

vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({
    sendMessage: vi.fn(), registerInlineConversation: vi.fn(() => vi.fn()),
    retry: vi.fn(), retryLoadMessages: vi.fn(), openDonnyWithContext: vi.fn(),
    close: vi.fn(), avatarState: 'idle', userRole: 'content_creator',
    conversation: { id: 'c1' }, messages: [], messagesLoaded: true,
    messagesErrored: false, isStreaming: false, streamingContent: '', error: null,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { full_name: 'Ada', creator_name: 'Ada', role: 'content_creator' }, activeOrgUnit: null }),
}));
vi.mock('@/components/analytics/AnalyticsProvider', () => ({
  useAnalyticsContext: () => ({ trackEvent: vi.fn() }),
}));
vi.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useTour', () => ({
  useTour: () => ({ showTour: false, tourSteps: [], completeTour: vi.fn(), skipTour: vi.fn(), triggerTour: vi.fn() }),
}));
vi.mock('@/components/reviews/RatingPromptManager', () => ({
  RatingPromptManager: () => <div data-testid="rating-prompt" />,
}));

// The four creator hooks: one invitation and one collaboration, so item D and
// item A both render and the attention region is never empty — the anchor must
// be measurable, not merely present.
vi.mock('@/hooks/useCreatorAttentionInvitations', () => ({
  useCreatorAttentionInvitations: () => ({ data: [{ invitationId: 'i1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', businessName: "Joe's Pizza", createdAt: '2026-08-02T14:00:00Z' }], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useCreatorContentTodo', () => ({
  useCreatorContentTodo: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useCreatorPendingApplications', () => ({
  useCreatorPendingApplications: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useCreatorPayoutState', () => ({
  useCreatorPayoutState: () => ({ data: { hasStripeAccount: false, onboardingComplete: false, pendingBalance: 0, collaborationCount: 1 }, isLoading: false, isError: false }),
}));

import { CreatorDonnyHome } from '@/components/donny/CreatorDonnyHome';
import CreatorOverview from '@/pages/CreatorOverview';

const renderCreatorDonnyHome = () =>
  render(<MemoryRouter><CreatorDonnyHome /></MemoryRouter>);
const renderCreatorOverview = () =>
  render(<MemoryRouter><CreatorOverview /></MemoryRouter>);
```

`CreatorOverview` mounts several DragonShare/Outstand hooks that hit Supabase. Mock each one it imports the same way — `vi.mock('@/hooks/useDragonShare', ...)` and friends — returning `{ data: undefined, isLoading: false }`; the test only asserts anchor presence, so nothing needs real rows. If a mock is missing, the failure is an unhandled Supabase call at render, not a missing anchor — read the error before assuming the anchor is wrong.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/tours/creatorTourAnchors.test.tsx
```
Expected: FAIL — `CREATOR_TOUR` still targets `profile-completion` and `dragonshare-nav`, which exist on neither page after Task 3.

- [ ] **Step 3: Re-point the tour**

```ts
export const CREATOR_TOUR: TourStep[] = [
  {
    target: "[data-tour='browse-campaigns']",
    title: "Ask Donny for work",
    body: "Tell Donny what you're looking for, or browse every open campaign.",
  },
  {
    target: "[data-tour='creator-attention']",
    title: "What needs you",
    body: "Invitations, content to start, and anything waiting on a reply — all here.",
  },
  {
    target: "[data-tour='creator-secondary']",
    title: "Your full dashboard",
    body: "Earnings, DragonShare and your stats live on the full dashboard.",
  },
  {
    target: "[data-tour='donny-help']",
    title: "Ask Donny",
    body: "Stuck on anything? Ask Donny.",
  },
];
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/tours/creatorTourAnchors.test.tsx
```
Expected: PASS. If an anchor is missing, add it in the page that lacks it — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tours/role-tours.ts src/lib/tours/creatorTourAnchors.test.tsx
git commit -m "fix(tour): re-point CREATOR_TOUR at anchors that exist on both creator pages

Three of its four steps targeted elements in the body that moved to
CreatorOverview. useTour is role-keyed with no page awareness and both pages
render a TourButton, so every step must resolve on both — now enforced by a test,
because that invariant rotting silently is how this broke."
```

---

### Task 8: Review gates

**Files:** none — verification only.

- [ ] **Step 1: Full verification**

```bash
npm run typecheck && npm run lint && npm run build && npx vitest run
```
All four clean. `DonnyHome.test.tsx` must still report **37 passed** with no edits.

- [ ] **Step 2: `/simplify`**

Run the `/simplify` skill over the branch diff and apply what it finds.

- [ ] **Step 3: Codex second review**

```bash
codex review --base main --title "Donny-first creator dashboard (Phase 3)"
```
Fix what it flags and re-run until clean. **A blank run is a failed gate, not a pass.** Relay its summary verdict to the founder.

`data-exposure-reviewer` and `edge-function-reviewer` do **not** apply — no service-role read, no RLS policy, no migration, and nothing is deployed (spec §7).

- [ ] **Step 4: Open the PR**

Body must state: no migration, no edge-function deploy, and that `routes.ts` gains one allow-list string that ships un-deployed by design (spec D4).

- [ ] **Step 5: After merge — `verify-prod`, both viewports**

Land on `/dashboard/creator`: resting arrangement, then send and confirm the answer lands inline and the side panel does **not** open. Confirm the hero collapses and the thread is readable on a phone. **Tap both suggestions and confirm each returns something real** — this is the taps' first live exercise, since `donny_tool_executions` can never log them. Follow "← Dashboard" to `/dashboard/creator/overview` and confirm the old body is intact. Reload and confirm you land on the dashboard, not mid-thread. Check the console on both viewports.

If `campaign_agent` returns something unhelpful for a creator with no history, **cut to one tap** rather than ship it — the business version set that precedent. If the campaign board is still all-lapsed, that is a supply finding for the founder, not a reason to hold the branch.

- [ ] **Step 6: `knowledge-sync`**

Wiki session source → `/wiki-ops ingest` → prepend to `docs/SHIPPED_LOG.md` → one-line index entry in `PROJECT_CONTEXT.md` §5 → Donny RAG sync after merge.

Record two things that outlived this branch: **`donny_tool_executions` logs only MCP social tools**, so it cannot prove any sub-agent tap for any role — correcting the claim in `PROJECT_CONTEXT.md` — and **`billing_agent` is wrong for creators**, which is a live defect this phase routed around rather than fixed.
