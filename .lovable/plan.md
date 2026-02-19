

# Brand-Restaurant Sponsorship Payment Flow - Integration Plan

## Current State

The sponsorship payment infrastructure is **partially built** but has gaps that prevent a complete end-to-end flow. Here is what exists today:

### What Already Works
- **Checkout creation** (`create-sponsorship-checkout`): Creates a Stripe Checkout session for the brand to pay the sponsorship amount with a 5% platform fee
- **Payment verification** (`verify-sponsorship-payment`): Checks the Stripe PaymentIntent status and updates `payment_status` to `paid`
- **UI components**: `PaymentButton` (brand-facing), `SponsorshipStatusCard` (on campaign details)
- **Brand Sponsorships page** (`BrandSponsorships.tsx`): Lists all sponsorships but does NOT show the PaymentButton
- **Business Sponsorships page** (`BusinessSponsorships.tsx`): Restaurant sees proposals, can accept/reject, but no payment visibility

### What Is Missing

1. **PaymentButton not shown on BrandSponsorships page** -- The brand's main sponsorship management page never renders the `PaymentButton` for accepted sponsorships. The brand has no way to pay from their dashboard.

2. **No auto-verification on return** -- When a brand completes Stripe Checkout and is redirected back to `/brand/sponsorships?payment=success&sponsorship_id=...`, nothing reads those URL params to trigger verification.

3. **Pop-up blocker issue** -- `useSponsorshipPayment` uses `window.open(data.url, '_blank')` which gets blocked by most browsers. The DragonDash escrow flow already solved this with a "pre-open blank tab" pattern.

4. **Restaurant has no payment visibility** -- On `BusinessSponsorships.tsx`, the restaurant cannot see whether the brand has paid or not. There is no payment status badge.

5. **No email notifications on payment** -- Neither party receives an email when payment is completed.

6. **`confirmPayment` mutation exists but is unused and insecure** -- It updates payment status directly from the client, bypassing Stripe verification. This should be removed.

---

## Solution

### Flow After Brand Pays

```text
Brand clicks "Pay" on accepted sponsorship
       |
       v
Pre-opened blank tab redirects to Stripe Checkout
       |
       v
Brand completes payment, redirected to /brand/sponsorships?payment=success&sponsorship_id=xxx
       |
       v
Auto-verify: call verify-sponsorship-payment edge function
       |
       v
DB updated: payment_status = 'paid', payment_date set
       |
       v
Email sent to both brand and restaurant confirming payment
       |
       v
Restaurant sees "Paid" badge on their sponsorship card
```

---

## Implementation Details

### 1. Add PaymentButton to BrandSponsorships page
**File:** `src/pages/BrandSponsorships.tsx`

For each accepted sponsorship where `payment_status !== 'paid'`, render the existing `PaymentButton` component. For paid sponsorships, show a green "Payment Complete" badge.

### 2. Auto-verify payment on redirect
**File:** `src/pages/BrandSponsorships.tsx`

Add a `useEffect` that reads URL search params (`payment=success` and `sponsorship_id`). When detected, automatically call `verifyPayment` and clean up the URL params.

### 3. Fix pop-up blocker issue
**File:** `src/hooks/useSponsorshipPayment.ts`

Replace `window.open(data.url, '_blank')` with the proven "pre-open blank tab" pattern:
- Open `about:blank` synchronously on the user click
- Then set `stripeTab.location.href = data.url` after the Edge Function returns
- Add fallback UI if the pop-up is still blocked

### 4. Remove insecure `confirmPayment` mutation
**File:** `src/hooks/useSponsorshipPayment.ts`

Remove the `confirmPayment` mutation that directly updates the DB. All payment confirmation should go through `verify-sponsorship-payment`.

### 5. Add payment visibility to restaurant's Sponsorships page
**File:** `src/pages/BusinessSponsorships.tsx`

For accepted sponsorships, show a payment status indicator:
- Unpaid: amber "Awaiting Brand Payment" badge
- Pending: amber "Payment Processing" badge
- Paid: green "Payment Received" badge with date

### 6. Add email notifications on payment
**File:** `supabase/functions/verify-sponsorship-payment/index.ts`

After successfully verifying and updating payment status, call `send-notification-email` for both:
- Brand: "Your sponsorship payment of $X has been confirmed"
- Restaurant: "Brand X has completed their $X sponsorship payment for campaign Y"

This requires fetching brand/restaurant profile details and user emails.

### 7. Add sponsorship payment notification type
**File:** `src/hooks/useEmailNotifications.ts`

Add `'sponsorship_payment_confirmed'` to the notification type union.

**File:** `supabase/functions/send-notification-email/index.ts`

Add template for `sponsorship_payment_confirmed`.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/BrandSponsorships.tsx` | Add PaymentButton for accepted sponsorships + auto-verify on redirect |
| `src/hooks/useSponsorshipPayment.ts` | Fix pop-up blocker pattern, remove insecure confirmPayment |
| `src/pages/BusinessSponsorships.tsx` | Add payment status badges for accepted sponsorships |
| `supabase/functions/verify-sponsorship-payment/index.ts` | Send email notifications after successful payment verification |
| `src/hooks/useEmailNotifications.ts` | Add sponsorship_payment_confirmed type |
| `supabase/functions/send-notification-email/index.ts` | Add sponsorship payment email template |

## No New Files Required

All changes build on existing components and edge functions.

## Expected Result

1. Brand sees a "Pay" button on every accepted sponsorship in their dashboard
2. After completing Stripe Checkout, payment is automatically verified on redirect
3. Pop-up blocker is handled gracefully (pre-opened tab pattern)
4. Restaurant sees real-time payment status (Awaiting / Processing / Paid)
5. Both parties receive email confirmation when payment completes
6. The insecure direct-DB payment update is removed
