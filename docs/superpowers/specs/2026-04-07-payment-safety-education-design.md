# Payment Safety & User Education System — Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Scope:** Automated money-loss prevention + user-facing payment education for DragonCandy launch

---

## 1. Problem Statement

DragonCandy is launching next week. The Phase 1 audit (`delivery-payment-audit-business.md`, `delivery-payment-audit-brand.md`) identified critical gaps in the payment pipeline:

- No audit trail for payment state changes (disputes unrecoverable)
- Campaign-deliverables bucket is public (raw creator content exposed)
- Missing webhook handlers for refunds, disputes, and failed transfers
- No webhook idempotency table (double-processing risk)
- Sponsorship payout missing idempotency key (double transfer risk)
- Sponsorship checkout lacks ownership validation
- Non-atomic pending_balance updates (race condition)
- Users have no visibility into where their money is in the pipeline

The system needs both **server-side safety infrastructure** (prevent real money loss) and **user-facing education** (build trust by making the payment flow transparent). These must be a unified system: the UI renders real state from real tables.

---

## 2. Goals

1. **Prevent financial loss** via ledger, idempotency, and webhook hardening
2. **Build user trust** by showing both sides exactly where money is at every step
3. **Zero risk to existing flows** — dual-write pattern, no breaking changes
4. **Ship within launch week** — scoped to what matters, defer what doesn't

### Non-Goals (Deferred)

- Refund flow UI (manual via Stripe dashboard for week 1)
- Auto-approval timer / escalation ladder (post-launch)
- Server-side revision limit enforcement (client-side cap stays)
- Budget pool accounting for brand multi-creator campaigns
- Usage rights / exclusivity enforcement
- Real watermark generation (private bucket + signed URLs sufficient)
- Sentry / error tracking integration

---

## 3. Architecture: Shadow Table (Dual-Write)

All existing mutable columns (`escrow_status`, `payment_status`, `content_status`) continue to work as-is. A new `payment_events` table is written alongside on every state change. Existing code reads from mutable columns. New timeline UI reads from `payment_events`. Over time, reads migrate to the event table.

**Why this approach:**
- Zero risk to existing working flows
- Real audit trail from day 1
- Timeline component backed by real data
- Clear migration path: deprecate mutable columns when reads are fully migrated

**Conscious trade-off:** Ledger writes are fire-and-forget (log error, don't throw). A post-launch reconciliation cron will detect and backfill gaps.

---

## 4. Database Schema

### 4a. `payment_events` Table (Append-Only Ledger)

```sql
CREATE TABLE payment_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('collaboration', 'sponsorship')),
  entity_id     UUID NOT NULL,
  campaign_id   UUID REFERENCES campaigns(id),  -- nullable for wallet withdrawals
  actor_id      UUID REFERENCES profiles(id),
  actor_role    TEXT NOT NULL CHECK (actor_role IN ('business', 'creator', 'brand', 'system', 'stripe')),
  -- Role mapping from DB: business_client → 'business', content_creator → 'creator', brand → 'brand'
  -- System/cron events use 'system', Stripe webhook events use 'stripe'
  amount_cents  INTEGER,
  currency      TEXT DEFAULT 'usd',
  stripe_id     TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Event types:**
- Escrow: `escrow_authorized`, `escrow_held`, `escrow_failed`, `escrow_expired`
- Content: `content_started`, `content_submitted`, `revision_requested`, `content_resubmitted`, `content_approved`
- Payment: `payment_released`, `transfer_created`, `transfer_failed`, `payout_completed`, `payout_pending_wallet`
- Sponsorship: `sponsorship_paid`
- Recovery: `refund_initiated`, `refund_completed`, `dispute_created`, `dispute_resolved`

**Indexes:**
```sql
CREATE INDEX idx_payment_events_entity ON payment_events (entity_type, entity_id, created_at);
CREATE INDEX idx_payment_events_campaign ON payment_events (campaign_id, created_at);
CREATE INDEX idx_payment_events_stripe ON payment_events (stripe_id) WHERE stripe_id IS NOT NULL;
```

**RLS:** Collaboration participants can view events for their collaborations. Sponsorship participants can view events for their sponsorships. No client INSERT — only service role (edge functions) can write.

### 4b. `stripe_webhook_events` Table (Idempotency)

```sql
CREATE TABLE stripe_webhook_events (
  event_id      TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'failed')),
  error_message TEXT
);
```

No RLS — accessed only by edge functions via service role.

### 4c. Storage Policy Fix

```sql
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
        AND fu.bucket_id = 'campaign-deliverables'  -- prevent cross-bucket path collisions
        AND c.user_id = auth.uid()
      )
    )
  );
