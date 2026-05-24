# Content Delivery System Stabilization — Design Spec

**Date:** 2026-05-24
**Author:** Dame Williams + Claude Code
**Status:** Approved

## Context

The content delivery system is the core marketplace transaction: a creator uploads content, a business reviews it, and payment is released from escrow. This pipeline spans 5 edge functions, 6 React components, 4 hooks, and a PL/pgSQL state machine across 9 statuses. The system has been built iteratively — prior commits show at least three separate bug-fix passes (22, 9, and 6 bugs respectively) — but structural issues remain that would cause financial errors, silent failures, and data inconsistencies in production.

DragonCandy is in Stripe test mode. No real money has flowed through the pipeline. These fixes must land before switching to live mode and launching.

### Issues Found

A deep audit of the five most critical files (`ContentReviewSection.tsx`, `useProjectFileUpload.ts`, `release-creator-payout`, `auto-approve-content`, `create-campaign-escrow`) identified 14 issues across four severity levels. The most critical: the payout function calculates the creator's payment using different logic than the escrow function, ignoring negotiated counter-offers entirely.

## Approach

Severity-layered fix in three passes, with build/typecheck gates between each. Critical financial bugs first, then operational reliability issues, then defensive hardening. Each pass is self-contained and testable.

## Pass 1: Critical & High Severity (5 Fixes)

### 1.1 — Pricing Desync Between Escrow and Payout (CRITICAL)

**Problem:** `create-campaign-escrow` already correctly queries `campaign_applications` → `application_counter_offers` for an accepted counter-offer and uses the negotiated rate. However, `release-creator-payout` (lines 98-105) ignores counter-offers entirely and falls back to `campaign.fixed_price` or `campaign.budget_max`. If a creator negotiated a different rate via counter-offer, the escrow charges the correct amount but the payout sends the wrong amount.

**Fix:** Extract the existing pricing resolution logic from `create-campaign-escrow` into a shared utility at `supabase/functions/_shared/pricing-utils.ts`, then have both functions call it:

```typescript
export async function resolvePayoutAmount(
  supabaseClient: SupabaseClient,
  campaignId: string,
  collaborationId: string
): Promise<{ amount: number; source: string }>
```

This function:
1. Queries `campaign_collaborations` → `campaign_applications` → `application_counter_offers` for an accepted counter-offer with a `proposed_rate`
2. Falls back to `campaign.fixed_price`
3. Falls back to `campaign.budget_max`
4. Returns the amount and its source for logging

Both `create-campaign-escrow` and `release-creator-payout` call this utility, ensuring the same amount is charged and paid.

**Files:**
- Create: `supabase/functions/_shared/pricing-utils.ts`
- Modify: `supabase/functions/create-campaign-escrow/index.ts`
- Modify: `supabase/functions/release-creator-payout/index.ts`

### 1.2 — No Rollback After Stripe Transfer if DB Update Fails (HIGH)

**Problem:** In `release-creator-payout`, if the Stripe transfer succeeds (line 149) but the subsequent DB update to `campaign_collaborations` fails (line 185), money leaves the platform account but the collaboration status is never updated. There is no compensation mechanism.

**Fix:** Restructure `release-creator-payout` to use a two-phase commit pattern:

1. **Phase 1 (DB pre-commit):** Update `escrow_status` to `'releasing'` — a new intermediate state that signals "transfer in progress." If this fails, stop immediately (no money moves).
2. **Phase 2 (Stripe transfer):** Execute the Stripe transfer. If this fails, revert `escrow_status` to `'held'`.
3. **Phase 3 (DB finalize):** Update `escrow_status` to `'released'`, `content_status` to `'approved'`/`'auto_approved'`, and campaign to `'completed'`. If this fails, log a critical error — the money has moved but the DB is stale. A manual reconciliation is needed, but at least the intermediate `'releasing'` state makes the inconsistency visible.

