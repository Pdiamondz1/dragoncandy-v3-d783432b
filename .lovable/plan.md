

# Fix: Sponsorship Payment Edge Functions Not Deployed

## Root Cause

The two sponsorship payment edge functions exist as code but are **not registered in `supabase/config.toml`**. Without config entries, these functions are never deployed to Supabase, so when the brand clicks "Pay", the call to `create-sponsorship-checkout` fails silently (or returns an error), and the payment flow never starts.

Missing from config.toml:
- `create-sponsorship-checkout`
- `verify-sponsorship-payment`
- `get-stripe-dashboard-link` (also missing)

## Fix

### File: `supabase/config.toml`

Add the three missing function entries with `verify_jwt = false` (they handle auth manually in code):

```toml
[functions.create-sponsorship-checkout]
verify_jwt = false

[functions.verify-sponsorship-payment]
verify_jwt = false

[functions.get-stripe-dashboard-link]
verify_jwt = false
```

### Post-change

Deploy all three edge functions so they become callable.

## Expected Result

- Brand clicks "Pay" on an accepted sponsorship and gets redirected to Stripe Checkout
- After payment, auto-verification triggers on redirect and updates `payment_status` to `paid`
- Restaurant sees "Payment Received" badge
- Both parties receive confirmation emails

