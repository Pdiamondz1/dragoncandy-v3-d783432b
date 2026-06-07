# iOS Purchase-CTA Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide all 8 subscription/upgrade/billing purchase CTAs in the native iOS app (Apple guideline 3.1.1) while keeping web behavior byte-identical.

**Architecture:** One reusable `WebOnly` component renders its children only on the web (via `useNativePlatform`), `null` in the iOS app. Wrap each of the 8 purchase CTAs in `<WebOnly>`. No CTA logic changes — the CTAs simply don't render on iOS; their read-only surrounding context stays.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind, Vitest (node env; jsdom per-file for DOM tests), Capacitor 6 (`@/lib/platform`, `@/hooks/use-native-platform`).

**Spec:** `docs/superpowers/specs/2026-06-07-ios-purchase-cta-gating-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/components/platform/WebOnly.tsx` | Render children on web only | Create |
| `src/components/platform/WebOnly.test.tsx` | Unit test the boundary | Create |
| `src/components/pricing/TierComparisonGrid.tsx` | wrap per-tier "Choose Plan" button | Modify |
| `src/components/pricing/SoftPaywallSheet.tsx` | wrap "Upgrade to {tier}" button | Modify |
| `src/pages/OrgBillingPage.tsx` | wrap "Manage billing" + "Upgrade plan" buttons | Modify |
| `src/components/donny/DonnyChatView.tsx` | wrap "Upgrade Plan" link | Modify |
| `src/components/outstand/DonnyAutoPilot.tsx` | wrap inline "Upgrade" link | Modify |
| `src/components/outstand/DonnyPerformanceInsights.tsx` | wrap inline "Upgrade" link | Modify |
| `src/components/outstand/DonnyWeeklyPlanner.tsx` | wrap inline "Upgrade" link | Modify |

**Notes for the implementer (read first):**
- Worktree `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\apple-app-store-3` (branch `worktree-apple-app-store-3`). Use the **Bash** tool for npm/npx/git.
- `npm run test` exits non-zero due to unrelated e2e files. Run scoped: `npx vitest run <path>`.
- The `WebOnly` test renders DOM, so it MUST start with `// @vitest-environment jsdom` (global env is `node`). Use plain assertions (`.toBeTruthy()`/`.toBeNull()`), NOT jest-dom matchers (not registered). Mirror `src/components/dragonshare/DragonShareUploadArea.test.tsx`.
- Each wrap is purely additive: surround the existing CTA element with `<WebOnly>…</WebOnly>` and add the import. Do not change the CTA's props, classes, or handlers. Do not wrap the CTA's container (keep the read-only context).
- Line numbers below are approximate — anchor on the shown JSX.
- Do NOT touch marketplace CTAs (`create-campaign-escrow`, `create-sponsorship-checkout`, DragonShare boosts) or the read-only "Upgrade" *strings* in `DragonDashRushButton.tsx` / `InviteModal.tsx` (no link/handler).
- Do NOT fix the legacy `/settings/billing` route in the Donny links — out of scope.

---

## Task 1: `WebOnly` component (TDD)

**Files:**
- Create: `src/components/platform/WebOnly.tsx`
- Test: `src/components/platform/WebOnly.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// src/components/platform/WebOnly.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockPlatform = { isNative: false, isIOS: false };
vi.mock('@/hooks/use-native-platform', () => ({
  useNativePlatform: () => mockPlatform,
}));

import { WebOnly } from './WebOnly';

describe('WebOnly', () => {
  it('renders children on web', () => {
    mockPlatform = { isNative: false, isIOS: false };
    render(<WebOnly><button>Buy</button></WebOnly>);
    expect(screen.queryByText('Buy')).toBeTruthy();
  });

  it('renders nothing in the native app', () => {
    mockPlatform = { isNative: true, isIOS: true };
    render(<WebOnly><button>Buy</button></WebOnly>);
    expect(screen.queryByText('Buy')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/platform/WebOnly.test.tsx`
