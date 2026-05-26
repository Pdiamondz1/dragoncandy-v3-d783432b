# DragonCandy Notification System Design

> Full notification system for all three user roles (Restaurant, Creator, Brand)
> with in-app notifications, email, and SMS (future). Includes real-time page
> refresh so users never miss critical platform events.

## Context

DragonCandy currently has a partial notification system: a bell dropdown showing
the last 10 notifications stored in localStorage, toast alerts via Sonner, and
transactional emails via Resend. Key gaps: notifications are lost on browser
clear, critical tables lack Supabase Realtime (restaurants wait up to 60 seconds
to see new applications), there's no dedicated notification center page, and
CGC/team/social events produce no notifications. Users are missing important
platform events.

This design replaces the localStorage-based system with server-side persistence,
adds a full notification center page, enables Realtime on key transaction tables,
expands notification coverage to 38 event types across 5 categories, and
redesigns the preference system as a per-category per-channel matrix.

## Architecture: Edge Function Hub

All notification creation flows through a single `create-notification` edge
function. Event sources (mutations, webhooks, cron jobs) call this function
with a standard payload. It handles persistence, preference checking, and
delivery routing.

```
Event Source → create-notification edge function
                ├─ INSERT into push_notifications (always)
                ├─ Check preferences_matrix for user
                ├─ IF in_app enabled → Realtime broadcasts to client
                ├─ IF email enabled → call send-notification-email (existing)
                └─ IF sms enabled → call SMS provider (future, Twilio)
```

The client subscribes to `push_notifications` via Supabase Realtime filtered by
`user_id`. A separate `useRealtimeRefresh` hook subscribes to business tables
(campaign_applications, campaign_collaborations, campaign_sponsorships) and
invalidates React Query caches when changes arrive, causing dashboard components
to auto-refresh with a pulse animation on changed items.

### Why Edge Function Hub over DB Triggers

Database triggers can't call external APIs (email, SMS). An edge function
centralizes notification logic, makes preference checks server-side (can't be
bypassed), and provides a single integration point for adding SMS later. The
tradeoff is ~50ms latency per notification creation and a function call at each
event site, but this is acceptable for the reliability and maintainability gains.

## Database Schema Changes

### push_notifications — Add columns

Existing columns kept as-is (id, user_id, title, body, data, sent_at, read_at,
created_at). Add:

| Column | Type | Purpose |
|--------|------|---------|
| `type` | TEXT DEFAULT 'legacy' | Event type key (e.g. `application_received`). Nullable per project rules; edge function always populates. |
| `category` | TEXT DEFAULT 'legacy' | Category for filtering (campaigns, messages, transactions, content, account). Nullable per project rules. |
| `action_url` | TEXT | Deep link path (e.g. `/dashboard/business/campaigns/{id}`) |
| `actor_id` | UUID REFERENCES profiles(id) | Who triggered the notification |
| `actor_name` | TEXT | Cached display name — point-in-time snapshot; name changes do not retroactively update past notifications |
| `icon` | TEXT DEFAULT 'default' | Icon key for frontend rendering |

Add indexes:

```sql
CREATE INDEX idx_push_notif_user_unread
  ON push_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_push_notif_user_category
  ON push_notifications(user_id, category, created_at DESC);
```

Enable Realtime publication on this table.

### push_notifications — RLS policies

- `SELECT`: `auth.uid() = user_id` — users see only their own notifications
- `UPDATE`: `auth.uid() = user_id` — users can mark their own as read
- `INSERT`: service role only — notifications created exclusively by edge functions

### notification_preferences — Add preferences_matrix

Keep existing boolean columns for backward compatibility. Add:

```sql
preferences_matrix JSONB DEFAULT '{
  "campaigns":    { "in_app": true,  "email": true,  "sms": false },
  "messages":     { "in_app": true,  "email": false, "sms": false },
  "transactions": { "in_app": true,  "email": true,  "sms": false },
  "content":      { "in_app": true,  "email": false, "sms": false },
  "account":      { "in_app": true,  "email": true,  "sms": false }
}'::jsonb
```

New code reads `preferences_matrix`; old boolean columns ignored but preserved.

### Supabase Realtime — Enable on 4 tables