```

---

## 5. Edge Function Changes

### 5a. Shared Helper

New file: `supabase/functions/_shared/payment-events.ts`

```typescript
export async function writePaymentEvent(
  supabase: SupabaseClient,
  event: {
    event_type: string;
    entity_type: 'collaboration' | 'sponsorship';
    entity_id: string;
    campaign_id: string;
    actor_id?: string;
    actor_role: 'business' | 'creator' | 'brand' | 'system' | 'stripe';
    amount_cents?: number;
    stripe_id?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from('payment_events').insert(event);
  if (error) {
    console.error(`[PAYMENT-EVENT] Failed to write ${event.event_type}:`, error.message);
    // Fire-and-forget: don't throw. Reconciliation cron catches gaps.
  }
}
```

### 5b. Dual-Write Mapping

| Edge Function | Events Written | Existing Column Update (kept) |
|---|---|---|
| `create-campaign-escrow` | `escrow_authorized` | `escrow_status = 'pending'` |
| `stripe-webhook` (checkout.session.completed) | `escrow_held` or `sponsorship_paid` | `escrow_status = 'held'` or `payment_status = 'paid'` |
| `stripe-webhook` (payment_intent.payment_failed) | `escrow_failed` | `escrow_status = 'none'` |
| `stripe-webhook` (checkout.session.expired) | `escrow_expired` | `escrow_status = 'none'` |
| `stripe-webhook` (charge.refunded) **NEW** | `refund_completed` | `escrow_status = 'refunded'` or `payment_status = 'refunded'` |
| `stripe-webhook` (charge.dispute.created) **NEW** | `dispute_created` | metadata only |
| `stripe-webhook` (transfer.failed) **NEW** | `transfer_failed` | restore `pending_balance` |
| `verify-campaign-escrow` | `escrow_held` (if not already from webhook) | `escrow_status = 'held'` |
| `release-creator-payout` | `content_approved` + `payment_released` + (`transfer_created` or `payout_pending_wallet`) | `content_status = 'approved'`, `status = 'completed'` |
| `release-sponsorship-payout` | `payment_released` + (`transfer_created` or `payout_pending_wallet`) | existing updates |
| `withdraw-pending-balance` | `transfer_created` | `pending_balance = 0` |
| `create-sponsorship-checkout` | `escrow_authorized` | `payment_status = 'pending'` |
| `verify-sponsorship-payment` | `sponsorship_paid` | `payment_status = 'paid'` |

### 5c. Content Status Events (Frontend → RPC)

Content state changes from the frontend write events via an RPC function:

```sql
CREATE OR REPLACE FUNCTION insert_payment_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_campaign_id UUID,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  -- Whitelist: only content-related events allowed from client
  IF p_event_type NOT IN ('content_started', 'content_submitted', 'revision_requested', 'content_resubmitted') THEN
    RAISE EXCEPTION 'Invalid event type: %. Only content events allowed from client.', p_event_type;
  END IF;

  -- Validate caller is a participant
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

  -- Map DB role to actor_role: business_client → 'business', content_creator → 'creator', brand → 'brand'
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
```

Events written from frontend:
- `content_started` (creator starts content)
- `content_submitted` (creator submits)
- `revision_requested` (business requests revision, metadata includes notes and revision_number)
- `content_resubmitted` (creator resubmits after revision)

### 5d. Webhook Handler Updates

**Idempotency integration** in `stripe-webhook/index.ts`:

```
1. Verify signature (existing)
2. Check stripe_webhook_events for event.id
   → If exists and status='processed': return 200
   → If exists and status='failed': allow re-processing
3. Process event (existing switch/case + new cases)
4. Write to payment_events
5. Update mutable columns (existing)
6. Insert stripe_webhook_events with status='processed'
7. Return 200

On failure:
  → Insert stripe_webhook_events with status='failed'
  → Return 500 (Stripe retries)
```

**New webhook cases:**

| Event | Action |
|---|---|
| `charge.refunded` | Write `refund_completed` event, update `escrow_status='refunded'` or `payment_status='refunded'` |
| `charge.dispute.created` | Write `dispute_created` event with dispute details in metadata, send admin email |
| `transfer.failed` | Write `transfer_failed` event, restore `pending_balance` if applicable |

---

## 6. P0 Safety Fixes (Bundled)

### 6a. Sponsorship Payout Idempotency Key

In `release-sponsorship-payout/index.ts`, add to `stripe.transfers.create()`:

```typescript
{ idempotencyKey: `sponsorship_payout_${sponsorshipId}` }
```

### 6b. Sponsorship Checkout Ownership Validation

In `create-sponsorship-checkout/index.ts`, before creating checkout session:

```typescript
const { data: sponsorship } = await adminClient
  .from('campaign_sponsorships')
  .select('brand_id')
  .eq('id', sponsorshipId)
  .single();

const { data: brandProfile } = await adminClient
  .from('business_profiles')
  .select('id')
  .eq('user_id', user.id)
  .eq('id', sponsorship.brand_id)
  .single();

if (!brandProfile) {
  return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 });
}
```

### 6c. Atomic pending_balance in release-creator-payout

Replace read-modify-write with an RPC function that handles NULL correctly:

```sql
-- Migration: add atomic balance increment function
CREATE OR REPLACE FUNCTION increment_pending_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_profile_type TEXT  -- 'creator' or 'business'
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

