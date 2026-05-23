---
title: Content Delivery State Machine
type: concept
created: 2026-05-23
updated: 2026-05-23
sources: [docs/content-delivery-system-flows.md]
tags: [state-machine, content-delivery, collaboration]
---

# Content Delivery State Machine

The core of DragonCandy's marketplace — manages what happens after a
creator is hired for a campaign.

## States

```
pending → in_progress → submitted → approved/auto_approved → payment released
                                  → revision_requested (max 2) → submitted (loop)
                                  → rejected → disputed → resolved
```

## Status Transitions

| From | To | Trigger |
|------|-----|---------|
| pending | in_progress | Creator starts work |
| in_progress | submitted | Creator submits content |
| submitted | approved | Restaurant approves |
| submitted | auto_approved | Review timer expires |
| submitted | revision_requested | Restaurant requests changes (max 2) |
| revision_requested | submitted | Creator resubmits |
| revision_requested + exhausted | rejected | Restaurant rejects after all revisions |
| rejected | disputed | Auto-transition |
| disputed | resolved | Admin resolves (refund/partial/approved) |

## Alternative Path: Dual Completion

Either party can request completion:
1. Party A clicks "Mark Complete" → their `*_completion_status = 'requested'`
2. Party B clicks "Approve Completion" → both set to `'approved'`
3. System: collaboration → completed, content → approved, payment released

## Key Invariants

- Escrow must be held before collaboration is created
- Max 2 revision requests total
- Auto-approval timers vary by delivery tier ([[DragonDash]])
- Rejection auto-transitions to dispute — no content goes unpaid without mediation

## See Also

- [[Campaign Lifecycle]]
- [[DragonDash]]
- [[Stripe Connect]]
