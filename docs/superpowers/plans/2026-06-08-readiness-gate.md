# Transaction Readiness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-block a creator/restaurant from committing to a transaction they can't be paid for until their Stripe payout account is ready — with a friendly, self-healing, **fail-open** gate that never falsely blocks a legitimate user.

**Architecture:** A pure status-derivation core (`src/lib/readiness.ts`, exhaustively unit-tested for fail-open) + a thin React-Query hook (`useTransactionReadiness`) that feeds it live `check-*-payout-status` data + social status + a reusable `ReadinessGate` component inserted ONLY at the 3 receiver commitment controls. Server-side fallbacks (`pending_balance` park + auto-flush, boost 202 park) are untouched and remain the money-safety guarantee, so the gate is a UX layer that can fail-open safely. Whole gate is feature-flagged for staged rollout.

**Tech Stack:** React 18 + TS, @tanstack/react-query, Vitest + @testing-library/react (jsdom), shadcn/ui, Supabase edge functions (Deno) for the one server nudge.

**Design doc:** the approved plan at `C:\Users\dwill\.claude\plans\we-need-documentation-and-groovy-raven.md` (read it for full rationale + decisions).

---

## Conventions (read once)

- Tests are co-located Vitest files. Component/DOM tests need `// @vitest-environment jsdom` as the FIRST line. The repo has **no jest-dom** — assert with `toBeTruthy()` / `toBeNull()` / `toBe(...)`, NOT `toBeInTheDocument()`. Pattern reference: `src/components/schedule/PostCard.test.tsx`.
- Run a single test: `npx vitest run src/lib/readiness.test.ts`. The exit code may be non-zero from unrelated pre-existing failing files — trust the per-file "Tests N passed" line, not the exit code.
- `npm run typecheck` and `npm run build` must pass before pushing.
- Feature flags: `src/lib/featureConfig.ts` has only a **build-time constant** `BRAND_ROLE_ENABLED = false` (no runtime hook). But a real DB-backed `feature_flags` table **exists** (migration `20250617160641…`): columns `name` (unique), `is_enabled` (bool, default false), `rollout_percentage`, `target_roles text[]`, `environment` (default `'production'`), with **public-read RLS** (`SELECT USING (true)`). We use this table so the gate has an **instant kill-switch** (flip `is_enabled` in the DB — no redeploy) and **staging-first** rollout (separate row per `environment`). Task 0 below builds the missing `useFeatureFlag` hook. v1 honors `is_enabled` only; `rollout_percentage`/`target_roles` are available for later ops use (YAGNI at ~30 users — do not implement percentage logic now). **Fail-safe: the hook returns `false` (gate off → pass-through) on any error or missing row**, which is the safe direction.

---

## Task 0: `useFeatureFlag` hook (DB-backed, fail-safe off)

**Files:**
- Create: `src/hooks/useFeatureFlag.ts`

- [ ] **Step 1: Implement**
```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Reads public.feature_flags by name. Fail-safe: returns false (off) on any error
 *  or missing row, so an unreadable flag never blocks anyone. v1 honors is_enabled
 *  only; rollout_percentage/target_roles/environment exist for ops use later. */
export function useFeatureFlag(name: string): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', name],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('is_enabled')
        .eq('name', name)
        .maybeSingle();
      if (error) return false;
      return !!data?.is_enabled;
    },
    staleTime: 5 * 60_000,
  });
  return data ?? false;
}
```
- [ ] **Step 2: Typecheck** — `npm run typecheck` exit 0.
- [ ] **Step 3: Commit** — `git add src/hooks/useFeatureFlag.ts && git commit -m "feat(flags): DB-backed useFeatureFlag hook (fail-safe off)"`

> Rollout (ops, no redeploy): insert a `feature_flags` row `name='READINESS_GATE_ENABLED'`. Set `is_enabled=true` on the **staging** project first to validate, then on **prod**. Flip `is_enabled=false` = instant kill-switch.

