# Reliable Restaurant → Creator Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make restaurants able to reliably pay creators — fixing the DragonShare boost charge (which currently has no payment method to charge) and eliminating the test-mode "my linked bank accounts don't appear" confusion.

**Architecture:** One Stripe customer per org (anchored on `organizations.stripe_customer_id`), with the card saved on first hosted checkout. DragonShare boosts become two-path: a one-tap off-session charge when a card is on file, or a hosted-checkout tab (which also saves the card) when none is. A shared `fulfill-boost` module performs the creator transfer + ledger updates from both the off-session path and the webhook. The payout-account confusion is pre-empted with Stripe Checkout `custom_text` shown only in test mode.

**Tech Stack:** Supabase Deno Edge Functions (Stripe SDK `stripe@18.5.0`, API `2025-08-27.basil`), React 18 + TypeScript, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-stripe-restaurant-payments-design.md`

---

## Testing approach (read first)

This repo has **no Deno unit-test harness** for edge functions, and `npm run typecheck` / ESLint **ignore `supabase/**`**. So edge-function correctness is verified by:
- Careful review against the complete code provided here,
- An optional `deno check <file>` if Deno is installed locally,
- `npm run build` + `npm run lint` (frontend),
- **Production verification** on dragoncandy.io after Lovable deploy (screenshots, Chrome DevTools console, Supabase function logs), per `CLAUDE.md`.

Genuine TDD applies to the one pure frontend unit extracted in **Task 7** (`resolveBoostOutcome`), which is fully Vitest-tested. Everything else uses the verification loop above. This is an honest reflection of the toolchain — do not fabricate edge-function unit tests that cannot run.

## File Structure

**Create:**
- `supabase/functions/_shared/stripe-customer.ts` — `getOrCreateOrgCustomer()` (one customer per org, persisted).
- `supabase/functions/_shared/fulfill-boost.ts` — `fulfillBoost()` (creator transfer + payout + post status + social hook; idempotent).
- `supabase/functions/_shared/test-mode-text.ts` — shared `custom_text` message + `isTestKey()` helper.
- `src/components/dragonshare/boostOutcome.ts` — pure `resolveBoostOutcome()` (testable branching).
- `src/components/dragonshare/boostOutcome.test.ts` — Vitest unit test.

**Modify:**
- `supabase/functions/boost-payment/index.ts` — two-path charge, pending guard, customer, off-session, checkout fallback, custom_text, use `fulfillBoost`.
- `supabase/functions/create-campaign-escrow/index.ts` — anchor customer on `campaign.org_id`, `setup_future_usage`, custom_text.
- `supabase/functions/create-sponsorship-checkout/index.ts` — custom_text only (kept minimal / "as-is").
- `supabase/functions/stripe-webhook/index.ts` — set default PM on completed checkouts, boost fulfill branch, boost expired branch.
- `src/components/dragonshare/BoostConfirmationSheet.tsx` — consume `resolveBoostOutcome`, open checkout tab, correct toasts.

## Accepted risks / non-goals (from spec + brainstorming)

- **No merge of pre-existing duplicate Stripe customers** (test mode, pre-revenue). The persisted `organizations.stripe_customer_id` becomes authoritative going forward.
- **Sponsorship kept "as-is"** — only the test-mode `custom_text` clarification is added; its customer model is unchanged (brands don't boost, so no card-reuse need).
- **Two completed boost checkouts** (user pays in two tabs) could double-charge; `fulfillBoost` is idempotent on the transfer but cannot un-capture a second payment. Low risk; not mitigated (would need a schema column). Documented, not solved.

---

### Task 1: Shared `getOrCreateOrgCustomer` helper

**Files:**
- Create: `supabase/functions/_shared/stripe-customer.ts`

- [ ] **Step 1: Create the helper**

```ts
// supabase/functions/_shared/stripe-customer.ts
import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Returns the single canonical Stripe customer id for an org, creating and
 * persisting it on first use. organizations.stripe_customer_id is authoritative.
 */
