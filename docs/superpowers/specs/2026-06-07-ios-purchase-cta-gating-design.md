# iOS Purchase-CTA Gating — Design Spec

> **Status:** Draft (pending spec review) · **Created:** 2026-06-07
> **Phase:** Apple App Store roadmap → Phase 3 (compliance), Slice 3a.
> **Roadmap:** `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`
> **Pattern siblings:** `src/lib/nativeCamera.ts`, `src/lib/nativeShare.ts` (platform-gated behavior).

## Context

DragonCandy's web app runs inside a Capacitor iOS shell for the Apple App
Store. Apple's commission (30%, or 15% under the Small Business Program) applies
**only to digital goods/services sold via In-App Purchase inside the iOS app**.
DragonCandy avoids it by **not selling subscriptions or Donny AI credits inside
the app** — those are sold only on the web; the iOS app reflects the user's tier
read-only. Marketplace flows (campaign payments, escrow, DragonShare boosts,
80/20 split) are real-world person-to-person services and **stay on Stripe** on
all surfaces (guideline 3.1.3(e)/3.1.5; precedent Uber/Fiverr/Upwork).

Apple guideline **3.1.1** also forbids "steering" — an app may not include
buttons, links, or CTAs that direct users to purchase outside the app, and
should not even tell users where to do so. So the requirement is to **remove the
purchase CTAs entirely on iOS, with no external pointer** — not to replace them
with "subscribe on the web" links.

## Problem

The app currently renders subscription/upgrade/billing purchase CTAs everywhere,
unconditionally. In the iOS build these would trigger external Stripe checkout
and constitute steering — a top App Store rejection cause. A codebase audit
found **8 CTA spots** (more than the 4 originally tracked).

## Goals

1. In the iOS app, **hide every subscription/upgrade/billing purchase CTA** with
   no external/steering links.
2. **Keep neutral read-only context** so the app stays useful: current-plan
   display, tier comparison (informational), and "requires {plan}" lock
   messaging all remain.
3. Web behavior is **byte-identical** — every CTA still shows in the browser.
4. One small, reusable, tested gating boundary.

## Non-goals (YAGNI)

- No "manage your plan at dragoncandy.io" / "subscribe on web" text anywhere
  (that is steering).
- No changes to marketplace payments — campaign payments, campaign **escrow**
  (`create-campaign-escrow`), DragonShare **boosts**, the 80/20 split, and brand
  **sponsorship** checkout (`create-sponsorship-checkout`) all stay on Stripe on
  all surfaces.
- **Not** fixing the pre-existing wrong route in the Donny upgrade links
  (`/settings/billing` should be `/dashboard/business/billing`) — unrelated bug,
  noted as a follow-up, untouched here.
- Block-user (guideline 1.2) is a separate slice (3b).
- No new in-app messaging about why a CTA is missing beyond the read-only
  context that already exists.

## Architecture & components

### 1. `WebOnly` component — `src/components/platform/WebOnly.tsx`
A single declarative gating boundary. Renders its children only on the web.