---

## Task 1: Pure readiness-derivation core + tests (TDD)

**Files:**
- Create: `src/lib/readiness.ts`
- Test: `src/lib/readiness.test.ts`

This is the heart of the fail-open behavior. It is pure (no React, no network) so we can exhaustively test it.

- [ ] **Step 1: Write the failing test** `src/lib/readiness.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { deriveReadiness, type ReadinessInput } from './readiness';

const base: ReadinessInput = {
  require: { stripe: true, social: false },
  stripeQuery: { isLoading: false, isError: false, data: { hasAccount: true, onboardingComplete: true, chargesEnabled: true, payoutsEnabled: true, platformPendingBalance: 0 } },
  socialHasActive: true,
  socialReconnectNeeded: [],
  previousAccountId: null,
};

describe('deriveReadiness — fail-open', () => {
  it('blocks only on a definitive not-ready (no account)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: false, data: { hasAccount: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0 } } });
    expect(r.status).toBe('no_account');
    expect(r.isReady).toBe(false);
    expect(r.shouldBlock).toBe(true);
  });

  it('ALLOWS while loading (fail-open, no block)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: true, isError: false, data: undefined } });
    expect(r.status).toBe('loading');
    expect(r.shouldBlock).toBe(false);
  });

  it('ALLOWS on query error (fail-open, no block)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: true, data: undefined } });
    expect(r.status).toBe('indeterminate');
    expect(r.shouldBlock).toBe(false);
  });

  it('ALLOWS when data is missing despite not loading (fail-open)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: false, data: undefined } });
    expect(r.shouldBlock).toBe(false);
  });

  it('ready when account onboarded', () => {
    const r = deriveReadiness(base);
    expect(r.status).toBe('ready');
    expect(r.isReady).toBe(true);
    expect(r.shouldBlock).toBe(false);
  });

  it('verification_pending when account exists but not onboarded', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: false, data: { hasAccount: true, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0 } } });
    expect(r.status).toBe('verification_pending');
    expect(r.shouldBlock).toBe(true);
  });

  it('reconnect_needed only when social required and a platform needs reconnect', () => {
    const needs = [{ platform: 'instagram', platformHandle: '@x' }];
    const blocked = deriveReadiness({ ...base, require: { stripe: true, social: true }, socialHasActive: false, socialReconnectNeeded: needs });
    expect(blocked.status).toBe('reconnect_needed');
    const ignored = deriveReadiness({ ...base, require: { stripe: true, social: false }, socialReconnectNeeded: needs });
    expect(ignored.status).toBe('ready'); // social not required → ignored
  });

  it('requireStripe:false never blocks on stripe', () => {
    const r = deriveReadiness({ ...base, require: { stripe: false, social: false }, stripeQuery: { isLoading: false, isError: false, data: { hasAccount: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0 } } });
    expect(r.shouldBlock).toBe(false);
    expect(r.status).toBe('ready');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/lib/readiness.test.ts`
Expected: FAIL — `deriveReadiness` not found.

- [ ] **Step 3: Implement `src/lib/readiness.ts`**

