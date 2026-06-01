# DragonShare → Notifications + Dashboard Parity — Design

> **Status:** Approved design, pending implementation plan.
> **Date:** 2026-06-01
> **Author:** Dame + Claude
> **Related:** `docs/superpowers/specs/2026-06-01-dragonshare-flow-fixes-design.md`
> (the submit → review → pay flow this builds on).

## 1. Goal

Make DragonShare a first-class citizen in the notification system and on the
dashboards — **just like campaigns** — so every party is kept informed across
in-app bell, email, and Donny, and DragonShare activity is visible at a glance
on both dashboards.

Today DragonShare only emits two raw in-app notifications (boost paid, declined)
to the **creator** via DB triggers. The restaurant/brand gets nothing, there is
no email, no Donny surfacing, and DragonShare appears on the dashboards only as a
single earnings/boosts stat tile (no activity).

## 2. How campaigns do it (the pattern we mirror)

Confirmed by code exploration:

- **In-app bell + email:** frontend mutation hooks call the `create-notification`
  edge function (`supabase/functions/create-notification/index.ts`). It inserts a
  `push_notifications` row, reads `notification_preferences.preferences_matrix`,
  and sends email via `send-notification-email` when the category's `email`
  channel is enabled (or when `forceDelivery` is set). The realtime subscription
  in `src/hooks/useNotifications.ts` pushes the bell + toast live.
- **Donny nudges (campaign path is BROKEN in prod — see §2.1):**
  `notify_donny_nudge()` (migration `20260411000001_donny_nudge_triggers.sql`) is
  an `AFTER INSERT` trigger meant to call the `donny-nudge-frame` edge function
  via `pg_net` (`extensions.http_post`, using `app.settings.supabase_url` +
  `app.settings.service_role_key`) to upsert a `donny_nudges` row.
- **Donny proactive chat message:** for the highest-value moment only (campaign
  invitation, `send-campaign-invitation/index.ts`), the edge function writes a
  `donny_messages` row (`role: 'assistant'`, `quick_actions: [...]`) into the
  user's `donny_conversations` thread.
- **Dashboards:** a `Recent Activity` feed on the creator dashboard
  (`useCreatorRecentActivity`) and an `Active Campaigns` feed on the business
  dashboard (`useBusinessActiveCampaigns`), each rendered with `ActivityFeedCard`.

### 2.1 Two pre-existing facts that shape the mechanism (verified live)

1. **The `pg_net`-from-trigger path is a silent no-op today.** Both
   `app.settings.supabase_url` and `app.settings.service_role_key` are **unset**
   on the production database (verified via `current_setting(...)`). Every
   `notify_donny_nudge()` call therefore builds `url := NULL || '/functions/...'`
   and the `http_post` fails inside a swallowed `EXCEPTION` — so **campaign Donny
   nudges via DB trigger are not firing in production.** We will **not** depend on
   `pg_net`/GUCs for DragonShare (and we note the campaign-nudge gap as a
   discovered issue in §12).
2. **`donny-nudge-frame` cannot target an arbitrary recipient.** It derives the
   user from the auth token (`const user_id = caller.id`, line 45) and discards
   the body `user_id`. Called with a service-role bearer, `getUser()` won't
   resolve to the intended recipient. So it is **not reusable** for nudging the
   restaurant owner / creator. DragonShare will insert `donny_nudges` rows
   **directly** (service-role, explicit `actions`) instead.

**Conclusion:** the faithful way to mirror campaigns is their *working* path —
invoke `create-notification` from the **application layer** (frontend hooks /
server-side fulfillment), not from SQL triggers. That is the mechanism below.

## 3. Scope (confirmed decisions)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Events | All four (below) |
| 2 | Dashboard | **Both** — fold into existing feeds **and** a dedicated DragonShare card |
| 3 | Channels | **Full parity** — in-app bell + email + Donny |
| 4 | Category | **New `dragonshare` category**, default `in_app: true, email: true` |
| 5 | Donny chat message | **Only** new-submission→restaurant; lighter `donny_nudges` for the other three |

### Events and recipients

| Event | Recipient | Type | Status today |
|-------|-----------|------|--------------|
| Creator submits a post tagging a restaurant | Restaurant/brand owner | `dragonshare_submission` | **NEW** |
| Boost paid (`dragonshare_boosts.status → transferred`) | Creator (payout) | `dragonshare_boost` | exists (in-app only) |
| Boost paid | Restaurant/brand (receipt) | `dragonshare_boost_receipt` | **NEW** |
| Pass / decline (`decline_dragonshare_post`) | Creator (gentle) | `dragonshare_declined` | exists (in-app only) |

## 4. Notification types & category

