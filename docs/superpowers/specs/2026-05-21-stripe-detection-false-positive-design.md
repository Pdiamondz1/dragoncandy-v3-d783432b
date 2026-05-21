# Stripe Detection False-Positive Fix

> **Date:** 2026-05-21
> **Status:** Draft
> **Scope:** Fix false "Stripe not connected" banner on Business Dashboard + self-healing data sync

## Problem

The Business Dashboard displays a warning banner — "Complete [location]'s setup to unlock features … a connected Stripe account" — even when the Stripe account is fully connected and visible in Settings > Payments.

**Root cause:** The `useLocationReadiness` hook checks only `org_units.stripe_account_id` and `org_units.stripe_onboarding_complete`. For accounts where Stripe was connected before `org_units` had Stripe columns (or where the create flow stored data in `business_profiles` instead), the `org_units` row has null/false values while `business_profiles` has the correct data. The Settings page correctly detects the connection via the `check-restaurant-payout-status` edge function (which falls back to `business_profiles`), but the dashboard banner does not.

## Solution

Two-layer fix: immediate frontend fallback + backend self-healing sync.

### Layer 1: Hook Simplification + Fallback Query

**File:** `src/hooks/useLocationReadiness.ts`

The `activeOrgUnit` object (from `useAuth()`) already carries `stripe_account_id` and `stripe_onboarding_complete` — `AuthContext.tsx` line 196 selects these fields. The hook's existing separate query to `org_units` is redundant. Remove it and read directly from `activeOrgUnit`.

Add a conditional fallback query to `business_profiles` when `activeOrgUnit` has no `stripe_account_id`:

- Primary: read `activeOrgUnit.stripe_account_id` + `activeOrgUnit.stripe_onboarding_complete` (no extra query needed)
- Fallback (enabled only when primary has no `stripe_account_id`): query `business_profiles` where `user_id` matches and `account_type` matches the `accountType` param (default `'restaurant'`)
- `hasStripe` = true if either source has both `stripe_account_id` and `stripe_onboarding_complete` truthy

The hook accepts an optional `accountType` parameter (default `'restaurant'`) for future brand dashboard reuse. This value maps to `business_profiles.account_type` and can be auto-derived from `activeOrg.org_type` in the future.

### Layer 2: Edge Function Self-Healing Sync

When the edge function finds the Stripe account in `business_profiles` (the fallback path) but an `org_unit_id` was provided, it syncs both `stripe_account_id` AND `stripe_onboarding_complete` to `org_units`. After one status check, `org_units` has correct data and the hook's fallback is no longer needed.

**Important:** The sync fires only when the Stripe account was resolved from the `business_profiles` fallback path (lines 70-74), not when it was already found in `org_units` (lines 64-67). Track which source provided the account ID to gate the sync.

**File:** `supabase/functions/check-restaurant-payout-status/index.ts`

After resolving the Stripe account from `business_profiles` (lines 70-74), when `org_unit_id` is present: update `org_units` with both `stripe_account_id` (the resolved account ID) and `stripe_onboarding_complete` (from the Stripe API response). The existing update at line 105-108 currently only writes `stripe_onboarding_complete` — extend it to also write `stripe_account_id`.

**File:** `supabase/functions/create-restaurant-connect-account/index.ts`

When an existing Stripe account is found in `business_profiles` (lines 86-99) and `org_unit_id` is provided: copy `stripe_account_id` to `org_units` and set `sourceTable = 'org_units'` so subsequent writes (test mode auto-provision at lines 196-207) target the correct table.

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useLocationReadiness.ts` | Remove redundant `org_units` query, read from `activeOrgUnit` directly, add fallback query to `business_profiles`, accept `accountType` param |
| `supabase/functions/check-restaurant-payout-status/index.ts` | Sync both `stripe_account_id` and `stripe_onboarding_complete` to `org_units` when account found via `business_profiles` fallback |
| `supabase/functions/create-restaurant-connect-account/index.ts` | Sync existing `business_profiles` account to `org_units` when `org_unit_id` provided |

## Other Affected Consumers (Self-Correcting)

These components also read Stripe data from `org_units` and will show incorrect status until the self-healing sync runs (i.e., until the user visits Settings once):

- **`OrgUnitSwitcher.tsx` line 90** — checks `unit.stripe_onboarding_complete === true` for location readiness indicator
- **`BusinessSettings.tsx` line 140** — passes `activeOrgUnit?.stripe_onboarding_complete` to `calculateLocationCompletion()` for the profile completion meter

No code changes are needed for these consumers. Once the edge function syncs the Stripe data to `org_units`, the `AuthContext` refetch will pick up the correct values and these components will display correctly.

## What This Does NOT Change

- No database migrations
- No new files or components
- No UI changes (the banner logic in `BusinessDashboard.tsx` is correct — just the data was wrong)
- No changes to Creator or Brand dashboards (they don't have readiness banners)
- No changes to the `StripeConnectSetup` component (it already works correctly)

## Verification

1. `npm run build` passes
2. Log in as Restaurant (dwilliams@harbormill.net) — dashboard should NOT show the false Stripe warning
3. Settings > Payments should still show "Connected" status
4. Verify `OrgUnitSwitcher` shows correct readiness for the location
5. Verify `BusinessSettings` profile completion meter reflects Stripe as connected
6. Log in as Creator (damewillie@gmail.com) and Brand (damesonpoint@gmail.com) — verify no regressions
7. Check Chrome dev tools for console errors on all dashboards
8. Verify both desktop and mobile views
9. After visiting Settings once, the self-healing sync should populate `org_units` with Stripe data, eliminating the fallback query on subsequent dashboard loads