Currently enabled: messages, donny_messages, donny_nudges, campaign_invitations,
application_counter_offers.

Add to publication:
- `push_notifications` — for notification delivery to clients
- `campaign_applications` — for real-time dashboard refresh
- `campaign_collaborations` — for collaboration status updates
- `campaign_sponsorships` — for sponsorship event updates

## Notification Categories (5)

| Category | Icon | Types | Description |
|----------|------|-------|-------------|
| Campaigns | 📋 | 11 | Applications, invitations, status changes, CGC promotions |
| Messages | 💬 | 1 | New direct messages (secondary alert) |
| Transactions | 💰 | 7 | Sponsorships, payments, counter-offers, project completion |
| Content | ❤️ | 8 | Likes, approvals, file uploads, social posting, DragonShare |
| Account | 🏢 | 11 | Team members, locations/products, settings, account deletion |

## Notification Types (38 total)

### Campaigns (11)

| Type | Recipient | Title | Body template |
|------|-----------|-------|---------------|
| `application_received` | Restaurant/Brand | New Application | {actor} applied to your "{campaign}" campaign |
| `application_accepted` | Creator | Application Accepted | Your application to "{campaign}" was accepted! |
| `application_rejected` | Creator | Application Update | Your application to "{campaign}" was not selected |
| `campaign_invitation` | Creator | Campaign Invitation | {actor} invited you to join "{campaign}" |
| `invitation_declined` | Restaurant/Brand | Invitation Declined | {actor} declined your invitation to "{campaign}" |
| `campaign_published` | All Creators | New Campaign | "{campaign}" is now live — check it out! |
| `revision_requested` | Creator | Revision Requested | {actor} requested revisions on "{campaign}" |
| `cgc_submission_received` | Restaurant | New CGC Submission | {customer_name} submitted a video for "{promotion_title}" |
| `cgc_code_redeemed` | Restaurant | Discount Code Redeemed | Code {code} was redeemed for "{promotion_title}" |
| `cgc_promotion_expired` | Restaurant | Promotion Expired | Your "{promotion_title}" promotion has ended — {total_submissions} submissions |
| `cgc_max_redemptions_reached` | Restaurant | Promotion Fully Redeemed | "{promotion_title}" hit its max redemptions |

### Messages (1)

| Type | Recipient | Title | Body template |
|------|-----------|-------|---------------|
| `message_received` | Recipient | New Message | {actor}: "{preview}..." |

### Transactions (7)

| Type | Recipient | Title | Body template |
|------|-----------|-------|---------------|
| `sponsorship_proposal` | Restaurant | Sponsorship Proposal | {actor} proposed a ${amount} sponsorship for "{campaign}" |
| `sponsorship_accepted` | Brand | Sponsorship Accepted | Your sponsorship for "{campaign}" was accepted! |
| `sponsorship_rejected` | Brand | Sponsorship Update | Your sponsorship for "{campaign}" was not accepted |
| `counter_offer_received` | Creator or Restaurant | Counter Offer | {actor} sent a counter offer of ${amount} for "{campaign}" |
| `counter_offer_responded` | Creator or Restaurant | Counter Offer {status} | {actor} {accepted/declined} your counter offer |
| `payment_received` | Creator | Payment Received | ${amount} received for "{campaign}" collaboration |
| `project_completed` | Creator + Restaurant | Project Completed | "{campaign}" collaboration has been completed! |

### Content (8)

| Type | Recipient | Title | Body template |
|------|-----------|-------|---------------|
| `content_liked` | Creator | Content Liked | {actor} liked your content on DragonShare |
| `content_approved` | Creator | Content Approved | Your content for "{campaign}" was approved! |
| `file_uploaded` | Restaurant or Creator | New File Uploaded | {actor} uploaded {count} file(s) for "{campaign}" |
| `dragonshare_boost` | Creator | Content Boosted | Your content was boosted on DragonShare! |
| `social_post_published` | Post author | Post Published | Your {platform} post for "{campaign}" is live! |
| `social_post_failed` | Post author | Post Failed | Your scheduled {platform} post failed to publish |
| `social_draft_ready` | Post author | Draft Ready to Post | Donny created a draft for "{campaign}" — review and schedule it |
| `triple_post_completed` | Restaurant + Creator + Brand | All Parties Posted | Everyone has posted for "{campaign}" — great teamwork! |

