# Campaign Invitations, Shared Context & Notifications

**Date:** 2026-04-26
**Status:** Design approved
**Scope:** Campaign invitation flow (3 entry points), shared campaign context in messaging, notification bell for invitations

---

## Problem

Three interconnected systems are broken or missing:

1. **Campaign invitations don't work.** Donny's `invite_creator` tool inserts a record into `campaign_invitations` but creators are never notified — no email, no in-app alert, no Donny message. The invitation silently disappears into the database.

2. **No shared campaign context in messaging.** DonnyProvider doesn't pass campaign-specific data to the edge function, so Donny can't reference the campaign the user is viewing. Campaign-linked conversations exist in the schema (`conversations.campaign_id`) but no UI surfaces the campaign context in chat.

3. **Notifications don't cover invitations.** The bell icon and `useNotifications` hook work via localStorage with realtime subscriptions for applications, sponsorships, and likes — but not invitations. Creators have no way to discover they've been invited.

## Solution

### 1. Edge Function Hub: `send-campaign-invitation`

A new Supabase edge function that serves as the single code path for all invitation entry points. All three UIs call this one function.

**Request payload:**
- `campaign_id` — which campaign
- `creator_id` — who to invite
- `invited_by` — the business user sending the invitation
- `invitation_message` — optional personal note

**What it does (in order):**
1. **Validates** — checks campaign exists and is published, creator exists, no duplicate pending invitation for this campaign+creator pair
2. **Inserts** into `campaign_invitations` table (status: `pending`)
3. **Sends email** — calls `send-notification-email` edge function with a new `campaign_invitation` template (must be added to the `NotificationType` union and `templates` record in `send-notification-email/index.ts`). Template data fields: `campaign_title`, `business_name`, `invitation_message`, `campaign_detail_url`.
4. **Creates Donny message** — looks up the creator's Donny conversation via `SELECT id FROM donny_conversations WHERE user_id = creator_id ORDER BY last_message_at DESC LIMIT 1`. If no conversation exists, creates one first (`INSERT INTO donny_conversations (user_id)`). Inserts a message summarizing the campaign (deliverables, budget, deadline) with the business's personal note if provided. Includes a link to the campaign detail page.
5. **Returns** the created invitation record (or existing record with `already_invited: true` flag for duplicates)

**Error handling:**
- Duplicate pending invitation → returns existing invitation with `already_invited: true`
- Campaign not published → 400 error
- Creator doesn't exist → 400 error
- Inviter doesn't own the campaign → 403 error
- `creator_id === invited_by` (self-invite) → 400 error

**Who calls it:**
- Donny's `invite_creator` tool (replaces current raw insert)
- Campaign detail page "Invite" button (AI Match tab)
- Creator profile "Invite to Campaign" modal

### 2. Campaign Context

Two sub-features that solve different sides of the same problem — AI context and human context.

#### 2A. DonnyProvider Page Context

When the user navigates to a campaign detail page (`/dashboard/business/campaigns/:id`), the DonnyProvider:
- Extracts the campaign ID from the URL
- Fetches basic campaign data (title, status, creator count, budget range)
- Stores this as `campaignContext` state in the provider
- Clears the context when the user navigates away from a campaign page

**Changes required across the context-passing chain:**

1. **`DonnyProvider` (`src/contexts/DonnyProvider.tsx`)** — add `campaignContext` state, extract campaign ID from `location.pathname` via regex, fetch campaign data with React Query, expose via context
2. **`useDonny` hook (`src/hooks/useDonny.ts`)** — read `campaignContext` from the provider and include it in the `supabase.functions.invoke('donny-chat', { body: { ... campaign_context } })` call (currently the body only passes `conversation_id` and `message`)
3. **`donny-chat` edge function** — read `campaign_context` from the request body, include campaign details in `buildSystemPrompt` (alongside the existing `page_url` context), and make `invite_creator` tool read `campaign_id` from this context when the user doesn't specify one

This lets Donny reference the campaign naturally ("I see you're looking at your Steak Night campaign") and auto-fill `campaign_id` for tools like `invite_creator` without requiring the user to specify which campaign.

#### 2B. Conversation Campaign Header

When a conversation has a `campaign_id` set (column already exists in `conversations` table):
- A compact banner appears at the top of the chat, below the conversation header
- Shows: campaign emoji + title + status badge + "View Details" link
- Styled as `bg-teal-50 border-b border-teal-200` — subtle, not intrusive
- Tapping "View Details" navigates to the campaign detail page
- Applies to both direct messages and campaign group conversations