Expected: FAIL — cannot resolve `./WebOnly`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/platform/WebOnly.tsx
import type { ReactNode } from 'react';
import { useNativePlatform } from '@/hooks/use-native-platform';

/**
 * Renders children only on the web (browser), never in the native iOS app.
 * Used to hide in-app purchase / upgrade / billing CTAs so the iOS build does
 * not sell digital goods or steer users to external purchase (Apple 3.1.1).
 */
export function WebOnly({ children }: { children: ReactNode }) {
  const { isNative } = useNativePlatform();
  return isNative ? null : <>{children}</>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/platform/WebOnly.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/platform/WebOnly.tsx src/components/platform/WebOnly.test.tsx
git commit -m "feat(ios): add WebOnly component to gate in-app purchase CTAs"
```

---

## Task 2: Wrap all 8 purchase CTAs in `<WebOnly>`

For EACH file below: add `import { WebOnly } from '@/components/platform/WebOnly';` near the existing imports, then wrap the indicated element. Nothing else changes.

- [ ] **Step 1: `TierComparisonGrid.tsx` — per-tier CTA button (~line 120)**

Wrap the `<Button>` that calls `onSelectTier`:
```tsx
            {/* CTA */}
            <WebOnly>
              <Button
                onClick={() => onSelectTier?.(tier)}
                className={`mt-6 w-full rounded-full font-semibold ${
                  tier === 'free' && !isHighlighted(tier)
                    ? 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
                    : 'bg-teal-500 hover:bg-teal-600 text-white'
                }`}
              >
                {ctaLabel(tier)}
              </Button>
            </WebOnly>
```

- [ ] **Step 2: `SoftPaywallSheet.tsx` — "Upgrade to {tier}" button (~line 62)**

Wrap only the upgrade button; keep "Maybe later":
```tsx
        <div className="flex flex-col gap-3 mt-6">
          <WebOnly>
            <Button onClick={handleUpgrade} className="w-full rounded-full bg-teal-500">
              Upgrade to {requiredTier}
            </Button>
          </WebOnly>
          <Button variant="outline" onClick={handleDismiss} className="w-full rounded-full">
            Maybe later
          </Button>
        </div>
```

- [ ] **Step 3: `OrgBillingPage.tsx` — "Manage billing" button (~line 75)**

Wrap the button inside the existing `isOwner && tier !== 'free'` guard:
```tsx
            {isOwner && tier !== 'free' && (
              <WebOnly>
                <Button onClick={handleManageBilling} variant="outline" className="gap-2 rounded-full">
                  Manage billing
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </WebOnly>
            )}
```

- [ ] **Step 4: `OrgBillingPage.tsx` — "Upgrade plan" button in the free-tier alert (~line 122)**

Wrap only the `<Button>`; keep the alert text (it names a price — by design):
```tsx
                  <WebOnly>
                    <Button
                      size="sm"
                      disabled={upgrading}
                      onClick={async () => {
                        setUpgrading(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                            body: { tier: 'starter', billing_period: 'monthly', org_id: activeOrg!.id },
                          });
                          if (error) throw error;
                          if (data?.checkout_url) window.location.href = data.checkout_url;
                        } catch (err: unknown) {
                          const message = err instanceof Error ? err.message : String(err);
                          toast({ title: 'Checkout failed', description: message, variant: 'destructive' });
                        } finally {
                          setUpgrading(false);
                        }
                      }}
                      className="mt-3 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
                    >
                      {upgrading ? 'Redirecting…' : 'Upgrade plan'}
                    </Button>
                  </WebOnly>
```

- [ ] **Step 5: `DonnyChatView.tsx` — "Upgrade Plan" link (~line 84)**

Wrap the `<Link>` inside the existing `error.includes('Upgrade')` guard:
```tsx
              {error.includes('Upgrade') && (
                <WebOnly>
                  <Link to="/settings/billing"
                    className="text-xs text-dc-teal font-semibold">
                    Upgrade Plan
                  </Link>
                </WebOnly>
              )}
