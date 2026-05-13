# Three Bug Fixes: Mission Gate Bypass, OAuth Error, Phantom Notifications

**Date:** 2026-05-13
**Status:** Draft

## Problem Statement

Three user-facing bugs are blocking normal use of the platform:

1. The "Almost there!" prerequisite gate blocks access to Create a Campaign, DragonShare, UGC Campaigns, and other features. Because social media integration and Stripe onboarding both have bugs, users cannot complete the prerequisites and are permanently locked out.

2. When a user connects a social media account through Outstand.io and is redirected back to DragonCandy, the OAuth callback page shows "Could not record connection: db_error". There is also no way to navigate back from the callback page if something goes wrong.

3. A user (coalition.joe@gmail.com) sees a "1" notification badge on the Messages tab but has no actual messages. The badge count and message list are inconsistent.

## Fix 1: Temporarily Bypass PrerequisiteGate

**Root cause:** The `PrerequisiteGate` component (`src/components/PrerequisiteGate.tsx`) wraps multiple feature pages and blocks rendering until profile, social, and Stripe requirements are met. With social and Stripe integrations having bugs, users can never satisfy the gate.

**Approach:** Add an early return at the top of `PrerequisiteGate` that always renders `children`, bypassing all checks. This is a single-line change in one file that automatically unblocks every page using the gate (DragonShare, UGC Campaigns, Campaign creation, Promotions, Sponsorships, Proposals, etc.). No page-level changes needed.

**Files changed:**
- `src/components/PrerequisiteGate.tsx` — add `return <>{children}</>` as the first line of the component body, before the hook calls

**Revert plan:** Remove the early return line to re-enable gating once social media and Stripe integrations are fixed.

## Fix 2: Social Media OAuth Connection Error + Back Button

### 2a: Fix the db_error

**Root cause analysis:** The error occurs in `supabase/functions/outstand-proxy/index.ts` at line 430-432. When the `handleRecordConnection` function upserts into `business_outstand_accounts`, the operation fails and the function returns a generic `{ error: "db_error" }` without surfacing the actual Postgres error message.

The edge function uses a service_role admin client (line 471), which bypasses RLS. The table schema allows nullable `business_id` (migration `20260507000000`), the unique constraint is on `(user_id, outstand_social_account_id)` (matching the `onConflict` parameter), and all inserted columns have appropriate types and defaults.

**Possible failure causes** (without access to Supabase runtime logs):
- The `org_unit_id` foreign key constraint fails if a non-null value is provided that doesn't exist in the `org_units` table
- The Supabase JS client's service_role auth configuration may not be correctly initialized (missing `auth: { persistSession: false }` for server-side usage)
- A race condition where two concurrent callback requests for the same user/account conflict

**Approach:**
1. Surface the actual error: change the error response from `{ error: "db_error" }` to `{ error: "db_error", detail: upsertError.message }` so the frontend displays the real Postgres error. This is critical for diagnosing the root cause.
2. Harden the upsert: guard `org_unit_id` to only pass a valid UUID or null (never empty string). Ensure the admin client is configured with `auth: { persistSession: false }` for proper server-side behavior.
3. Add a retry with fallback: if the upsert fails, try once more with `org_unit_id: null` to isolate whether the FK constraint is the culprit.

**Files changed:**
- `supabase/functions/outstand-proxy/index.ts` — improve error surfacing in `handleRecordConnection`, harden `org_unit_id` handling, add client config

### 2b: Add Back Button to OAuth Callback Page

**Root cause:** `OutstandOAuthCallbackPage.tsx` has no navigation element to return to the settings or social media page. If the callback fails, the user is stranded.

**Approach:** Add a "Back to Settings" button that navigates to the social media accounts tab. The `accountsTab` path is already available via the `useOutstandPaths()` hook. Show the button:
- Always in the error state (when `status === 'error'`)
- After a brief delay in the pending state (in case the user wants to abandon)

**Files changed:**
- `src/pages/OutstandOAuthCallbackPage.tsx` — add a back/return button using existing `accountsTab` path from `useOutstandPaths()`

## Fix 3: Phantom Message Notification Badge

**Root cause:** The `get_user_conversations` RPC function (migration `20260514000002_conversations_org_unit.sql`, lines 67-106) returns direct conversations (Branch 1) where the user is a participant, regardless of whether any messages exist. The `unread_count` subquery counts unread messages, but a conversation can exist with:
- Zero messages total (empty conversation created but never used)
- An orphaned unread message record that doesn't display in the UI

The `useTotalUnreadCount()` hook (`src/hooks/useUnreadCounts.ts`) sums all `unread_count` values from the RPC, so even one conversation with `unread_count >= 1` creates a badge.

Branch 2 (campaign conversations) already has an `EXISTS` guard requiring at least one message (lines 157-161). Branch 1 lacks this.

**Approach:** Add an `EXISTS` clause to Branch 1 of the `get_user_conversations` RPC to filter out conversations that have zero messages. This mirrors the pattern already used by Branch 2 and ensures the notification badge only counts conversations with actual visible messages.

**Migration SQL:**
```sql
-- Add to Branch 1 WHERE clause:
AND EXISTS (
  SELECT 1 FROM public.messages m
  WHERE m.conversation_id = c.id
)
```

**Files changed:**
- New migration file `supabase/migrations/2026MMDD_fix_conversations_empty_filter.sql` — recreate `get_user_conversations` with the EXISTS filter on Branch 1

## Testing

**Fix 1:** Navigate to DragonShare, UGC Campaigns, Create Campaign, Promotions, Sponsorships, and Proposals pages — all should render content directly without the "Almost there!" gate.

**Fix 2a:** Connect a social media account through Outstand.io. On callback, the connection should succeed (or display a meaningful error message instead of "db_error").

**Fix 2b:** Navigate to the OAuth callback page manually or trigger an error — the "Back to Settings" button should appear and navigate to the correct social media accounts tab.

**Fix 3:** Log in as coalition.joe@gmail.com (or any user with phantom notifications). The Messages badge should show 0 (no badge) if there are no actual messages. Existing conversations with real unread messages should still show correct counts.

## Scope Boundaries

- The gate bypass is temporary. The gate will be re-enabled after social media and Stripe integration bugs are resolved.
- The OAuth error fix focuses on error visibility and hardening, not a full rewrite of the Outstand integration.
- The message fix targets the RPC query only. No changes to the frontend notification components or the messages UI.