Conversations get linked to campaigns organically — when Donny sends an invitation message, when a business messages a creator about a specific campaign. No auto-creation of empty campaign conversations.

### 3. Invitation Entry Points

All three entry points call the same `send-campaign-invitation` edge function.

#### 3A. Donny Chat

Business tells Donny "invite Roger to my campaign." Donny's `invite_creator` tool calls `send-campaign-invitation`. If the user is on a campaign page, `campaign_id` auto-fills from DonnyProvider context. If not, Donny asks which campaign.

**Changes to `donny-chat` edge function:**
- Update `invite_creator` tool handler to call `send-campaign-invitation` instead of raw insert
- Accept `campaign_id` from the new `campaign_context` field when available
- Return a natural confirmation message: "Done! I've sent [Creator] an invitation to your [Campaign] campaign."

#### 3B. Campaign Detail Page (AI Match Tab)

Each matched creator card in the AI Match tab gets an "Invite" button (teal pill, right-aligned). Tapping it:
- Optionally shows a quick confirmation with room for a personal note
- Calls `send-campaign-invitation` with the campaign ID from the page and the creator's ID
- Button changes to "Invited" (disabled state) on success
- Toast confirms: "Invitation sent to [Creator]"

#### 3C. Creator Profile Modal

"Invite to Campaign" button on creator profile pages opens a modal containing:
- Dropdown of the business's active/published campaigns (showing emoji + title + spots remaining)
- Optional personal note textarea
- "Send Invitation" confirm button
- Calls `send-campaign-invitation` with the selected campaign ID

**Frontend hook:** The existing `useInviteCreator` hook in `src/hooks/useCampaignInvitations.ts` currently does a raw insert into `campaign_invitations`. Modify it to call the `send-campaign-invitation` edge function instead, so all side effects (email, Donny message) fire. Entry points 3B and 3C both use this hook. Also update `useBulkInvite` in `src/hooks/useBulkInvite.ts` to call the edge function per invitation (it currently also does raw inserts).

### 4. Creator-Side Invitation Experience

#### 4A. Bell Notification

Add a realtime subscription for `campaign_invitations` INSERT events where `creator_id` matches the current user to the existing `useNotifications` hook.

When an invitation arrives:
- Creates notification entry: `{ type: 'campaign_invitation', title: 'Campaign Invitation', message: '[Business] invited you to [Campaign]', campaignId, invitationId }`
- Adds to existing localStorage-backed array
- Shows a toast notification
- Increments unread badge

Tapping the notification in `NotificationDropdown`:
- Navigates to `/dashboard/creator/campaigns/:campaignId?invited=true`
- The `?invited=true` query param triggers the invitation banner on the campaign detail page
- Marks notification as read

#### 4B. Donny Proactive Message

The `send-campaign-invitation` edge function inserts a message into the creator's Donny conversation:
- Summarizes campaign: deliverables, budget range, deadline
- Includes the business's personal note if provided
- Includes a "View Campaign" link to the campaign detail page

The Donny chat UI renders this with two quick-action buttons:
- **"View Campaign"** — navigates to campaign detail page with `?invited=true`
- **"Decide Later"** — dismisses, invitation stays pending

**Quick-action button implementation:**

This requires a new `quick_actions` JSONB column on the `donny_messages` table (DB migration needed). Schema:

```json
[
  { "label": "View Campaign", "action": "navigate", "url": "/dashboard/creator/campaigns/:id?invited=true" },
  { "label": "Decide Later", "action": "dismiss" }
]
```

Changes needed:
1. **Migration:** `ALTER TABLE donny_messages ADD COLUMN quick_actions JSONB DEFAULT NULL`
2. **TypeScript types:** Add `quick_actions?: QuickAction[]` to the `DonnyMessage` type in `src/types/donny.ts`
3. **DonnyMessage component** (`src/components/donny/DonnyMessage.tsx`): Add rendering logic — when `quick_actions` is present, render a row of pill buttons below the message bubble. "navigate" actions use `useNavigate()`, "dismiss" actions hide the buttons.

#### 4C. Campaign Detail Page — Invitation Banner

When the creator arrives at the campaign detail page via an invitation (detected by `?invited=true` query param OR by checking if a pending invitation exists for this user+campaign):
- A warm yellow banner appears below the hero header: "You're invited! [Business] personally invited you to this campaign"
- Styled as `bg-amber-50 border-b border-amber-300` with a 📩 icon
- The existing "Apply Now" button and application form work as-is — no changes to the application flow
- The creator "accepts" by applying; "declines" by doing nothing

