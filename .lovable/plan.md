

# Fix Bid-Range Campaign Escrow Display and Flow Issues

## Problems Identified

### 1. "Escrow Held" badge not showing for bid-range campaigns
In `CampaignCard.tsx`, the `getEscrowBadge()` function (line 61) returns `null` for any campaign where `pricing_type !== 'fixed'`. This means bid-range campaigns that have gone through the counter-offer escrow flow never show the "Escrow Held" badge, even though the DB has `escrow_status: 'held'`.

### 2. Campaign shows "Published" without escrow payment
Bid-range campaigns are set to `status: 'published'` immediately at creation (line 112 in `CampaignFinalizeStep.tsx`). This is correct for the initial marketplace listing phase. However, once a deal is finalized (application accepted after negotiation), the restaurant needs to pay escrow. The campaign card should clearly indicate whether escrow has been paid or not.

### 3. No escrow payment prompt on CampaignCard for bid-range campaigns
The `needsEscrowPayment` check on line 223 of `CampaignCard.tsx` only triggers for `pricing_type === 'fixed'`. Bid-range campaigns with `escrow_status: 'pending'` (set after Pay Escrow is initiated from ApplicationCard) don't show the payment alert on the campaign card.

## Root Cause

The escrow badge and payment prompt logic in `CampaignCard.tsx` was built only for the original DragonDash fixed-price flow. When the counter-offer/bidding system was added, these conditions were not updated to include bid-range campaigns that now also use escrow.

## Solution

### File: `src/components/campaigns/CampaignCard.tsx`

**Change 1 - Update `getEscrowBadge()`:** Remove the `pricing_type === 'fixed'` guard. Show the escrow badge for ANY campaign that has a non-default escrow status (`pending`, `held`, or `released`).

**Change 2 - Update `needsEscrowPayment`:** Also check for bid-range campaigns with accepted applications that need escrow. Change from:
```
campaign.pricing_type === 'fixed' && campaign.escrow_status === 'pending'
```
to:
```
campaign.escrow_status === 'pending'
```

**Change 3 - Update payment amount display:** For bid-range campaigns, the "Pay" button currently shows `fixed_price`. For bid-range, it should show the agreed amount from the accepted application. Since `CampaignCard` doesn't have application data, the escrow payment for bid-range campaigns is already handled via `ApplicationCard`'s "Pay Escrow" button. The `CampaignCard` just needs to show the pending/held badge correctly.

### File: `src/hooks/usePublicCampaigns.ts`

No changes needed -- bid-range campaigns are correctly excluded from the marketplace when they have accepted applications (lines 38-53).

## Files to Modify

| File | Change |
|------|--------|
| `src/components/campaigns/CampaignCard.tsx` | Remove `pricing_type === 'fixed'` guard from escrow badge and payment prompt |

## Expected Result

- Bid-range campaigns with `escrow_status: 'held'` will show the green "Escrow Held" badge
- Bid-range campaigns with `escrow_status: 'pending'` will show the amber "Payment Pending" badge
- The restaurant dashboard will correctly reflect the escrow state for all campaign types
- Creator-side project visibility is already working (collaborations exist in the DB)