Edge function call:
```typescript
const { data: result } = await supabaseClient.rpc('increment_pending_balance', {
  p_user_id: collaboration.creator_id,
  p_amount: creatorPayout,
  p_profile_type: 'creator',
});
```

This is a single atomic UPDATE — no read-modify-write race. `COALESCE` handles NULL pending_balance correctly.

---

## 7. Frontend Components

### 7a. `<PaymentTimeline>` Component

**File:** `src/components/payments/PaymentTimeline.tsx`

**Props:**
```typescript
interface PaymentTimelineProps {
  entityType: 'collaboration' | 'sponsorship';
  entityId: string;
  campaignId: string;
  userRole: 'business' | 'creator' | 'brand';
  variant: 'compact' | 'full';
}
```

**Data hook:** `usePaymentTimeline(entityType, entityId)` — React Query, refetches on focus + 30s interval.

**Compact variant** (ProjectDetailsPage widget):
- Vertical stepper, 4-5 visible steps
- Current step highlighted in teal with pulse, completed steps have teal checkmarks, future grayed
- One line of microcopy below current step
- "View full payment details" link

**Full variant** (payments page):
- Expanded stepper with timestamps, actor names, amounts
- Revision sub-steps indented
- Failure states in red/amber with action buttons
- Metadata visible (revision notes, failure reasons)

**Design system compliance:**
- Stepper line: `border-l-2 border-teal-300`
- Active dot: `bg-teal-400 ring-2 ring-teal-200` (pulse animation)
- Completed dot: `bg-teal-400` with checkmark
- Failed dot: `bg-red-400` with X
- Pending dot: `bg-gray-300`
- Cards: `rounded-2xl bg-white p-4`
- Copy: `text-sm text-gray-500`

