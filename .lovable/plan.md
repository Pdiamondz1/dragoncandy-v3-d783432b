

# Fix Counter-Offer Bidding System - Multiple Issues

## Issues Identified

### 1. Proposed Rate should be REQUIRED for bid-type campaigns
Currently the "Proposed Rate" field is optional in both the Application Form and Counter Offer Modal. For bid-range campaigns, the rate is the core negotiation point and must be required.

### 2. No email notifications for counter-offers
When a counter-offer is sent, no email notification goes to the other party. The `useCreateCounterOffer` and `useRespondToCounterOffer` hooks don't call the email notification system.

### 3. Creator accepting counter-offer causes RLS error
**Root cause:** When a creator accepts a counter-offer, `useRespondToCounterOffer` tries to INSERT into `campaign_collaborations`. However, the RLS policy on that table only allows **campaign owners** (restaurants/businesses) to create collaborations -- not creators. This causes a permission error.

### 4. Missing escrow payment flow after acceptance
Currently, when either side accepts a counter-offer, it immediately creates a collaboration and marks the application as "accepted." This skips the payment step entirely. The correct flow should be:

1. Negotiation finalizes (one side accepts the counter-offer)
2. Application moves to a "negotiation_finalized" or "accepted" state
3. The **restaurant/business must pay escrow** at the agreed-upon rate before the project appears for the creator
4. Only after payment verification does the collaboration become active

---

## Solution

### Flow After Counter-Offer Acceptance

```text
Counter-offer accepted
       |
       v
Application status -> "accepted"
       |
       v
Restaurant sees "Pay Escrow" button (agreed amount from final counter-offer)
       |
       v
Stripe Checkout (create-campaign-escrow edge function)
       |
       v
Payment verified -> Campaign escrow_status = "held"
       |
       v
Collaboration created -> Creator sees project
```

---

## Implementation Details

### File 1: `src/components/campaigns/CounterOfferModal.tsx`
- Make "Proposed Rate" **required** (add `required` attribute and validation)
- Update label to "Proposed Rate *"

### File 2: `src/components/campaigns/ApplicationForm.tsx`
- Make "Proposed Rate" **required** for bid-range campaigns (not optional)
- Update label to "Proposed Rate *"
- Add validation to prevent submission without a rate

### File 3: `src/hooks/useCounterOffers.ts` (major rework)

**`useCreateCounterOffer`:**
- Add email notification to the other party when a counter-offer is sent
- Fetch the other party's email and send a `counter_offer` notification

**`useRespondToCounterOffer`:**
- Remove the collaboration creation logic entirely
- When **accepted**: only update the counter-offer status and the application status to "accepted"
- Do NOT create a collaboration here -- that happens after payment
- Send email notification about acceptance/decline
- The restaurant will then see the "Pay Escrow" button on their campaign details

### File 4: `src/hooks/useManageApplication.ts`
- When accepting an application (including after counter-offer), do NOT create a collaboration immediately
- Instead, just update the application status to "accepted"
- The collaboration should only be created after escrow payment is verified

### File 5: `src/components/campaigns/ApplicationCard.tsx` (business/restaurant view)
- When application status is "accepted" and campaign `escrow_status` is not "held":
  - Show a "Pay Escrow" button with the agreed amount (from the latest accepted counter-offer or the application's proposed rate)
  - Use the existing `create-campaign-escrow` edge function
- When escrow is already paid, show "Paid" badge and normal collaboration flow

### File 6: `src/hooks/useEmailNotifications.ts`
- Add `'counter_offer'` and `'counter_offer_response'` to the `NotificationType` union type

### File 7: `supabase/functions/send-notification-email/index.ts`
- Add email templates for `counter_offer` and `counter_offer_response` notification types

### File 8: Update `verify-campaign-escrow` edge function
- After successful payment verification, create the collaboration record (using service role key)
- This ensures the collaboration is only created after the business has paid

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/components/campaigns/CounterOfferModal.tsx` | Make rate required |
| `src/components/campaigns/ApplicationForm.tsx` | Make rate required for bid campaigns |
| `src/hooks/useCounterOffers.ts` | Add email notifications, remove collaboration creation from accept |
| `src/hooks/useManageApplication.ts` | Remove collaboration creation (defer to payment) |
| `src/components/campaigns/ApplicationCard.tsx` | Add "Pay Escrow" button for accepted applications |
| `src/hooks/useEmailNotifications.ts` | Add counter_offer notification types |
| `supabase/functions/send-notification-email/index.ts` | Add counter-offer email templates |
| `supabase/functions/verify-campaign-escrow/index.ts` | Create collaboration after payment verification |

---

## Expected Result

1. **Proposed Rate is required** in both application form (for bid campaigns) and counter-offer modal
2. **Email notifications** are sent when counter-offers are made and responded to
3. **Creator can accept** without RLS errors (no more collaboration insert from creator side)
4. **After acceptance**, the restaurant sees a "Pay Escrow" button with the agreed amount
5. **After payment**, the collaboration is created automatically and the project appears for the creator
6. The entire flow mirrors the existing DragonDash escrow flow but uses the negotiated rate

