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

## Analytics & measurability (2026-06-11 findings)

The `content-performance-capture` cron reads per-post engagement from Outstand's
`GET /posts/{id}/analytics`. Two limitations discovered while building the
[[Content Engine]] read surface:

- **No deletion/archival signal.** The analytics response
  (`{ success, post{id,publishedAt,createdAt}, metrics_by_account[],
  aggregated_metrics{total_*,average_engagement_rate} }`) has **no `status` /
  `deleted_at` / `archived` field**. Per-account status is only
  `pending | published | failed`. Webhooks document only `post.published` and
  `post.error` — there is **no `deleted` event** (the marketing site name-drops
  one, but no event/payload exists in the docs). So there is **no reliable way to
  know a user deleted or archived a published post on the platform.**
- **Empty `metrics_by_account` = "unmeasurable", and it's ambiguous.** When
  Outstand returns `success:true` but an **empty `metrics_by_account[]`**, the
  `aggregated_metrics` are all-zero as a *consequence of no per-account data* —
  NOT a measured zero. An empty array is identical for a deleted post, an
  archived post, a disconnected/revoked account, a never-truly-published post,
  AND analytics-not-yet-populated. A genuinely live, measurable post returns
  **≥1** per-account entry (even when its counts are 0).
- **Observed:** the one captured prod post (`mJuDd`, YouTube) has had an **empty
  `metrics_by_account` for 5+ days** across its 24h and 72h snapshots — past any
  analytics lag, suggesting our published test posts are **fundamentally
  unmeasurable** by Outstand today (connection scope / not truly published to a
  live account), not merely unwatched. Open question for launch: *can the publish
  pipeline ever produce a populated `metrics_by_account`?* (Settle with a real
  post + an Outstand-side check.)

> ## ✅ OPEN QUESTION SETTLED 2026-08-04 — the answer is YES
>
> **"Fundamentally unmeasurable" was a false generalization from a single post, and this page
> was never corrected.** The conclusion above was written 2026-06-11 from `mJuDd` alone. Two
> days later, `content_performance` captured YouTube post **`XDbxe`** with **1,388 views and
> 5 likes at 24h, growing to 1,388 / 5 by 72h and 7d** — real, populated, non-zero metrics
> from the same publish pipeline and the same account (`coalition.joe@gmail.com`).
>
> All three captured posts, for the record:
>
> | post | platform | views | likes | verdict |
> |---|---|---|---|---|
> | `XDbxe` | youtube | **1,388** | **5** | **measurable — pipeline works** |
> | `XDb8e` | youtube | 0 | 0 | zeros (posted 9s after `XDbxe`; likely a dud upload) |
> | `mJuDd` | youtube | 0 | 0 | zeros — the post this page's conclusion was based on |
>
> A video with genuinely zero views returns 0. **Zero is not the same as unmeasurable**, and
> that conflation is what produced the wrong conclusion — the same ambiguity this page itself
> warns about, two bullets up.
>
> **Residual unknowns (do not over-correct):** `reach`, `engagement_rate` and `saves` were
> 0/null even on the working post — YouTube does not report reach, so partial field coverage
> may be platform-specific rather than a defect. **Instagram has never been tested on
> Outstand.** Outstand's current documented response also carries a per-account
> `metrics_error {code, message}` field absent from the June shape, which would disambiguate
> future empties directly.
>
> **Consequence:** this page's claim was load-bearing — it was cited as a primary reason to
> migrate off Outstand in
> `docs/superpowers/specs/2026-08-01-outstand-zernio-cutover-design.md`. That spec's premise
> is retracted. See [[Social Provider Seam]].

Consequence: the Content Engine treats empty `metrics_by_account` as
**"metrics unavailable"** rather than a measured 0 (see [[Content Engine]]).

## Integration Status

- Phases 1–3 complete (account linking + delegated posting); phase 4 (analytics
  dashboard) in scope per [[Project Context]].
- Direct platform API approvals (Meta, TikTok, YouTube, X) are deliberately
  deferred — Outstand is the abstraction that makes that deferral safe ("never
  block launch on API approvals").

## See Also

- [[Campaign Lifecycle Flow]] — auto-posting path (approved content → Outstand)
- [[DragonShare Flow]] — boost cross-posting via Outstand
- [[DragonShare]]
- [[Donny AI]]
- [[DragonCandy Platform]]
- [[Core Docs Recent Updates Sync Session]]