### 7b. `paymentEducation` Config Map

**File:** `src/lib/paymentEducation.ts`

TypeScript map of `Record<role, Record<event_type, { title, description, action? }>>`.

Three role keys: `business`, `creator`, `brand`. Each maps every `event_type` to role-appropriate microcopy.

Examples:
- Business + `escrow_held` → "Funds Held Securely" / "Your payment is held in escrow. When you approve the content, the creator gets paid."
- Creator + `payout_pending_wallet` → "Payment in Your Wallet" / "Your earnings are ready. Complete Stripe setup to withdraw to your bank account." / action: "Set Up Payouts"
- Creator + `revision_requested` → "Revision Requested" / "The business has requested changes. Check their notes and resubmit." / action: "View Feedback"

### 7c. Payments Page

**Route:** `/dashboard/payments`

**Sections:**
1. **Summary cards** (role-specific):
   - Business: Total Spent, In Escrow, Pending Approvals
   - Creator: Total Earned, In Wallet, Pending Review
   - Brand: Total Committed, Paid Out, Pool Remaining
2. **Active payments** — entities with non-terminal latest event, each showing campaign name, amount, current status, expandable timeline
3. **Completed** — entities with terminal event (payout_completed, refund_completed), showing date and amount
4. **Issues** — entities with failure events (escrow_failed, transfer_failed, dispute_created), with action buttons

**Tabs:** Active / Completed / Issues
**Sort:** Most recent activity (default)

### 7d. Embedded Widget Integration

In `ProjectDetailsPage.tsx`, add `<PaymentTimeline variant="compact">` as a card section between the existing stats row and the content area. Only renders when `payment_events` exist for the collaboration.

In `BrandSponsorships.tsx`, add compact timeline to each sponsorship card's expanded view.

---

## 8. Notification System

### 8a. Toast Notifications

The `usePaymentTimeline` hook tracks previously seen event IDs. When new events appear from the other party or system, fire a toast using the `paymentEducation` config:

```typescript
const newEvents = events.filter(e => !seenIds.has(e.id) && e.actor_id !== currentUserId);
newEvents.forEach(event => {
  const copy = paymentEducation[userRole][event.event_type];
  if (copy) toast({ title: copy.title, description: copy.description });
});
```

### 8b. Email Notifications

Edge functions call `send-notification-email` after writing payment events. Each edge function that writes a notifiable event makes a direct `fetch()` call to `send-notification-email` with the event details. Email subject and body sourced from a server-side education config (mirrors the frontend map).

**Email sending is fire-and-forget:** the edge function logs errors but does not fail if the email fails. No batching or frequency guard for launch — send one email per notifiable event. Batching/dedup is a post-launch enhancement.

**Callsite per edge function:**
| Edge Function | Event | Email Call Added After |
|---|---|---|
| `stripe-webhook` | `escrow_held` | After campaign escrow update |
| `stripe-webhook` | `escrow_failed` | After escrow status reset |
| `stripe-webhook` | `refund_completed` | After refund status update |
| `stripe-webhook` | `dispute_created` | After dispute event write |
| `stripe-webhook` | `transfer.failed` | After transfer_failed event write |
| `release-creator-payout` | `transfer_created` or `payout_pending_wallet` | After transfer/balance update |
| `release-sponsorship-payout` | `transfer_created` or `payout_pending_wallet` | After transfer/balance update |
| `verify-sponsorship-payment` | `sponsorship_paid` | Already sends emails (keep existing) |

Content events (`content_submitted`, `revision_requested`) already trigger notifications via existing frontend `send-notification-email` calls — no changes needed.

**Events that trigger email:**