**Migration:** Add `'releasing'` to the `escrow_status` CHECK constraint. The existing constraint also includes `'refunded'` (used by `refund-campaign-escrow` and `stripe-webhook`), which must be preserved:
```sql
-- Query pg_constraint to find the exact auto-generated constraint name first
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'campaigns'::regclass
    AND conname LIKE '%escrow_status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE campaigns DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_escrow_status_check
  CHECK (escrow_status IN ('none', 'pending', 'held', 'releasing', 'released', 'refunded'));
```

**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts`
- Create: migration for `escrow_status` CHECK constraint update

### 1.3 — Silent Audit Logging Failures Abort Payout (HIGH)

**Problem:** `writePaymentEvent()` calls in `release-creator-payout` are awaited and propagate exceptions. If the `payment_events` table is temporarily unavailable, the entire payout flow crashes — the creator doesn't get paid because the audit log couldn't be written.

**Fix:** Wrap all `writePaymentEvent()` calls in try/catch that logs errors to `console.error` but does not prevent the payment from completing:

```typescript
try {
  await writePaymentEvent(supabaseClient, { ... });
} catch (auditErr) {
  console.error('Payment event logging failed (non-blocking):', auditErr);
}
```

Payment completion is more important than its audit trail. If logging fails, the Stripe dashboard and webhook events still provide a record.

**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts`

### 1.4 — RLS Failure Silently Misclassifies Uploader Role (HIGH)

**Problem:** In `useProjectFileUpload.ts` (line 159-161), if the profile query fails due to RLS, `uploaderRole` defaults to `'restaurant'`. This causes wrong notifications — a creator upload might notify the creator instead of the business.

**Fix:** Move the profile query to run *before* the file upload loop (currently it runs after upload succeeds). If the profile can't be read, fail the upload early rather than proceeding with wrong metadata:

```typescript
// Move this BEFORE the upload loop (before file processing)
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single();

if (profileError || !profile) {
  throw new Error('Could not determine your account role. Please refresh and try again.');
}

const uploaderRole = profile.role;
// ... then proceed with file upload
```

This must be moved earlier in the function because the current location is inside a post-upload try/catch that swallows errors silently.

**Files:**
- Modify: `src/hooks/useProjectFileUpload.ts`

### 1.5 — Missing Creator Profile Crashes Payout (HIGH)

**Problem:** `release-creator-payout` calls `.single()` on `creator_profiles` (lines 80-89). If the creator's profile is missing or data is inconsistent, the entire payout crashes instead of falling back gracefully.

**Fix:** Use `.maybeSingle()` and fall back to pending balance:

```typescript
const { data: creatorProfile } = await supabaseClient
  .from('creator_profiles')
  .select('stripe_account_id')
  .eq('user_id', collaboration.creator_id)
  .maybeSingle();

if (!creatorProfile?.stripe_account_id) {
  logStep('Creator has no Stripe account — adding to pending balance');
  // Record payout as pending, update collaboration status, return success
}
```

The creator still gets credit; they'll receive funds when they connect their Stripe account.

**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts`

## Pass 2: Medium Severity (7 Fixes)

### 2.1 — Auto-Approve Cron Doesn't Check Escrow Status

**Problem:** `auto-approve-content` (line 43) selects `escrow_status` but never filters on it. It approves content and triggers payout even when `escrow_status !== 'held'`, causing the payout function to reject it.

**Fix:** Add an application-level filter inside the processing loop. PostgREST's `.eq()` on embedded/joined resource columns filters the embedded object, not the parent row — using it on `campaigns.escrow_status` would return the collaboration with a `null` campaign rather than filtering it out. Instead, add the check in the loop:

```typescript
for (const collab of overdue) {
  const campaign = collab.campaigns;
  if (!campaign) continue;
  if (campaign.escrow_status !== 'held') {
    logStep('Skipping — escrow not held', { escrowStatus: campaign.escrow_status });
    continue;
  }
  // ... proceed with auto-approval
}
```

**Files:**
- Modify: `supabase/functions/auto-approve-content/index.ts`

### 2.2 — Race Condition: Duplicate Payout Attempts in Auto-Approve

**Problem:** If a business manually approves content between the cron's initial fetch and its `transition_content_status` call, the cron still invokes `release-creator-payout`. The payout function's idempotency key should prevent a duplicate transfer, but it creates confusing logs and wasted function calls.

**Fix:** After `transition_content_status` succeeds, re-read the collaboration's `content_status`. If it's `approved` (not `auto_approved`), skip the payout call — the manual approval path already handled it.

**Files:**
- Modify: `supabase/functions/auto-approve-content/index.ts`

### 2.3 — Hardcoded Lovable Origin Fallback

**Problem:** `create-campaign-escrow` (line 138) falls back to `https://dragoncandy-v3.lovable.app` when the `origin` header is missing. In production, this would redirect users to the wrong domain after Stripe checkout.