export async function getOrCreateOrgCustomer(
  stripe: Stripe,
  supabase: SupabaseClient,
  orgId: string,
  email: string | undefined,
): Promise<string> {
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .single();

  if (org?.stripe_customer_id) return org.stripe_customer_id;

  let customerId: string | undefined;
  if (email) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) customerId = existing.data[0].id;
  }
  if (!customerId) {
    const created = await stripe.customers.create({ email, metadata: { org_id: orgId } });
    customerId = created.id;
  }

  await supabase
    .from("organizations")
    .update({ stripe_customer_id: customerId })
    .eq("id", orgId);

  return customerId;
}
```

- [ ] **Step 2: Verify it parses (optional, if Deno installed)**

Run: `deno check supabase/functions/_shared/stripe-customer.ts`
Expected: no errors. If Deno is not installed, skip — it will be exercised at deploy.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/stripe-customer.ts
git commit -m "feat(payments): add getOrCreateOrgCustomer shared helper"
```

---

### Task 2: Shared `fulfillBoost` helper (extract fulfillment)

**Files:**
- Create: `supabase/functions/_shared/fulfill-boost.ts`

This extracts the post-charge logic currently inline in `boost-payment` so the off-session path and the webhook share one code path. It is idempotent.

- [ ] **Step 1: Create the helper**

```ts
// supabase/functions/_shared/fulfill-boost.ts
import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { calculateDragonShareFee } from "./dragonshare-fee.ts";

interface FulfillBoostParams {
  boostId: string;
  postId: string;
  creatorId: string;
  amountCents: number;
  paymentIntentId: string;
}

/**
 * Transfers the creator's share, records the payout, marks the boost
 * transferred and the post boosted, and fires the social hook.
 * Idempotent: no-ops if the boost is already transferred.
 */
export async function fulfillBoost(
  stripe: Stripe,
  supabase: SupabaseClient,
  { boostId, postId, creatorId, amountCents, paymentIntentId }: FulfillBoostParams,
): Promise<{ alreadyDone: boolean; transferId?: string }> {
  const { data: boostRow } = await supabase
    .from("dragonshare_boosts")
    .select("status")
    .eq("id", boostId)
    .single();
  if (boostRow?.status === "transferred") return { alreadyDone: true };

  const { data: creatorProfile, error: creatorError } = await supabase
    .from("creator_profiles")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("user_id", creatorId)
    .single();
  if (creatorError || !creatorProfile?.stripe_account_id || !creatorProfile?.stripe_onboarding_complete) {
    throw new Error("Creator payout account not ready at fulfillment");
  }

  const { creatorPayoutCents } = calculateDragonShareFee(amountCents);

  const transfer = await stripe.transfers.create({
    amount: creatorPayoutCents,
    currency: "usd",
    destination: creatorProfile.stripe_account_id,
    metadata: { type: "dragonshare_boost", boost_id: boostId, post_id: postId },
  }, { idempotencyKey: `boost_tr_${boostId}` });

  await supabase
    .from("dragonshare_boosts")
    .update({
      status: "transferred",
      stripe_payment_intent_id: paymentIntentId,
      stripe_transfer_id: transfer.id,
      captured_at: new Date().toISOString(),
      transferred_at: new Date().toISOString(),
    })
    .eq("id", boostId);

  await supabase
    .from("dragonshare_payouts")
    .insert({
      boost_id: boostId,
      creator_id: creatorId,
      amount_cents: creatorPayoutCents,
      stripe_transfer_id: transfer.id,
      status: "succeeded",
      processed_at: new Date().toISOString(),
    });

  await supabase
    .from("dragonshare_posts")
    .update({ boost_status: "boosted" })
    .eq("id", postId);

  // Social hook (fire-and-forget)
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fire-dragonshare-social-hook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ boost_id: boostId, post_id: postId }),
    });
  } catch (e) {
    console.warn("[fulfill-boost] social hook failed (non-blocking):", e);
  }

  return { alreadyDone: false, transferId: transfer.id };
}
```

- [ ] **Step 2: Optional `deno check`**, then **commit**

```bash
git add supabase/functions/_shared/fulfill-boost.ts
git commit -m "feat(payments): add shared idempotent fulfillBoost helper"
```

---

### Task 3: Shared test-mode `custom_text`

**Files:**
- Create: `supabase/functions/_shared/test-mode-text.ts`

- [ ] **Step 1: Create the helper**