**Invitation status lifecycle:** When a creator submits a campaign application, check if a pending invitation exists for this user+campaign pair. If so, update `campaign_invitations.status` to `'accepted'`. This keeps the invitation data clean (no perpetually-pending records) and prevents the business from re-inviting someone who already applied. This check belongs in the application submission logic (the `campaign_applications` INSERT path).

No separate accept/decline UI flow — this keeps the codebase simple and avoids a parallel workflow.

### 5. Notifications — Invitation Events

**Changes to `useNotifications` hook (`src/hooks/useNotifications.ts`):**
- Add realtime channel subscription for `campaign_invitations` table with server-side Postgres filter: `filter: 'creator_id=eq.${userId}'` (unlike the existing application/sponsorship subscriptions which filter client-side, invitations should use a server-side filter to avoid leaking invitation data to unrelated users)
- On INSERT: create notification, show toast, increment badge
- Notification includes `campaignId` for routing

**Changes to `NotificationDropdown` (`src/components/notifications/NotificationDropdown.tsx`):**
- Add routing case for `campaign_invitation` type → navigate to campaign detail with `?invited=true`

**Email:** Handled by the `send-campaign-invitation` edge function calling `send-notification-email`. Requires adding a `campaign_invitation` type and template to `send-notification-email/index.ts` (see Section 1, step 3).

**What we're NOT doing:**
- No database-backed notification storage (keeping localStorage)
- No notification preferences or muting
- No dedicated notifications page (dropdown is sufficient)
- No browser push notifications

---

## Components Summary

| Component | Location | Status |
|-----------|----------|--------|
| `send-campaign-invitation` | `supabase/functions/send-campaign-invitation/` | New edge function |
| `donny-chat` invite_creator tool | `supabase/functions/donny-chat/index.ts` | Modify to call new edge function |
| `DonnyProvider` | `src/contexts/DonnyProvider.tsx` | Add campaign page context extraction |
| `useInviteCreator` | `src/hooks/useCampaignInvitations.ts` | Modify to call edge function instead of raw insert |
| `useBulkInvite` | `src/hooks/useBulkInvite.ts` | Modify to call edge function per invitation |
| `CampaignConversationHeader` | `src/components/messaging/CampaignConversationHeader.tsx` | New banner component |
| `InviteToCampaignModal` | `src/components/campaigns/InviteToCampaignModal.tsx` | New modal for profile entry point |
| `useNotifications` | `src/hooks/useNotifications.ts` | Add invitation subscription |
| `NotificationDropdown` | `src/components/notifications/NotificationDropdown.tsx` | Add invitation routing |
| `CreatorCampaignDetails` | `src/components/campaign-details/CreatorCampaignDetails.tsx` | Add invitation banner |
| `CampaignDetailsPage` | `src/pages/CampaignDetailsPage.tsx` | Read `?invited=true` param |
| Creator match cards (AI Match tab) | `src/components/campaigns/CreatorMatchCard.tsx` | Add "Invite" button to each card |
| `donny_messages` table | Migration | Add `quick_actions` JSONB column |
| `DonnyMessage` component | `src/components/donny/DonnyMessage.tsx` | Add quick-action button rendering |
| `DonnyMessage` type | `src/types/donny.ts` | Add `quick_actions` field |
| `send-notification-email` | `supabase/functions/send-notification-email/index.ts` | Add `campaign_invitation` template |
| `useDonny` hook | `src/hooks/useDonny.ts` | Pass `campaign_context` in edge function call |

## Data Flow

```
Business invites creator (any entry point)
  → send-campaign-invitation edge function
    → INSERT campaign_invitations (status: pending)
    → CALL send-notification-email (campaign_invitation template)
    → INSERT message into creator's Donny conversation
    → RETURN invitation record
  
Creator's browser (realtime):
  → useNotifications catches campaign_invitations INSERT
  → Bell badge increments, toast shows
  → Donny conversation updates with proactive message

Creator taps notification or Donny's "View Campaign":
  → Navigates to /dashboard/creator/campaigns/:id?invited=true
  → Invitation banner shows on campaign detail page
  → Creator taps "Apply Now" → normal application form
  → Application submitted → invitation status updated to 'accepted'
```

## Out of Scope

- Database-backed notification storage (future spec)
- Notification preferences / muting
- Browser push notifications / service worker
- Auto-creating campaign conversations on publish
- Invitation accept/decline as a separate flow (creator applies or ignores)
- Bulk invitation UI from campaign page (existing `useBulkInvite` hook covers programmatic use)
- Invitation analytics / tracking (open rates, response rates)
