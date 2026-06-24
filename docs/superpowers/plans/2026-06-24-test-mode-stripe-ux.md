# Test-Mode Stripe UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Stripe surfaces (payout onboarding + paying) instinctive in test mode — one-tap payout setup and card-only checkout — with **zero** change to live-mode behavior.

**Architecture:** Two pure, vitest-tested `_shared` helpers carry all the mode logic; edge functions and frontend just wire them in, gated strictly on `sk_test_` / `pk_test_`. Part A auto-creates a fully-enabled **Custom** connected account in test mode (no hosted onboarding). Part B forces `payment_method_types: ['card']` on all Checkout sessions in test mode and surfaces the working test card on payment-launch screens.

**Tech Stack:** Supabase Deno edge functions (Stripe SDK v18.5.0, API `2025-08-27.basil`), React 18 + TypeScript + Tailwind, vitest (unit), Stripe test mode.

**Spec:** `docs/superpowers/specs/2026-06-24-test-mode-stripe-ux-design.md`

---

## Key constraints (read before starting)

- **vitest cannot load runtime `https://` imports.** Any module a vitest test imports (directly or transitively) must avoid runtime URL imports. Use `import type Stripe from "https://esm.sh/stripe@18.5.0"` (type-only — erased at runtime) where Stripe types are needed in a tested file. Never `import Stripe from ...` (value import) in a tested module.
- **Deno needs file extensions** in import specifiers (`./stripe-mode.ts`). Source files keep `.ts`; vitest test files import without extension (matches existing `donny-chat/*.test.ts`).
- **Edge functions deploy separately** from the frontend (Lovable deploys frontend only). `npm run build` does NOT parse edge functions — `supabase functions deploy` is the real edge-fn parse check (watch the template-literal-backtick footgun). Order edge-fn work **build → deploy → verify**.
- **Live mode is sacred.** Every new branch resolves to `undefined`/no-op when the key is `sk_live_` / `pk_live_`.
- Run frontend unit tests with `npm run test`. Per project note, a green run prints `Tests N passed` even though the overall process may exit 1 due to unrelated nested e2e files — trust the per-file `passed`/`failed` line, not the exit code.

---

## File structure

**Create:**
- `supabase/functions/_shared/stripe-mode.ts` — pure `isTestKey` (no imports).
- `supabase/functions/_shared/stripe-mode.test.ts` — vitest.
- `supabase/functions/_shared/test-mode-payment-methods.ts` — `testModePaymentMethodTypes`.
- `supabase/functions/_shared/test-mode-payment-methods.test.ts` — vitest.
- `supabase/functions/_shared/test-mode-connect.ts` — `buildTestAccountParams` (pure) + `createTestModeEnabledAccount`.
- `supabase/functions/_shared/test-mode-connect.test.ts` — vitest (targets `buildTestAccountParams`).

**Modify:**
- `supabase/functions/_shared/test-mode-text.ts` — import `isTestKey` from `stripe-mode.ts`; type-only Stripe import.
- `supabase/functions/boost-payment/index.ts` — card-only on `openBoostCheckout`.
- `supabase/functions/create-checkout-session/index.ts` — card-only + `custom_text`.
- `supabase/functions/create-sponsorship-checkout/index.ts` — card-only.
- `supabase/functions/create-campaign-escrow/index.ts` — card-only.
- `supabase/functions/create-creator-connect-account/index.ts` — test-mode bypass.
- `supabase/functions/create-restaurant-connect-account/index.ts` — test-mode bypass.
- `supabase/functions/get-stripe-dashboard-link/index.ts` — graceful Custom-account degradation.
- `src/components/settings/StripeConnectSetup.tsx` — hide dashboard button in test mode.
- `src/components/dragonshare/BoostConfirmationSheet.tsx` — mount `TestModeBanner`.
- `src/pages/PricingPage.tsx` — mount `TestModeBanner` + `StripeTestHelper`.
- `src/pages/OrgBillingPage.tsx` — mount `TestModeBanner` + `StripeTestHelper`.
- `src/pages/BrandSponsorships.tsx` — mount `TestModeBanner` + `StripeTestHelper`.

