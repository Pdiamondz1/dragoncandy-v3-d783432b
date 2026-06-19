---
title: DragonShare
type: entity
created: 2026-06-01
updated: 2026-06-07
sources: [raw/sessions/2026-06-01-dragonshare-amplification-engine.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md, docs/PROJECT_CONTEXT.md, docs/DATABASE_SCHEMA.md]
tags: [dragonshare, amplification, ugc, payments, social]
---

# DragonShare

The amplification engine — **live on web.** Creators upload organic content about
restaurants; restaurants (and brands) boost it to cross-post across their connected
social channels via Outstand, paying the creator through [[Stripe Connect]] on an
80/20 creator/platform split. Every boost feeds the [[Data Flywheel]].

## How It Works

1. **Creator submits** — upload-first single screen. Media is first-class; an optional
   post link auto-detects platform (Instagram/TikTok/YouTube/X/Other). Creator tags a
   restaurant via typeahead or the browse page.
2. **Post is live immediately** under the [[Trust-Then-Flag Model]] — default status
   `verified`, no admin queue, no scoring gate. Safety is post-hoc flagging.
3. **Restaurant/brand decides — boost or pass.** Before paying, content is shown
   watermarked ("DragonCandy • PREVIEW"). Pass soft-declines (`declined_at`), removing
   the post from the queue without deleting it.
4. **Boost pays the creator** via the [[Two-Path Boost Payment]] flow; on success the
   clean content downloads and the creator receives 80% of the boost.

## What Shipped

- Upload-first submit (mobile sheet + desktop side-by-side), URL-to-platform detection,
  restaurant typeahead + browse with cuisine/search filters.
- Watermarked preview before payment; clean post-payment download (cross-origin forced).
- Custom boost amount ($5–$500) on top of preset tiers.
- Real photo/video-frame thumbnails across all four surfaces (`isVideoPost` helper).
- Success confirmation dialog with "Share another".

## Notifications & Activity (2026-06)

A dedicated notifications layer sits on top of the engine:

- **`dragonshare-notify` fanout edge function** is the single owner of DragonShare
  notification delivery across three channels — in-app bell + email + Donny. Raw
  `push_notifications` inserts were retired so all delivery routes through it.
- DragonShare is its **own notification category** (split out of the generic
  "content" category) with four DragonShare email templates, fired on three
  lifecycle events: **submit, decline, and boost fulfillment**.
- **Dashboard activity parity** — a dedicated DragonShare activity card on *both*
  the creator and business dashboards, with events folded into each role's
  recent-activity feed via an activity-derive helper + per-role activity hooks.
  Whole-dollar formatting matches the rest of the app; business activity query
  failures surface instead of failing silently.
- **CGC submissions unblocked** — storage upload RLS fix + a missing
  `social_handles` column; posting/download parity, real duration, atomic delete.

## Database Tables

- `dragonshare_posts` — creator posts. `post_url`/`platform` nullable (direct uploads);
  `content_file_path` is a **public URL** (see Known Issues); `flagged_at`/`flagged_by`
  and `declined_at`/`declined_by`; default status `verified`. Admin-queue and Donny-scoring
  columns were removed. `source_brief_id` (FK → `content_briefs`) and `caption` link a submission
  back to the [[Content Engine]] brief that prompted it and carry the brief's pre-filled caption.
  Once a boosted post is published, `social_post_log.dragonshare_post_id` references this post and a
  trigger resolves `source_brief_id` onto the log row and the brief, closing the [[Content Engine]]
  loop (Phase C).
- `dragonshare_boosts` — boost payments (pending → transferred).
- `dragonshare_payouts` — creator payouts (audit ledger, mirrors `payment_events`).
- `dragonshare_events` — lifecycle events for the [[Data Flywheel]].
- `dragonshare_engagement` — schema only, not yet populated.

## Key Decisions

- Trust-then-flag instead of an admin verification queue — see [[Trust-Then-Flag Model]].
- Nullable url/platform so direct uploads need no link.
- Security-definer RPCs (`resolve_dragonshare_orgs`, `get_org_connected_platforms`) to read
  restaurant names and connected accounts across RLS boundaries on [[Supabase]].
- Soft-decline (additive) over hard delete, to preserve the audit trail.

## Known Issues

- **`content_file_path` is already a public URL — never wrap it in `useSignedUrl`.**
  `createSignedUrl` expects a storage key, so re-signing silently fails and media won't
  render. (Also recorded in project memory.)
- `business_outstand_accounts` is keyed to `business_profiles.id`, not `organizations.id` —
  resolving an org's platforms requires org → owner → business_profile → accounts.

## See Also

- [[DragonShare Flow]] — visual end-to-end flow diagrams
- [[Content Engine]] — the brief → DragonShare submission path (`source_brief_id`, caption pre-fill)
- [[Deep-Link Param Query Race]] — the `?restaurant=&brief=` pre-fill bug + fix
- [[Trust-Then-Flag Model]]
- [[Two-Path Boost Payment]]
- [[Stripe Connect]]
- [[Data Flywheel]]
- [[DragonDash]]
- [[Outstand]]
- [[DragonShare Amplification Engine Session]]
- [[Core Docs Recent Updates Sync Session]]
