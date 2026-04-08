# Payment Safety & User Education Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified payment safety infrastructure (ledger, idempotency, private bucket, webhook hardening) and user-facing payment education system (timeline component, microcopy, payments page, notifications) for DragonCandy launch.

**Architecture:** Shadow table dual-write pattern. New `payment_events` ledger writes alongside existing mutable columns. Timeline UI reads from ledger. Existing flows untouched. See spec: `docs/superpowers/specs/2026-04-07-payment-safety-education-design.md`

**Tech Stack:** Supabase (Postgres, Edge Functions/Deno, Storage), React + TypeScript, React Query, Stripe SDK, Tailwind CSS, shadcn/ui

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `supabase/migrations/20260408000000_payment_safety.sql` | payment_events table, stripe_webhook_events table, storage policy fix, insert_payment_event RPC, increment_pending_balance RPC |
| `supabase/functions/_shared/payment-events.ts` | Shared writePaymentEvent helper for edge functions |
| `src/hooks/usePaymentTimeline.ts` | React Query hook fetching payment_events for an entity |
| `src/hooks/usePaymentNotifications.ts` | Toast notifications for new payment events from other party |
| `src/lib/paymentEducation.ts` | Role+state microcopy config map |
| `src/components/payments/PaymentTimeline.tsx` | Timeline stepper component (compact + full variants) |
| `src/components/payments/PaymentSummaryCards.tsx` | Summary cards for payments page (role-specific) |
| `src/pages/PaymentsPage.tsx` | Dedicated /dashboard/payments route |

### Modified Files
| File | Change |
|---|---|
| `supabase/functions/stripe-webhook/index.ts` | Add idempotency check, 3 new webhook handlers, dual-write events |
| `supabase/functions/create-campaign-escrow/index.ts` | Add dual-write event |
| `supabase/functions/verify-campaign-escrow/index.ts` | Add dual-write event |
| `supabase/functions/release-creator-payout/index.ts` | Add dual-write events, use atomic RPC for pending_balance |
| `supabase/functions/release-sponsorship-payout/index.ts` | Add idempotency key, dual-write events |
| `supabase/functions/create-sponsorship-checkout/index.ts` | Add ownership validation, dual-write event |
| `supabase/functions/verify-sponsorship-payment/index.ts` | Add dual-write event |
| `supabase/functions/withdraw-pending-balance/index.ts` | Add dual-write event |
| `src/pages/ProjectDetailsPage.tsx` | Embed compact PaymentTimeline widget |
| `src/pages/BrandSponsorships.tsx` | Embed compact PaymentTimeline widget |
| `src/components/projects/ContentApprovalPanel.tsx` | Write content events via RPC |
| `src/components/projects/QuickApprovalCard.tsx` | Write content events via RPC |
| `src/App.tsx` | Add /dashboard/payments route |
| `src/lib/navConfig.ts` | Add Payments nav item for all roles |

---

## Task 1: Database Migration — Ledger, Idempotency, Storage Fix, RPCs

**Files:**
- Create: `supabase/migrations/20260408000000_payment_safety.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Payment Safety Migration
-- Creates: payment_events, stripe_webhook_events
-- Fixes: campaign-deliverables storage policy
-- Adds: insert_payment_event RPC, increment_pending_balance RPC
-- ============================================================

-- 1. payment_events (append-only ledger)
CREATE TABLE IF NOT EXISTS payment_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('collaboration', 'sponsorship')),
  entity_id     UUID NOT NULL,
  campaign_id   UUID REFERENCES campaigns(id),  -- nullable for wallet withdrawals (not tied to a specific campaign)
  actor_id      UUID REFERENCES profiles(id),
  actor_role    TEXT NOT NULL CHECK (actor_role IN ('business', 'creator', 'brand', 'system', 'stripe')),
  -- Role mapping from DB: business_client -> 'business', content_creator -> 'creator', brand -> 'brand'
  -- System/cron events use 'system', Stripe webhook events use 'stripe'
  amount_cents  INTEGER,
  currency      TEXT DEFAULT 'usd',
  stripe_id     TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_entity ON payment_events (entity_type, entity_id, created_at);
CREATE INDEX idx_payment_events_campaign ON payment_events (campaign_id, created_at);
CREATE INDEX idx_payment_events_stripe ON payment_events (stripe_id) WHERE stripe_id IS NOT NULL;

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Append-only: no UPDATE, no DELETE policies
CREATE POLICY "Collaboration participants can view payment events"
  ON payment_events FOR SELECT
  USING (
    entity_type = 'collaboration' AND (
      EXISTS (SELECT 1 FROM campaign_collaborations cc WHERE cc.id = entity_id AND cc.creator_id = auth.uid())
      OR
      EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid())
    )
  );

CREATE POLICY "Sponsorship participants can view payment events"
  ON payment_events FOR SELECT
  USING (
    entity_type = 'sponsorship' AND (
      EXISTS (
        SELECT 1 FROM campaign_sponsorships cs
        WHERE cs.id = entity_id
        AND (
          cs.brand_id IN (SELECT bp.id FROM business_profiles bp WHERE bp.user_id = auth.uid())
          OR cs.restaurant_id IN (SELECT bp.id FROM business_profiles bp WHERE bp.user_id = auth.uid())
        )
      )
    )
  );

-- 2. stripe_webhook_events (idempotency)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id      TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'failed')),
  error_message TEXT
);

-- 3. Fix campaign-deliverables storage policy
DROP POLICY IF EXISTS "Users can view campaign deliverables" ON storage.objects;

CREATE POLICY "Collaboration participants can view deliverables"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campaign-deliverables'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      EXISTS (
        SELECT 1 FROM file_uploads fu
        JOIN campaigns c ON c.id = fu.campaign_id
        WHERE fu.file_path = name
        AND fu.bucket_name = 'campaign-deliverables'
        AND c.user_id = auth.uid()
      )
    )
  );

-- 4. RPC: insert_payment_event (client-safe, whitelisted event types)
CREATE OR REPLACE FUNCTION insert_payment_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_campaign_id UUID,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  IF p_event_type NOT IN ('content_started', 'content_submitted', 'revision_requested', 'content_resubmitted') THEN
    RAISE EXCEPTION 'Invalid event type: %. Only content events allowed from client.', p_event_type;
  END IF;

  IF p_entity_type = 'collaboration' THEN
    IF NOT EXISTS (
      SELECT 1 FROM campaign_collaborations cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.id = p_entity_id
      AND (cc.creator_id = auth.uid() OR c.user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  INSERT INTO payment_events (event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, metadata)
  VALUES (
    p_event_type, p_entity_type, p_entity_id, p_campaign_id, auth.uid(),
    (SELECT CASE
      WHEN role = 'content_creator' THEN 'creator'
      WHEN role = 'business_client' THEN 'business'
      WHEN role = 'brand' THEN 'brand'
      ELSE 'business'
    END FROM profiles WHERE id = auth.uid()),
    p_metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: increment_pending_balance (atomic, NULL-safe)
CREATE OR REPLACE FUNCTION increment_pending_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_profile_type TEXT
) RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  IF p_profile_type = 'creator' THEN
    UPDATE creator_profiles
    SET pending_balance = COALESCE(pending_balance, 0) + p_amount
    WHERE user_id = p_user_id
    RETURNING pending_balance INTO new_balance;
  ELSE
    UPDATE business_profiles
    SET pending_balance = COALESCE(pending_balance, 0) + p_amount
    WHERE user_id = p_user_id
    RETURNING pending_balance INTO new_balance;
  END IF;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Verify migration syntax**

Run: `cd supabase && grep -c "CREATE TABLE" migrations/20260408000000_payment_safety.sql`
Expected: 2 (payment_events + stripe_webhook_events)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408000000_payment_safety.sql
git commit -m "feat: add payment_events ledger, webhook idempotency, private bucket, RPCs"
```