- **`src/types/notifications.ts`**
  - Extend `NotificationType` with `dragonshare_submission`,
    `dragonshare_boost_receipt` (existing `dragonshare_boost`,
    `dragonshare_declined` retained).
  - Extend `NotificationCategory` union with `'dragonshare'`.
  - Add `CATEGORY_META.dragonshare = { label: 'DragonShare', icon: '🐉',
    description: 'Submissions, boosts, and payouts' }`.
  - Add `DEFAULT_PREFERENCES_MATRIX.dragonshare = { in_app: true, email: true,
    sms: false }`.
  - Add the four DragonShare types to `NOTIFICATION_TYPE_TO_EMAIL_TYPE`.
- **`supabase/functions/create-notification/index.ts`** — add the same four
  entries to its local `NOTIFICATION_TYPE_TO_EMAIL_TYPE` map, and ensure the
  `dragonshare` category resolves to the default `{ email: true }` when a user's
  stored matrix has no `dragonshare` key (fall back to `DEFAULT_PREFERENCES_MATRIX`).
- Migration: backfill is **not** required — existing creator notifications stay
  in the `content` category; only new notifications use `dragonshare`. The
  notification-preferences settings UI gains one row automatically from
  `CATEGORY_META`.

## 5. Delivery mechanism

One new **service-role edge function `dragonshare-notify`** owns all DragonShare
fanout. For a given `{ event, post_id, boost_id? }` it resolves recipients +
names, calls `create-notification` (server-to-server, service bearer) for each
recipient (bell + email + preference-aware), inserts `donny_nudges` rows
**directly** (service-role; explicit `actions`; existing-valid `type`), and — for
new submissions only — writes the proactive Donny chat message. No `pg_net`, no
GUCs, no `donny-nudge-frame`. All fanout is best-effort and never blocks the
caller's primary action.

`create-notification` is already callable both from the frontend (user JWT —
campaigns do this) and server-to-server (service bearer via its `isService`
path); `dragonshare-notify` uses the latter.

### Invocation points (each event fires once, at its natural origin)

