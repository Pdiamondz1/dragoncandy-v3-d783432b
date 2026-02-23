

# Fix: Restaurant Pending Balance Visibility Before Stripe Connection

## The Bug

The `check-restaurant-payout-status` Edge Function returns inconsistent field names depending on whether a Stripe account exists:

- **No Stripe account**: Returns `pendingBalance` (line 59) with the DB value
- **Stripe connected**: Returns `platformPendingBalance` (line ~107) with the DB value

The frontend `RestaurantPaymentSettings.tsx` only checks `platformPendingBalance` to show the wallet section. So when there is no Stripe account, the pending balance is invisible even if funds exist.

## Fix

### 1. Edge Function: `check-restaurant-payout-status/index.ts`

Update the "no Stripe account" response (line 56-65) to include `platformPendingBalance` alongside `pendingBalance` for consistency:

```typescript
return new Response(JSON.stringify({ 
  hasAccount: false,
  onboardingComplete: false,
  pendingBalance: 0,
  chargesEnabled: false,
  payoutsEnabled: false,
  platformPendingBalance: businessProfile?.pending_balance || 0,
}), ...);
```

This ensures `platformPendingBalance` is always returned regardless of Stripe account status.

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/check-restaurant-payout-status/index.ts` | Add `platformPendingBalance` to the no-Stripe-account response |

### Result

Restaurants will see their pending balance in the Payment Settings card even before connecting Stripe, with a clear message prompting them to connect Stripe to withdraw the funds.