```ts
// supabase/functions/_shared/test-mode-text.ts
import Stripe from "https://esm.sh/stripe@18.5.0";

export function isTestKey(stripeKey: string): boolean {
  return stripeKey.startsWith("sk_test_");
}

const TEST_MODE_MESSAGE =
  "Test mode — pay with card 4242 4242 4242 4242 (any future expiry, any CVC). " +
  "Your linked test bank accounts are payout accounts and won't appear here.";

/**
 * custom_text block for a Checkout Session, only in test mode; otherwise undefined.
 */
export function testModeCustomText(
  stripeKey: string,
): Stripe.Checkout.SessionCreateParams.CustomText | undefined {
  return isTestKey(stripeKey)
    ? { submit: { message: TEST_MODE_MESSAGE } }
    : undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/test-mode-text.ts
git commit -m "feat(payments): add test-mode checkout custom_text helper"
```

---

### Task 4: Rewrite `boost-payment` (two-path charge)

**Files:**
- Modify (full replacement): `supabase/functions/boost-payment/index.ts`

**Logic order:** auth → fetch post → membership check → resolve org customer → creator readiness → concurrent-pending guard (BEFORE `create_boost`) → if not ready return 202 → resolve default card → off-session charge (idempotency key `boost_pi_${boostId}`) with fallback to hosted checkout.

- [ ] **Step 1: Replace the file contents**

