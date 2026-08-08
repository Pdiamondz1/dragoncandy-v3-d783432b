---
title: Notification Delivery
type: concept
created: 2026-06-23
updated: 2026-08-08
sources: [2026-06-23-notification-email-audit.md, 2026-08-08-notification-and-invitation-authorization.md]
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

> **Corrected 2026-08-08.** This section used to end: *"`create-notification` resolves the
> email type as `emailType ?? map[type]`, so a caller can target **any** template by passing
> an explicit `emailType` without adding a map entry."* That was accurate, and it was
> describing a **vulnerability as a feature** — "any template" meant a user could have any
> counterparty emailed a payment receipt or a hire confirmation for an event that never
> happened. See "Who may notify whom" below for what replaced it.

## Who may notify whom (added 2026-08-08)

Until 2026-08-08 the answer was **anyone, anything, to anybody**. `create-notification`
called `auth.getUser()` and then **never referenced the `user` object again** — every field
written, including `recipientId` and `actorId`, came from the request body and was inserted
with the service role.

Read that against "The two edge functions" above: `send-notification-email` carries a
self-only gate *specifically to prevent email enumeration*, and the invariant on this page
tells all frontend code to route around that gate through `create-notification`, **because
its internal send uses the service key**. The recommended path around the guard had no guard
of its own. A page can document a control accurately and still miss that the door beside it
is open.

Three layers now stand between a caller and a recipient's feed. **Service-role callers
(`dre-award-engine`, `dragonshare-notify`) bypass all of it** — they are the system acting on
its own behalf.

**1. The actor is the JWT, never the body.** A client-supplied `actorId`/`actorName` is
ignored and both are resolved server-side. Safe to do unconditionally: every `actorId` passed
anywhere in `src/` was already the caller's own id, so no real call site changed behaviour.

**2. The recipient must be reachable — `can_notify_user(actor, recipient)`.** A
`SECURITY DEFINER`, service-role-only SQL function over six relationships: self, campaign
(owner ↔ applicant/collaborator/invitee, either direction), conversation, crew, org, and
sponsorship. Membership clauses check the relationship is **live** — `left_at IS NULL`,
`invitation_status='active'` — because a stale tie is not a current one.

The clause set was derived twice and cross-checked, which is the part worth copying:

- **Backtested** against all 91 actor-bearing `push_notifications` rows → 89/91.
- **Enumerated** across all 32 client call sites → caught **sponsorship**, which the
  backtest could never have found because no sponsorship notification has ever fired on prod.

> **A history-only derivation can only see what has already happened.** Backtesting proves a
> rule doesn't break the past; only reading the call sites shows what the future needs.

Sponsorship also carries a trap: `campaign_sponsorships.brand_id`/`restaurant_id` are FKs to
**`business_profiles.id`, not `auth.users`**. Comparing them to a user id never matches — and
fails *silently*, as a 403 nobody can explain.

**Cold contact needs no exemption.** `ContactCreatorModal`/`ContactRestaurantModal` reach
someone from their public profile with no prior tie — but both `await` conversation creation
*before* notifying, so the conversation clause already covers them. This is an **ordering
dependency**: invert that sequencing and cold contact starts silently 403ing.

**3. The server writes the copy where the caller must not.** `content_liked` is the one type
legitimately reachable without a relationship, so it is authorized against the **referenced
post** (recipient must own it) rather than a relationship. Ownership being the only check
would leave `title`/`body`/`actionUrl` as free text aimed at any post owner — the exact
stranger-phishing vector — so for that type the server composes them.

### Template selection is bound to the flow that justifies it

The `emailType ?? map[type]` passthrough is gone. A client may now name only the template
**matching its own notification type** (`emailType === type`, from a 5-entry allow-list of
flows whose type has no map entry). Anything needing a *different* template than its type is
derived server-side.

`file_uploaded` is the one such case and the sharpest lesson on this page: it is a single
notification type carrying **two role-worded emails** ("New Deliverables … ready for review"
from the creator, "New Campaign Files" from the restaurant). Binding the template to the type
was not enough, because the role lives *inside* the type — the client still picked, so either
party in a real collaboration could send the other the email claiming the wrong uploader. The
variant is now read from the collaboration: the caller is either its `creator_id` or the
campaign's `user_id`. Both sides are checked explicitly rather than inferring "not the creator
⇒ the business", since several people can pass the relationship gate on one campaign while
only two are parties to that collaboration.

And when the role **cannot** be derived, the email is **suppressed** rather than defaulted —
the bell still fires. A fallback to the type map looked harmless ("the same mail this type
always sent") and was not: with the client no longer supplying `emailType`, omitting
`data.collaboration_id` had become the only remaining way to force the wrong role-worded
email.

> **"No worse than before" is the wrong bar for a fix.** The test is whether the claim the code
> now makes — this variant comes from database facts — is true. A fallback the caller can
> trigger at will defeats the derivation it falls back from.

> **Ignoring an untrusted input is not automatically safe.** The first attempt at this
> dropped `emailType` outright and **silently killed 7 working email flows** whose
> notification type has no map entry. A tightening is a behaviour change and needs the same
> "what does this break?" pass as a feature.

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

- ~~Bulk-invite (`useBulkInvite`) sends the invitation email but creates **no** in-app
  bell.~~ **Fixed 2026-08-08 (PR #387)** — both invite paths now route through one shared
  `notifyInvitedCreator()` helper, so single and bulk invites cannot drift apart again.
- `CollaborationRedirect` always lands on the **creator's** my-campaigns view regardless
  of who clicks the `/projects/:id` link.
- **`title`/`body`/`actionUrl` are still free text** for callers who *do* hold a
  relationship with the recipient. Far smaller than the stranger-phishing surface closed
  above — a counterparty can already message you — but it wants a server-side templating
  pass across the 32 call sites to close properly.
- `can_notify_user`'s cold-contact coverage rests on an **ordering dependency** (conversation
  created before the notify fires), not on an explicit clause. Nothing enforces that order.
- Findings in PR #161 were code-verified only — prod had no `send-notification-email`
  traffic in 24h (pre-revenue), so the 403s weren't observed at runtime.

## See Also

- [[Campaign Lifecycle]] — the events that fire most of these notifications
- [[Content Delivery State Machine]] — completion/approval transitions that notify
- [[Supabase]] — edge functions, service-role vs user-JWT auth, RLS
- [[Service-Role Data Exposure]] — the defect class: service-role code bypassing the RLS
  that would otherwise scope it
- [[Campaign Invitations]] — the invite flow whose UX work surfaced all three holes
- [[Notification Email Audit Session]] — the session that produced this page
- [[Notification & Invitation Authorization Session]] — the 2026-08-08 hardening