| Event | Recipient | Subject Pattern |
|---|---|---|
| `escrow_held` | Business | "Your campaign is live — funds held securely" |
| `escrow_held` | Creator | "New project — payment secured" |
| `escrow_failed` | Business | "Payment failed — please update your payment method" |
| `content_submitted` | Business | "Content ready for review" |
| `revision_requested` | Creator | "Revision requested on [campaign]" |
| `transfer_created` | Creator | "Your payout of $X is on its way" |
| `payout_pending_wallet` | Creator | "Earnings added to your wallet" |
| `transfer_failed` | Creator | "Payout issue — we're working on it" |
| `refund_completed` | Business | "Refund of $X processed" |
| `dispute_created` | Business + Admin | "Payment dispute filed — action needed" |

**Frequency guard (deferred to post-launch):** For v1, each notifiable event sends one email immediately. Post-launch enhancement: max one payment email per entity per 10 minutes, with rapid successive events batched.

---

## 9. Files to Create or Modify

### New Files
| File | Purpose |
|---|---|
| `supabase/migrations/2026XXXX_payment_events.sql` | payment_events table, stripe_webhook_events table, storage policy fix, RPC function |
| `supabase/functions/_shared/payment-events.ts` | Shared writePaymentEvent helper |
| `src/components/payments/PaymentTimeline.tsx` | Timeline component (compact + full variants) |
| `src/lib/paymentEducation.ts` | Role-aware microcopy config map |
| `src/hooks/usePaymentTimeline.ts` | React Query hook for payment events |
| `src/pages/PaymentsPage.tsx` | Dedicated payments dashboard |

### Modified Files
| File | Change |
|---|---|
| `supabase/functions/stripe-webhook/index.ts` | Add idempotency check, 3 new webhook handlers, dual-write events |
| `supabase/functions/create-campaign-escrow/index.ts` | Add dual-write event |
| `supabase/functions/verify-campaign-escrow/index.ts` | Add dual-write event |
| `supabase/functions/release-creator-payout/index.ts` | Add dual-write events, atomic pending_balance |
| `supabase/functions/release-sponsorship-payout/index.ts` | Add idempotency key, dual-write events |
| `supabase/functions/create-sponsorship-checkout/index.ts` | Add ownership validation, dual-write event |
| `supabase/functions/verify-sponsorship-payment/index.ts` | Add dual-write event |
| `supabase/functions/withdraw-pending-balance/index.ts` | Add dual-write event |
| `src/pages/ProjectDetailsPage.tsx` | Embed compact PaymentTimeline widget |
| `src/pages/BrandSponsorships.tsx` | Embed compact PaymentTimeline widget |
| `src/components/projects/ContentApprovalPanel.tsx` | Write content events via RPC |
| `src/components/projects/QuickApprovalCard.tsx` | Write content events via RPC |
| `src/App.tsx` | Add /dashboard/payments route |
| `src/lib/navConfig.ts` | Add Payments nav item |

---

## 10. Post-Launch Roadmap

**Week 2-3:**
- Refund flow UI (button + edge function + ledger entry)
- Content reject path (reject status + automatic refund trigger)
- Auto-approval timer (scheduled function, configurable per delivery type)

**Month 1:**
- Escalation ladder (24hr → 48hr → admin flag)
- Server-side revision limit enforcement
- Reconciliation cron (compare mutable columns against ledger)

**Month 2-3:**
- Budget pool accounting for brand multi-creator campaigns
- Usage rights expiration notifications
- Exclusivity enforcement at campaign-acceptance time
- Real watermark generation (Sharp for images, ffmpeg for video)
- Sentry integration on all edge functions

---

## 11. Open Questions

1. **Platform fee rate:** Currently 5% across all edge functions. Moat Playbook says 15-20%. Which is correct for launch?
2. **Payments page nav placement:** Which bottom-nav icon slot should it occupy? New icon, or replace an existing one?
3. **Email batching window:** 10 minutes proposed. Too long? Too short?
4. **Admin notification for disputes:** Email only, or also a Slack webhook?