```ts
// supabase/functions/boost-payment/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { getOrCreateOrgCustomer } from "../_shared/stripe-customer.ts";
import { fulfillBoost } from "../_shared/fulfill-boost.ts";
import { testModeCustomText } from "../_shared/test-mode-text.ts";

const logStep = (step: string, details?: unknown) => {
  console.log(`[BOOST-PAYMENT] ${step}${details ? " - " + JSON.stringify(details) : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status,
    });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error(`Auth failed: ${userError?.message}`);
    const userId = userData.user.id;
    const userEmail = userData.user.email;

    const { post_id, amount_cents, tier_label } = await req.json();
    if (!post_id || !amount_cents || !tier_label) throw new Error("Missing required fields");
    if (typeof amount_cents !== "number" || amount_cents < 500 || amount_cents > 50000) {
      throw new Error("Boost amount must be between $5 and $500");
    }

    logStep("Boost requested", { post_id, amount_cents, tier_label, userId });

    const { data: post, error: postError } = await supabase
      .from("dragonshare_posts")
      .select("id, creator_id, target_org_id, status, boost_status")
      .eq("id", post_id)
      .single();
    if (postError || !post) throw new Error(`Post not found: ${postError?.message}`);

    const { data: membership, error: memError } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .eq("org_id", post.target_org_id)
      .eq("invitation_status", "active")
      .single();
    if (memError || !membership) throw new Error("Not a member of the target organization");
    if (!["owner", "admin"].includes(membership.role)) throw new Error("Only owners and admins can boost");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = await getOrCreateOrgCustomer(stripe, supabase, membership.org_id, userEmail);

    // Creator payout readiness
    const { data: creatorProfile } = await supabase
      .from("creator_profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", post.creator_id)
      .single();
    const creatorReady = !!creatorProfile?.stripe_account_id && !!creatorProfile?.stripe_onboarding_complete;

    // Concurrent-pending guard — BEFORE create_boost.
    const { data: existingPending } = await supabase
      .from("dragonshare_boosts")
      .select("id, amount_cents")
      .eq("post_id", post_id)
      .eq("boosting_org_id", membership.org_id)
      .eq("status", "pending")
      .maybeSingle();

    let boostId: string;
    let boostAmountCents: number;
    if (existingPending) {
      boostId = existingPending.id;
      boostAmountCents = existingPending.amount_cents ?? amount_cents;
      logStep("Reusing pending boost", { boostId });
    } else {
      const { data: createdId, error: boostError } = await supabase.rpc("create_boost", {
        p_post_id: post_id,
        p_boosting_org_id: membership.org_id,
        p_amount_cents: amount_cents,
        p_tier: tier_label,
      });
      if (boostError) throw new Error(`create_boost failed: ${boostError.message}`);
      boostId = createdId as string;
      boostAmountCents = amount_cents;
      logStep("Boost row created", { boostId });
    }

    if (!creatorReady) {
      logStep("Creator payout not ready — parking boost", { creatorId: post.creator_id, boostId });
      return json({
        error: "CREATOR_PAYOUT_NOT_READY",
        boost_id: boostId,
        message: "Creator hasn't finished payout setup. Boost is queued.",
      }, 202);
    }

    const origin = req.headers.get("origin")
      || Deno.env.get("PUBLIC_SITE_URL")
      || "https://dragoncandy.io";

    const openBoostCheckout = async () => {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "DragonShare boost" },
            unit_amount: boostAmountCents,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          setup_future_usage: "off_session",
          metadata: {
            type: "dragonshare_boost",
            boost_id: boostId,
            post_id: post_id,
            creator_id: post.creator_id,
            boosting_org_id: membership.org_id,
          },
        },
        metadata: {
          type: "dragonshare_boost",
          boost_id: boostId,
          post_id: post_id,
          creator_id: post.creator_id,
          boosting_org_id: membership.org_id,
        },
        custom_text: testModeCustomText(stripeKey),
        success_url: `${origin}/dashboard/business/dragonshare?boost=success`,
        cancel_url: `${origin}/dashboard/business/dragonshare?boost=cancelled`,
      });
      logStep("Boost checkout session created", { sessionId: session.id, boostId });
      return json({ checkout_url: session.url, boost_id: boostId });
    };

    // Resolve a reusable default card.
    const customer = await stripe.customers.retrieve(customerId);
    let defaultPm: string | undefined;
    if (!("deleted" in customer && customer.deleted)) {
      const dpm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
      defaultPm = typeof dpm === "string" ? dpm : dpm?.id;
    }
    if (!defaultPm) {
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
      defaultPm = pms.data[0]?.id;
    }

    if (defaultPm) {
      try {
        const pi = await stripe.paymentIntents.create({
          amount: boostAmountCents,
          currency: "usd",
          customer: customerId,
          payment_method: defaultPm,
          off_session: true,
          confirm: true,
          metadata: {
            type: "dragonshare_boost",
            boost_id: boostId,
            post_id: post_id,
            boosting_org_id: membership.org_id,
            creator_id: post.creator_id,
          },
        }, { idempotencyKey: `boost_pi_${boostId}` });

        if (pi.status !== "succeeded") {
          logStep("Off-session PI not succeeded — falling back to checkout", { status: pi.status });
          return await openBoostCheckout();
        }

        await fulfillBoost(stripe, supabase, {
          boostId,
          postId: post_id,
          creatorId: post.creator_id,
          amountCents: boostAmountCents,
          paymentIntentId: pi.id,
        });
        logStep("Boost complete (off-session)", { boostId, piId: pi.id });

        const { creatorPayoutCents } = await import("../_shared/dragonshare-fee.ts")
          .then((m) => m.calculateDragonShareFee(boostAmountCents));
        return json({ success: true, boost_id: boostId, creator_payout_cents: creatorPayoutCents });
      } catch (err) {
        // authentication_required / card needs SCA → collect via hosted checkout
        logStep("Off-session charge failed — falling back to checkout", { message: String(err) });
        return await openBoostCheckout();
      }
    }

    // No card on file → hosted checkout collects + saves it.
    return await openBoostCheckout();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return json({ error: msg }, 500);
  }
});
```

> Note: the `import("../_shared/dragonshare-fee.ts")` for the payout amount in the
> success response is only for the toast number; if you prefer, add a static
> `import { calculateDragonShareFee }` at the top instead and drop the dynamic import.

- [ ] **Step 2: Optional `deno check supabase/functions/boost-payment/index.ts`**

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/boost-payment/index.ts
git commit -m "feat(payments): two-path boost charge (off-session or hosted checkout)"
```

---

### Task 5: `create-campaign-escrow` — anchor customer + save card

**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

- [ ] **Step 1: Add imports** (top of file, after existing imports)

```ts
import { getOrCreateOrgCustomer } from "../_shared/stripe-customer.ts";
import { testModeCustomText } from "../_shared/test-mode-text.ts";
```

- [ ] **Step 2: Select `org_id` on the campaign query**

Find the `.select(...)` on the `campaigns` query (currently:
`'id, user_id, escrow_status, budget_max, fixed_price, pricing_type, delivery_fee, delivery_type, title'`) and add `org_id`:

