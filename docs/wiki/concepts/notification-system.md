---
title: Notification System
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [docs/DATABASE_SCHEMA.md, docs/PROJECT_CONTEXT.md]
tags: [notifications, realtime, preferences]
---

# Notification System

Cross-channel notification delivery with per-user, per-category routing.
Shipped May 2026.

## Categories × Channels

A `preferences_matrix` JSONB on `notification_preferences` maps 5 categories
against 3 channels:

| Category | Channels |
|----------|----------|
| Campaigns | in_app · email · sms |
| Messages | in_app · email · sms |
| Transactions | in_app · email · sms |
| Content | in_app · email · sms |
| Account | in_app · email · sms |

## Data Model

- `push_notifications` — realtime-enabled feed. Adds `type`, `category`,
  `action_url`, `actor_id`, `actor_name`, `icon`. Indexed on
  `(user_id, created_at)` filtered to unread, and on
  `(user_id, category, created_at)`.
- `notification_preferences` — holds the `preferences_matrix`.

## Behavior

- Realtime publication on `push_notifications` drives the in-app feed live.
- Notification center redesigned with per-category clearing and deletion.
- Email/SMS/in-app routing decided per category from the matrix.

## Key Decisions

- A single matrix (category × channel) keeps preference logic declarative
  rather than spread across per-type flags.

## See Also

- [[Supabase]]
- [[Campaign Lifecycle]]
- [[DragonCandy Platform]]
