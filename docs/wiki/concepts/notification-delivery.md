---
title: Notification Delivery
type: concept
created: 2026-06-23
updated: 2026-08-10
sources: [2026-06-23-notification-email-audit.md, 2026-08-08-notification-and-invitation-authorization.md, 2026-08-10-can-notify-crew-clause.md, 2026-08-10-email-link-injection.md]
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
sponsorship. Membership clauses check the relationship is **live** — `left_at IS NULL`
(conversation), `invitation_status='active'` (org), `status='active'` (crew) — because a
stale tie is not a current one.

> **Correction (2026-08-10, #440).** Until #440 that sentence was *false for the crew
> clause*, which this page nonetheless described as live-checked. Crew membership carried
> **no status filter at all**, and because `creator_groups` INSERT is
> `WITH CHECK (owner_id = auth.uid())` (any user may create a crew) and `cgm_owner_insert`
> leaves **`creator_id` unconstrained**, two INSERTs manufactured a channel from any
> authenticated user to **any user on the platform**. Proven red on prod, then proven closed.
> The lesson is not about crews: **a page that lists a control is not evidence the control
> exists.** Read the deployed `pg_get_functiondef`, not the prose or the migration.

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

**The crew invite and removal work the same way, for the same reason (2026-08-10, #440).**
`group_invitation` and `group_membership_removed` are cold contact by design — a business may
invite any creator it finds — and both fire at a **non-active** membership status, so the
`status='active'` clause cannot cover them:

| type | status **at notify time** |
|---|---|
| `group_invitation` | `invited` — the invite itself |
| `group_membership_removed` | `removed` — `removeMember` UPDATEs *before* dispatching |

Gating those on `active` would have silently killed both (the #387 regression shape), and
relaxing the clause to `IN ('active','invited','removed')` excludes only `declined` and fixes
nothing. So they are authorized against the **membership row** (caller owns the crew,
recipient is the named member, status matches the type) with **server-composed copy**.

> **The server-composed half is what makes it a fix rather than a relocation.** Row
> authorization alone would still mean "you may send anyone you can name in a crew row
> arbitrary text" — the same hole by a shorter route. With the copy pinned, a forged row
> buys nothing but a genuine-looking crew invitation *in our own words* at a fixed in-app
> URL, which the product already permits.

**Why `status='active'` is a real consent signal:** an owner **cannot write it**.
`cgm_owner_insert` pins `'invited'`, `cgm_owner_update` pins `IN ('invited','removed')`, there
is no self-UPDATE policy, and the only writer of `'active'` is `respond_to_group_invitation()`
gated `creator_id = auth.uid()`. Proven on prod **with a control**, since two denials alone
could mean a broken probe: INSERT active → 42501, UPDATE to active → 42501, UPDATE to
`'removed'` → **succeeds**.

### Every href was caller-chosen (2026-08-10, #442)

The same reachability, a third time: because `create-notification` spreads the request body
verbatim and calls `send-notification-email` **with the service key**, a user-authenticated
caller reached the templates and the self-only gate did not apply. **Every `href` in ~30
templates was built from that `data` and none was checked** — whole-URL fields (`actionUrl`,
`campaignUrl`, `reviewUrl`) went into `href` raw, and id fields were concatenated into paths so
a `"` closed the attribute and let the caller write markup into the message.

Closed by `_shared/emailLinks.ts`: `link` (a path *we* composed), `safeLink` (a caller path
forced back onto our origin), `pathSegment`, `safeImageUrl`.

> **`safeLink` discards the host rather than validating it** — it parses relative to our own
> origin and keeps only `pathname + search + hash`. That is why one rule covers absolute,
> protocol-relative, backslash, userinfo, `javascript:`/`data:`, CRLF and encoded-traversal
> spellings simultaneously. **Validation enumerates what is bad; discarding keeps only what is
> good — a host that is never read cannot be smuggled.**

29 tests assert **both** properties on every hostile input (stays-on-origin *and*
cannot-break-out), since fixing one without the other still leaves a usable injection.

Two auth bugs went with it: **`"Bearer undefined"` promoted an unauthenticated caller to
SERVICE** (the key was read `as string` with no presence check — confirmed real by reading the
live deployed bundle), and the self-check `to && callerEmail && …` **failed open on any caller
with no email on their auth record** — latent at 0-of-42 users today, but one GoTrue toggle
away from live.

**And the regression it had to avoid:** `budget: 0` is a real value (crew campaigns are free and
carry a literal `0`) behind a `data.budget ?` guard, so a naive `?? ''` would have printed
"Budget: $0" on every free-campaign email. **Escaping must not change what renders.** Money is
*coerced* rather than escaped, because two amounts sit in the **subject** — not markup, where
`&amp;` renders literally and a CRLF is a header-injection primitive escaping cannot touch.

**Also closed in #440 — the email could be redirected.** `recipientUserId` was spread **first**
in the payload `create-notification` sends to `send-notification-email`, so the two
caller-controlled spreads (`emailData`, `data`) overwrote it. Since that internal call uses the
service key, the self-only gate documented at the top of this page **does not apply to it** — so
a caller could authorize trivially against themselves (`p_actor = p_recipient`) and have a
branded email delivered to a **third party, with no `push_notifications` row recording it**. Now
pinned last. Separately, `forceDelivery` — which overrides the recipient's own opt-out — is now
**service-only** (it had zero callers anywhere).

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
- **A crew owner can still put a crew-flavoured bell in any user's feed** (#440, documented not
  closed). The row-authorized branch requires the membership row to *currently* hold the status
  the type is about, but an owner may insert `invited` naming anyone and then update to
  `removed` — producing "you're no longer in this crew" for someone who never joined. Bounded:
  bell-only for removal, server-worded for both, fixed in-app URL. The tempting guard —
  additionally require `responded_at IS NOT NULL` — was **checked and rejected**:
  `column_privileges` shows `authenticated` holds UPDATE on `responded_at`, and an RLS
  `WITH CHECK` cannot pin a column (there is no `OLD` row in a policy), so it is forgeable by
  the same owner. Closing it properly needs a column-grant revoke or membership history.
- **The repo cannot rebuild `can_notify_user` from migrations.** `schema_migrations` records
  `20260808120130 can_notify_user_active_relationships` with **no file in the tree** — applied
  directly during #387/#396 and never written back — so the repo body lacked the conversation
  and org clauses prod has. #440 codified prod's real body, but nothing reconciles the ledger
  against `supabase/migrations/` in general. See [[Updated-At Trigger Drift]] for the same
  `recorded ≠ actual` family in the other direction.
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