```ts
.select('id, user_id, org_id, escrow_status, budget_max, fixed_price, pricing_type, delivery_fee, delivery_type, title')
```

- [ ] **Step 3: Replace the customer lookup** (currently lists by email and does not persist)

Replace:
```ts
    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;
    if (customerId) {
      logStep("Found existing customer", { customerId });
    }
```
with:
```ts
    if (!campaign.org_id) throw new Error("Campaign has no org_id");
    const customerId = await getOrCreateOrgCustomer(stripe, supabaseClient, campaign.org_id, user.email);
    logStep("Resolved org customer", { customerId, orgId: campaign.org_id });
```

- [ ] **Step 4: Save the card + add custom_text on the session**

In the `stripe.checkout.sessions.create({ ... })` call, (a) remove `customer_email: customerId ? undefined : user.email,` (customer is always set now), (b) add `custom_text`, and (c) add `setup_future_usage` inside `payment_intent_data`:

```ts
      customer: customerId,
      custom_text: testModeCustomText(stripeKey),
      // ...existing line_items, mode, success_url, cancel_url, metadata...
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          campaign_id: campaignId,
          platform_fee: platformFee.toString(),
          user_id: user.id,
          type: 'campaign_escrow',
        },
      },
```

- [ ] **Step 5: Optional `deno check`, then commit**

```bash
git add supabase/functions/create-campaign-escrow/index.ts
git commit -m "feat(payments): anchor escrow customer on org and save card for reuse"
```

---

### Task 6: `create-sponsorship-checkout` — test-mode note only (kept as-is)

**Files:**
- Modify: `supabase/functions/create-sponsorship-checkout/index.ts`

- [ ] **Step 1: Add import**

```ts
import { testModeCustomText } from "../_shared/test-mode-text.ts";
```

- [ ] **Step 2: Add `custom_text` to the session create**

In `stripe.checkout.sessions.create({ ... })`, add after `customer_email`:

```ts
      custom_text: testModeCustomText(stripeKey),
```

(Leave the customer model and everything else unchanged — sponsorship is intentionally kept as-is.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-sponsorship-checkout/index.ts
git commit -m "feat(payments): show test-mode payment note on sponsorship checkout"
```

---

### Task 7: Webhook — set default card, fulfill boosts, handle expiry

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Add import + default-PM helper** (after existing imports)

```ts
import { fulfillBoost } from "../_shared/fulfill-boost.ts";

async function setDefaultPaymentMethodIfUnset(
  stripe: Stripe,
  customerId: string,
  paymentIntentId: string | null,
): Promise<void> {
  if (!paymentIntentId) return;
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) return;
  if ((customer as Stripe.Customer).invoice_settings?.default_payment_method) return;
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const pm = pi.payment_method;
  if (!pm) return;
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: typeof pm === "string" ? pm : pm.id },
  });
}
```

- [ ] **Step 2: In `checkout.session.completed`, set default PM (all types) + add boost branch**

Right after the existing `const paymentIntentId = session.payment_intent as string | null;` line (and before the `campaign_escrow` block), add:

```ts
        // Save the card as the customer's default so the next boost is one-tap.
        if (session.customer && paymentIntentId) {
          try {
            await setDefaultPaymentMethodIfUnset(
              stripe,
              typeof session.customer === "string" ? session.customer : session.customer.id,
              paymentIntentId,
            );
          } catch (e) {
            logStep("Non-fatal: failed to set default payment method", { error: String(e) });
          }
        }

        // DragonShare boost paid via hosted checkout
        if (metadata.type === "dragonshare_boost" && metadata.boost_id) {
          await fulfillBoost(stripe, supabase, {
            boostId: metadata.boost_id,
            postId: metadata.post_id,
            creatorId: metadata.creator_id,
            amountCents: session.amount_total ?? 0,
            paymentIntentId: paymentIntentId ?? "",
          });
          logStep("DragonShare boost fulfilled via checkout webhook", { boostId: metadata.boost_id });
        }
