---
title: Outstand
type: entity
created: 2026-06-07
updated: 2026-06-08
sources: [docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md, docs/DATABASE_SCHEMA.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md, raw/sessions/2026-06-08-weekly-sync.md]
tags: [outstand, social, integration, instagram, tiktok, youtube, webhook]
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
  state reconciliation; `outstand-webhook` receives inbound lifecycle events
  (see § Publish Webhook below).

## Publish Webhook (2026-06-07, shipped)

**Problem:** `donny_scheduled_posts` rows sat at `scheduled` indefinitely — nothing
consumed Outstand's outbound webhook events after queuing a post.

**`outstand-webhook` edge function** handles three events:
- `post.published` → advances row to `published`, sets `published_at`, stores
  per-account results in `metadata.publish_result`. Partial success (≥1 account)
  still maps to `published`.
- `post.error` → advances row to `failed`.
- `account.token_expired` → sets `business_outstand_accounts.status = 'error'`,
  triggering the existing reconnect-needed prompt.

**Auth:** HMAC-SHA256 over raw request body; header `X-Outstand-Signature: sha256=<hex>`;
secret `OUTSTAND_WEBHOOK_SECRET` env var. Constant-time comparison (timing-safe). Inbound
webhook so `verify_jwt = false` in `config.toml`.

**Idempotency:** all updates guarded `neq("status", "published")`; audit insert into
new `outstand_webhook_events` table with `id = "<event>:<postId>"` (unique-violation
silently ignored).

**Correlation:** webhook `postId` == `donny_scheduled_posts.metadata.outstand_post_id`
(written by `confirm-posting-schedule` when it queues the post to Outstand).

**Shared lib:** `supabase/functions/_shared/outstand-webhook-lib.ts` — runtime-agnostic
HMAC verification + defensive event parser, fully unit-tested.

**PostCard UI** updated to show `published`/`failed` badge states.

Runbook: `docs/superpowers/runbooks/outstand-webhook.md`  
Spec: `docs/superpowers/specs/2026-06-07-outstand-publish-webhook-design.md`

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

- [[Campaign Lifecycle Flow]] — auto-posting path (approved content → Outstand); webhook leg added 2026-06-07
- [[DragonShare Flow]] — boost cross-posting via Outstand
- [[DragonShare]]
- [[Donny AI]] — scheduled-post lifecycle now fully closed by webhook
- [[DragonCandy Platform]]
- [[Core Docs Recent Updates Sync Session]]
- [[Weekly Sync Session (2026-06-08)]]
