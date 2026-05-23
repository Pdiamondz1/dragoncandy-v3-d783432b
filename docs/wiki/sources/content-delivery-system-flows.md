---
title: Content Delivery System Flows
type: source
created: 2026-05-23
updated: 2026-05-23
sources: [docs/content-delivery-system-flows.md]
tags: [content-delivery, campaigns, state-machine]
---

# Content Delivery System Flows

Complete reference for the content delivery lifecycle across all three
roles: Restaurant, Creator, and Brand.

## Key Claims

- Campaign lifecycle: draft → published → active → completed (or cancelled)
- Fixed-price campaigns require escrow payment before publishing
- Application flow supports counter-offers and joint approval (brand + restaurant)
- Content delivery is the core system — 9 statuses from pending through resolved
- Auto-approval windows: Standard 48h, Expedited 24h, DragonRush 4h
- Max 2 revision requests before rejection triggers dispute flow
- Dual completion is an alternative path where either party can request completion
- Sponsorship flow is separate: brand proposes → restaurant accepts → completion handshake
- DB trigger `trg_recompute_final_approval` syncs joint approval status

## Data Points

- Content statuses: pending, in_progress, submitted, revision_requested,
  approved, auto_approved, rejected, disputed, resolved
- Escrow statuses: none, pending, held, released
- Dispute outcomes: refund, partial_payment, approved
- Extension windows: +24h for Standard/Expedited, +2h for DragonRush

## See Also

- [[Content Delivery State Machine]]
- [[Campaign Lifecycle]]
- [[Stripe Connect]]
- [[DragonDash]]