```ts
export interface PayoutStatusData {
  hasAccount: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  platformPendingBalance: number;
  accountId?: string;
}

export interface ReconnectNeededPlatform { platform: string; platformHandle?: string | null; }

export interface ReadinessInput {
  require: { stripe?: boolean; social?: boolean };
  stripeQuery: { isLoading: boolean; isError: boolean; data: PayoutStatusData | undefined };
  socialHasActive: boolean;
  socialReconnectNeeded: ReconnectNeededPlatform[];
  previousAccountId: string | null;
}

export type ReadinessStatus =
  | 'loading' | 'indeterminate' | 'ready'
  | 'no_account' | 'verification_pending' | 'reconnect_needed';

export interface ReadinessResult {
  status: ReadinessStatus;
  isReady: boolean;
  shouldBlock: boolean;      // hard mode blocks IFF this is true (definitive not-ready only)
  missingStripe: boolean;
  missingSocial: boolean;
  stripe: PayoutStatusData & { previousAccountId: string | null };
  social: { hasActive: boolean; reconnectNeeded: ReconnectNeededPlatform[] };
}

const EMPTY_STRIPE: PayoutStatusData = {
  hasAccount: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0,
};

/**
 * Pure, fail-open readiness derivation.
 * shouldBlock is true ONLY on a DEFINITIVE not-ready answer (the live check
 * returned data saying the account isn't usable, or a required social platform
 * needs reconnect). Loading / error / missing-data → indeterminate → DO NOT block.
 * The server-side pending_balance park + auto-flush remain the money-safety net,
 * so failing open here can never strand money.
 */
export function deriveReadiness(input: ReadinessInput): ReadinessResult {
  const requireStripe = input.require.stripe ?? false;
  const requireSocial = input.require.social ?? false;
  const { stripeQuery } = input;

  const stripe = { ...(stripeQuery.data ?? EMPTY_STRIPE), previousAccountId: input.previousAccountId };
  const social = { hasActive: input.socialHasActive, reconnectNeeded: input.socialReconnectNeeded };

  // Indeterminate (fail-open): we never got a definitive answer.
  const stripeIndeterminate = requireStripe && (stripeQuery.isLoading || stripeQuery.isError || stripeQuery.data === undefined);
  if (stripeIndeterminate) {
    const status: ReadinessStatus = stripeQuery.isLoading ? 'loading' : 'indeterminate';
    return { status, isReady: false, shouldBlock: false, missingStripe: false, missingSocial: false, stripe, social };
  }

  // Definitive Stripe evaluation
  let stripeReady = true;
  let stripeStatus: ReadinessStatus = 'ready';
  if (requireStripe) {
    const d = stripeQuery.data!;
    if (!d.hasAccount) { stripeReady = false; stripeStatus = 'no_account'; }
    else if (!d.onboardingComplete) { stripeReady = false; stripeStatus = 'verification_pending'; }
  }

  // Social (only when required)
  let socialReady = true;
  let socialStatus: ReadinessStatus | null = null;
  if (requireSocial && !social.hasActive && social.reconnectNeeded.length > 0) {
    socialReady = false; socialStatus = 'reconnect_needed';
  } else if (requireSocial && !social.hasActive) {
    socialReady = false; socialStatus = 'no_account';
  }

  const isReady = stripeReady && socialReady;
  const status: ReadinessStatus = isReady ? 'ready' : (!stripeReady ? stripeStatus : socialStatus!);
  return {
    status, isReady, shouldBlock: !isReady,
    missingStripe: requireStripe && !stripeReady,
    missingSocial: requireSocial && !socialReady,
    stripe, social,
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/readiness.test.ts`
Expected: PASS — all cases (the "Tests N passed" line).

- [ ] **Step 5: Commit**
```bash
git add src/lib/readiness.ts src/lib/readiness.test.ts
git commit -m "feat(readiness): pure fail-open readiness derivation core + tests"
```

---

## Task 2: `useTransactionReadiness` hook (thin React-Query wrapper)

**Files:**
- Create: `src/hooks/useTransactionReadiness.ts`
- Read first: `src/components/settings/StripeConnectSetup.tsx:79-92` (the exact `check-*-payout-status` invoke pattern, incl. `?org_unit_id=`), `src/hooks/outstand/useLocationSocialAccounts.ts`, `src/hooks/outstand/useReconnectNeeded.ts`, `src/hooks/useAuth.ts` (for `user`, `activeOrgUnit`).