---

## Task 2: Shared Payment Events Helper

**Files:**
- Create: `supabase/functions/_shared/payment-events.ts`

- [ ] **Step 1: Create the shared helper**

```typescript
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface PaymentEvent {
  event_type: string;
  entity_type: 'collaboration' | 'sponsorship';
  entity_id: string;
  campaign_id: string;
  actor_id?: string;
  actor_role: 'business' | 'creator' | 'brand' | 'system' | 'stripe';
  amount_cents?: number;
  currency?: string;
  stripe_id?: string;
  metadata?: Record<string, unknown>;
}

export async function writePaymentEvent(
  supabase: SupabaseClient,
  event: PaymentEvent,
  logPrefix: string = '[PAYMENT-EVENT]'
): Promise<void> {
  const { error } = await supabase
    .from('payment_events')
    .insert({
      ...event,
      currency: event.currency ?? 'usd',
      metadata: event.metadata ?? {},
    });

  if (error) {
    console.error(`${logPrefix} Failed to write ${event.event_type} for ${event.entity_type}/${event.entity_id}: ${error.message}`);
    // Fire-and-forget: don't throw. Reconciliation cron catches gaps.
  } else {
    console.log(`${logPrefix} Wrote ${event.event_type} for ${event.entity_type}/${event.entity_id}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/payment-events.ts
git commit -m "feat: add shared writePaymentEvent helper for edge functions"
```

---

## Task 3: Harden stripe-webhook — Idempotency + New Handlers + Dual-Write

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

This is the most complex task. Read the existing file first: it handles `checkout.session.completed`, `payment_intent.payment_failed`, `checkout.session.expired`, `account.updated`.

- [ ] **Step 1: Add import for shared helper**

At the top of the file, after the existing imports, add:

```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

- [ ] **Step 2: Add idempotency check after signature verification**

After the `constructEventAsync` call (around line 44), before the `switch` statement, add:

```typescript
  // Idempotency: check if this event was already processed
  const { data: existingEvent } = await supabase
    .from('stripe_webhook_events')
    .select('event_id, status')
    .eq('event_id', event.id)
    .single();

  if (existingEvent?.status === 'processed') {
    logStep("Event already processed, skipping", { eventId: event.id });
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }
```

- [ ] **Step 3: Add new webhook cases to the switch statement**

Before the `default:` case, add three new handlers:

```typescript
      // ── Refund processed ────────────────────────────────────────────────
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const metadata = charge.metadata ?? {};
        const refundAmount = charge.amount_refunded;

        logStep("Refund processed", { chargeId: charge.id, amount: refundAmount });

        if (metadata.type === "campaign_escrow" && metadata.campaign_id) {
          await supabase
            .from("campaigns")
            .update({ escrow_status: "refunded" })
            .eq("id", metadata.campaign_id);

          await writePaymentEvent(supabase, {
            event_type: 'refund_completed',
            entity_type: 'collaboration',
            entity_id: metadata.collaboration_id || metadata.campaign_id,
            campaign_id: metadata.campaign_id,
            actor_role: 'stripe',
            amount_cents: refundAmount,
            stripe_id: charge.id,
            metadata: { reason: charge.refunds?.data?.[0]?.reason },
          }, '[STRIPE-WEBHOOK]');
        }

        if (metadata.sponsorship_id) {
          await supabase
            .from("campaign_sponsorships")
            .update({ payment_status: "refunded" })
            .eq("id", metadata.sponsorship_id);

          await writePaymentEvent(supabase, {
            event_type: 'refund_completed',
            entity_type: 'sponsorship',
            entity_id: metadata.sponsorship_id,
            campaign_id: metadata.campaign_id || '',
            actor_role: 'stripe',
            amount_cents: refundAmount,
            stripe_id: charge.id,
          }, '[STRIPE-WEBHOOK]');
        }
        break;
      }

      // ── Dispute / chargeback ────────────────────────────────────────────
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const charge = dispute.charge as string;
        const metadata = (dispute as any).metadata ?? {};

        logStep("Dispute created", { disputeId: dispute.id, chargeId: charge, amount: dispute.amount, reason: dispute.reason });

        // Write event — the metadata may not have our IDs, so log what we have
        await writePaymentEvent(supabase, {
          event_type: 'dispute_created',
          entity_type: metadata.type === 'campaign_escrow' ? 'collaboration' : 'sponsorship',
          entity_id: metadata.collaboration_id || metadata.sponsorship_id || dispute.id,
          campaign_id: metadata.campaign_id || '',
          actor_role: 'stripe',
          amount_cents: dispute.amount,
          stripe_id: dispute.id,
          metadata: { reason: dispute.reason, status: dispute.status, charge_id: charge },
        }, '[STRIPE-WEBHOOK]');

        // Send admin notification
        try {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: 'admin@dragoncandy.io',
              subject: `Payment Dispute Filed — $${(dispute.amount / 100).toFixed(2)}`,
              type: 'dispute_alert',
              data: { disputeId: dispute.id, amount: dispute.amount, reason: dispute.reason },
            },
          });
        } catch (emailErr) {
          logStep("Failed to send dispute admin email", { error: String(emailErr) });
        }
        break;
      }

      // ── Transfer failed ─────────────────────────────────────────────────
      case "transfer.failed": {
        const transfer = event.data.object as Stripe.Transfer;
        const metadata = transfer.metadata ?? {};

        logStep("Transfer failed", { transferId: transfer.id, amount: transfer.amount });

        const entityType = metadata.sponsorship_id ? 'sponsorship' : 'collaboration';
        const entityId = metadata.collaboration_id || metadata.sponsorship_id || transfer.id;

        await writePaymentEvent(supabase, {
          event_type: 'transfer_failed',
          entity_type: entityType,
          entity_id: entityId,
          campaign_id: metadata.campaign_id || '',
          actor_role: 'stripe',
          amount_cents: transfer.amount,
          stripe_id: transfer.id,
          metadata: { failure_message: (transfer as any).failure_message },
        }, '[STRIPE-WEBHOOK]');

        // Restore pending balance if this was a payout transfer
        if (metadata.collaboration_id) {
          const { data: collab } = await supabase
            .from('campaign_collaborations')
            .select('creator_id')
            .eq('id', metadata.collaboration_id)
            .single();
          if (collab) {
            await supabase.rpc('increment_pending_balance', {
              p_user_id: collab.creator_id,
              p_amount: transfer.amount / 100,
              p_profile_type: 'creator',
            });
          }
        }
        break;
      }
```