---

## Task 1: Extract pure `isTestKey` into `stripe-mode.ts`

**Why:** lets the new helpers reuse `isTestKey` (DRY) while staying vitest-importable (no runtime URL import).

**Files:**
- Create: `supabase/functions/_shared/stripe-mode.ts`
- Create: `supabase/functions/_shared/stripe-mode.test.ts`
- Modify: `supabase/functions/_shared/test-mode-text.ts`

- [ ] **Step 1: Write the failing test**

`supabase/functions/_shared/stripe-mode.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isTestKey } from './stripe-mode';

describe('isTestKey', () => {
  it('is true for sk_test_ keys', () => {
    expect(isTestKey('sk_test_abc123')).toBe(true);
  });
  it('is false for sk_live_ keys', () => {
    expect(isTestKey('sk_live_abc123')).toBe(false);
  });
  it('is false for empty / undefined-ish', () => {
    expect(isTestKey('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/stripe-mode.test.ts`
Expected: FAIL — cannot resolve `./stripe-mode`.

- [ ] **Step 3: Create `stripe-mode.ts`**

`supabase/functions/_shared/stripe-mode.ts`:
```ts
// Pure Stripe-mode detection. NO imports (must stay vitest-importable).
export function isTestKey(stripeKey: string): boolean {
  return typeof stripeKey === 'string' && stripeKey.startsWith('sk_test_');
}
```

- [ ] **Step 4: Re-point `test-mode-text.ts` at the shared helper**

In `supabase/functions/_shared/test-mode-text.ts`:
- Change `import Stripe from "https://esm.sh/stripe@18.5.0";` → `import type Stripe from "https://esm.sh/stripe@18.5.0";`
- Remove the local `isTestKey` definition.
- Add at top: `import { isTestKey } from "./stripe-mode.ts";`
- Add a re-export so existing importers keep working: `export { isTestKey } from "./stripe-mode.ts";`

