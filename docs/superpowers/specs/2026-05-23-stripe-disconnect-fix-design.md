# Stripe Disconnect Fix — Design Spec

**Date**: 2026-05-23
**Status**: Draft
**Author**: Dame + Claude

## Context

Users cannot disconnect their Stripe accounts from DragonCandy. Clicking "Disconnect Account" on the Business Settings page (`/dashboard/business/settings`) shows a generic error toast: "Failed to disconnect. Please try again."

**Root cause**: The `disconnect-stripe-account` edge function was never deployed to Supabase. Both disconnect attempts returned HTTP 404 with `function_id: null` in the Supabase edge function logs.

**Secondary bug**: The frontend's `handleDisconnect` function in `StripeConnectSetup.tsx` has a logic error — it throws on any non-2xx response before it can check for the `BALANCE_REMAINING` error code. That check is dead code. The UI already disables the Disconnect button when `platformPendingBalance > 0`, so the server-side `BALANCE_REMAINING` check is a safety net for race conditions (e.g., balance changes between status check and disconnect click). Fixing it ensures defense in depth.

## Requirements

- All users (Business/Restaurant, Content Creator, Brand/Sponsor) can disconnect their Stripe accounts
- Disconnect is blocked only when `pending_balance > 0` (platform wallet has funds)
- Active campaigns, held escrow, or in-progress collaborations do NOT block disconnect — Stripe accounts can be re-connected at any time, and campaign payments are deferred until project completion, so a temporary disconnection does not break counterparty flows
- The `BALANCE_REMAINING` error message must surface correctly to the user if the server-side safety net triggers

## Design

### Part 1: Deploy the Edge Function

Deploy `supabase/functions/disconnect-stripe-account/index.ts` to Supabase. No code changes needed — the function is fully implemented and correct.

**Edge function flow**:
1. Authenticate user via Bearer token
2. Resolve Stripe account from `org_units` → `creator_profiles` → `business_profiles` (priority order based on `org_unit_id` parameter)
3. Check `pending_balance > 0` → return 409 with `{ error: 'BALANCE_REMAINING', balance: <amount> }`
4. Call `stripe.accounts.del(stripeAccountId)` — wrapped in try-catch, continues even if Stripe call fails (account may already be deleted)
5. Clear `stripe_account_id = null` and `stripe_onboarding_complete = false` in the source table
6. Return 200 with `{ success: true }`

### Part 2: Fix Frontend Error Handling

**File**: `src/components/settings/StripeConnectSetup.tsx`
**Function**: `handleDisconnect`

**Current code (broken)**:
```typescript
const { data, error } = await supabase.functions.invoke('disconnect-stripe-account', {
  body: { org_unit_id: activeOrgUnit?.id ?? null },
});
if (error) throw error;                              // Throws for ALL non-2xx
if (data?.error === 'BALANCE_REMAINING') { ... }     // Dead code — never reached
```

**Fixed code**:
```typescript
const { data, error } = await supabase.functions.invoke('disconnect-stripe-account', {
  body: { org_unit_id: activeOrgUnit?.id ?? null },
});
if (error) {
  const context = await error.context?.json?.().catch(() => null);
  if (context?.error === 'BALANCE_REMAINING') {
    toast.error(`You have $${context.balance.toFixed(2)} pending. Withdraw your balance before disconnecting.`);
    return;
  }
  throw error;
}
```

The fix extracts the response body from the `FunctionsHttpError`'s `context` property, which is the raw `Response` object from the failed fetch. The body is unconsumed at this point (the Supabase client only parses 2xx response bodies), so `.json()` works. The `.catch(() => null)` guard handles cases where the response isn't JSON. If the parsed body contains a known business error code (`BALANCE_REMAINING`), it shows the specific message. Otherwise, it falls through to the generic catch block.

No UI layout or styling changes. The button, dialog, and success flow remain unchanged on both desktop and mobile.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/disconnect-stripe-account/index.ts` | Deploy only — no code changes |
| `src/components/settings/StripeConnectSetup.tsx` | Fix `handleDisconnect` error handling |

## Verification

1. **Deploy** the edge function via Supabase MCP or CLI
2. **Build** locally with `npm run build` to verify no TypeScript errors
3. **Test disconnect** on production with the Restaurant account (`dwilliams@harbormill.net`) — should succeed and show "Stripe account disconnected" toast
4. **Verify reconnect** — after disconnect, the "Connect Stripe Account" button should appear and work
5. **Test with Creator account** (`damewillie@gmail.com`) — verify disconnect works for creator role
6. **Test with Brand account** (`damesonpoint@gmail.com`) — verify disconnect works for brand role
7. **Check Chrome DevTools console** for errors on production after deployment
8. **Screenshot** the disconnected and reconnected states on both desktop and mobile
9. **Test BALANCE_REMAINING safety net** — call the edge function directly (e.g., via DevTools console or curl) with a user that has `pending_balance > 0` to confirm the specific error message surfaces correctly, since the UI button is normally disabled in this state
