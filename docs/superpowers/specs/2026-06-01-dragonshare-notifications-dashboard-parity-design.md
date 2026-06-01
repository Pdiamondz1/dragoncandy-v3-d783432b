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
- **Donny nudges:** `notify_donny_nudge()` (migration
  `20260411000001_donny_nudge_triggers.sql`) is an `AFTER INSERT` trigger that
  calls the `donny-nudge-frame` edge function via `pg_net`
  (`extensions.http_post`, using `app.settings.supabase_url` +
  `app.settings.service_role_key`). `donny-nudge-frame` upserts a `donny_nudges`
  row (unique on `user_id, source_table, source_id`).
- **Donny proactive chat message:** for the highest-value moment only (campaign
  invitation, `send-campaign-invitation/index.ts`), the edge function also writes
  a `donny_messages` row (`role: 'assistant'`, `quick_actions: [...]`) into the
  user's `donny_conversations` thread.
- **Dashboards:** a `Recent Activity` feed on the creator dashboard
  (`useCreatorRecentActivity`) and an `Active Campaigns` feed on the business
  dashboard (`useBusinessActiveCampaigns`), each rendered with `ActivityFeedCard`.

`pg_net`, `http`, and `pg_cron` are all enabled on the project, so the
trigger → edge-function pattern is available.

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

A new SQL trigger function **`notify_dragonshare()`** (sibling to
`notify_donny_nudge()`), `SECURITY DEFINER`, reads `app.settings.supabase_url` +
`app.settings.service_role_key`, and uses `extensions.http_post` (`pg_net`) to
fan out per event. All HTTP calls are fire-and-forget and wrapped so a failure
**never** affects post state or money transfer.

### Per-event flow

1. **New submission — `AFTER INSERT ON dragonshare_posts`:**
   - Resolve restaurant owner: `org_members` where `org_id = NEW.target_org_id`,
     `role = 'owner'`, `invitation_status = 'active'` (the established resolver
     pattern). If none, return.
   - Resolve creator name (`profiles.full_name`) and clean business name
     (coalesce `business_profiles.business_name`, mirroring
     `resolve_dragonshare_orgs`).
   - `POST create-notification` → `{ recipientId: owner, type:
     'dragonshare_submission', category: 'dragonshare', title, body, actionUrl:
     '/dashboard/business/dragonshare?highlight=<post_id>', icon: 'star', data:
     { post_id, creator_name, content_type } }`.
   - `POST donny-nudge-frame` → nudge (`type: 'content'`, `source_table:
     'dragonshare_posts'`, `source_id: post_id`, actions: Review / Boost).
   - **Proactive Donny chat message:** find-or-create the owner's
     `donny_conversations` thread and insert a `donny_messages` row
     (`role: 'assistant'`, content names the creator + content type,
     `quick_actions: [{label:'Review & boost', action:'navigate', url:
     '/dashboard/business/dragonshare?highlight=<post_id>'}, {label:'Later',
     action:'dismiss'}]`), then bump `last_message_at`. This is the **only**
     event that writes a chat message.

2. **Boost paid — boost `status → transferred`:**
   - This currently fires `trg_ds_boost_accepted_fn`. That function keeps its
     `dragonshare_events` insert and the clean-business-name lookup, but its raw
     `push_notifications` insert is **removed**; instead it `POST`s
     `create-notification` twice:
     - Creator: `dragonshare_boost` (payout), category `dragonshare`, actionUrl
       `/dashboard/creator/dragonshare?highlight=<post_id>`, icon `dollar`.
     - Restaurant owner: `dragonshare_boost_receipt` (drafted for posting),
       category `dragonshare`, actionUrl `/dashboard/business/dragonshare`.
   - Each recipient also gets a `donny-nudge-frame` nudge (no chat message).

3. **Decline — `decline_dragonshare_post(p_post_id)`:**
   - Keeps its membership guard, the in-progress-boost guard, `declined_at`
     update, and `dragonshare_events` insert. Its raw `push_notifications` insert
     is **removed**; instead it `POST`s `create-notification` (creator,
     `dragonshare_declined`, gentle copy, category `dragonshare`) and a nudge.

### Why centralize on `create-notification`

Single source of truth for bell + email + preference-respecting delivery; no
double-notify; identical-or-better in-app behavior than today, plus email + Donny.
State transitions stay transactional in SQL; only the *notification* leaves the
transaction (best-effort, matching the existing `BEGIN..EXCEPTION` philosophy and
campaigns' best-effort frontend calls).

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

- Every `pg_net` call in `notify_dragonshare()` is fire-and-forget; the trigger
  returns `NEW` regardless. A notification/email/Donny failure must never roll
  back a submission insert, a boost transfer, or a decline.
- `create-notification` already swallows email failures (the bell row still
  lands). The dedicated card and feed hooks must handle loading/error/empty
  without breaking the dashboard (follow the widget-level `ErrorBoundary`
  pattern where applicable).
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
  redeploy `create-notification`, `send-notification-email`, and
  `donny-nudge-frame` if changed, preserving each function's `verify_jwt` flag.
  Smoke-test `notify_dragonshare()` paths in SQL.
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

## 13. Files touched (summary)

- **Types/FE:** `src/types/notifications.ts`, `src/lib/getNotificationRoute.ts`,
  `src/hooks/useCreatorRecentActivity.ts`, `src/hooks/useBusinessActiveCampaigns.ts`
  (or a new business-activity merge), new `useCreatorDragonShareActivity.ts` /
  `useBusinessDragonShareActivity.ts`, new
  `src/components/dragonshare/DragonShareActivityCard.tsx`,
  `src/pages/CreatorDashboard.tsx`, `src/pages/BusinessDashboard.tsx`.
- **Edge functions:** `create-notification/index.ts` (type map),
  `send-notification-email/index.ts` (4 templates). `donny-nudge-frame` reused
  as-is if it already accepts arbitrary `type/source_table`.
- **Migrations:** new `notify_dragonshare()` + triggers; edits to
  `trg_ds_boost_accepted_fn` and `decline_dragonshare_post` to drop raw push
  inserts and POST `create-notification` instead.
