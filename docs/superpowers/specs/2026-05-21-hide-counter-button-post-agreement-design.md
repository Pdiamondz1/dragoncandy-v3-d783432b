# Hide Counter Button After Negotiation Agreement

**Date:** 2026-05-21
**Status:** Draft
**Scope:** Small UX fix — single file, single condition

## Problem

When a creator accepts a business's counter-offer, the application status transitions from `counter_offered` to `pending` and `agreed_rate` is set on the application row. The business then sees Accept/Counter/Reject buttons to formally hire or reject.

The Counter button is inappropriate at this stage. The price negotiation is settled — both parties agreed on a rate. Showing Counter invites the business to reopen a closed negotiation, which is confusing and undermines trust.

## Design

**Rule:** When `application.agreed_rate` is set (non-null), hide the Counter button. Show only Accept and Reject.

**Why `agreed_rate` is the right signal:** It's set exactly once — when either party accepts a counter-offer. It means "a negotiated rate was agreed upon." This is distinct from `proposed_rate` (the creator's initial ask) and from any pending counter-offer amounts.

## Affected Component

`src/components/campaigns/ApplicationCard.tsx` — the three-button row at lines 318–348.

**Current behavior:** All three buttons render whenever `application.status === 'pending' || application.status === 'counter_offered'` and no pending outbound offer exists.

**New behavior:** Same condition, but the Counter button is conditionally rendered only when `!application.agreed_rate`.

## What Does NOT Change

- Creator side (`AppliedPhaseView.tsx`) — creators see "Waiting for [business] to respond" when status is `pending`, not action buttons. No change needed.
- The Accept button text — already shows the correct `effectiveRate` which reflects `agreed_rate`.
- The Reject button — business can still back out even after agreement.
- Database schema — no changes.
- Counter-offer flow for fresh applications (`status === 'pending'` without `agreed_rate`) — Counter button still appears as normal.

## Edge Cases

| Scenario | `agreed_rate` | Buttons shown |
|----------|--------------|---------------|
| Fresh application, no negotiation | `null` | Accept, Counter, Reject |
| Active counter-offer negotiation | `null` | Accept, Counter, Reject |
| Creator accepted business's counter | `875` | Accept, Reject |
| Business accepted creator's counter | `875` | Accept, Reject |

## Testing

1. Log in as Restaurant (Harbormill)
2. View application where creator accepted a counter-offer (`agreed_rate` is set)
3. Verify only Accept and Reject buttons appear — no Counter
4. View a fresh application with no counter-offer history
5. Verify all three buttons (Accept, Counter, Reject) still appear
6. Verify desktop layout (side-by-side) and mobile layout (stacked) both look correct with two buttons
