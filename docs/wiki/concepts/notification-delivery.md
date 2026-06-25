---
title: Notification Delivery
type: concept
created: 2026-06-23
updated: 2026-06-23
sources: [2026-06-23-notification-email-audit.md]
tags: [notifications, email, edge-functions, auth, rls]
---
# Notification Delivery

How DragonCandy delivers user notifications (in-app bell + email), and the one rule
that keeps cross-user notifications from silently failing.

## The two edge functions

- **`create-notification`** — the **choke point**. Inserts the in-app bell row
  (`push_notifications`, via the service-role client so RLS is bypassed), checks the
  recipient's `notification_preferences`, and — if the category's email is enabled (or
  `forceDelivery`) — calls `send-notification-email` internally **with the service key**.
  Resolves the recipient's email server-side from `recipientId`.
- **`send-notification-email`** — renders one of ~30 templates and sends via Resend. It
  has a **self-only auth gate**: a non-service caller (i.e. a frontend `invoke`, which
  carries the user's JWT) may only send to **itself** — if `to`/`recipientUserId` isn't
  the caller, it returns **403** ("recipient must be self" / "cannot resolve other users'
  emails"). This exists to prevent email enumeration.

## The rule (invariant)

**Frontend code must never call `send-notification-email` directly to notify another
user — route it through `create-notification`.** A frontend direct send to a counterparty
is 403'd and silently dropped (the `.catch` swallows it). `create-notification` is the
only correct path because its internal send uses the service key (`isService=true`,
bypassing the gate) and it also gives the event an in-app bell.

This was the root cause of **9 silently-broken transactional emails** (PR #161): likes,
content-started, joint approvals, project/sponsorship completion all called
`send-notification-email` directly with the counterparty's address and never delivered.
Edge-function callers (`verify-sponsorship-payment`, `auto-approve-content`,
`send-campaign-publish-notifications`, `send-campaign-invitation`, `stripe-webhook`) are
fine because they use the service key.

## Category → default email channel

`create-notification` reads the recipient's `notification_preferences.preferences_matrix`,
falling back to a default matrix:

| Category | Email default | Used for |
|---|---|---|
| `campaigns`, `transactions`, `account`, `dragonshare` | **on** | applications, approvals, completions, payments, boosts |
| `messages`, `content` | **off** (bell only) | DMs, likes, file uploads |

So a `content`-category event (e.g. a like) shows a bell but emails **only if the user
opted in**. `forceDelivery: true` bypasses prefs — appropriate for critical transactional
mail, **not** for high-frequency social events like likes (which would override the
user's choice).

`create-notification` resolves the email type as `emailType ?? map[type]`, so a caller can
target **any** template by passing an explicit `emailType` without adding a map entry.

## Email template conventions (`send-notification-email`)

- Build every button URL from `baseUrl` (`APP_URL` env) — **not** from a raw
  caller-supplied field with no fallback. The dead "View Campaign" link (PR #161) was the
  one template using bare `data.campaignUrl` → `href="undefined"`. Guard
  id-interpolated paths (`/campaigns/${id}`) so a missing id degrades to a list page, not
  `/undefined`. Verify targets against `src/App.tsx` routes.
- Greet with `${esc.rn}` (the server-resolved name) **or** `${esc.recipientName}`, which
  now falls back to `rn` — so `create-notification`-routed mail (no top-level
  `recipientName`) doesn't render "Hi ,".
- `/projects/:id` ([[Content Delivery State Machine]]'s project view) is
  `CollaborationRedirect` and expects a **collaboration id**, not a campaign/project id.
- A `type` with no matching template throws "Unknown notification type" → the send fails.
  Keep the `NotificationType` union, the templates object, and every caller's `type` in
  sync.

## Known Issues

- Bulk-invite (`useBulkInvite`) sends the invitation email (via
  `send-campaign-invitation`) but creates **no** in-app bell.
- `CollaborationRedirect` always lands on the **creator's** my-campaigns view regardless
  of who clicks the `/projects/:id` link.
- Findings in PR #161 were code-verified only — prod had no `send-notification-email`
  traffic in 24h (pre-revenue), so the 403s weren't observed at runtime.

## See Also

- [[Campaign Lifecycle]] — the events that fire most of these notifications
- [[Content Delivery State Machine]] — completion/approval transitions that notify
- [[Supabase]] — edge functions, service-role vs user-JWT auth, RLS
- [[Notification Email Audit Session]] — the session that produced this page