(Result: `testModeCustomText` still calls `isTestKey`; the `Stripe.Checkout...CustomText` return type still resolves via the type-only import.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/stripe-mode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/stripe-mode.ts supabase/functions/_shared/stripe-mode.test.ts supabase/functions/_shared/test-mode-text.ts
git commit -m "refactor(stripe): extract pure isTestKey into stripe-mode.ts"
```

---

## Task 2: `testModePaymentMethodTypes` helper (Part B logic)

**Files:**
- Create: `supabase/functions/_shared/test-mode-payment-methods.ts`
- Create: `supabase/functions/_shared/test-mode-payment-methods.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { testModePaymentMethodTypes } from './test-mode-payment-methods';

describe('testModePaymentMethodTypes', () => {
  it('returns ["card"] in test mode (suppresses Link/Klarna/etc.)', () => {
    expect(testModePaymentMethodTypes('sk_test_x')).toEqual(['card']);
  });
  it('returns undefined in live mode (Stripe automatic methods unchanged)', () => {
    expect(testModePaymentMethodTypes('sk_live_x')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/test-mode-payment-methods.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`supabase/functions/_shared/test-mode-payment-methods.ts`:
```ts
import { isTestKey } from "./stripe-mode.ts";

/**
 * In test mode, restrict Checkout to card only — removes Link/Klarna/bank
 * options that don't work in the sandbox and confuse users. In live mode,
 * returns undefined so Stripe's dashboard-configured automatic payment
 * methods are used exactly as before.
 */
export function testModePaymentMethodTypes(stripeKey: string): ['card'] | undefined {
  return isTestKey(stripeKey) ? ['card'] : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/test-mode-payment-methods.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/test-mode-payment-methods.ts supabase/functions/_shared/test-mode-payment-methods.test.ts
git commit -m "feat(stripe): add testModePaymentMethodTypes (card-only in test mode)"
```

---

## Task 3: `test-mode-connect.ts` — enabled Custom account builder (Part A logic)

**Files:**
- Create: `supabase/functions/_shared/test-mode-connect.ts`
- Create: `supabase/functions/_shared/test-mode-connect.test.ts`

**Note on test values:** the prefill below uses Stripe's published test triggers for full identity verification (`address.line1: 'address_full_match'`, dob `1901-01-01`, `id_number: '000000000'`, `ssn_last_4: '0000'`, `external_account: 'btok_us'`). These satisfy `currently_due` in test mode so the account returns `charges_enabled` + `payouts_enabled`. The live prod-test in Task 11 is the authority: if `payouts_enabled` does not flip, adjust the trigger values there (this is the one place that may need a live tweak).

- [ ] **Step 1: Write the failing test**

`supabase/functions/_shared/test-mode-connect.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildTestAccountParams } from './test-mode-connect';

describe('buildTestAccountParams', () => {
  const params = buildTestAccountParams({
    email: 'creator@example.com',
    businessName: 'Jane Creator',
    productDescription: 'Content creation services via DragonCandy marketplace',
    metadata: { user_id: 'u1', platform: 'dragoncandy' },
    requestIp: '8.8.8.8',
    nowUnix: 1_700_000_000,
  });

  it('creates a Custom individual account', () => {
    expect(params.type).toBe('custom');
    expect(params.business_type).toBe('individual');
  });
  it('requests card_payments + transfers capabilities', () => {
    expect(params.capabilities?.card_payments?.requested).toBe(true);
    expect(params.capabilities?.transfers?.requested).toBe(true);
  });
  it('attaches the test bank token and accepted ToS with the given ip/date', () => {
    expect(params.external_account).toBe('btok_us');
    expect(params.tos_acceptance).toEqual({ date: 1_700_000_000, ip: '8.8.8.8' });
  });
  it('carries email, business name, description, and metadata', () => {
    expect(params.email).toBe('creator@example.com');
    expect(params.business_profile?.name).toBe('Jane Creator');
    expect(params.business_profile?.product_description).toContain('Content creation');
    expect(params.metadata?.user_id).toBe('u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/test-mode-connect.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`supabase/functions/_shared/test-mode-connect.ts`:
```ts
// Type-only import — erased at runtime, so this file stays vitest-importable.
import type Stripe from "https://esm.sh/stripe@18.5.0";

export interface TestAccountOptions {
  email: string;
  businessName?: string;
  productDescription: string;
  metadata: Record<string, string>;
  requestIp: string;
  nowUnix: number;
}

/**
 * Pure builder for a fully-prefilled Custom connected account that becomes
 * charges_enabled + payouts_enabled in TEST MODE without hosted onboarding.
 * Uses Stripe's published test verification triggers.
 */
export function buildTestAccountParams(o: TestAccountOptions): Stripe.AccountCreateParams {
  return {
    type: 'custom',
    country: 'US',
    email: o.email,
    business_type: 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: o.businessName || undefined,
      product_description: o.productDescription,
      mcc: '5734',
      url: 'https://dragoncandy.io',
    },
    individual: {
      first_name: 'Test',
      last_name: 'Account',
      email: o.email,
      phone: '+15555550100',
      dob: { day: 1, month: 1, year: 1901 },
      address: {
        line1: 'address_full_match',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94103',
        country: 'US',
      },
      ssn_last_4: '0000',
      id_number: '000000000',
    },
    external_account: 'btok_us',
    tos_acceptance: { date: o.nowUnix, ip: o.requestIp },
    metadata: o.metadata,
  };
}

/**
 * Creates the enabled test-mode Custom account. Caller passes a Stripe client
 * (already constructed with the sk_test_ key) so this module needs no runtime
 * Stripe import.
 */
export async function createTestModeEnabledAccount(
  stripe: Stripe,
  opts: Omit<TestAccountOptions, 'nowUnix'>,
): Promise<Stripe.Account> {
  return stripe.accounts.create(
    buildTestAccountParams({ ...opts, nowUnix: Math.floor(Date.now() / 1000) }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/test-mode-connect.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/test-mode-connect.ts supabase/functions/_shared/test-mode-connect.test.ts
git commit -m "feat(stripe): add test-mode Custom connected-account builder"
```

---

## Task 4: Wire card-only into all Checkout-session creators (Part B)

**Files (modify):** `boost-payment/index.ts`, `create-checkout-session/index.ts`, `create-sponsorship-checkout/index.ts`, `create-campaign-escrow/index.ts`

No unit test (logic lives in the Task 2 helper, already tested); verified by deploy + prod-test in Task 11.

- [ ] **Step 1: `boost-payment/index.ts`**

Add import near the other `_shared` imports:
```ts
import { testModePaymentMethodTypes } from "../_shared/test-mode-payment-methods.ts";
```
In `openBoostCheckout`, add to the `stripe.checkout.sessions.create({...})` object (alongside `mode: "payment"`):
```ts
      payment_method_types: testModePaymentMethodTypes(stripeKey),
```
(The off-session `paymentIntents.create` path already uses an explicit saved card — leave it untouched.)

- [ ] **Step 2: `create-sponsorship-checkout/index.ts`**

Add the same import. In the `stripe.checkout.sessions.create({...})` call, add:
```ts
      payment_method_types: testModePaymentMethodTypes(stripeKey),
```

- [ ] **Step 3: `create-campaign-escrow/index.ts`**

Add the same import. In the `stripe.checkout.sessions.create({...})` call, add:
```ts
      payment_method_types: testModePaymentMethodTypes(stripeKey),
```

- [ ] **Step 4: `create-checkout-session/index.ts` (subscriptions) — card-only + test note**

This function lacks both. Add imports:
```ts
import { testModePaymentMethodTypes } from "../_shared/test-mode-payment-methods.ts";
import { testModeCustomText } from "../_shared/test-mode-text.ts";
```
Note its Stripe key is read as `stripeSecretKey` (not `stripeKey`). In the `stripe.checkout.sessions.create({...})` object add:
```ts
      payment_method_types: testModePaymentMethodTypes(stripeSecretKey),
      custom_text: testModeCustomText(stripeSecretKey),
```

- [ ] **Step 5: Build (frontend parse sanity only) + commit**

Run: `npm run build`
Expected: succeeds (does not validate edge fns — real check is deploy in Task 11).
```bash
git add supabase/functions/boost-payment/index.ts supabase/functions/create-sponsorship-checkout/index.ts supabase/functions/create-campaign-escrow/index.ts supabase/functions/create-checkout-session/index.ts
git commit -m "feat(stripe): force card-only checkout in test mode across all session creators"
```

---

## Task 5: Test-mode bypass in `create-creator-connect-account`

**File (modify):** `supabase/functions/create-creator-connect-account/index.ts`

- [ ] **Step 1: Add imports**

```ts
import { isTestKey } from "../_shared/stripe-mode.ts";
import { createTestModeEnabledAccount } from "../_shared/test-mode-connect.ts";
```

- [ ] **Step 2: Insert the bypass branch**

Locate the block that ends the "already fully onboarded → return `alreadyComplete`" early return (after the `if (accountId) { const existing = await stripe.accounts.retrieve... }` block, around line 74). Immediately after it, insert:
```ts
    // TEST MODE: skip hosted onboarding entirely. Provision a fully-enabled
    // sandbox Custom account so "Connect" is one tap. Live mode is unaffected.
    if (isTestKey(stripeKey) && !accountId) {
      logStep("Test mode — creating instantly-enabled Custom account");
      const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
      const acct = await createTestModeEnabledAccount(stripe, {
        email: user.email,
        businessName: creatorProfile?.creator_name || undefined,
        productDescription: "Content creation services via DragonCandy marketplace",
        metadata: { user_id: user.id, platform: "dragoncandy" },
        requestIp,
      });
      await supabaseClient
        .from('creator_profiles')
        .update({ stripe_account_id: acct.id, stripe_onboarding_complete: true })
        .eq('user_id', user.id);
      logStep("Test account enabled", { accountId: acct.id, charges: acct.charges_enabled, payouts: acct.payouts_enabled });
      return new Response(JSON.stringify({ alreadyComplete: true, accountId: acct.id }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }
```

This sits before the disconnected-account / Express-creation logic, so a brand-new (or reconnecting) test user goes straight to an enabled account; live mode falls through to the unchanged Express path.

- [ ] **Step 3: Build + commit**

Run: `npm run build`
```bash
git add supabase/functions/create-creator-connect-account/index.ts
git commit -m "feat(stripe): instant test-mode payout setup for creators (no hosted onboarding)"
```

---

## Task 6: Test-mode bypass in `create-restaurant-connect-account`

**File (modify):** `supabase/functions/create-restaurant-connect-account/index.ts`

Mirror of Task 5, plus `org_units` persistence.

- [ ] **Step 1: Add imports** (same two as Task 5).

- [ ] **Step 2: Insert the bypass branch**

After the "already fully onboarded → `alreadyComplete`" block (around line 113), and noting `org_unit_id` was destructured from the body earlier, insert:
```ts
    // TEST MODE: instant enabled Custom account, no hosted onboarding.
    if (isTestKey(stripeKey) && !accountId) {
      logStep("Test mode — creating instantly-enabled Custom account");
      const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
      const acct = await createTestModeEnabledAccount(stripe, {
        email: user.email,
        businessName: businessProfile?.business_name || undefined,
        productDescription: "Restaurant business receiving sponsorship payments via DragonCandy marketplace",
        metadata: { user_id: user.id, platform: "dragoncandy", account_type: "restaurant", org_unit_id: org_unit_id ?? "" },
        requestIp,
      });
      await supabaseClient
        .from('business_profiles')
        .update({ stripe_account_id: acct.id, stripe_onboarding_complete: true })
        .eq('user_id', user.id)
        .eq('account_type', 'restaurant');
      if (org_unit_id) {
        await supabaseClient
          .from('org_units')
          .update({ stripe_account_id: acct.id, stripe_onboarding_complete: true })
          .eq('id', org_unit_id);
      }
      logStep("Test account enabled", { accountId: acct.id, charges: acct.charges_enabled, payouts: acct.payouts_enabled });
      return new Response(JSON.stringify({ alreadyComplete: true, accountId: acct.id }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }
```

- [ ] **Step 3: Build + commit**

Run: `npm run build`
```bash
git add supabase/functions/create-restaurant-connect-account/index.ts
git commit -m "feat(stripe): instant test-mode payout setup for restaurants (no hosted onboarding)"
```

---

## Task 7: Graceful dashboard-link degradation for Custom test accounts

**File (modify):** `supabase/functions/get-stripe-dashboard-link/index.ts`

`createLoginLink` only works for Express/Standard; it throws on Custom test accounts. Make that a clean message instead of a raw error.

- [ ] **Step 1: Guard the `createLoginLink` call**

Replace:
```ts
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    logStep('Dashboard link created successfully');
    return new Response(
      JSON.stringify({ url: loginLink.url, success: true }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
```
with:
```ts
    let loginUrl: string;
    try {
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      loginUrl = loginLink.url;
    } catch (linkErr) {
      // Custom accounts (used for test-mode sandbox payouts) have no Express dashboard.
      logStep('createLoginLink unavailable (likely a Custom/test account)', { error: (linkErr as Error).message });
      return new Response(
        JSON.stringify({ success: false, error: 'Dashboard link not available for test accounts.' }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 200 }
      );
    }
    logStep('Dashboard link created successfully');
    return new Response(
      JSON.stringify({ url: loginUrl, success: true }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
```

- [ ] **Step 2: Build + commit**

Run: `npm run build`
```bash
git add supabase/functions/get-stripe-dashboard-link/index.ts
git commit -m "fix(stripe): degrade gracefully when dashboard link is unavailable (Custom test accounts)"
```

---

## Task 8: Hide the Stripe dashboard button in test mode (frontend)

**File (modify):** `src/components/settings/StripeConnectSetup.tsx`

`isTestMode` already exists in this component (line 79). Guard the dashboard button.

- [ ] **Step 1: Conditionally render the dashboard button**

In the "Connected" block, wrap the `<Button onClick={handleDashboard} ...>View Stripe Dashboard</Button>` so it only renders when `!isTestMode`:
```tsx
            {!isTestMode && (
              <Button
                onClick={handleDashboard}
                disabled={connecting}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                {connecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                )}
                {connecting ? 'Opening...' : 'View Stripe Dashboard'}
              </Button>
            )}
```
(The Disconnect button and the rest of the block stay as-is.)

- [ ] **Step 2: Build + commit**

Run: `npm run build`
Expected: succeeds.
```bash
git add src/components/settings/StripeConnectSetup.tsx
git commit -m "feat(stripe): hide Stripe dashboard button in test mode (no Express dashboard for Custom accounts)"
```

---

## Task 9: Surface the working test card on payment-launch screens (frontend)

`TestModeBanner` and `StripeTestHelper` already self-hide in live mode (internal `pk_test_` check), so they mount unconditionally.

**Files (modify):** `BoostConfirmationSheet.tsx`, `PricingPage.tsx`, `OrgBillingPage.tsx`, `BrandSponsorships.tsx`

- [ ] **Step 1: `BoostConfirmationSheet.tsx`**

Add import:
```ts
import { TestModeBanner } from '@/components/payments/TestModeBanner';
```
Insert as the first child of `<div className="mt-6 space-y-4">` (the content wrapper, ~line 94):
```tsx
          <TestModeBanner />
```

- [ ] **Step 2: `PricingPage.tsx`**

Add imports:
```ts
import { TestModeBanner } from '@/components/payments/TestModeBanner';
import { StripeTestHelper } from '@/components/payments/StripeTestHelper';
```
Insert directly after the closing `</div>` of the `{/* Header */}` block (after line 73, before `{/* Tier grid */}`):
```tsx
      <div className="mx-auto max-w-md px-4 space-y-3">
        <TestModeBanner />
        <StripeTestHelper variant="cards" />
      </div>
```

- [ ] **Step 3: `OrgBillingPage.tsx`**

Add the same two imports. Insert `<TestModeBanner className="mb-4" />` followed by `<StripeTestHelper variant="cards" className="mb-4" />` at the top of the page's main content container (above the plan/billing panel). If unsure of the exact wrapper, place it immediately inside the outermost content `<div>` of the returned JSX so it appears above the plan cards.

- [ ] **Step 4: `BrandSponsorships.tsx`**

Add the same two imports. In the **loaded** (`profile` present) render branch, insert at the top of the main content region (immediately after the `<PageHeader>` block, before the sponsorships list):
```tsx
          <div className="px-4 mt-4 space-y-3">
            <TestModeBanner />
            <StripeTestHelper variant="cards" />
          </div>
```

- [ ] **Step 5: Build + commit**

Run: `npm run build`
Expected: succeeds.
```bash
git add src/components/dragonshare/BoostConfirmationSheet.tsx src/pages/PricingPage.tsx src/pages/OrgBillingPage.tsx src/pages/BrandSponsorships.tsx
git commit -m "feat(stripe): surface test-mode banner + test card on payment-launch screens"
```

---

## Task 10: Full unit-test + build gate

- [ ] **Step 1: Run the new unit tests together**

Run: `npx vitest run supabase/functions/_shared/stripe-mode.test.ts supabase/functions/_shared/test-mode-payment-methods.test.ts supabase/functions/_shared/test-mode-connect.test.ts`
Expected: all PASS (9 tests total).

- [ ] **Step 2: Frontend build**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean (warnings tolerated per existing config; no new errors).

---

## Task 11: Deploy edge functions + live test-mode verification

> Edge functions do NOT deploy via the Lovable push. Deploy the 8 touched functions, then verify in prod test-mode. This is the real parse check and the authority on the prefill values.

- [ ] **Step 1: Deploy all touched edge functions**

Deploy (via `npm run deploy:fn -- <name>` or the Supabase MCP `deploy_edge_function`, bundling all `_shared` deps):
`boost-payment`, `create-checkout-session`, `create-sponsorship-checkout`, `create-campaign-escrow`, `create-creator-connect-account`, `create-restaurant-connect-account`, `get-stripe-dashboard-link`.
Expected: each deploys without a bundle/parse error (watch for template-literal-backtick issues).

- [ ] **Step 2: Verify payout bypass (the feasibility authority)**

As a fresh **creator** and a fresh **restaurant** test user on dragoncandy.io:
- Settings → Payments → "Connect Stripe Account" → expect **one tap → Connected** (no Stripe screens).
- Confirm in Stripe test dashboard (or via status fn) that the account is `charges_enabled` AND `payouts_enabled`.
- **If `payouts_enabled` is false:** adjust the prefill triggers in `test-mode-connect.ts` (Task 3 note), re-deploy, re-test. This is the expected place for a live tweak.
- Confirm the "View Stripe Dashboard" button is **hidden** in test mode.

- [ ] **Step 3: Verify card-only checkout**

- DragonShare boost with **no card on file** → hosted Checkout shows **card only** (no Link/Klarna/bank), test-mode note visible, `4242` card adjacent → completes.
- Subscription checkout (Pricing + Org Billing), sponsorship payment, campaign escrow → each shows **card only**.

- [ ] **Step 4: Both viewports + console**

Use the `verify-prod` skill: screenshot desktop + mobile of the boost sheet, pricing, sponsorships, and creator/restaurant payment settings; confirm no console errors.

- [ ] **Step 5: Commit any prefill tweak (if Step 2 required one)**

```bash
git add supabase/functions/_shared/test-mode-connect.ts
git commit -m "fix(stripe): adjust test-account prefill so payouts enable in test mode"
```

---

## Task 12: Codex second review + finish branch

- [ ] **Step 1: Codex review**

Use the `codex-review` skill: `codex review --base main --title "Simplify test-mode Stripe UX"`. Fix any real findings; re-run until clean. Relay the verdict to the user.

- [ ] **Step 2: Knowledge sync**

Use the `knowledge-sync` skill (per CLAUDE.md branch-finish rule): write a `docs/wiki/raw/sessions/` source, `/wiki-ops ingest`, refresh core docs if a workflow rule changed (PROJECT_CONTEXT active-workstreams entry), include in the PR.

- [ ] **Step 3: Finish the branch**

Use the `finishing-a-development-branch` skill to open the PR.

---

## Done when

- All 9 unit tests pass; `npm run build`, `typecheck`, `lint` clean.
- Test-mode: creator + restaurant payout setup is one tap → Connected (`charges_enabled` + `payouts_enabled`); dashboard button hidden.
- Test-mode: every Checkout surface is card-only with the test card surfaced.
- Live-mode paths verified unchanged (helpers resolve to `undefined`/no-op; Express + hosted onboarding + automatic payment methods untouched).
- Codex review clean; knowledge synced; PR opened.
