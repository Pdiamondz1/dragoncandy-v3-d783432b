---
title: Multi-Deliverable Scheduling
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [docs/DATABASE_SCHEMA.md, docs/PROJECT_CONTEXT.md]
tags: [scheduling, deliverables, social-hooks, cross-posting]
---

# Multi-Deliverable Scheduling

Per-deliverable captions, hooks, and post times with auto cross-scheduling
across the three roles. Replaces the prior single-post flow. Shipped May 2026.

## Per-Deliverable Model

- Each deliverable carries its own caption and social hook.
- `donny_scheduled_posts.deliverable_id` and
  `campaign_social_hooks.deliverable_id` link posts and hooks back to a
  specific `campaign_deliverables` row.
- `campaigns.posting_preferences` (JSONB) and `posting_schedule_status`
  govern how the schedule is generated and confirmed.

## Auto Cross-Scheduling

- Date-collision resolution prevents two posts landing on the same slot.
- Spread-aware post times distribute posts rather than clustering them.

## 5-Stage Social Hooks

`campaign_social_hooks` prompt each party (`party_role`:
restaurant/creator/brand) at stages 1–5 with a `content_template`, tracking
`prompted_at`/`acted_at`/`status`. Uniqueness is
`(campaign_id, stage, user_id, deliverable_id)`.

`triple_post_sessions` coordinates the trio: `restaurant_status`,
`creator_status`, `brand_status` per `(campaign_id, creator_id)`.

## Key Decisions

- Hooks and scheduled posts are scoped to a deliverable, not a campaign, so a
  multi-deliverable campaign schedules and prompts independently per asset.

## See Also

- [[Campaign Lifecycle]]
- [[Content Delivery State Machine]]
- [[Donny AI]]
- [[DragonCandy Platform]]