### Account (11)

| Type | Recipient | Title | Body template |
|------|-----------|-------|---------------|
| `member_joined` | Owner + Admins | New Team Member | {member_name} joined your team as {role} |
| `member_removed` | Removed member | Removed from Team | You were removed from {org_name} |
| `member_role_changed` | Affected member | Role Updated | Your role in {org_name} was changed to {new_role} |
| `unit_created` | All org members | New {Location/Product} | "{unit_name}" was added to {org_name} |
| `unit_deleted` | All org members | {Location/Product} Removed | "{unit_name}" was removed from {org_name} |
| `profile_updated` | Other org members | Profile Updated | {actor} updated the profile for {org_name} |
| `social_account_connected` | Other org members | Social Account Connected | {actor} connected {platform} to {org_name} |
| `social_account_disconnected` | Other org members | Social Account Disconnected | {actor} disconnected {platform} from {org_name} |
| `account_deletion_requested` | Owner + all members | Account Deletion Scheduled | {org_name} is scheduled for deletion on {purge_date} |
| `account_restored` | Owner + all members | Account Restored | {org_name} has been restored. Deletion cancelled. |
| `account_purge_warning` | Owner | Deletion in 7 Days | {org_name} will be permanently deleted on {purge_date} |

Account deletion notifications (last 3) always send regardless of preferences.

## Frontend Components

### Notification Center Page (`/notifications`)

Dedicated page accessible via "See all notifications →" from the bell dropdown.
Same route for all roles; content filtered by `user_id` server-side via RLS.

