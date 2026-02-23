

# Restaurant Sponsorship Payout Flow

## Problem

When a brand pays for a sponsorship via Stripe Checkout, the full amount lands in the **platform's Stripe account**. There is no mechanism to transfer funds to the restaurant. Restaurants have no Stripe Connect account, no onboarding flow, and no withdrawal capability.

## Solution

Mirror the existing creator payout system for restaurants/business accounts. The flow will be:

1. Restaurant connects a Stripe Express account (just like creators do today)
2. When both parties mark a sponsorship as complete, funds are automatically transferred to the restaurant (minus 5% platform fee)
3. If the restaurant hasn't connected Stripe yet, funds go to a pending balance they can withdraw later

## Implementation

### 1. Database Migration

Add three new columns to `business_profiles`:

- `stripe_account_id` (text, nullable) -- Stripe Express connected account ID
- `stripe_onboarding_complete` (boolean, default false) -- Whether payouts are enabled
- `pending_balance` (numeric, default 0) -- Funds awaiting Stripe withdrawal

### 2. New Edge Function: `create-restaurant-connect-account`

Mirrors `create-creator-connect-account` but operates on `business_profiles` instead of `creator_profiles`. Creates a Stripe Express account, saves the account ID, and returns an onboarding link that redirects back to `/dashboard/business/settings`.

### 3. New Edge Function: `release-sponsorship-payout`

Triggered automatically when both parties mark a sponsorship as complete. It will:
- Fetch the sponsorship and restaurant profile
- Calculate payout: `sponsorship_amount - (sponsorship_amount * 0.05)`
- If restaurant has a connected Stripe account with payouts enabled, create a `stripe.transfers.create()` to their account
- If not, add the amount to `pending_balance` on `business_profiles`
- Update the sponsorship record with payout details
- Send email notifications to both parties

### 4. New Edge Function: `check-restaurant-payout-status`

Mirrors `check-creator-payout-status`. Checks the Stripe account status and returns one of three states: Not Connected, Verification Pending, or Connected/Enabled.

### 5. Update `useSponsorshipComplete` Hook

After both parties approve completion, automatically invoke `release-sponsorship-payout` (similar to how the DragonDash flow calls `release-creator-payout`).

### 6. Restaurant Stripe Connect UI on Business Settings Page

Add a "Payment Settings" section to `BusinessSettings.tsx` with:
- "Connect Stripe Account" button (calls `create-restaurant-connect-account`)
- Status indicator: Not Connected / Verification Pending / Connected
- Pending balance display with "Withdraw to Stripe" button

### 7. Register New Edge Functions

Add to `supabase/config.toml`:
```
[functions.create-restaurant-connect-account]
verify_jwt = false

[functions.release-sponsorship-payout]
verify_jwt = false

[functions.check-restaurant-payout-status]
verify_jwt = false
```

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `supabase/functions/create-restaurant-connect-account/index.ts` | Stripe Express onboarding for restaurants |
| `supabase/functions/release-sponsorship-payout/index.ts` | Transfer sponsorship funds to restaurant |
| `supabase/functions/check-restaurant-payout-status/index.ts` | Check restaurant Stripe account status |

### Files to Modify
| File | Change |
|------|--------|
| `supabase/config.toml` | Register 3 new edge functions |
| `src/hooks/useSponsorshipComplete.ts` | Call `release-sponsorship-payout` after both parties approve |
| `src/pages/BusinessSettings.tsx` | Add Stripe Connect section with connect/withdraw buttons |

### Database Migration
```sql
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_balance numeric DEFAULT 0;
```

### Payment Flow Diagram

```text
Brand pays via Stripe Checkout
       |
       v
Funds land in platform Stripe account
       |
       v
Both parties mark sponsorship complete
       |
       v
release-sponsorship-payout Edge Function fires
       |
       +---> Restaurant has Stripe connected?
       |         |
       |    YES: stripe.transfers.create() -> Restaurant's account
       |    NO:  Add to pending_balance on business_profiles
       |
       v
Sponsorship marked as payout_released
Email notifications sent to both parties
```

### Expected Result

1. Restaurants can connect their Stripe account from Business Settings
2. When a sponsorship is completed by both parties, funds are automatically transferred (minus 5% fee)
3. If Stripe isn't connected yet, funds accumulate in a pending balance
4. Restaurants can withdraw their pending balance once they connect Stripe
