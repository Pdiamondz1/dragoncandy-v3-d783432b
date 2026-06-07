---
title: Outstand
type: entity
created: 2026-06-07
updated: 2026-06-07
sources: [docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md, docs/DATABASE_SCHEMA.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md]
tags: [outstand, social, integration, instagram, tiktok, youtube]
---

# Outstand

Outstand.so is the **social-media bridge** for [[DragonCandy Platform]]. It
handles connecting creator/restaurant social accounts (Instagram, TikTok,
YouTube) and **delegated posting** on the user's behalf, so the platform never
has to ship its own Meta/TikTok/YouTube API approvals. It underpins two core
flows: [[DragonShare]] boosts (cross-posting boosted content to a restaurant's
connected channels) and [[Donny AI]] scheduled posts (auto cross-scheduling
into the user's channels).

## Role in the Stack

- **Account linking** — `business_outstand_accounts` maps a `business_profiles.id`
  to its connected Outstand accounts (note: keyed to the business profile, not
  `organizations.id`, so resolving an org's platforms goes org → owner →
  business_profile → accounts).
- **Delegated posting** — `delegated_posting_permissions`, `social_post_log`,
  `triple_post_sessions` (multi-platform posting), and `creator_automation_preferences`.
- **Platform-aware AI** — Donny only suggests platforms the restaurant has
  actually connected via Outstand, then queues approved content to Outstand for
  scheduling (`donny_scheduled_posts`).
- Edge function `outstand-proxy` brokers calls; `outstand-reconcile` handles
  state reconciliation.

## Account Recovery (2026-06)

When Outstand drops a connected account — e.g. after a **billing lapse** on the
user's Outstand subscription — the platform now **reconciles** state and shows a
**reconnect-needed prompt** so the user is guided to re-link, instead of hitting
silent posting failures. **Real profile photos** now surface for connected
accounts (previously placeholder/initial avatars).

Spec: account recovery after billing wipe (`docs/superpowers/...`, 2026-06).

## Integration Status

- Phases 1–3 complete (account linking + delegated posting); phase 4 (analytics
  dashboard) in scope per [[Project Context]].
- Direct platform API approvals (Meta, TikTok, YouTube, X) are deliberately
  deferred — Outstand is the abstraction that makes that deferral safe ("never
  block launch on API approvals").

## See Also

- [[DragonShare]]
- [[Donny AI]]
- [[DragonCandy Platform]]
- [[Core Docs Recent Updates Sync Session]]
