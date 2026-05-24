---
title: Campaign Lifecycle
type: concept
created: 2026-05-23
updated: 2026-05-24
sources: [docs/content-delivery-system-flows.md, docs/DATABASE_SCHEMA.md]
tags: [campaigns, lifecycle, applications]
---

# Campaign Lifecycle

The flow from campaign creation through completion, including
application handling and sponsorship.

## Campaign States

draft → published → active → completed (or cancelled)

- Fixed-price campaigns require escrow payment before publishing
- Publishing makes the campaign visible to creators
- Active means a creator has been accepted and escrow is held
- Completed when all deliverables are approved and payment released

## Application Flow

### Standard (Restaurant Only)

pending → accepted (→ collaboration) | rejected | counter_offered

Restaurant actions: Accept, Reject, Counter. Acceptance with held
escrow auto-creates a collaboration.

### Sponsored (Joint Approval)

Both brand and restaurant must approve. DB trigger
`trg_recompute_final_approval` auto-syncs `final_approval_status`.
Either party rejecting sets `final_approval_status: 'rejected'`.

## Database Tables

- `campaigns` — campaign records with escrow_status
- `campaign_applications` — creator applications
- `campaign_collaborations` — active collaborations
- `campaign_invitations` — direct invites
- `application_counter_offers` — negotiation records
- `campaign_sponsorships` — brand sponsorship arrangements

## See Also

- [[Content Delivery State Machine]]
- [[Stripe Connect]]
- [[DragonCandy Platform]]
- [[Realtime Edge Cases Session]]
- [[Counter-Offer Enum Fix Session]]