No new unit test (it's a thin wrapper over `deriveReadiness`, which is fully tested, plus React Query + the existing social hooks). Verified via typecheck + the gate's manual tests.

- [ ] **Step 1: Implement the hook**

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useReconnectNeeded } from '@/hooks/outstand/useReconnectNeeded';
import { deriveReadiness, type PayoutStatusData, type ReadinessResult } from '@/lib/readiness';

export type ReadinessRole = 'creator' | 'business';

export interface UseTransactionReadinessOpts {
  requireStripe?: boolean;
  requireSocial?: boolean;
  orgUnitId?: string | null;
  enabled?: boolean;
}

export interface TransactionReadiness extends ReadinessResult {
  refetch: () => Promise<void>;
}

export function useTransactionReadiness(
  role: ReadinessRole,
  opts: UseTransactionReadinessOpts = {},
): TransactionReadiness {
  const { user } = useAuth();
  const { requireStripe = true, requireSocial = false, orgUnitId = null, enabled = true } = opts;
  const queryClient = useQueryClient();
  const statusFn = role === 'creator' ? 'check-creator-payout-status' : 'check-restaurant-payout-status';

  const stripeQuery = useQuery({
    queryKey: ['payout-status', role, orgUnitId],
    queryFn: async (): Promise<PayoutStatusData> => {
      const params = orgUnitId ? `?org_unit_id=${orgUnitId}` : '';
      const { data, error } = await supabase.functions.invoke(`${statusFn}${params}`);
      if (error) throw error;
      return data as PayoutStatusData;
    },
    enabled: enabled && !!user && requireStripe,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Social status (only meaningful for business + requireSocial; creator never requires social)
  const { data: socialAccounts = [] } = useLocationSocialAccounts(user?.id, orgUnitId);
  // NOTE: useReconnectNeeded returns a React Query result — the array is on .data
  // (confirmed at the real call site src/components/.../ConnectedAccountsList.tsx).
  const { data: reconnectNeeded = [] } = useReconnectNeeded(user?.id);

  const result = deriveReadiness({
    require: { stripe: requireStripe, social: requireSocial },
    stripeQuery: { isLoading: stripeQuery.isLoading, isError: stripeQuery.isError, data: stripeQuery.data },
    socialHasActive: (socialAccounts?.length ?? 0) > 0,
    socialReconnectNeeded: (reconnectNeeded ?? []) as { platform: string; platformHandle?: string | null }[],
    previousAccountId: null,
  });

  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['payout-status', role, orgUnitId] }),
    ]);
  }, [queryClient, role, orgUnitId]);

  return { ...result, refetch };
}
```

> NOTE during implementation: verify the actual return shapes of `useLocationSocialAccounts` and `useReconnectNeeded` (names/types) and adapt the two adapter lines accordingly. If `useReconnectNeeded` returns objects keyed differently, map to `{ platform, platformHandle }`. Do not change those hooks.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add src/hooks/useTransactionReadiness.ts
git commit -m "feat(readiness): useTransactionReadiness live-status hook"
```

---

## Task 3: `ReadinessGate` component + `ReadinessChecklistCard`

**Files:**
- Create: `src/components/ReadinessChecklistCard.tsx` (presentational), `src/components/ReadinessGate.tsx`
- Test: `src/components/ReadinessGate.test.tsx`
- Read first: `src/components/dragonshare/AmplificationPreview.tsx` (soft-hint visual pattern), `src/components/settings/StripeConnectSetup.tsx` (status colors), and how routing/navigation is done (`react-router` `useNavigate`).

The gate must be testable without real network. Achieve this by having `ReadinessGate` accept its readiness via the hook, but allow injecting a readiness object in tests OR (preferred) test the **decision** through `deriveReadiness` already (Task 1) and test only the gate's render branches with a mocked `useTransactionReadiness`.

- [ ] **Step 1: Write `ReadinessChecklistCard.tsx`** (pure presentational; no data fetching)