- [ ] **Step 4: Add dual-write events to EXISTING webhook cases**

In the `checkout.session.completed` handler, after the campaign escrow update succeeds (after `logStep("Campaign escrow confirmed via webhook")`), add:

```typescript
          await writePaymentEvent(supabase, {
            event_type: 'escrow_held',
            entity_type: 'collaboration',
            entity_id: campaignId, // Will be replaced with collaboration ID when available
            campaign_id: campaignId,
            actor_role: 'stripe',
            amount_cents: session.amount_total ?? undefined,
            stripe_id: paymentIntentId ?? undefined,
          }, '[STRIPE-WEBHOOK]');
```

After the sponsorship payment update succeeds (after `logStep("Sponsorship payment confirmed via webhook")`), add:

```typescript
          await writePaymentEvent(supabase, {
            event_type: 'sponsorship_paid',
            entity_type: 'sponsorship',
            entity_id: sponsorshipId,
            campaign_id: metadata.campaign_id || '',
            actor_role: 'stripe',
            amount_cents: session.amount_total ?? undefined,
            stripe_id: paymentIntentId ?? undefined,
          }, '[STRIPE-WEBHOOK]');
```

In `payment_intent.payment_failed`, after the campaign escrow reset, add:

```typescript
          await writePaymentEvent(supabase, {
            event_type: 'escrow_failed',
            entity_type: 'collaboration',
            entity_id: metadata.campaign_id,
            campaign_id: metadata.campaign_id,
            actor_role: 'stripe',
            stripe_id: pi.id,
            metadata: { failure_message: failureMessage },
          }, '[STRIPE-WEBHOOK]');
```

In `checkout.session.expired`, after the campaign escrow reset, add:

```typescript
          await writePaymentEvent(supabase, {
            event_type: 'escrow_expired',
            entity_type: 'collaboration',
            entity_id: metadata.campaign_id,
            campaign_id: metadata.campaign_id,
            actor_role: 'stripe',
          }, '[STRIPE-WEBHOOK]');
```

- [ ] **Step 5: Record processed event at end of handler**

Before the final `return new Response(JSON.stringify({ received: true })`, add:

```typescript
  // Record successful processing
  await supabase
    .from('stripe_webhook_events')
    .upsert({ event_id: event.id, event_type: event.type, status: 'processed' });
```

In the outer catch block (around line 215), before `return new Response`, add:

```typescript
    // Record failed processing (allows retry)
    await supabase
      .from('stripe_webhook_events')
      .upsert({ event_id: event.id, event_type: event.type, status: 'failed', error_message: String(err) })
      .then(() => {}, () => {}); // Ignore upsert errors in error handler
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat: harden webhook — idempotency, refund/dispute/transfer handlers, dual-write"
```

---

## Task 4: Dual-Write in Campaign Escrow Functions

**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`
- Modify: `supabase/functions/verify-campaign-escrow/index.ts`

- [ ] **Step 1: Update create-campaign-escrow**

Add import at top:
```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

After the `escrow_status: 'pending'` update succeeds (around line 167), add:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'escrow_authorized',
      entity_type: 'collaboration',
      entity_id: campaignId,
      campaign_id: campaignId,
      actor_id: user.id,
      actor_role: 'business',
      amount_cents: totalAmountCents,
      stripe_id: session.id,
    }, '[CREATE-CAMPAIGN-ESCROW]');
```

- [ ] **Step 2: Update verify-campaign-escrow**

Add import at top:
```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

After the `escrow_status: 'held'` update succeeds, add:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'escrow_held',
      entity_type: 'collaboration',
      entity_id: campaignId,
      campaign_id: campaignId,
      actor_id: user.id,
      actor_role: 'business',
      stripe_id: paymentIntentId,
    }, '[VERIFY-CAMPAIGN-ESCROW]');
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-campaign-escrow/index.ts supabase/functions/verify-campaign-escrow/index.ts
git commit -m "feat: dual-write payment events in campaign escrow functions"
```

---

## Task 5: Dual-Write + Safety Fixes in Payout Functions

**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts`
- Modify: `supabase/functions/release-sponsorship-payout/index.ts`
- Modify: `supabase/functions/withdraw-pending-balance/index.ts`

- [ ] **Step 1: Update release-creator-payout**

Add import at top:
```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

Replace the non-atomic pending_balance update (lines 166-171) with:

```typescript
      const newBalance = await supabaseClient.rpc('increment_pending_balance', {
        p_user_id: collaboration.creator_id,
        p_amount: creatorPayout,
        p_profile_type: 'creator',
      });
```

After the Stripe transfer succeeds (after `logStep("Transfer created")`), add:

```typescript
      await writePaymentEvent(supabaseClient, {
        event_type: 'content_approved',
        entity_type: 'collaboration',
        entity_id: collaborationId,
        campaign_id: campaign.id,
        actor_id: user.id,
        actor_role: 'business',
      }, '[RELEASE-CREATOR-PAYOUT]');

      await writePaymentEvent(supabaseClient, {
        event_type: 'payment_released',
        entity_type: 'collaboration',
        entity_id: collaborationId,
        campaign_id: campaign.id,
        actor_id: user.id,
        actor_role: 'business',
        amount_cents: Math.round(creatorPayout * 100),
        stripe_id: transfer.id,
      }, '[RELEASE-CREATOR-PAYOUT]');

      await writePaymentEvent(supabaseClient, {
        event_type: 'transfer_created',
        entity_type: 'collaboration',
        entity_id: collaborationId,
        campaign_id: campaign.id,
        actor_role: 'system',
        amount_cents: Math.round(creatorPayout * 100),
        stripe_id: transfer.id,
        metadata: { destination: creatorProfile.stripe_account_id },
      }, '[RELEASE-CREATOR-PAYOUT]');