1. **New submission → restaurant.** `useSubmitDragonSharePost` `onSuccess`
   invokes `dragonshare-notify({ event:'submission', post_id })` (creator's JWT).
   The function:
   - Resolves the restaurant **owner** (`org_members`, `role = 'owner'`,
     `invitation_status = 'active'`; owner-only is intended for the bell +
     email + chat-message recipient — admins are not separately notified),
     creator name (`profiles.full_name`), and clean business name (coalesce
     `business_profiles.business_name`, like `resolve_dragonshare_orgs`).
   - `create-notification` → owner: `dragonshare_submission`, category
     `dragonshare`, actionUrl `/dashboard/business/dragonshare?highlight=<post_id>`,
     icon `star`, data `{ post_id, creator_name, content_type }`.
   - Inserts a `donny_nudges` row for the owner (`type:'content'`, `source_table:
     'dragonshare_posts'`, `source_id:post_id`, explicit `actions`: Review & boost
     / Later — `onConflict (user_id, source_table, source_id)` ignore-dup).
   - **Proactive Donny chat message (this event only):** find-or-create the
     owner's `donny_conversations` thread, insert a `donny_messages` row
     (`role:'assistant'`, names the creator + content type, `quick_actions:
     [{label:'Review & boost', action:'navigate', url:'/dashboard/business/
     dragonshare?highlight=<post_id>'},{label:'Later', action:'dismiss'}]`), bump
     `last_message_at`.

2. **Boost paid → creator + restaurant.** Invoked **inside
   `supabase/functions/_shared/fulfill-boost.ts`, on the `alreadyDone === false`
   branch** (the same place the existing `fire-dragonshare-social-hook` call is
   made, fire-and-forget). `fulfillBoost` is the sole writer of
   `status = 'transferred'` and is idempotent (early-returns when already done),
   so invoking there covers both callers (`boost-payment` and `stripe-webhook`)
   exactly once — do **not** wire it at the two call sites. Pass the values
   `fulfillBoost` already has — `{ event:'boost_paid', boost_id, post_id,
   creator_id, creator_payout_cents }` — so `dragonshare-notify` needn't
   re-resolve them:
   - `create-notification` → creator: `dragonshare_boost` (payout), category
     `dragonshare`, actionUrl `/dashboard/creator/dragonshare?highlight=<post_id>`,
     icon `dollar`.
   - `create-notification` → restaurant owner: `dragonshare_boost_receipt`
     (drafted for posting), category `dragonshare`, actionUrl
     `/dashboard/business/dragonshare`.
   - A `donny_nudges` row for each (`type:'payment'` creator, `type:'content'`
     restaurant; explicit actions). No chat message.
   - `trg_ds_boost_accepted_fn` is reduced to its `dragonshare_events` insert
     (its raw `push_notifications` insert is **removed** to avoid a double bell).

3. **Decline → creator.** `useDeclineDragonSharePost` `onSuccess` invokes
   `dragonshare-notify({ event:'declined', post_id })`:
   - `create-notification` → creator: `dragonshare_declined`, gentle copy,
     category `dragonshare`. Plus a `donny_nudges` row (`type:'content'`).
   - `decline_dragonshare_post` keeps its membership guard, in-progress-boost
     guard, `declined_at` update, and `dragonshare_events` insert; its raw
     `push_notifications` insert is **removed**.

### Why this shape

- **Mirrors the campaign path that actually works** (application-layer invocation
  of `create-notification`), not the broken trigger path.
- **Single source of truth** for bell + email + prefs (`create-notification`); no
  double-notify; no `pg_net`/GUC dependency.
- **Sidesteps all three nudge pitfalls:** direct `donny_nudges` inserts use
  existing-valid `type` values (`content`/`payment`, satisfying the table CHECK)
  with `actions` set explicitly in the row, so we never rely on
  `donny-nudge-frame`'s token-derived recipient or its hardcoded
  `getActionsForType`. **No CHECK-constraint migration is required.**
- **Regression guard:** removing the raw push inserts changes a just-verified
  path, so re-verifying the creator boost + decline bell after the change is a
  mandatory step (§11). The bell row still lands via `create-notification`; only
  its category changes (`content` → `dragonshare`), which the bell renders
  regardless of preferences.

## 6. Email templates

Add four inline HTML templates to `send-notification-email/index.ts`, matching the
existing brand styling (teal/pink gradient header, single CTA button):

- `dragonshare_submission` → restaurant: "{creator} shared a post about you",
  content type, **Review & boost** CTA → business DragonShare page.
- `dragonshare_boost` → creator: "Your post got boosted 🎉", payout amount,
  **See it live** CTA → creator DragonShare page.
- `dragonshare_boost_receipt` → restaurant: "Your boost is live", "drafted for
  one-tap posting", CTA → Social/DragonShare page.
- `dragonshare_declined` → creator: encouraging copy, **Share more** CTA.

Wire each `emailType` into the templates record and the supported-types list.

## 7. Routing

Add explicit cases to `src/lib/getNotificationRoute.ts` so clicks deep-link
correctly even if `action_url` is absent:

- `dragonshare_submission`, `dragonshare_boost_receipt` →
  `/dashboard/business/dragonshare` (+ `?highlight=<post_id>` when present).
- `dragonshare_boost`, `dragonshare_declined` →
  `/dashboard/creator/dragonshare` (+ `?highlight=<post_id>`).

## 8. Dashboard — fold into existing feeds

- **Creator:** extend `useCreatorRecentActivity` to merge DragonShare events
  (boost paid, declined; optionally submitted) into the chronological feed,
  sourced from `dragonshare_events` (with `dragonshare_posts`/`boosts` joins for
  labels). New `ActivityItem` variant `type: 'dragonshare'` with a brand icon and
  link to the creator DragonShare page.
- **Business:** add DragonShare items (new submissions awaiting decision, recent
  boosts made) into the business dashboard activity, rendered via the existing
  `ActivityFeedCard`. Source from `dragonshare_events` scoped to the active org.

## 9. Dashboard — dedicated DragonShare card

- New component `src/components/dragonshare/DragonShareActivityCard.tsx` plus
  hooks `useCreatorDragonShareActivity` / `useBusinessDragonShareActivity`
  (React Query, keys `['dragonshare-activity','creator'|'business', id]`,
  `enabled: !!id`), sourced from `dragonshare_events` (RLS-scoped).
  - **Creator card:** recent submissions, boosts (+$payout), and "not selected"
    rows with status pills + links.
  - **Business card:** "awaiting your decision" count + list, and recent boosts
    made.
  - **Brand role** reuses the business card (shared component), consistent with
    the existing `BusinessDragonShare` / brand split.
- Placed on `CreatorDashboard.tsx` and `BusinessDashboard.tsx` near the existing
  `DragonShareStatTile`. Desktop uses `lg:`/`xl:` layout classes; mobile uses base
  classes — never cross-applied. Loading + error + empty states required.

## 10. Error handling

- `dragonshare-notify` is best-effort and isolated from the caller's primary
  action: the submit mutation, the boost transfer, and the decline RPC all
  **succeed regardless** of whether the notify invocation succeeds (invoke
  without `await`-blocking the user flow, or catch + ignore). A notify failure
  never rolls back a submission, a boost transfer, or a decline.
- Inside `dragonshare-notify`, each recipient's `create-notification` call and
  each `donny_nudges`/`donny_messages` insert is wrapped independently so one
  failure doesn't abort the others. `create-notification` already swallows email
  failures (the bell row still lands).
- The dedicated card and feed hooks must handle loading/error/empty without
  breaking the dashboard (follow the widget-level `ErrorBoundary` pattern where
  applicable).
- The notification-preferences matrix may lack a `dragonshare` key for existing
  users — both the edge function and the settings UI must fall back to
  `DEFAULT_PREFERENCES_MATRIX` (email on).

## 11. Testing & verification

- **Unit tests (Vitest, co-located):**
  - `getNotificationRoute` cases for all four DragonShare types (with/without
    `post_id`).
  - The activity merge/derive helper(s) feeding the feeds and the dedicated card
    (pure functions: shape `dragonshare_events` rows → `ActivityItem`s, ordering,
    labels).
- **Backend:** apply migrations via Supabase MCP **and** commit them as files;
  deploy the new `dragonshare-notify` function and redeploy `create-notification`
  + `send-notification-email`, preserving each function's `verify_jwt` flag.
  Smoke-test each `dragonshare-notify` event path.
- **Regression re-verify (mandatory):** removing the raw push inserts from
  `trg_ds_boost_accepted_fn` / `decline_dragonshare_post` touches a just-verified
  path — confirm the creator still gets the boost-paid bell and the decline bell
  after the change (use the test accounts).
- **Production verification** (per project workflow, after Lovable deploy; poll
  bundle hash first):
  - Creator (`damewillie@gmail.com`) submits a post to Harbormill → restaurant
    (`dwilliams@harbormill.net`) bell shows "new submission", email arrives,
    Donny chat message + nudge appear.
  - Real test boost → creator bell/email/payout + restaurant receipt.
  - Decline → creator gentle notification.
  - Both dashboards: DragonShare items in the activity feed **and** the dedicated
    card render with correct data.
  - **Desktop and mobile** viewports separately; Chrome DevTools console clean on
    both roles.
- Don't advance past a task until it's 95% complete, correct, and passing.

## 12. Out of scope (YAGNI)

- SMS delivery (channel exists in the matrix but no provider wired — leave off).
- Donny chat messages for boost/receipt/decline (nudges only, per decision 5).
- Backfilling historical DragonShare events into notifications.
- Re-categorizing existing `content` DragonShare notifications.

### Discovered issue (out of scope, flag to stakeholder)

The campaign Donny-nudge trigger path (`notify_donny_nudge()` →
`donny-nudge-frame` via `pg_net`) is **not firing in production** because
`app.settings.supabase_url` / `app.settings.service_role_key` are unset (§2.1).
Fixing it (set the GUCs out-of-band and patch `donny-nudge-frame` to honor a
body `user_id` on service-role calls) is a separate campaign-side concern and is
**not** required for this DragonShare work — DragonShare deliberately avoids that
path. Recommend tracking it as its own ticket.

## 13. Files touched (summary)

- **Types/FE:** `src/types/notifications.ts`, `src/lib/getNotificationRoute.ts`,
  `src/hooks/useCreatorRecentActivity.ts`, `src/hooks/useBusinessActiveCampaigns.ts`
  (or a new business-activity merge), new `useCreatorDragonShareActivity.ts` /
  `useBusinessDragonShareActivity.ts`, new
  `src/components/dragonshare/DragonShareActivityCard.tsx`,
  `src/pages/CreatorDashboard.tsx`, `src/pages/BusinessDashboard.tsx`.
- **Edge functions:** **new** `dragonshare-notify/index.ts` (the fanout: resolves
  recipients, calls `create-notification`, inserts `donny_nudges`, and writes the
  submission chat message); `create-notification/index.ts` (add the 4 DragonShare
  entries to its type→email map + `dragonshare` category default);
  `send-notification-email/index.ts` (4 templates). `donny-nudge-frame` is **not**
  used or modified by this work.
- **Invocation wiring:** `src/hooks/useDragonShare.ts`
  (`useSubmitDragonSharePost` `onSuccess`) and `src/hooks/useDeclineDragonSharePost.ts`
  (`onSuccess`) invoke `dragonshare-notify`; **`supabase/functions/_shared/fulfill-boost.ts`**
  invokes it on the `alreadyDone === false` branch (alongside the existing
  `fire-dragonshare-social-hook` call).
- **Migrations:** edits to `trg_ds_boost_accepted_fn` and
  `decline_dragonshare_post` to **remove** their raw `push_notifications` inserts
  (keep state changes + `dragonshare_events` logging). No new triggers; no
  `donny_nudges` CHECK-constraint change.