```

- [ ] **Step 3: In `checkout.session.expired`, add a boost branch**

Inside the `case "checkout.session.expired":` block, after the existing sponsorship reset, add:

```ts
        if (metadata.type === "dragonshare_boost" && metadata.boost_id) {
          await supabase
            .from("dragonshare_boosts")
            .update({ status: "failed" })
            .eq("id", metadata.boost_id)
            .eq("status", "pending");
          await supabase.from("dragonshare_events").insert({
            event_type: "boost_failed",
            actor_org_id: metadata.boosting_org_id,
            post_id: metadata.post_id,
            boost_id: metadata.boost_id,
            payload: { reason: "checkout_session_expired" },
          });
          logStep("DragonShare boost reset after session expiry", { boostId: metadata.boost_id });
        }
```

- [ ] **Step 4: Optional `deno check`, then commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(payments): webhook sets default card and fulfills checkout-paid boosts"
```

---

### Task 8: Pure `resolveBoostOutcome` + Vitest test (TDD)

**Files:**
- Create: `src/components/dragonshare/boostOutcome.ts`
- Test: `src/components/dragonshare/boostOutcome.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dragonshare/boostOutcome.test.ts
import { describe, it, expect } from 'vitest';
import { resolveBoostOutcome } from './boostOutcome';

describe('resolveBoostOutcome', () => {
  it('returns checkout when a checkout_url is present', () => {
    expect(resolveBoostOutcome({ checkout_url: 'https://stripe/cs_test_1' }))
      .toEqual({ kind: 'checkout', url: 'https://stripe/cs_test_1' });
  });

  it('returns queued when creator payout is not ready', () => {
    expect(resolveBoostOutcome({ error: 'CREATOR_PAYOUT_NOT_READY', boost_id: 'b1' }))
      .toEqual({ kind: 'queued' });
  });

  it('returns success when the off-session charge settled', () => {
    expect(resolveBoostOutcome({ success: true, boost_id: 'b1', creator_payout_cents: 800 }))
      .toEqual({ kind: 'success', creatorPayoutCents: 800 });
  });

  it('treats null/empty data as success-less unknown -> success fallback only on success flag', () => {
    expect(resolveBoostOutcome({})).toEqual({ kind: 'success', creatorPayoutCents: undefined });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/components/dragonshare/boostOutcome.test.ts`
Expected: FAIL — `resolveBoostOutcome` not found.

- [ ] **Step 3: Implement**

```ts
// src/components/dragonshare/boostOutcome.ts
export type BoostOutcome =
  | { kind: 'checkout'; url: string }
  | { kind: 'queued' }
  | { kind: 'success'; creatorPayoutCents?: number };

/** Maps a boost-payment edge function response to a UI outcome. */
export function resolveBoostOutcome(data: unknown): BoostOutcome {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.checkout_url === 'string') return { kind: 'checkout', url: d.checkout_url };
  if (d.error === 'CREATOR_PAYOUT_NOT_READY' || d.queued === true) return { kind: 'queued' };
  return { kind: 'success', creatorPayoutCents: d.creator_payout_cents as number | undefined };
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run src/components/dragonshare/boostOutcome.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dragonshare/boostOutcome.ts src/components/dragonshare/boostOutcome.test.ts
git commit -m "feat(payments): add tested resolveBoostOutcome helper"
```

---

### Task 9: Wire `BoostConfirmationSheet` to the two-path response

**Files:**
- Modify: `src/components/dragonshare/BoostConfirmationSheet.tsx`

The current `boostMutation` returns `res.data` and `onSuccess` always shows "on its way" — wrong for the checkout and queued cases. Route via `resolveBoostOutcome`.

- [ ] **Step 1: Import the helper** (with the other imports)

```ts
import { resolveBoostOutcome } from './boostOutcome';
```

- [ ] **Step 2: Pre-open a tab in `mutationFn` and route in `onSuccess`**

Replace the existing `boostMutation` definition with:

```ts
  const boostMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Pre-open a blank tab synchronously to dodge pop-up blockers (may be unused).
      const checkoutTab = window.open('about:blank', '_blank');

      const res = await supabase.functions.invoke('boost-payment', {
        body: { post_id: post.id, amount_cents: amountCents, tier_label: tierLabel },
      });
      if (res.error) {
        checkoutTab?.close();
        throw new Error(res.error.message);
      }
      return { data: res.data, checkoutTab };
    },
    onSuccess: ({ data, checkoutTab }) => {
      const outcome = resolveBoostOutcome(data);
      if (outcome.kind === 'checkout') {
        if (checkoutTab) checkoutTab.location.href = outcome.url;
        else window.open(outcome.url, '_blank');
        toast({ title: 'Complete your payment', description: 'Finish the boost in the new tab.' });
        onOpenChange(false);
        return;
      }
      checkoutTab?.close();
      if (outcome.kind === 'queued') {
        toast({ title: 'Boost queued', description: "We've notified the creator to finish setup. You won't be charged until it's processed." });
        onOpenChange(false);
        return;
      }
      toast({ title: 'Boost confirmed!', description: `$${(creatorPayoutCents / 100).toFixed(0)} is on its way to ${creatorName}.` });
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Boost failed', description: msg, variant: 'destructive' });
    },
  });
```

> This keeps the existing `creatorPayoutCents` / `creatorName` locals. The
> `CREATOR_PAYOUT_NOT_READY` case is now handled in `onSuccess` (the edge
> function returns it as HTTP 202, i.e. not an error), fixing the prior
> mishandling where it fell through to the success toast.

- [ ] **Step 3: Build + lint**

Run: `npm run build` then `npm run lint`
Expected: build succeeds; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dragonshare/BoostConfirmationSheet.tsx
git commit -m "feat(payments): route boost sheet through two-path outcome"
```

---

### Task 10: Build, deploy, and verify in production

**Files:** none (verification only)

- [ ] **Step 1: Full frontend gate**

Run: `npm run build` and `npx vitest run`
Expected: build passes; all tests green.

- [ ] **Step 2: Deploy edge functions to Supabase**

Deploy these functions (via the project's normal Supabase deploy mechanism / Supabase MCP `deploy_edge_function`, or `supabase functions deploy <name>`):
`boost-payment`, `create-campaign-escrow`, `create-sponsorship-checkout`, `stripe-webhook`.
Shared files under `_shared/` deploy with each function that imports them.

Confirm the Stripe webhook endpoint is subscribed to: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `transfer.updated` (already in use). No new event types are required.

- [ ] **Step 3: Push frontend to main (Lovable auto-deploy)**

```bash
git push
```

- [ ] **Step 4: Production verification on dragoncandy.io** (per CLAUDE.md)

Use the test logins from project memory. For each, screenshot + open Chrome DevTools console (expect no errors), and check Supabase function logs:

1. **Campaign escrow** (restaurant `dwilliams@harbormill.net`): pay a campaign via hosted checkout using card `4242 4242 4242 4242`. Verify: checkout shows the test-mode `custom_text` note; escrow becomes `held`; the card is saved to the org customer (Stripe dashboard → customer → payment methods).
2. **First boost, no card** — only if the org has no saved card yet: tap Confirm Boost → verify it opens a hosted-checkout tab (not a silent failure) → pay → verify creator transfer in Stripe and post `boost_status = boosted`.
3. **Repeat boost** (card now on file): tap Confirm Boost → verify it charges off-session with **no** tab and the success toast fires; creator transfer recorded.
4. **Sponsorship** (brand `damesonpoint@gmail.com`, if brand flow reachable): verify the test-mode note appears on its checkout.

- [ ] **Step 5: Verify both viewports**

Repeat the boost flow on **desktop** and **mobile** viewports (the boost sheet is mobile-first; confirm the sheet, toasts, and tab-open behave on both). Do not mark complete until both pass and the console is clean.

- [ ] **Step 6: Final confirmation**

Confirm with the user that Joe's accounts (`joe-coalition@gmail.com`) can now complete a boost and a campaign payment end-to-end. Only then is the task 95% → 100% complete.

---

## Notes for the implementer

- **Do not** re-introduce `automatic_payment_methods` on the off-session boost PI — pinning `payment_method` + `off_session` is intentional and `automatic_payment_methods` conflicts with it.
- `dragonshare_boosts.status` already allows `pending`/`failed`/`transferred`; `dragonshare_posts.boost_status` is `available|boosted|expired|withdrawn` — **no migration is needed or permitted** for this work.
- The `create_boost` RPC raises if the post is not `available`; that is the backstop preventing a re-charge after a successful boost (post becomes `boosted`).
- Keep every Supabase query's explicit `.select()` field list (no `select *`) and preserve existing error handling.