```tsx
import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, Unplug } from 'lucide-react';
import type { ReadinessStatus } from '@/lib/readiness';

interface Props {
  status: Extract<ReadinessStatus, 'no_account' | 'verification_pending' | 'reconnect_needed'>;
  role: 'creator' | 'business';
  onFinishSetup: () => void;
}

const COPY = {
  no_account: { icon: AlertCircle, title: 'Finish payout setup to get paid', cta: 'Set up payouts',
    body: (r: string) => `Connect your Stripe account so you can ${r === 'creator' ? 'receive' : 'process'} payments. It only takes a minute.` },
  verification_pending: { icon: Clock, title: 'Your payout account is being verified', cta: 'Complete setup',
    body: () => 'Stripe is still verifying your account. Finish the remaining steps to unlock this.' },
  reconnect_needed: { icon: Unplug, title: 'Reconnect your account', cta: 'Reconnect',
    body: () => 'Your connection needs to be re-established before you can continue.' },
} as const;

export function ReadinessChecklistCard({ status, role, onFinishSetup }: Props) {
  const c = COPY[status];
  const Icon = c.icon;
  const tone = status === 'verification_pending' ? 'border-yellow-200 bg-yellow-50' : 'border-teal-200 bg-teal-50';
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${tone}`} role="status">
      <div className="flex items-start gap-2">
        <Icon className="w-5 h-5 mt-0.5 text-dc-teal shrink-0" />
        <div>
          <p className="font-semibold text-dc-text">{c.title}</p>
          <p className="text-sm text-dc-text-muted">{c.body(role)}</p>
        </div>
      </div>
      <Button onClick={onFinishSetup} className="w-full rounded-full bg-teal-500 hover:bg-teal-600">{c.cta}</Button>
    </div>
  );
}
```

- [ ] **Step 2: Write the failing test** `src/components/ReadinessGate.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useReadinessGateEnabled', () => ({ useReadinessGateEnabled: () => true }));
const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useTransactionReadiness', () => ({ useTransactionReadiness: () => readiness.current }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { ReadinessGate } from './ReadinessGate';

function setReadiness(partial: any) {
  readiness.current = { status: 'ready', isReady: true, shouldBlock: false, missingStripe: false, missingSocial: false,
    stripe: { hasAccount: true, onboardingComplete: true, chargesEnabled: true, payoutsEnabled: true, platformPendingBalance: 0, previousAccountId: null },
    social: { hasActive: true, reconnectNeeded: [] }, refetch: async () => {}, ...partial };
}