**Fix:** Change the fallback to `https://dragoncandy.io` and use an environment variable for override:

```typescript
const origin = req.headers.get("origin")
  || Deno.env.get("PUBLIC_SITE_URL")
  || "https://dragoncandy.io";
```

**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

### 2.4 — Session ID Stored as Payment Intent ID

**Problem:** `create-campaign-escrow` stores `session.id` (a checkout session ID like `cs_xxx`) in the `escrow_payment_intent_id` column. Note: `verify-campaign-escrow` already partially mitigates this by detecting the `cs_` prefix and updating the field with the actual payment intent ID after checkout completes. However, between creation and verification, the column holds an incorrect value, and if verification fails or is skipped, the value stays wrong permanently.

**Fix:** Extract the payment intent from the session at creation time and store it. Also add `escrow_checkout_session_id` for full traceability:

```typescript
const paymentIntentId = typeof session.payment_intent === 'string'
  ? session.payment_intent
  : session.payment_intent?.id;

// Update campaign with both for traceability
.update({
  escrow_payment_intent_id: paymentIntentId || session.id,
  escrow_checkout_session_id: session.id,
  escrow_status: 'pending',
})
```

If the payment intent isn't available yet (deferred), fall back to storing the session ID but also store the session ID in a separate field.

**Migration:** Add `escrow_checkout_session_id` column to `campaigns` if it doesn't exist:
```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS escrow_checkout_session_id TEXT;
```

**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`
- Modify: `supabase/functions/verify-campaign-escrow/index.ts` (to populate `escrow_payment_intent_id` from the session after payment completes)
- Create: migration for `escrow_checkout_session_id` column

### 2.5 — Orphaned Thumbnails After Failed Video Transcoding

**Problem:** `useProjectFileUpload.ts` can create orphaned thumbnail files if the main file upload or DB insert fails after thumbnail extraction and upload succeed. The cleanup logic (lines 140-145) only removes the main file path.

**Fix:** Track all uploaded artifacts in an array and clean up everything on failure:

```typescript
const uploadedPaths: string[] = [];

// After each storage upload:
uploadedPaths.push(filePath);
if (thumbnailPath) uploadedPaths.push(thumbnailPath);

// In catch block:
for (const path of uploadedPaths) {
  await supabase.storage.from(bucketName).remove([path]);
}
```

**Files:**
- Modify: `src/hooks/useProjectFileUpload.ts`

### 2.6 — Email Notification Failures Are Silent

**Problem:** In `ContentReviewSection.tsx`, the email notification after content approval fails silently. The business thinks the creator was notified, but the creator may never see the approval.

**Fix:** Don't block the approval flow, but surface a non-blocking toast warning:

```typescript
const { error: emailError } = await supabase.functions.invoke('send-notification-email', { ... });
if (emailError) {
  toast.warning('Content approved, but email notification failed. The creator may not be notified immediately.');
}
```

**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx`

### 2.7 — localStorage Auto-Approve State Can Become Stale

**Problem:** `ContentReviewSection.tsx` writes `autoApproveAfterPayment` to localStorage before payment validation completes. If the user navigates away or payment fails, the flag persists and can cause unexpected auto-approval behavior on return.

