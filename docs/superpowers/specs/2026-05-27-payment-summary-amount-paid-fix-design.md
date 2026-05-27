---
title: Fix Payment Summary "Amount Paid" Display
type: bug-fix
created: 2026-05-27
status: approved
---

# Fix Payment Summary "Amount Paid" Display

## Context

On the business campaign detail page, the Payment section shows "Amount Paid: N/A" even after the restaurant has completed payment. The restaurant user (Dame Smooth) paid creator Ricky Ricardo $330 via a negotiated agreed rate, but the UI displays "N/A".

## Root Cause

`PaymentSummary.tsx` receives `campaign.budget_min` and `campaign.budget_max` (the campaign's budget range) and formats them via `formatAmount()`. When both are null, it returns "N/A". The component should display the actual negotiated payment amount.

## Design

The page already calls `useAgreedValue(id)` at line 119 of `CampaignDetailsPage.tsx`, which correctly resolves the settled rate by checking accepted counter-offers first, then falling back to the application's proposed rate. The `agreedValue` result is already available — it just isn't wired to `PaymentSummary`.

### Component — `src/components/campaigns/detail/PaymentSummary.tsx`

Replace `budgetMin` / `budgetMax` props with `amountPaid: number | null`. Remove the `formatAmount()` helper. Display: `amountPaid != null ? formatCurrency(amountPaid) : 'N/A'`. Use existing currency formatting pattern from the codebase.

### Wiring — `src/pages/CampaignDetailsPage.tsx`

Change the `PaymentSummary` call from passing `budgetMin`/`budgetMax` to passing `amountPaid={agreedValue ?? null}`.

### Data Layer — No Changes

`useAgreedValue` already fetches the correct data and is already called on this page.

## Files Changed

| File | Change |
|------|--------|
| `src/components/campaigns/detail/PaymentSummary.tsx` | Replace budget props with amountPaid |
| `src/pages/CampaignDetailsPage.tsx` | Wire existing agreedValue to PaymentSummary |

## Verification

1. `npm run build` passes with no type errors
2. Log in as restaurant user, navigate to "Flavor Story: Behind the Gumbo" campaign detail
3. Confirm Payment section shows "Amount paid: $330" and "Paid on: May 27, 2026"
4. Verify both desktop and mobile viewports
5. Check Chrome DevTools console for errors