```

In the else branch (pending balance path), after the balance increment, add:

```typescript
      await writePaymentEvent(supabaseClient, {
        event_type: 'content_approved',
        entity_type: 'collaboration',
        entity_id: collaborationId,
        campaign_id: campaign.id,
        actor_id: user.id,
        actor_role: 'business',
      }, '[RELEASE-CREATOR-PAYOUT]');

      await writePaymentEvent(supabaseClient, {
        event_type: 'payout_pending_wallet',
        entity_type: 'collaboration',
        entity_id: collaborationId,
        campaign_id: campaign.id,
        actor_role: 'system',
        amount_cents: Math.round(creatorPayout * 100),
        metadata: { reason: 'Creator Stripe onboarding incomplete' },
      }, '[RELEASE-CREATOR-PAYOUT]');
```

- [ ] **Step 2: Update release-sponsorship-payout — add idempotency key + dual-write**

Add import at top:
```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

Find the `stripe.transfers.create()` call and add the idempotency key option:

```typescript
      }, { idempotencyKey: `sponsorship_payout_${sponsorshipId}` });
```

After the Stripe transfer succeeds, add:

```typescript
      await writePaymentEvent(supabaseClient, {
        event_type: 'payment_released',
        entity_type: 'sponsorship',
        entity_id: sponsorshipId,
        campaign_id: sponsorship.campaign_id,
        actor_role: 'system',
        amount_cents: Math.round(restaurantPayout * 100),
        stripe_id: transfer.id,
      }, '[RELEASE-SPONSORSHIP-PAYOUT]');

      await writePaymentEvent(supabaseClient, {
        event_type: 'transfer_created',
        entity_type: 'sponsorship',
        entity_id: sponsorshipId,
        campaign_id: sponsorship.campaign_id,
        actor_role: 'system',
        amount_cents: Math.round(restaurantPayout * 100),
        stripe_id: transfer.id,
        metadata: { destination: businessProfile.stripe_account_id },
      }, '[RELEASE-SPONSORSHIP-PAYOUT]');
```

In the else branch (pending balance path), add:

```typescript
      await writePaymentEvent(supabaseClient, {
        event_type: 'payout_pending_wallet',
        entity_type: 'sponsorship',
        entity_id: sponsorshipId,
        campaign_id: sponsorship.campaign_id,
        actor_role: 'system',
        amount_cents: Math.round(restaurantPayout * 100),
        metadata: { reason: 'Restaurant Stripe onboarding incomplete' },
      }, '[RELEASE-SPONSORSHIP-PAYOUT]');
```

- [ ] **Step 3: Update withdraw-pending-balance — add dual-write**

Add import at top:
```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

After the successful Stripe transfer, add:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'transfer_created',
      entity_type: profileType === 'creator' ? 'collaboration' : 'sponsorship',
      entity_id: user.id, // No specific entity — this is a wallet withdrawal
      campaign_id: '',
      actor_id: user.id,
      actor_role: profileType === 'creator' ? 'creator' : 'business',
      amount_cents: amountInCents,
      stripe_id: transfer.id,
      metadata: { type: 'wallet_withdrawal' },
    }, '[WITHDRAW-PENDING-BALANCE]');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/release-creator-payout/index.ts supabase/functions/release-sponsorship-payout/index.ts supabase/functions/withdraw-pending-balance/index.ts
git commit -m "feat: dual-write + safety fixes in payout functions (idempotency, atomic balance)"
```

---

## Task 6: Dual-Write in Sponsorship Checkout Functions + Ownership Fix

**Files:**
- Modify: `supabase/functions/create-sponsorship-checkout/index.ts`
- Modify: `supabase/functions/verify-sponsorship-payment/index.ts`

- [ ] **Step 1: Update create-sponsorship-checkout — add ownership validation + dual-write**