**Fix:** Move the localStorage write to after the Stripe checkout URL is confirmed, and add cleanup:

```typescript
// Only set after we have a valid checkout URL
if (checkoutUrl) {
  localStorage.setItem('autoApproveAfterPayment', JSON.stringify({ collaborationId, timestamp: Date.now() }));
}

// On component mount, clean up stale flags (older than 1 hour)
// Handles both old format (no timestamp) and new format (with timestamp)
useEffect(() => {
  const stored = localStorage.getItem('autoApproveAfterPayment');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const timestamp = parsed.timestamp;
      if (!timestamp || Date.now() - timestamp > 3600000) {
        localStorage.removeItem('autoApproveAfterPayment');
      }
    } catch {
      localStorage.removeItem('autoApproveAfterPayment');
    }
  }
}, []);
```

**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx`

## Pass 3: Low/Defensive (2 Fixes)

### 3.1 — Uninitialized customerId in Escrow Creation

**Problem:** `customerId` is `let` without initialization (line 127). If no Stripe customer exists, it's `undefined` and passed to `stripe.checkout.sessions.create()`.

**Fix:** Explicitly initialize and document the intent:

```typescript
const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;
// undefined = Stripe creates a guest checkout (no customer record reused)
```

**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

### 3.2 — Delivery Fee Type Safety

**Problem:** `campaign.delivery_fee || 0` could silently convert a string `"0"` to `0` correctly by coincidence, but a string like `"50.00"` would be treated as truthy and used as a string in arithmetic.

**Fix:** Explicit type coercion:

```typescript
const deliveryFee = Number(campaign.delivery_fee) || 0;
```

**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

## Files Modified Summary

| File | Pass | Changes |
|------|------|---------|
| `supabase/functions/_shared/pricing-utils.ts` | 1 | Create: shared pricing resolution utility |
| `supabase/functions/release-creator-payout/index.ts` | 1 | Pricing utility, two-phase commit, non-blocking audit, maybeSingle for creator profile |
| `supabase/functions/create-campaign-escrow/index.ts` | 1-3 | Pricing utility, origin fallback, session vs PI ID, customerId, delivery fee |
| `supabase/functions/auto-approve-content/index.ts` | 2 | Escrow status filter, race condition guard |
| `supabase/functions/verify-campaign-escrow/index.ts` | 2 | Populate payment intent ID from completed session |
| `src/hooks/useProjectFileUpload.ts` | 1-2 | Profile error handling, orphaned thumbnail cleanup |
| `src/components/campaigns/detail/ContentReviewSection.tsx` | 2 | Email notification warning, localStorage cleanup |
| Migration (new) | 1-2 | Add `releasing` to escrow_status CHECK, add `escrow_checkout_session_id` column |

## Verification Plan

### After Pass 1
1. `npm run build` + `npm run typecheck` pass
2. Deploy edge functions to Supabase (or verify locally with `supabase functions serve`)
3. Create a test campaign with a counter-offer → verify escrow amount matches negotiated rate
4. Approve content → verify payout amount matches escrow amount
5. Simulate creator with no Stripe account → verify pending balance fallback

### After Pass 2
1. Build + typecheck pass
2. Verify auto-approve cron skips campaigns without held escrow
3. Verify Stripe checkout returns to dragoncandy.io (not Lovable URL)
4. Upload a video, force-fail the DB insert → verify thumbnail gets cleaned up
5. Trigger content approval with email service offline → verify warning toast appears

### After Pass 3
1. Build + typecheck pass
2. Verify escrow creation with no existing Stripe customer works correctly

## Non-Goals

- Rewriting the state machine — the PL/pgSQL `transition_content_status()` function is solid with proper row-level locking
- Adding E2E integration tests — valuable follow-up but not blocking stabilization
- Changing the auto-approval windows — the current tier-based windows (4/24/48 hrs) are correct
- Dispute resolution flow — no issues found in `reject-content` or `resolve-dispute`
- UI redesign of any delivery components — this is backend/logic stabilization only