```tsx
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

- Depends only on `useNativePlatform` (`src/hooks/use-native-platform.tsx`,
  returns `{ isNative, isIOS }`, read once on mount — platform is immutable).
- Named export (component convention).

### 2. Wrap each purchase CTA in `<WebOnly>`
The 8 spots, anchored by label + handler (confirm exact lines against the working
tree — line numbers below are approximate and may drift):

| # | File | CTA to wrap (hide on iOS) | Read-only context that stays |
|---|---|---|---|
| 1 | `src/components/pricing/TierComparisonGrid.tsx` | per-tier `Button` "Choose Plan"/"Get Started" (`onSelectTier`) | the tier cards + feature lists |
| 2 | `src/components/pricing/SoftPaywallSheet.tsx` | "Upgrade to {tier}" `Button` (`handleUpgrade`) | the feature/limit explanation + close |
| 3 | `src/pages/OrgBillingPage.tsx` | "Manage billing" `Button` (`handleManageBilling`) | current-plan card, seats, team list |
| 4 | `src/pages/OrgBillingPage.tsx` | "Upgrade plan" `Button` in the free-tier alert (inline `create-checkout-session`) | the plans-overview section |
| 5 | `src/components/donny/DonnyChatView.tsx` | "Upgrade Plan" `Link` shown on upgrade-errors | the error message + "Try Again" |
| 6 | `src/components/outstand/DonnyAutoPilot.tsx` | inline "Upgrade" link in the lock tooltip | the locked toggle + "requires Growth" text |
| 7 | `src/components/outstand/DonnyPerformanceInsights.tsx` | inline "Upgrade" link | the locked card + "requires Starter" text |
| 8 | `src/components/outstand/DonnyWeeklyPlanner.tsx` | inline "Upgrade" link | the locked card + "requires Starter" text |

Wrapping pattern is uniform: `<WebOnly><Button …/></WebOnly>` (or the link). The
CTA's existing surrounding conditionals (e.g. OrgBilling's `isOwner && tier !==
'free'`) compose with `WebOnly` unchanged.

**`TierComparisonGrid` note:** it takes an `onSelectTier` callback and renders a
button per tier. Wrap the button (or the per-tier CTA block) so the cards still
render informationally on iOS. The page (`PricingPage`) and route stay reachable;
only the buy buttons disappear on iOS.

## Data flow

No new data flow. `WebOnly` reads `isNative` from `useNativePlatform` and
conditionally renders. On web (`isNative === false`) everything renders exactly
as today; on iOS the wrapped CTAs render `null`.

## Error handling

None added — `WebOnly` is pure presentational gating. The wrapped handlers
(Stripe checkout, billing portal) are simply unreachable on iOS.

## Testing

- **Unit — `WebOnly`** (`src/components/platform/WebOnly.test.tsx`, jsdom):
  mock `useNativePlatform`; assert it renders children when `{ isNative: false }`
  and renders nothing when `{ isNative: true }`. (DOM render test → needs the
  `// @vitest-environment jsdom` first line; use plain assertions like
  `.toBeTruthy()`/`.toBeNull()`, **not** jest-dom matchers — `@testing-library/jest-dom`
  is a devDependency but is **not wired via `setupFiles`**, so its matchers
  aren't registered. Mirror the existing pattern in
  `src/components/dragonshare/DragonShareUploadArea.test.tsx`.)
- **Representative consumer test (optional but recommended)** — one component
  test (e.g. `SoftPaywallSheet` or `TierComparisonGrid`) asserting the upgrade
  CTA is present when `isNative` is false and absent when true, to prove the
  wiring, not just the boundary. Keep to one to avoid over-testing 8 surfaces.
- **Web regression**: `npm run build` + `npm run typecheck`; manually confirm in
  a browser that all 8 CTAs still render and work (web is `isNative === false`).
- **iOS (deferred to TestFlight)**: on a real device confirm none of the 8 CTAs
  are reachable and the read-only context still shows. Verified in Phases 4–5.

## Verification (end-to-end)

1. `npm run typecheck` and `npm run build` pass.
2. `npx vitest run src/components/platform/WebOnly.test.tsx` (+ the consumer test)
   passes.
3. On web (`npm run dev`): every gated CTA still renders and functions — no
   regression on the pricing page, paywall sheet, billing page, Donny chat
   upgrade error, and the three locked Donny feature cards.
4. (Later, on device) none of the 8 CTAs are reachable; read-only context shows.

## Risks

- **Missed CTA.** A purchase CTA left unwrapped is a rejection cause. Mitigation:
  the audit enumerated 8 spots; re-grep before submission for
  `create-checkout-session`, `create-billing-portal-session`, "Upgrade",
  "Choose Plan", "Manage billing" to confirm none are missed. Expected non-CTA
  hits (do **not** wrap): marketplace checkouts (`create-campaign-escrow`,
  `create-sponsorship-checkout`, DragonShare boosts), and two read-only "Upgrade"
  *strings* that are not CTAs — `DragonDashRushButton.tsx` ("Upgrade to unlock
  Rush Posting" — plain text in a disabled div) and `InviteModal.tsx` ("Upgrade
  to Starter to add teammates." — an error-result string). Neither has a
  link/handler.
- **Over-hiding.** Wrapping too much (e.g. the whole billing page or the
  free-tier alert) would remove useful read-only context. Wrap only the CTA
  element, not its container — e.g. in `OrgBillingPage` the free-tier alert keeps
  its text (which still names a price, by design) and only the "Upgrade plan"
  button is wrapped.
- **`WebOnly` and SSR/hydration.** N/A — this is a client-rendered Vite SPA; no
  SSR hydration mismatch concern.

## Out of scope / follow-ups
- Slice 3b: UGC block-user + message reporting.
- Fix the legacy `/settings/billing` route in the Donny upgrade links.
- Phase 2 Slices A (push) and D (deep links) — blocked on Apple enrollment.
