---
title: Campaign Delivery, Scheduling & Notifications Session
type: source
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-campaign-delivery-scheduling-notifications.md]
tags: [content-delivery, notifications, scheduling, donny, revision]
---

# Campaign Delivery, Scheduling & Notifications Session

Synthesis of a late-May 2026 cluster that hardened the post-campaign content pipeline:
content-delivery stabilization, a real notification system, social scheduling + auto
cross-scheduling, the Donny content strategist, and revision-workflow status sync.

## Key Decisions

- **Content delivery:** a shared `pricing-utils` so escrow and payout compute the creator
  amount identically; a two-phase payout commit with a `releasing` escrow status (the Stripe
  transfer is irreversible); non-blocking audit logging.
- **Notifications:** a centralizing `create-notification` edge function (DB triggers can't call
  external APIs or enforce preferences server-side); a `preferences_matrix` JSONB (5×3) ready
  for SMS without migration; realtime on `push_notifications` + campaign tables for dashboard refresh.
- **Scheduling:** restaurant posting preferences stored on the campaign so [[Donny AI]]
  auto-generates the schedule after approval; `plan_group_id`/`plan_order` group multi-post
  plans without a new table; `deliverable_id` maps posts to deliverables.
- **Donny content strategist:** platform-aware generation constrained to connected accounts;
  `content_strategy` stored in `campaigns.ai_analysis`; one Anthropic call per plan.
- **Revision workflow:** per-item feedback; `revision_feedback` persists for audit; the stepper
  points at the actual next action.

## Patterns Discovered

- Shared utilities pay off fast (one util fixed escrow + payout).
- Enforce preferences server-side; DB triggers can't.
- Freeform-UUID grouping gives semantic grouping with no schema cost.
- Degrade gracefully when an external integration is absent.
- Resolve time-assignment collisions across the whole plan, not per post.
- Parse brittle external APIs (Outstand) defensively across field-name variants.

## See Also

- [[Donny AI]]
- [[Content Delivery State Machine]]
- [[Campaign Lifecycle]]
- [[Supabase]]
