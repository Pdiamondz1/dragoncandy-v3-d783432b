---
title: DragonShare
type: entity
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-dragonshare-amplification-engine.md, docs/PROJECT_CONTEXT.md, docs/DATABASE_SCHEMA.md]
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

## Database Tables

- `dragonshare_posts` — creator posts. `post_url`/`platform` nullable (direct uploads);
  `content_file_path` is a **public URL** (see Known Issues); `flagged_at`/`flagged_by`
  and `declined_at`/`declined_by`; default status `verified`. Admin-queue and Donny-scoring
  columns were removed.
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
- **Notification inserts are best-effort** — wrapped in `BEGIN…EXCEPTION WHEN OTHERS THEN
  NULL` blocks so a push-notification failure can never roll back a boost payment or decline
  (both of which are financially or state-critical). The Stripe transfer happens before the
  trigger fires; the notification is non-critical. (Migration:
  `20260601140000_dragonshare_notifications.sql`)

## Known Issues

- **`content_file_path` is already a public URL — never wrap it in `useSignedUrl`.**
  `createSignedUrl` expects a storage key, so re-signing silently fails and media won't
  render. (Also recorded in project memory.)
- `business_outstand_accounts` is keyed to `business_profiles.id`, not `organizations.id` —
  resolving an org's platforms requires org → owner → business_profile → accounts.

## See Also

- [[Trust-Then-Flag Model]]
- [[Two-Path Boost Payment]]
- [[Stripe Connect]]
- [[Data Flywheel]]
- [[DragonDash]]
- [[DragonShare Amplification Engine Session]]
