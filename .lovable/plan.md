

# Add "View Stripe Dashboard" Button for Restaurants

## What's Needed

The existing `get-stripe-dashboard-link` Edge Function only looks up `creator_profiles` for the Stripe account ID. Restaurants store their Stripe account in `business_profiles` instead. We need to update the function to also check restaurant profiles, and add the button to the restaurant Payment Settings UI.

## Changes

### 1. Edge Function: `supabase/functions/get-stripe-dashboard-link/index.ts`

Add a fallback: if no creator profile is found, check `business_profiles` for a restaurant account with `stripe_account_id` and `stripe_onboarding_complete`. This makes the single function work for both user types.

### 2. Frontend: `src/components/business-profile/RestaurantPaymentSettings.tsx`

Add a "View Stripe Dashboard" button in the connected state section (after the green success message, line 147-153). On click, it invokes `get-stripe-dashboard-link` and opens the returned URL in a new tab.

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/get-stripe-dashboard-link/index.ts` | After creator_profiles lookup fails, try `business_profiles` for restaurant Stripe account |
| `src/components/business-profile/RestaurantPaymentSettings.tsx` | Add "View Stripe Dashboard" button when Stripe is fully connected |