- **Header**: "Notifications" title + "Mark all as read" + Settings gear link (desktop)
- **Category tabs**: All, Campaigns, Messages, Transactions, Content, Account — pill-shaped, horizontally scrollable on mobile, with unread count badges per category
- **Notification list**: Chronological, paginated (load more on scroll). Each item has icon circle (color-coded by category), title, body preview, timestamp, teal unread dot. Clicking navigates to `action_url` and marks as read.
- **Empty state**: "You're all caught up!" with illustration
- **Mobile background**: `dc-gray` (#A8A8A0) per design system
- **Desktop**: White card container with rounded corners and subtle shadow

### Bell Dropdown (Redesigned)

Replaces current `NotificationDropdown.tsx`:

- Shows **5 most recent** notifications (reduced from 10 — it's a quick-peek)
- **"See all notifications →"** footer links to `/notifications`
- **No auto-mark-as-read on open** — user must click "Mark all read" or individual items
- Teal unread dot, teal-tinted background for unread items
- Icon circles match notification center styling
- Red badge on bell icon with unread count (caps at 99+)

### Notification Preferences Section (Redesigned)

Replaces current `NotificationPreferencesSection.tsx`:

- **5×3 matrix**: rows = categories, columns = In-App / Email / SMS
- SMS column disabled with "Coming soon" label — visible but not interactive
- Teal toggle color when ON
- Sub-descriptions under each category explaining what's included
- Same component on all settings pages (restaurant, creator, brand)
- Defaults: In-App all ON, Email ON for Campaigns + Transactions + Account, OFF for Messages + Content

## Client-Side Hooks

### useNotifications (Refactored)

Current: subscribes to 8+ tables via Realtime, stores in localStorage.
New: subscribes only to `push_notifications` filtered by `user_id`.

- On Realtime INSERT → add to React Query cache → show toast (if in_app enabled)
- On Realtime UPDATE (read_at set) → update cache
- Fetches notification history via standard Supabase query with pagination
- Bell badge count = server-side count of `read_at IS NULL`
- localStorage removed as source of truth

### useRealtimeRefresh (New)

Separate hook for dashboard auto-refresh. Subscribes to:
- `campaign_applications` (INSERT/UPDATE)
- `campaign_collaborations` (INSERT/UPDATE)
- `campaign_sponsorships` (INSERT/UPDATE)

On change → invalidate related React Query caches → components auto-refetch →
pulse animation on changed items via a `freshIds` state set.

These subscriptions receive all inserts/updates permitted by RLS. The callback
logic determines relevance (e.g., filtering to campaigns owned by the current
user) before invalidating caches.

### useNotificationPreferences (Updated)

Reads/writes `preferences_matrix` JSONB column instead of individual booleans.
Returns typed matrix object for the preferences UI.

## Edge Function: create-notification

```typescript
interface CreateNotificationRequest {
  recipientId: string;
  type: string;        // e.g. 'application_received'
  category: string;    // 'campaigns' | 'messages' | 'transactions' | 'content' | 'account'
  title: string;
  body: string;
  actionUrl?: string;
  actorId?: string;
  actorName?: string;
  icon?: string;
  data?: Record<string, unknown>;  // extra metadata
  forceDelivery?: boolean;         // bypass preferences (deletion warnings)
}
```

Flow:
1. INSERT into `push_notifications` with all fields (always — regardless of `in_app` preference, so notification history is always available in the notification center)
2. SELECT `preferences_matrix` from `notification_preferences` for recipientId
3. If `forceDelivery` or `preferences_matrix[category].email` → call `send-notification-email` (maps notification `type` to existing email template keys via a translation layer, e.g. `application_received` → `new_application`)
4. If `forceDelivery` or `preferences_matrix[category].sms` → call SMS provider (future)
5. Return notification record

The `in_app` preference is enforced client-side only: the `push_notifications`
row is always created, but the client checks `preferences_matrix[category].in_app`
before showing a toast. This ensures the notification center always has a
complete history.

Auth: requires service-role key or valid user JWT. Service-role callers can
notify any user. JWT callers restricted to notifying themselves only.

## Real-Time Update UX

When new data arrives via Realtime:
1. **Toast notification** — "New application received!" with brief description
2. **Bell badge increments** — red count updates instantly
3. **Dashboard auto-refresh** — React Query cache invalidated, component refetches
4. **Pulse animation** — changed card/row gets a brief teal pulse highlight (Framer Motion, 1.5s duration) so the user sees what changed

Latency: ~1-2 seconds from event to visible update (Supabase Realtime).

## SMS (Designed, Not Implemented)

The preferences matrix includes `sms: false` for all categories. The SMS column
appears in the preferences UI with "Coming soon" labels. The `create-notification`
edge function has a placeholder branch for SMS delivery. When Twilio is
integrated, flip the SMS toggles to interactive and implement the delivery call.

No phone number collection or verification UI is included in this build.

## Migration Strategy

The notification system can be built incrementally:
1. Schema migration (add columns, enable Realtime)
2. `create-notification` edge function
3. `useRealtimeRefresh` hook + Realtime subscriptions
4. Refactor `useNotifications` to read from `push_notifications` table
5. Notification center page + redesigned bell dropdown
6. Redesigned notification preferences section
7. Wire up event sources to call `create-notification`
8. Remove localStorage notification storage

Existing email notification calls (`useEmailNotifications`) continue working
during migration. Once all event sources call `create-notification`, the direct
email calls can be removed from individual hooks.

Broadcast notifications (`campaign_published`) call `create-notification` per
recipient in a loop. At ~30 users this is fine. If creator count grows past
1,000, consider a batch insert variant.

### Retention

Notifications older than 90 days can be auto-deleted via a scheduled function
(future work). Not included in this build — at ~30 users and 38 types, volume
is negligible for the first year.

## Verification Plan

1. **Unit tests**: `create-notification` edge function with preference checking logic
2. **Integration test**: create application → verify notification appears in `push_notifications` table → verify Realtime delivers to subscribed client
3. **Manual testing per role**:
   - Restaurant: create campaign, receive application notification in real-time
   - Creator: apply to campaign, receive acceptance notification
   - Brand: propose sponsorship, receive response notification
4. **Cross-device**: log in on two browsers, verify notification appears on both
5. **Preference enforcement**: disable email for Campaigns, verify no email sent on application
6. **Production verification**: deploy to Lovable.dev, log in with test accounts, verify bell badge, notification center page, and email delivery at dragoncandy.io
7. **Desktop + Mobile**: verify notification page layout, bell dropdown, and preferences section on both viewports