```

- [ ] **Step 6: `DonnyAutoPilot.tsx` — inline "Upgrade" link (~line 56)**

Wrap only the `<a>`; keep the "requires Growth plan" text:
```tsx
            <p>Auto-Pilot requires Growth plan or higher. <WebOnly><a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></WebOnly></p>
```

- [ ] **Step 7: `DonnyPerformanceInsights.tsx` — inline "Upgrade" link (~line 70)**

```tsx
        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <WebOnly><a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></WebOnly></p>
```

- [ ] **Step 8: `DonnyWeeklyPlanner.tsx` — inline "Upgrade" link (~line 42)**

```tsx
        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <WebOnly><a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></WebOnly></p>
```

- [ ] **Step 9: Confirm all 8 wraps + imports are present**

Run: `git grep -c "WebOnly" -- src/components/pricing/TierComparisonGrid.tsx src/components/pricing/SoftPaywallSheet.tsx src/pages/OrgBillingPage.tsx src/components/donny/DonnyChatView.tsx src/components/outstand/DonnyAutoPilot.tsx src/components/outstand/DonnyPerformanceInsights.tsx src/components/outstand/DonnyWeeklyPlanner.tsx`
Expected: each file ≥ 2 (1 import + ≥1 wrap); `OrgBillingPage.tsx` ≥ 3 (import + 2 wraps).

- [ ] **Step 10: Typecheck, lint, build**

Run: `npm run typecheck`
Then: `npx eslint src/components/platform/WebOnly.tsx src/components/pricing/TierComparisonGrid.tsx src/components/pricing/SoftPaywallSheet.tsx src/pages/OrgBillingPage.tsx src/components/donny/DonnyChatView.tsx src/components/outstand/DonnyAutoPilot.tsx src/components/outstand/DonnyPerformanceInsights.tsx src/components/outstand/DonnyWeeklyPlanner.tsx`
Then: `npm run build`
Expected: all pass.

- [ ] **Step 11: Manual web regression**

Run `npm run dev` and confirm in the browser (web = `isNative === false`) that every CTA still renders: the pricing page "Choose Plan" buttons, the soft paywall "Upgrade to …", the billing "Manage billing" and free-tier "Upgrade plan", the Donny chat upgrade-error "Upgrade Plan" link, and the three locked Donny cards' "Upgrade" links.

- [ ] **Step 12: Commit**

```bash
git add src/components/pricing/TierComparisonGrid.tsx src/components/pricing/SoftPaywallSheet.tsx src/pages/OrgBillingPage.tsx src/components/donny/DonnyChatView.tsx src/components/outstand/DonnyAutoPilot.tsx src/components/outstand/DonnyPerformanceInsights.tsx src/components/outstand/DonnyWeeklyPlanner.tsx
git commit -m "feat(ios): gate all 8 subscription/upgrade CTAs behind WebOnly"
```

---

## Task 3: Final verification & integration

- [ ] **Step 1: Run the WebOnly test**

Run: `npx vitest run src/components/platform/WebOnly.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed.

- [ ] **Step 3: Push the branch**

```bash
git push origin worktree-apple-app-store-3
```

- [ ] **Step 4: Open a PR to `main`**

`gh pr create --base main --head worktree-apple-app-store-3` with a title/body summarizing the CTA-gating slice. Wait for required checks (`lighthouse`, `verify`, `smoke`), then merge per the team flow.

> **Device verification (deferred):** on a real iPhone via TestFlight, confirm none of the 8 CTAs are reachable and the read-only context (current plan, tier comparison, "requires {plan}" messaging) still shows.

---

## Definition of Done

- `WebOnly` renders children on web and `null` in the native app (2 unit tests pass).
- All 8 purchase CTAs are wrapped in `<WebOnly>`; each file imports it; the grep check confirms counts.
- Web behavior is byte-identical (all CTAs still render and function in the browser).
- `npm run typecheck` and `npm run build` pass; eslint clean on all touched files.
- No marketplace/escrow/sponsorship CTA touched; legacy billing-route bug left as-is (out of scope).