Add import at top:
```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

After auth verification, before creating the Checkout session, add ownership check:

```typescript
    // Verify caller owns this sponsorship
    const { data: sponsorship, error: sponsorshipError } = await adminClient
      .from('campaign_sponsorships')
      .select('brand_id, campaign_id')
      .eq('id', sponsorshipId)
      .single();

    if (sponsorshipError || !sponsorship) {
      throw new Error("Sponsorship not found");
    }

    const { data: brandProfile } = await adminClient
      .from('business_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', sponsorship.brand_id)
      .single();

    if (!brandProfile) {
      return new Response(JSON.stringify({ error: 'Not authorized to pay for this sponsorship' }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
```

After the `payment_status: 'pending'` update, add:

```typescript
    await writePaymentEvent(adminClient, {
      event_type: 'escrow_authorized',
      entity_type: 'sponsorship',
      entity_id: sponsorshipId,
      campaign_id: sponsorship.campaign_id,
      actor_id: user.id,
      actor_role: 'brand',
      amount_cents: totalAmount,
      stripe_id: session.id,
    }, '[CREATE-SPONSORSHIP-CHECKOUT]');
```

- [ ] **Step 2: Update verify-sponsorship-payment — add dual-write**

Add import at top:
```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

After the `payment_status: 'paid'` update, add:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'sponsorship_paid',
      entity_type: 'sponsorship',
      entity_id: sponsorshipId,
      campaign_id: sponsorship.campaign_id,
      actor_id: user.id,
      actor_role: 'brand',
      amount_cents: Math.round(sponsorship.sponsorship_amount * 100),
      stripe_id: paymentIntentId,
    }, '[VERIFY-SPONSORSHIP-PAYMENT]');
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-sponsorship-checkout/index.ts supabase/functions/verify-sponsorship-payment/index.ts
git commit -m "feat: add ownership validation + dual-write to sponsorship checkout functions"
```

---

## Task 7: Payment Education Config Map

**Files:**
- Create: `src/lib/paymentEducation.ts`

- [ ] **Step 1: Create the microcopy config**

```typescript
export interface PaymentMessage {
  title: string;
  description: string;
  action?: string;
}

export type PaymentEventType =
  | 'escrow_authorized' | 'escrow_held' | 'escrow_failed' | 'escrow_expired'
  | 'content_started' | 'content_submitted' | 'revision_requested' | 'content_resubmitted' | 'content_approved'
  | 'payment_released' | 'transfer_created' | 'transfer_failed' | 'payout_completed' | 'payout_pending_wallet'
  | 'sponsorship_paid'
  | 'refund_initiated' | 'refund_completed' | 'dispute_created' | 'dispute_resolved';

export type UserRole = 'business' | 'creator' | 'brand';

const businessMessages: Partial<Record<PaymentEventType, PaymentMessage>> = {
  escrow_authorized: {
    title: "Payment Processing",
    description: "Your payment is being processed. Funds will be held securely until you approve the creator's content.",
  },
  escrow_held: {
    title: "Funds Held Securely",
    description: "Your payment is held in escrow. You won't be charged again. When you approve the content, the creator gets paid.",
  },
  escrow_failed: {
    title: "Payment Failed",
    description: "Your payment could not be processed. Please check your payment method and try again.",
    action: "Retry Payment",
  },
  escrow_expired: {
    title: "Payment Session Expired",
    description: "Your checkout session expired. Please initiate payment again to proceed.",
    action: "Pay Now",
  },
  content_started: {
    title: "Creator Working",
    description: "The creator has started working on your content. You'll be notified when it's ready for review.",
  },
  content_submitted: {
    title: "Content Ready for Review",
    description: "The creator has submitted their content. Review it and approve to release payment, or request a revision.",
    action: "Review Content",
  },
  revision_requested: {
    title: "Revision Requested",
    description: "You've requested changes. The creator will revise and resubmit.",
  },
  content_resubmitted: {
    title: "Revised Content Submitted",
    description: "The creator has resubmitted after your feedback. Review the updated content.",
    action: "Review Content",
  },
  content_approved: {
    title: "Content Approved",
    description: "You approved the content. The creator's payment is being processed now.",
  },
  payment_released: {
    title: "Payment Released",
    description: "Payment has been released to the creator. The project is complete.",
  },
  transfer_created: {
    title: "Payment Sent",
    description: "The creator's payment has been transferred successfully.",
  },
  transfer_failed: {
    title: "Transfer Issue",
    description: "There was an issue sending payment to the creator. Our team is looking into it.",
  },
  payout_pending_wallet: {
    title: "Payment Held for Creator",
    description: "Payment is ready for the creator. They'll receive it once they complete their payout setup.",
  },
  refund_completed: {
    title: "Refund Processed",
    description: "Your refund has been processed and will appear on your statement within 5-10 business days.",
  },
  dispute_created: {
    title: "Payment Dispute Filed",
    description: "A dispute has been filed on this payment. Our team has been notified and will respond.",
  },
};

const creatorMessages: Partial<Record<PaymentEventType, PaymentMessage>> = {
  escrow_authorized: {
    title: "Payment Incoming",
    description: "The business is completing payment. Once confirmed, you can start working on the content.",
  },
  escrow_held: {
    title: "Payment Secured",
    description: "The business has paid. Your payment is locked in. Deliver your content and get paid when they approve it.",
  },
  escrow_failed: {
    title: "Payment Issue",
    description: "The business's payment didn't go through. They've been notified to try again.",
  },
  content_started: {
    title: "You're Working on It",
    description: "You've started creating content for this project. Submit when you're ready.",
  },
  content_submitted: {
    title: "Content Under Review",
    description: "Your content is being reviewed by the business. You'll be notified when it's approved or if changes are needed.",
  },
  revision_requested: {
    title: "Revision Requested",
    description: "The business has requested changes. Check their notes and resubmit when ready.",
    action: "View Feedback",
  },
  content_resubmitted: {
    title: "Resubmitted for Review",
    description: "Your revised content is being reviewed. You'll be notified of the result.",
  },
  content_approved: {
    title: "Content Approved!",
    description: "Great work! Your content has been approved and payment is on its way.",
  },
  payment_released: {
    title: "Getting Paid",
    description: "Your payment is being transferred now.",
  },
  transfer_created: {
    title: "You Got Paid!",
    description: "Payment has been transferred to your Stripe account. It may take 1-2 business days to arrive in your bank.",
  },
  transfer_failed: {
    title: "Payout Issue",
    description: "There was a problem with your payout. Please check your Stripe account settings.",
    action: "Check Payout Settings",
  },
  payout_pending_wallet: {
    title: "Payment in Your Wallet",
    description: "Your earnings are ready! Complete your Stripe setup to withdraw to your bank account.",
    action: "Set Up Payouts",
  },
  refund_completed: {
    title: "Payment Refunded",
    description: "The payment for this project has been refunded to the business.",
  },
  dispute_created: {
    title: "Payment Under Review",
    description: "A payment dispute has been filed. Our team is handling it — no action needed from you right now.",
  },
};

const brandMessages: Partial<Record<PaymentEventType, PaymentMessage>> = {
  escrow_authorized: {
    title: "Payment Processing",
    description: "Your sponsorship payment is being processed.",
  },
  sponsorship_paid: {
    title: "Sponsorship Paid",
    description: "Your sponsorship payment is confirmed. The campaign is funded and active.",
  },
  escrow_held: {
    title: "Funds Secured",
    description: "Your sponsorship funds are held securely until the campaign is complete.",
  },
  escrow_failed: {
    title: "Payment Failed",
    description: "Your sponsorship payment could not be processed. Please try again.",
    action: "Retry Payment",
  },
  payment_released: {
    title: "Payment Released",
    description: "Sponsorship payment has been released to the restaurant.",
  },
  transfer_created: {
    title: "Payment Sent",
    description: "The restaurant's sponsorship payment has been transferred successfully.",
  },
  refund_completed: {
    title: "Refund Processed",
    description: "Your sponsorship refund has been processed.",
  },
  dispute_created: {
    title: "Payment Dispute Filed",
    description: "A dispute has been filed on this sponsorship payment. Our team has been notified.",
  },
};

export const paymentEducation: Record<UserRole, Partial<Record<PaymentEventType, PaymentMessage>>> = {
  business: businessMessages,
  creator: creatorMessages,
  brand: brandMessages,
};

export function getPaymentMessage(role: UserRole, eventType: string): PaymentMessage | undefined {
  return paymentEducation[role]?.[eventType as PaymentEventType];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/paymentEducation.ts
git commit -m "feat: add role-aware payment education microcopy config"
```

---

## Task 8: Payment Timeline Hook

**Files:**
- Create: `src/hooks/usePaymentTimeline.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PaymentEvent {
  id: string;
  event_type: string;
  entity_type: 'collaboration' | 'sponsorship';
  entity_id: string;
  campaign_id: string;
  actor_id: string | null;
  actor_role: string;
  amount_cents: number | null;
  currency: string;
  stripe_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function usePaymentTimeline(
  entityType: 'collaboration' | 'sponsorship',
  entityId: string | undefined,
) {
  return useQuery({
    queryKey: ['payment-timeline', entityType, entityId],
    queryFn: async (): Promise<PaymentEvent[]> => {
      if (!entityId) return [];

      const { data, error } = await supabase
        .from('payment_events')
        .select('id, event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, amount_cents, currency, stripe_id, metadata, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
    enabled: !!entityId,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // 30 seconds
  });
}

export function usePaymentTimelineByCampaign(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['payment-timeline-campaign', campaignId],
    queryFn: async (): Promise<PaymentEvent[]> => {
      if (!campaignId) return [];

      const { data, error } = await supabase
        .from('payment_events')
        .select('id, event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, amount_cents, currency, stripe_id, metadata, created_at')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
    enabled: !!campaignId,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePaymentTimeline.ts
git commit -m "feat: add usePaymentTimeline React Query hook"
```

---

## Task 9: Payment Timeline Component

**Files:**
- Create: `src/components/payments/PaymentTimeline.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { CheckCircle, Circle, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { usePaymentTimeline, type PaymentEvent } from "@/hooks/usePaymentTimeline";
import { getPaymentMessage, type UserRole } from "@/lib/paymentEducation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface PaymentTimelineProps {
  entityType: 'collaboration' | 'sponsorship';
  entityId: string;
  campaignId: string;
  userRole: UserRole;
  variant: 'compact' | 'full';
}

const failureEvents = new Set(['escrow_failed', 'escrow_expired', 'transfer_failed', 'dispute_created']);
const terminalEvents = new Set(['transfer_created', 'payout_completed', 'payout_pending_wallet', 'refund_completed', 'dispute_resolved']);

function getStepIcon(event: PaymentEvent, isLatest: boolean) {
  if (failureEvents.has(event.event_type)) {
    return <AlertCircle className="w-5 h-5 text-red-400" />;
  }
  if (isLatest) {
    return <div className="w-5 h-5 rounded-full bg-teal-400 ring-2 ring-teal-200 animate-pulse" />;
  }
  return <CheckCircle className="w-5 h-5 text-teal-400" />;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatAmount(cents: number | null): string | null {
  if (!cents) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaymentTimeline({ entityType, entityId, campaignId, userRole, variant }: PaymentTimelineProps) {
  const { data: events, isLoading, error } = usePaymentTimeline(entityType, entityId);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error || !events?.length) {
    return null; // Don't render if no events yet
  }

  const displayEvents = variant === 'compact' ? events.slice(-5) : events;

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100">
      <h3 className="text-sm font-bold text-gray-900 mb-3">
        {variant === 'compact' ? 'Payment Status' : 'Payment Timeline'}
      </h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-3 bottom-3 w-0.5 bg-teal-200" />

        <div className="space-y-4">
          {displayEvents.map((event, index) => {
            const isLatest = index === displayEvents.length - 1;
            const message = getPaymentMessage(userRole, event.event_type);
            if (!message) return null;

            const amount = formatAmount(event.amount_cents);

            return (
              <div key={event.id} className="relative flex items-start gap-3 pl-0">
                <div className="relative z-10 mt-0.5 shrink-0">
                  {getStepIcon(event, isLatest)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isLatest ? 'text-gray-900' : 'text-gray-600'}`}>
                      {message.title}
                    </span>
                    {amount && (
                      <span className="text-xs font-medium text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                        {amount}
                      </span>
                    )}
                  </div>
                  {(isLatest || variant === 'full') && (
                    <p className="text-xs text-gray-500 mt-0.5">{message.description}</p>
                  )}
                  {variant === 'full' && (
                    <p className="text-xs text-gray-400 mt-0.5">{formatTimestamp(event.created_at)}</p>
                  )}
                  {variant === 'full' && event.event_type === 'revision_requested' && event.metadata?.notes && (
                    <p className="text-xs text-amber-600 mt-1 italic">"{String(event.metadata.notes)}"</p>
                  )}
                  {isLatest && message.action && (
                    <Button size="sm" variant="outline" className="mt-2 h-7 text-xs rounded-full border-teal-300 text-teal-600">
                      {message.action}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {variant === 'compact' && (
        <Link
          to="/dashboard/payments"
          className="block text-xs text-teal-500 font-medium mt-3 hover:underline"
        >
          View full payment details
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/payments/PaymentTimeline.tsx
git commit -m "feat: add PaymentTimeline component with compact and full variants"
```

---

## Task 10: Payment Summary Cards Component

**Files:**
- Create: `src/components/payments/PaymentSummaryCards.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { DollarSign, Lock, Clock, Wallet } from "lucide-react";
import type { UserRole } from "@/lib/paymentEducation";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";

interface PaymentSummaryCardsProps {
  events: PaymentEvent[];
  userRole: UserRole;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function computeBusinessStats(events: PaymentEvent[]) {
  const totalSpent = events
    .filter(e => e.event_type === 'escrow_held' || e.event_type === 'sponsorship_paid')
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const inEscrow = events
    .filter(e => e.event_type === 'escrow_held')
    .filter(e => !events.some(r => r.entity_id === e.entity_id && (r.event_type === 'payment_released' || r.event_type === 'refund_completed')))
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const pendingReview = events
    .filter(e => e.event_type === 'content_submitted')
    .filter(e => !events.some(a => a.entity_id === e.entity_id && a.event_type === 'content_approved'))
    .length;
  return { totalSpent, inEscrow, pendingReview };
}

function computeCreatorStats(events: PaymentEvent[]) {
  const totalEarned = events
    .filter(e => e.event_type === 'transfer_created' || e.event_type === 'payout_pending_wallet')
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const inWallet = events
    .filter(e => e.event_type === 'payout_pending_wallet')
    .filter(e => !events.some(w => w.entity_id === e.entity_id && w.event_type === 'transfer_created' && w.metadata?.type === 'wallet_withdrawal'))
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const pendingReview = events
    .filter(e => e.event_type === 'content_submitted')
    .filter(e => !events.some(a => a.entity_id === e.entity_id && a.event_type === 'content_approved'))
    .length;
  return { totalEarned, inWallet, pendingReview };
}

export function PaymentSummaryCards({ events, userRole }: PaymentSummaryCardsProps) {
  if (userRole === 'business') {
    const { totalSpent, inEscrow, pendingReview } = computeBusinessStats(events);
    return (
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={DollarSign} label="Total Spent" value={formatCurrency(totalSpent)} />
        <SummaryCard icon={Lock} label="In Escrow" value={formatCurrency(inEscrow)} />
        <SummaryCard icon={Clock} label="Pending Review" value={String(pendingReview)} />
      </div>
    );
  }

  if (userRole === 'creator') {
    const { totalEarned, inWallet, pendingReview } = computeCreatorStats(events);
    return (
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={DollarSign} label="Total Earned" value={formatCurrency(totalEarned)} />
        <SummaryCard icon={Wallet} label="In Wallet" value={formatCurrency(inWallet)} />
        <SummaryCard icon={Clock} label="Pending Review" value={String(pendingReview)} />
      </div>
    );
  }

  // Brand — reuse business stats for now
  const { totalSpent, inEscrow, pendingReview } = computeBusinessStats(events);
  return (
    <div className="grid grid-cols-3 gap-3">
      <SummaryCard icon={DollarSign} label="Committed" value={formatCurrency(totalSpent)} />
      <SummaryCard icon={Lock} label="Paid Out" value={formatCurrency(totalSpent - inEscrow)} />
      <SummaryCard icon={Clock} label="Active" value={String(pendingReview)} />
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
      <Icon className="w-5 h-5 text-teal-400 mx-auto mb-1" />
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/payments/PaymentSummaryCards.tsx
git commit -m "feat: add PaymentSummaryCards component with role-specific stats"
```

---

## Task 11: Payments Page

**Files:**
- Create: `src/pages/PaymentsPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/navConfig.ts`

- [ ] **Step 1: Create PaymentsPage**

```typescript
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import { PaymentSummaryCards } from "@/components/payments/PaymentSummaryCards";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";
import type { UserRole } from "@/lib/paymentEducation";

type Tab = 'active' | 'completed' | 'issues';

const failureTypes = new Set(['escrow_failed', 'escrow_expired', 'transfer_failed', 'dispute_created']);
const terminalTypes = new Set(['transfer_created', 'payout_completed', 'refund_completed', 'dispute_resolved']);

function getUserRole(role: string | undefined): UserRole {
  if (role === 'content_creator') return 'creator';
  if (role === 'brand') return 'brand';
  return 'business';
}

export default function PaymentsPage() {
  const { user, userRole } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const role = getUserRole(userRole);

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['all-payment-events', user?.id],
    queryFn: async (): Promise<PaymentEvent[]> => {
      const { data, error } = await supabase
        .from('payment_events')
        .select('id, event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, amount_cents, currency, stripe_id, metadata, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  // Group events by entity
  const entityMap = new Map<string, { entityType: 'collaboration' | 'sponsorship'; entityId: string; campaignId: string; events: PaymentEvent[] }>();
  for (const event of allEvents) {
    const key = `${event.entity_type}:${event.entity_id}`;
    if (!entityMap.has(key)) {
      entityMap.set(key, { entityType: event.entity_type, entityId: event.entity_id, campaignId: event.campaign_id, events: [] });
    }
    entityMap.get(key)!.events.push(event);
  }

  const entities = Array.from(entityMap.values());
  const getLatestEvent = (events: PaymentEvent[]) => events[events.length - 1];

  const activeEntities = entities.filter(e => {
    const latest = getLatestEvent(e.events);
    return !terminalTypes.has(latest.event_type) && !failureTypes.has(latest.event_type);
  });
  const completedEntities = entities.filter(e => terminalTypes.has(getLatestEvent(e.events).event_type));
  const issueEntities = entities.filter(e => failureTypes.has(getLatestEvent(e.events).event_type));

  const displayed = activeTab === 'active' ? activeEntities : activeTab === 'completed' ? completedEntities : issueEntities;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Your Payments</h1>
          <p className="text-sm text-gray-500 mt-1">See where your money is across all projects</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : (
          <>
            <PaymentSummaryCards events={allEvents} userRole={role} />

            {/* Tabs */}
            <div className="flex gap-2">
              {(['active', 'completed', 'issues'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-teal-400 text-white'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'issues' && issueEntities.length > 0 && (
                    <Badge className="ml-1.5 bg-red-500 text-white text-xs px-1.5">{issueEntities.length}</Badge>
                  )}
                </button>
              ))}
            </div>

            {/* Entity list */}
            {displayed.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
                <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {activeTab === 'active' && "No active payments right now."}
                  {activeTab === 'completed' && "No completed payments yet."}
                  {activeTab === 'issues' && "No payment issues. Everything looks good!"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayed.map(entity => (
                  <PaymentTimeline
                    key={`${entity.entityType}:${entity.entityId}`}
                    entityType={entity.entityType}
                    entityId={entity.entityId}
                    campaignId={entity.campaignId}
                    userRole={role}
                    variant="full"
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

Read `src/App.tsx` and find the existing dashboard routes. Add inside the appropriate route group:

```typescript
import PaymentsPage from "@/pages/PaymentsPage";
```

Add route alongside existing dashboard routes:

```tsx
<Route path="/dashboard/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Add nav item to navConfig.ts**

Read `src/lib/navConfig.ts`. Add a Payments item to each role's sidebar/bottom nav. Import `Wallet` from lucide-react if not already imported:

```typescript
{ icon: Wallet, label: "Payments", href: "/dashboard/payments" },
```

Add this to `businessSidebarNav`, `creatorSidebarNav`, and `brandSidebarNav` arrays.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PaymentsPage.tsx src/App.tsx src/lib/navConfig.ts
git commit -m "feat: add Payments page with route and nav item for all roles"
```

---

## Task 12: Embed Compact Timeline in Project & Sponsorship Pages

**Files:**
- Modify: `src/pages/ProjectDetailsPage.tsx`
- Modify: `src/pages/BrandSponsorships.tsx`

- [ ] **Step 1: Add compact timeline to ProjectDetailsPage**

Read `src/pages/ProjectDetailsPage.tsx`. Find where the project stats/info section is rendered. Add the compact timeline widget as a card section:

```typescript
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
```

In the JSX, after the project stats row and before the content area, add:

```tsx
{collaboration?.id && collaboration?.campaign_id && (
  <PaymentTimeline
    entityType="collaboration"
    entityId={collaboration.id}
    campaignId={collaboration.campaign_id}
    userRole={userRole === 'content_creator' ? 'creator' : 'business'}
    variant="compact"
  />
)}
```

- [ ] **Step 2: Add compact timeline to BrandSponsorships**

Read `src/pages/BrandSponsorships.tsx`. Find where individual sponsorship cards are rendered. Add the compact timeline inside the expanded sponsorship view:

```typescript
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
```

In the sponsorship card JSX, add:

```tsx
{sponsorship.id && sponsorship.campaign_id && (
  <PaymentTimeline
    entityType="sponsorship"
    entityId={sponsorship.id}
    campaignId={sponsorship.campaign_id}
    userRole="brand"
    variant="compact"
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectDetailsPage.tsx src/pages/BrandSponsorships.tsx
git commit -m "feat: embed compact PaymentTimeline in project and sponsorship pages"
```

---

## Task 13: Wire Content Events from Frontend via RPC

**Files:**
- Modify: `src/components/projects/ContentApprovalPanel.tsx`
- Modify: `src/components/projects/QuickApprovalCard.tsx`
- Modify: `src/pages/ProjectDetailsPage.tsx` (for content_started and content_submitted)

**Event → Callsite mapping:**
| Event | Component | Trigger point |
|---|---|---|
| `content_started` | `ProjectDetailsPage.tsx` or `StartContentButton.tsx` | When creator clicks "Start Content" and `content_status` is set to `in_progress` |
| `content_submitted` | `ProjectDetailsPage.tsx` | When creator clicks "Submit Content" and `content_status` is set to `submitted` |
| `revision_requested` | `ContentApprovalPanel.tsx`, `QuickApprovalCard.tsx` | When business clicks "Request Revision" |
| `content_resubmitted` | `ProjectDetailsPage.tsx` | When creator resubmits after revision and `content_status` changes from `revision_requested` to `submitted` |
| `content_approved` | N/A | Written by `release-creator-payout` edge function — no frontend RPC needed |

- [ ] **Step 1: Add RPC calls to ContentApprovalPanel**

Read `src/components/projects/ContentApprovalPanel.tsx`. After the revision request mutation succeeds (after the `content_status: 'revision_requested'` update), add:

```typescript
// Write payment event for revision
await supabase.rpc('insert_payment_event', {
  p_event_type: 'revision_requested',
  p_entity_type: 'collaboration',
  p_entity_id: collaborationId,
  p_campaign_id: campaignId,
  p_metadata: { notes: revisionNotes, revision_number: newRevisionCount },
});
```

- [ ] **Step 2: Add RPC calls to QuickApprovalCard**

Same pattern as ContentApprovalPanel. After revision request mutation succeeds, add the same RPC call.

- [ ] **Step 3: Add content_started and content_submitted events**

Read `src/pages/ProjectDetailsPage.tsx` and find the "Start Content" button handler (or `src/components/projects/StartContentButton.tsx` if it exists as a separate component). After the `content_status: 'in_progress'` update succeeds, add:

```typescript
await supabase.rpc('insert_payment_event', {
  p_event_type: 'content_started',
  p_entity_type: 'collaboration',
  p_entity_id: collaborationId,
  p_campaign_id: campaignId,
  p_metadata: {},
});
```

Find the "Submit Content" handler. After the `content_status: 'submitted'` update succeeds, add:

```typescript
// Use 'content_resubmitted' if this is a resubmission after revision
const eventType = previousContentStatus === 'revision_requested' ? 'content_resubmitted' : 'content_submitted';
await supabase.rpc('insert_payment_event', {
  p_event_type: eventType,
  p_entity_type: 'collaboration',
  p_entity_id: collaborationId,
  p_campaign_id: campaignId,
  p_metadata: {},
});
```

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ContentApprovalPanel.tsx src/components/projects/QuickApprovalCard.tsx src/pages/ProjectDetailsPage.tsx
git commit -m "feat: write content payment events via RPC from approval and submission components"
```

---

## Task 14: Payment Toast Notifications

**Files:**
- Create: `src/hooks/usePaymentNotifications.ts`

- [ ] **Step 1: Create the notification hook**

```typescript
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getPaymentMessage, type UserRole } from "@/lib/paymentEducation";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";

export function usePaymentNotifications(
  events: PaymentEvent[] | undefined,
  userRole: UserRole,
) {
  const { toast } = useToast();
  const { user } = useAuth();
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!events || !user?.id) return;

    // On first load, mark all existing events as seen
    if (seenIds.current.size === 0) {
      events.forEach(e => seenIds.current.add(e.id));
      return;
    }

    const newEvents = events.filter(
      e => !seenIds.current.has(e.id) && e.actor_id !== user.id
    );

    for (const event of newEvents) {
      seenIds.current.add(event.id);
      const message = getPaymentMessage(userRole, event.event_type);
      if (message) {
        toast({
          title: message.title,
          description: message.description,
        });
      }
    }
  }, [events, user?.id, userRole, toast]);
}
```

- [ ] **Step 2: Wire it into ProjectDetailsPage**

In `src/pages/ProjectDetailsPage.tsx`, where `usePaymentTimeline` is called, add:

```typescript
import { usePaymentNotifications } from "@/hooks/usePaymentNotifications";

// After the usePaymentTimeline call:
usePaymentNotifications(timelineEvents, userRole === 'content_creator' ? 'creator' : 'business');
```

- [ ] **Step 3: Wire it into PaymentsPage**

In `src/pages/PaymentsPage.tsx`, after the `allEvents` query:

```typescript
import { usePaymentNotifications } from "@/hooks/usePaymentNotifications";

usePaymentNotifications(allEvents, role);
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePaymentNotifications.ts src/pages/ProjectDetailsPage.tsx src/pages/PaymentsPage.tsx
git commit -m "feat: add payment toast notifications for events from other party"
```

---

## Task 15: Smoke Test and Final Verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`
Expected: App compiles without TypeScript errors.

- [ ] **Step 2: Verify route exists**

Navigate to `http://localhost:5173/dashboard/payments` (or equivalent).
Expected: Page renders with "Your Payments" heading, empty state message, three summary cards.

- [ ] **Step 3: Verify nav item**

Check that "Payments" appears in the sidebar/bottom nav for all three roles (log in as each role type).

- [ ] **Step 4: Verify ProjectDetailsPage has timeline widget**

Navigate to an existing project detail page.
Expected: A "Payment Status" card appears (may show empty/no events if the migration hasn't been applied to the live DB yet).

- [ ] **Step 5: Verify no TypeScript errors in edge functions**

Run: `grep -r "payment-events" supabase/functions/ --include="*.ts" -l`
Expected: Lists all modified edge functions that import the shared helper.

- [ ] **Step 6: Final commit**

```bash
git add -A
git status  # Verify no unintended files
git commit -m "chore: final verification pass for payment safety & education system"
```

---

## Execution Notes

**Migration deployment:** The `20260408000000_payment_safety.sql` migration must be applied to Supabase before the frontend changes will work. Push it via `supabase db push` or apply through the Supabase dashboard.

**Stripe webhook registration:** After deploying the updated `stripe-webhook` function, register these new webhook events in the Stripe dashboard:
- `charge.refunded`
- `charge.dispute.created`
- `transfer.failed`

**Testing with existing data:** The payments page and timeline will be empty until new payment events start flowing. Existing collaborations and sponsorships won't have events retroactively. Consider a one-time backfill script (post-launch) that creates events from existing mutable column states.

**Edge function deployment order:** Deploy `_shared/payment-events.ts` FIRST, then all edge functions that import it. Supabase bundles shared modules automatically.

**Email notifications (deferred):** The spec defines email callsites for 8 edge functions (stripe-webhook, release-creator-payout, release-sponsorship-payout, verify-sponsorship-payment). This plan does NOT include wiring those email calls — existing email notifications in `useProjectComplete.ts` and `useSponsorshipComplete.ts` continue to work. Adding payment-event-triggered emails is a fast-follow task after the core safety infrastructure is deployed and verified.
