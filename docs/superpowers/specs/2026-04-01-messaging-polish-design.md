# Messaging Polish Design Spec

**Date:** 2026-04-01
**Scope:** Polish the messaging UI without modifying real-time Supabase logic

## Context

The messaging system is functionally complete — real-time messaging, typing indicators, reactions, replies, search, and file attachments all exist. This task is a UI polish pass to fix placeholder text, remove unnecessary elements, improve visual consistency, and add small UX enhancements before launch.

## Decision Log

- **Presence indicator:** Static "Recently Active" text only. The `UserPresenceIndicator` was disabled due to crashes; re-enabling is out of scope. Follow-up ticket if needed post-launch.
- **Approach:** Surgical edits to existing files. No new components, no refactoring.
- **Background color:** Replace `#A8A8A0` gray with `bg-teal-50` for brand consistency.

## Changes

### 1. Header Polish

**Files:** `DirectConversationPage.tsx`, `DirectMessagesPage.tsx`

- Remove the phone icon button from the header (only exists in `DirectConversationPage.tsx`)
- Wire real participant name from `useConversations()` data (`other_participant_name`)
- Add "View Profile" teal text link below the name, navigating to `/profile/:participantId`. Use the existing `otherParticipantId` state variable in `DirectConversationPage.tsx` and `recipientId` state in `DirectMessagesPage.tsx`. Do not modify protected hooks.
- Keep "Recently Active" as static status text
- Change page background from gray (`bg-dc-gray` / `bg-[#A8A8A0]`) to `bg-teal-50` across all messaging components: `DirectConversationPage.tsx`, `DirectMessagesPage.tsx`, `MessageList.tsx`, and `ConversationMessageThread.tsx`

### 2. Chat Bubble Polish

**Files:** `MessageBubbleEnhanced.tsx`, `MessageList.tsx`

- **Message grouping:** When consecutive messages share the same `sender_id`, only show avatar and sender name on the first message in the group. Pass a `showAvatar` boolean prop from `MessageList.tsx` by comparing each message's `sender_id` with the previous message's.
- **Slide-in animations:** Outbound messages slide in from right, inbound from left. Subtle translate (~8-12px) over ~200ms. Check if `tailwindcss-animate` plugin is installed (likely yes, since shadcn/ui uses it). If available, use its utilities; otherwise define keyframes inline in the component.

### 3. Input Bar Polish

**File:** `MessageInputEnhanced.tsx`

- **Placeholder:** Current placeholder is `"Type your message..."` — change to `"Type a message..."` for consistency with the spec. Minor wording tweak.
- **Send button disabled state:** Already partially implemented (`disabled={(!message.trim() && !file) || disabled || uploading}` with `disabled:opacity-40`). Refine styling: change to `opacity-50`, add `cursor-not-allowed`.
- **Send button color:** Change from plain icon (`text-gray-900`) to permanent teal fill with white icon (`bg-teal-500 text-white rounded-full`). Note: this intentionally departs from the CLAUDE.md design system's "dark circle with arrow icon" — the teal fill better matches the brand identity throughout the app.

### 4. Empty State

**File:** `DirectMessagesPage.tsx`

- When no conversation is selected (right panel empty), show centered text: "Select a conversation or start a new one from a creator's profile"
- Muted text color, optional small message icon above
- Desktop only — on mobile, `DirectMessagesPage` uses single-panel layout (list OR thread), so there is no visible empty right panel. No mobile equivalent needed.

### 5. Conversations List

**File:** `DirectMessagesList.tsx`

- No changes needed. Already has: last message preview, timestamps, unread count badges, sorted by most recent.

## Protected Files (DO NOT MODIFY)

- `useMessageQueries.ts` — real-time subscriptions
- `useMessageMutations.ts` — send logic, optimistic updates
- `useConversations.ts` — conversation fetching
- `useTypingIndicator.ts` — typing presence
- All pages outside messaging

## Files Modified

| File | Changes |
|------|---------|
| `DirectConversationPage.tsx` | Header rework (remove phone icon, add View Profile link), background color |
| `DirectMessagesPage.tsx` | Header fixes, background color, empty state (desktop) |
| `MessageBubbleEnhanced.tsx` | Message grouping (`showAvatar` prop) |
| `MessageList.tsx` | Pass grouping info to bubbles, slide-in animation, background color |
| `MessageInputEnhanced.tsx` | Placeholder, send button styling/disabled state |
| `ConversationMessageThread.tsx` | Background color only |

## No New Files

All changes are edits to existing components.

## Verification

- `npm run build` succeeds
- Chat renders correctly on mobile
- Existing real-time messaging still works (send, receive, typing indicators)
- Message grouping displays correctly for consecutive same-sender messages
