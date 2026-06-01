# Session Extract: Campaign Delivery, Scheduling & Notifications cluster (late May 2026)

**Created**: 2026-06-01
**Branch**: worktree-wiki (synthesis of work landed 2026-05-24 → 2026-05-31)
**Project**: C:\GIT\dragoncandy-v3-d783432b

## Summary

A cluster of related workstreams hardened the post-campaign content pipeline: content-delivery
stabilization, a real notification system, social scheduling + auto cross-scheduling, the Donny
content strategist, and revision-workflow status sync. Synthesized from specs dated
2026-05-24 (content delivery stabilization), 2026-05-25 (social scheduling calendar),
2026-05-26 (notification system, auto cross-scheduling, Donny content strategist, revision
workflow/stepper), and 2026-05-27 (auto cross-scheduling bugfixes, revision stepper sync).

## Content Delivery Stabilization (2026-05-24)

- **Shipped**: shared pricing utility so escrow and payout compute the creator amount
  identically; two-phase commit for payout with a `releasing` escrow status; non-blocking
  audit logging; `maybeSingle` graceful fallback for a missing creator profile; an
  escrow-status filter in the auto-approve cron.
- **Why**: escrow and payout were calculating creator amounts differently when counter-offers
  existed; the Stripe transfer is irreversible so in-flight state must be visible, not silent;
  payment completion outranks the audit trail.
- **Gotchas**: escrow stored the checkout session id in the `payment_intent_id` field; a
  manual approval racing the cron could double-invoke payout (idempotency key mitigates but
  logs are confusing); silently-swallowed email-notification failures now surface as a warning toast.
- **Touched**: `campaigns` (`escrow_status` adds `releasing`, new `escrow_checkout_session_id`),
  edge functions `create-campaign-escrow`/`release-creator-payout`/`auto-approve-content`/
  `verify-campaign-escrow`, new `_shared/pricing-utils.ts`.

## Notification System (2026-05-26)

- **Shipped**: a real notification system replacing localStorage. New columns on
  `push_notifications` (type, category, action_url, actor_id, actor_name, icon); a
  `preferences_matrix` JSONB on `notification_preferences`; a centralizing `create-notification`
  edge function; realtime enabled on `push_notifications` + 3 campaign tables; a `/notifications`
  center, redesigned bell dropdown, and a preferences matrix UI. ~38 notification types across 5
  categories (Campaigns, Messages, Transactions, Content, Account). SMS is a "coming soon" placeholder.
- **Why**: DB triggers can't call external APIs or enforce preferences server-side, so a single
  edge function is the hub; realtime publication drives dashboard refresh without polling; the
  5×3 `preferences_matrix` supports future SMS with no migration; account-deletion notifications
  bypass preferences.
- **Gotcha/scale note**: broadcast notifications loop `create-notification` per recipient — fine
  at ~30 users, needs a batch variant past ~1000 creators.

## Social Scheduling + Auto Cross-Scheduling (2026-05-25 / 26 / 27)

- **Shipped**: video hero-frame previews in the "Ready to Share" dialog; AI captions from the
  `social-caption` function (pre-generated at approval or refreshed in-dialog); a post-schedule
  confirmation state ("View on Calendar"); a standalone `/calendar` page (week/month, platform
  filters, reschedule); restaurant-configured posting spread (auto/even/front_loaded/custom) that
  Donny turns into an auto-generated schedule after content approval; a schedule-review UI; and an
  upcoming-posts dashboard widget.
- **Why**: reuse `VideoFrameThumbnail` for cross-app consistency; captions should target the
  platform audience, not internal business notes; a confirmation state beats toast-and-dismiss;
  posting preferences live on the campaign so Donny reuses them; `plan_group_id`/`plan_order`
  group multi-post plans without a new table; `deliverable_id` maps posts to specific deliverables.
- **Gotchas (fixed 2026-05-27)**: deliverables colliding on one day (fixed with a spread + next-
  available-day resolver); `confirm-posting-schedule` omitting `social_account_ids` (400s); the
  Outstand proxy mismatching account-id field names on reschedule (broadened parsing + ownership
  fallback).
- **Touched**: `campaigns` (`posting_preferences` JSONB, `posting_schedule_status`),
  `donny_scheduled_posts` (`deliverable_id`, `plan_group_id`, `plan_order`),
  `campaign_social_hooks` (`deliverable_id`), edge functions `content-posting-plan`,
  `confirm-posting-schedule`, `fire-campaign-social-hook`, `outstand-proxy`.

## Donny Content Strategist (2026-05-26)

- **Shipped**: platform-aware campaign generation (Donny only suggests platforms the restaurant
  has connected via `business_outstand_accounts`); a `content_strategy` block in
  `campaigns.ai_analysis` (posts array with content_type/platform/purpose/day_offset, cadence,
  reasoning); the `content-posting-plan` function mapping deliverables → strategy slots with
  platform-adapted captions and static optimal-time rules; a PostingPlanReview UI; and graceful
  zero-platform handling (amber nudge, campaign still launches).
- **Why**: don't suggest content the restaurant can't post; static time rules avoid external API
  calls; storing strategy in the existing `ai_analysis` JSONB needs no migration; one Anthropic
  call generates the whole plan for the cost of one caption.
- **Gotcha**: the model embeds hashtags in caption text, so appending the hashtags array doubled
  them — fixed by stripping trailing hashtag blocks and keeping caption/hashtags as separate state.

## Revision Workflow & Status Sync (2026-05-26 / 27)

- **Shipped**: per-item revision requests (per-file checkboxes + per-item feedback); a creator-
  side amber "needs revision" banner with the stepper held at the Upload step; content-status-
  aware campaign cards; and de-duplication so accepted applications don't appear in both Active
  and Done tabs.
- **Why**: targeted per-deliverable feedback; `revision_feedback` persists (not cleared on
  resubmit) for audit; the stepper must point at the actual next action.
- **Gotchas**: `deriveCurrentStep()` didn't handle `revision_requested` (fell through to
  `hired`); the business view rendered revision as "not yet submitted" until an
  `isRevisionRequested` flag was added; the dedup filter only checked active collabs, not completed.
- **Touched**: no schema changes — reused `campaign_collaborations.revision_feedback` /
  `revision_count`; component-level fixes only.

## Cross-Cutting Learnings

- Shared utilities pay off fast (pricing-utils fixed two functions at once).
- Enforce preferences server-side; DB triggers can't.
- Freeform-UUID grouping (`plan_group_id`) gives semantic grouping without schema complexity.
- Degrade gracefully when an external integration is absent (zero Outstand accounts → nudge, not error).
- Time-assignment collisions must be resolved across the whole plan, not per post.
- Parse brittle external APIs (Outstand) defensively across field-name variants.
