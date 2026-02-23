

# Fix: Sponsorship Payment Not Being Recorded After Stripe Checkout

## Root Cause

Two bugs prevent the payment from being tracked:

1. **RLS blocks the database update in `create-sponsorship-checkout`**: The function uses `SUPABASE_ANON_KEY` to update `campaign_sponsorships` with the `payment_intent_id` and `payment_status: 'pending'`. RLS silently blocks this update (0 rows affected, no error), so the record stays at `payment_status: unpaid` with no `payment_intent_id`.

2. **`verify-sponsorship-payment` cannot verify without a `payment_intent_id`**: Since the ID was never saved, verification immediately returns "no payment intent found" without checking Stripe.

3. **Bonus issue**: `session.payment_intent` can be `null` at Checkout Session creation time in newer Stripe API versions, making it unreliable to store at creation.

## Fix

### 1. `create-sponsorship-checkout/index.ts`
- Use a **separate service-role Supabase client** for the database update (same pattern used in `verify-campaign-escrow` and other edge functions)
- Store `session.id` (the Checkout Session ID) instead of `session.payment_intent` since the session ID is always available at creation time

### 2. `verify-sponsorship-payment/index.ts`
- When `payment_intent_id` starts with `cs_` (a Checkout Session ID), use `stripe.checkout.sessions.retrieve()` to get the actual PaymentIntent
- Also handle the case where `payment_intent_id` is null by looking up recent Checkout Sessions by sponsorship metadata as a fallback

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/create-sponsorship-checkout/index.ts` | Use service-role key for DB update; store `session.id` instead of `session.payment_intent` |
| `supabase/functions/verify-sponsorship-payment/index.ts` | Handle Checkout Session IDs (`cs_` prefix) by retrieving the session first to get the PaymentIntent |

### Technical Details

**create-sponsorship-checkout** change:
```text
- Line 20-24: Add a second Supabase client using SUPABASE_SERVICE_ROLE_KEY for DB operations
- Line 102-108: Use the service-role client for the update
- Line 106: Change from session.payment_intent to session.id
```

**verify-sponsorship-payment** change:
```text
- Lines 50-55: Instead of returning early when payment_intent_id is missing,
  handle cs_ prefixed IDs by retrieving the Checkout Session to get the real PaymentIntent
```

### Result
After this fix, when a brand completes Stripe Checkout:
1. The Checkout Session ID is reliably saved to the database
2. On redirect back, auto-verification retrieves the session, finds the PaymentIntent, confirms payment succeeded, and updates the status to "paid"
3. The UI correctly shows "Payment Complete" instead of "Pay $1,200"