describe('ReadinessGate', () => {
  it('renders children when ready', () => {
    setReadiness({});
    const { queryByTestId } = render(<ReadinessGate role="creator" require={{ stripe: true }} mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeTruthy();
  });

  it('renders children (fail-open) when shouldBlock is false even if not ready (loading)', () => {
    setReadiness({ status: 'loading', isReady: false, shouldBlock: false });
    const { queryByTestId } = render(<ReadinessGate role="creator" require={{ stripe: true }} mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeTruthy();
  });

  it('blocks (hides children, shows checklist) only when shouldBlock is true in hard mode', () => {
    setReadiness({ status: 'no_account', isReady: false, shouldBlock: true });
    const { queryByTestId, queryByRole } = render(<ReadinessGate role="creator" require={{ stripe: true }} mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeNull();
    expect(queryByRole('status')).toBeTruthy();
  });

  it('soft mode always renders children even when not ready', () => {
    setReadiness({ status: 'no_account', isReady: false, shouldBlock: true });
    const { queryByTestId } = render(<ReadinessGate role="creator" require={{ social: true }} mode="soft"><button data-testid="commit">Boost</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run, verify fail** — `npx vitest run src/components/ReadinessGate.test.tsx` → FAIL (module missing).

- [ ] **Step 4: Implement `ReadinessGate.tsx`**

```tsx
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactionReadiness, type ReadinessRole } from '@/hooks/useTransactionReadiness';
import { useReadinessGateEnabled } from '@/hooks/useReadinessGateEnabled';
import { ReadinessChecklistCard } from '@/components/ReadinessChecklistCard';

interface ReadinessGateProps {
  role: ReadinessRole;
  require: { stripe?: boolean; social?: boolean };
  mode: 'hard' | 'soft';
  inline?: boolean;
  orgUnitId?: string | null;
  children: ReactNode;
  softHint?: ReactNode; // optional custom inline hint for soft mode
}

export function ReadinessGate({ role, require, mode, orgUnitId = null, children, softHint }: ReadinessGateProps) {
  const enabled = useReadinessGateEnabled();
  const navigate = useNavigate();
  const r = useTransactionReadiness(role, {
    requireStripe: require.stripe ?? false,
    requireSocial: require.social ?? false,
    orgUnitId,
    enabled,
  });

  // Flag off → pure pass-through.
  if (!enabled) return <>{children}</>;

  const goToSetup = () => navigate(`/dashboard/${role === 'creator' ? 'creator' : 'business'}/settings?focus=payments`);

  // Soft mode never blocks; show children + an inline hint when not ready.
  if (mode === 'soft') {
    return <>{children}{r.shouldBlock && (softHint ?? null)}</>;
  }

  // Hard mode: block ONLY on a definitive not-ready (fail-open everywhere else).
  if (r.shouldBlock && (r.status === 'no_account' || r.status === 'verification_pending' || r.status === 'reconnect_needed')) {
    return <ReadinessChecklistCard status={r.status} role={role} onFinishSetup={goToSetup} />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 5: Create `src/hooks/useReadinessGateEnabled.ts`** — thin wrapper over the Task 0 hook:
```ts
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
export function useReadinessGateEnabled(): boolean {
  return useFeatureFlag('READINESS_GATE_ENABLED');
}
```

- [ ] **Step 6: Run tests + typecheck** — `npx vitest run src/components/ReadinessGate.test.tsx` (4 passed); `npm run typecheck` exit 0.

- [ ] **Step 7: Commit**
```bash
git add src/components/ReadinessGate.tsx src/components/ReadinessChecklistCard.tsx src/components/ReadinessGate.test.tsx src/hooks/useReadinessGateEnabled.ts
git commit -m "feat(readiness): ReadinessGate component (fail-open, flag-gated) + tests"
```

---

## Task 4: Auto-unlock — invalidate `['payout-status']` on onboarding-return & disconnect

**Files:** Modify `src/components/settings/StripeConnectSetup.tsx`

So a mounted `ReadinessGate` re-renders ready the moment the user finishes/returns from Stripe setup (no manual refresh).

- [ ] **Step 1:** import and use the query client. Add `import { useQueryClient } from '@tanstack/react-query';` and `const queryClient = useQueryClient();` in the component.
- [ ] **Step 2:** In `checkStatus` (after `setStatus(data)`, ~line 86) and in the disconnect/onboarding-return success paths, add `queryClient.invalidateQueries({ queryKey: ['payout-status'] });` so any gate keyed `['payout-status', role, orgUnitId]` refetches. (Invalidating the prefix invalidates all role/org variants — correct here.)
- [ ] **Step 3:** Typecheck (`npm run typecheck` exit 0). Manually reason no behavior change beyond cache invalidation.
- [ ] **Step 4: Commit** — `git commit -m "feat(readiness): invalidate payout-status cache on stripe status change"`

---

## Task 5: Gate the creator apply control (paid campaigns only)

**Files:** Modify `src/pages/CampaignDetailsPage.tsx`
- Read first: the existing `<PrerequisiteGate feature="apply…" inline>` usage (~`:351`) and the surrounding apply/`OneTapApplySheet` control + how the campaign's compensation/rate is available in scope (the "paid" condition).

- [ ] **Step 1:** Determine the "paid" predicate from in-scope campaign data (e.g. `budget > 0` or `effectiveRate > 0` — use whatever the file already computes for compensation; do NOT invent a new query).
- [ ] **Step 2:** Wrap ONLY the apply/send commit control:
```tsx
{isPaid ? (
  <ReadinessGate role="creator" require={{ stripe: true }} mode="hard" inline>
    {/* existing apply control */}
  </ReadinessGate>
) : (
  /* existing apply control unchanged */
)}
```
Leave the existing `PrerequisiteGate` wrapper as-is (it's a no-op) or remove it at this one site — either is fine; do not touch its other 10 call sites.
- [ ] **Step 3:** Typecheck + build (`npm run typecheck && npm run build`). 
- [ ] **Step 4: Commit** — `git commit -m "feat(readiness): gate creator apply on paid campaigns"`

---

## Task 6: Gate the creator counter-offer accept control

**Files:** Modify `src/components/campaigns/DetailedApplicationCard.tsx` (the creator-side counter-offer accept UI).
- Read first: `DetailedApplicationCard.tsx` — `handleAcceptOffer` with `currentUserRole === 'creator'` and the `Accept` button (~line 231). **Do NOT touch `src/components/campaigns/ApplicationCard.tsx` `handleAccept` — that is the business/payer accepting.** Confirm against `src/hooks/useCounterOffers.ts` (`useRespondToCounterOffer`).

- [ ] **Step 1:** Wrap only the creator's `Accept` button in `<ReadinessGate role="creator" require={{ stripe: true }} mode="hard">…</ReadinessGate>`.
- [ ] **Step 2:** Typecheck + build.
- [ ] **Step 3: Commit** — `git commit -m "feat(readiness): gate creator counter-offer acceptance"`

---

## Task 7: Restaurant-as-receiver gate — VERIFY-OR-DEFER

**Reality check (from plan review):** `src/pages/BrandSponsorships.tsx` is the **brand's payer** view (gated behind `BRAND_ROLE_ENABLED = false`, so hidden in prod) — its money buttons are the brand **paying** a restaurant, which must stay smooth. In the **live** app, restaurants are essentially always **payers** (they create/fund campaigns, they boost) — those stay ungated by design. The only restaurant-**receiver** money flow is **sponsorship payouts** (`release-sponsorship-payout`), which is tied to the dormant brand role.

- [ ] **Step 1:** Search for a **live** restaurant-side control where the restaurant *accepts/commits to receive* a sponsorship/payout (not the brand's pay button). Grep sponsorship-accept flows; check whether any such control is reachable without `BRAND_ROLE_ENABLED`.
- [ ] **Step 2a — if a live receiver control exists:** wrap **only that button** in `<ReadinessGate role="business" require={{ stripe: true }} mode="hard" orgUnitId={activeOrgUnit?.id ?? null}>…</ReadinessGate>` (pass the active org unit id, mirroring `StripeConnectSetup`). Typecheck + build + commit.
- [ ] **Step 2b — if none exists (expected):** **DEFER** this gate. Do NOT gate any payer control on `BrandSponsorships.tsx`. Add a one-line note in the PR description: "Restaurant-receiver gate deferred — no live receiver-commitment control today (sponsorship payouts are behind the hidden brand role); will gate when that flow ships." No code change.
- [ ] **Step 3: Commit** (only if 2a) — `git commit -m "feat(readiness): gate restaurant sponsorship acceptance (receiver)"`

---

## Task 8: DragonShare park UX — business card + creator nudge

**Files:**
- Modify: `src/components/dragonshare/BoostConfirmationSheet.tsx` (business-facing queued card)
- Modify: `supabase/functions/boost-payment/index.ts` (creator nudge before the 202 return)
- Read first: `BoostConfirmationSheet.tsx` `queued` branch (~`:69-73`), `src/components/dragonshare/boostOutcome.ts` (co-located, NOT `src/lib/`), and the `donny_nudges` insert pattern in `src/hooks/useCounterOffers.ts` (~`:263-273`, columns `user_id, type, summary, priority, actions, raw_data`) — but emit the nudge SERVER-side from the edge fn for reliability (match `donny_nudges` columns exactly; read a prior insert to confirm).

- [ ] **Step 1 (business UX):** In the `queued` outcome branch, render a persistent teal info card inside the sheet instead of (or in addition to) the transient toast: "{creatorName} is finishing payout setup — your ${amount} boost is queued and won't be charged until they're ready." Reuse the sheet's existing teal info-card styling. Do NOT change `resolveBoostOutcome` or the 202 contract.
- [ ] **Step 2 (creator nudge):** In `boost-payment/index.ts`, immediately before the `return json({ error: 'CREATOR_PAYOUT_NOT_READY', ... }, 202)` (~`:118-125`), add a best-effort `try/catch` block (never block/await-fail the 202) that inserts a `donny_nudges` row + invokes the notification fn for `post.creator_id`: title "A business wants to boost your post", body "Finish your payout setup to get paid for the $X boost", action deep-link `/dashboard/creator/settings?focus=payments`. Match the existing `donny_nudges` column shape (read a prior insert in the codebase to get columns right). Wrap in try/catch and `console.warn` on failure.
- [ ] **Step 3:** Frontend typecheck + build; `"$HOME/.deno/bin/deno" check supabase/functions/boost-payment/index.ts` (allow the known pre-existing repo errors elsewhere; ensure no NEW errors in the lines you touched).
- [ ] **Step 4: Commit** — `git commit -m "feat(readiness): surface queued-boost state + nudge unready creator"`

> Deploy note (deferred to a deploy session): `boost-payment` must be redeployed via Supabase MCP (staging→prod) bundling its existing `_shared` deps. Frontend ships via Lovable on merge to main.

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Automated gates** — `npx vitest run src/lib/readiness.test.ts src/components/ReadinessGate.test.tsx` (all pass); `npm run typecheck` exit 0; `npm run build` exit 0; `npm run lint` (no NEW errors in changed files).
- [ ] **Step 2: Push branch + open PR.** CI `verify` + `smoke` must pass. Frontend-only + one edge-fn change; the edge-fn deploy is a separate session.
- [ ] **Step 3 (post-merge / preview, flag ON for test accounts only):** Manual matrix using the two test accounts (both password `Pdi@mondz1`):
  - **Creator — Ricky Ricardo (`damewillie@gmail.com`):** disconnect his Stripe (he must have `pending_balance==0`) → open a **paid** campaign → browse works, **apply control shows the checklist** (no_account), CTA deep-links to creator settings payments. Reconnect → apply control **auto-unlocks** without manual refresh. Counter-offer accept gated likewise.
  - **Restaurant — Harbormill (`dwilliams@harbormill.net`):** with the restaurant not payout-ready, open sponsorships → browsing works, only the **accept/initiate button** shows the checklist (page not blocked); after setup it unlocks. Confirm `orgUnitId` scoping uses the active location.
  - **Fail-open:** in devtools, block the `check-*-payout-status` network call (offline / bad URL) → confirm the commit controls stay **usable** (no block, no stall). Flag **off** → every gate is pure pass-through.
  - **DragonShare:** boost Ricky's post while he's not payout-ready → business sees the persistent "queued, won't be charged" card; Ricky receives the Donny nudge + notification; after he finishes setup the queued boost charges exactly once.
  - **Payers smooth:** business escrow-pay and boost (payer) show no pre-block.
  - **Viewports:** verify the checklist card on desktop (`lg:`) and mobile base widths.

---

## Out of scope (per design)
- Re-activating `PrerequisiteGate` at its other 10 sites (left as no-op).
- Hard-gating payers before Checkout.
- A `pg_cron` or batch sweep.
- Re-basing `useLocationReadiness` on the new hook (optional later dedupe).
