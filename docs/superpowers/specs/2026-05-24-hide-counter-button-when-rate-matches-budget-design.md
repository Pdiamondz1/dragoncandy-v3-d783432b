# Hide Counter Button When Creator Rate Matches Campaign Budget

**Date:** 2026-05-24
**Status:** Approved

## Context

When a creator applies to a campaign at or below the campaign's budget, the restaurant sees Accept, Counter, and Reject buttons. The Counter button is confusing in this scenario because the creator already agreed to the restaurant's price — there's nothing to negotiate. Counter should only appear when the creator's effective rate exceeds the campaign budget.

## Current Behavior

`ApplicationCard.tsx:328` hides the Counter button only when `agreed_rate` is set (from a completed counter-offer exchange). It has no awareness of the campaign budget, so Counter always shows for pending applications regardless of rate alignment.

## Design

### Approach: Pass campaign budget through to ApplicationCard

Thread the campaign's budget ceiling from `ApplicationsListFixed` into `ApplicationCard` as a new prop.

### Data Flow

```
CampaignDetailsPage
  └─ campaign (has fixed_price, budget_max)
      └─ ApplicationsListFixed (campaign prop expanded)
          └─ campaignBudget = fixed_price ?? budget_max ?? undefined
              └─ ApplicationCard (new campaignBudget prop)
                  └─ Counter button condition checks effectiveRate > campaignBudget
```

### Files Changed

**`src/components/campaigns/ApplicationsListFixed.tsx`**
- Expand `campaign` prop interface to include `fixed_price?: number | null` and `budget_max?: number | null`
- Compute `campaignBudget = campaign?.fixed_price ?? campaign?.budget_max ?? undefined`
- Pass `campaignBudget` to each `<ApplicationCard>`

**`src/components/campaigns/ApplicationCard.tsx`**
- Add `campaignBudget?: number | null` to `ApplicationCardProps`
- Update Counter button condition at line 328 from:
  ```tsx
  {!application.agreed_rate && (
  ```
  to:
  ```tsx
  {!application.agreed_rate && (!campaignBudget || effectiveRate == null || effectiveRate > campaignBudget) && (
  ```

### Counter Button Visibility Rules

| Scenario | Counter Visible? | Reason |
|----------|-----------------|--------|
| Creator proposed at campaign budget | No | Rate matches — nothing to negotiate |
| Creator proposed below budget | No | Already under budget |
| Creator proposed above budget | Yes | Restaurant may want to negotiate down |
| No campaign budget data available | Yes | Safe fallback to current behavior |
| effectiveRate is unknown (null/undefined) | Yes | Safe fallback — don't hide functionality when rate is unknown |
| Agreed rate already set | No | Existing behavior preserved |
| BusinessProposals page (no campaign) | Yes | campaignBudget is undefined — fallback |

### Edge Cases

- `fixed_price` and `budget_max` both null → `campaignBudget` is undefined → Counter shows (safe fallback)
- `effectiveRate` is undefined → Counter shows (safe fallback — don't silently remove functionality when rate data is missing)
- Counter-offer chain resolves → `agreed_rate` set → existing condition hides Counter before the new condition is evaluated

### Out of Scope (Future)

- `BusinessProposals` page also uses `ApplicationsListFixed` without the campaign prop. It fetches the campaign object but doesn't pass it. Threading the budget through there would fix the same bug on that path. Deferred to keep this change minimal.

### Query Verification

`useCampaignQueries.ts:193` already includes `fixed_price` and `budget_max` in the `.select()` list, so no query changes are needed.

## Verification

1. `npm run build` + `npm run typecheck` — no regressions
2. Log into restaurant account → "JC Burger Weekend Blitz" → verify Counter hidden for Ricky Ricardo ($475 = budget)
3. Verify Counter still appears for applications above campaign budget
4. Test both desktop and mobile viewports
5. Check Chrome DevTools for console errors in production after deploy
