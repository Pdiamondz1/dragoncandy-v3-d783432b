# DragonCandy Platform UX Fixes — Design Spec

**Date:** 2026-05-12
**Author:** Dame (co-founder, CPO)
**Status:** Approved

Four independent subsystems that share notification infrastructure, packaged as one spec with four sections. Each section is self-contained and can be implemented independently.

---

## Section 1: Messaging Unread Badges + Email Notifications

### Problem

When a user receives a message on DragonCandy, there is no visible notification on the Messages icon in either the mobile bottom nav or the desktop sidebar. Users have no way to know they have unread messages without navigating to the Messages page. Additionally, email notifications for new messages only send to business/brand roles — creators never receive them.

### Design

**Unread badge on nav icons.** A pink (#EC4899) circular badge appears on the Messages icon showing the total unread message count, capped at "9+" for display. The badge appears on both the `MobileBottomNav` component and the desktop sidebar in `DashboardLayout`.

**New hook: `useTotalUnreadCount`.** Wraps the existing `useConversations` query (which already returns `unread_count` per conversation via the `get_user_conversations` RPC). Sums all per-conversation `unread_count` values into a single total integer. Refetch triggers: every 30 seconds, on window focus, and when a Supabase realtime INSERT event fires on the `messages` table for the current user. React Query's `queryKey`-based deduplication prevents double-counting when multiple triggers fire simultaneously — no manual dedup logic needed.

**Email notifications for all roles.** Remove the role filter in the `send-notification-email` edge function that currently restricts message emails to `business_client` and `brand` roles. All roles (creator, business_client, brand) receive email notifications for new direct messages.

### Files to modify

| File | Change |
|------|--------|
| `src/hooks/useUnreadCounts.ts` | Add `useTotalUnreadCount()` that sums conversation unread counts |
| `src/components/MobileBottomNav.tsx` | Consume `useTotalUnreadCount`, render badge on Messages icon |
| `src/components/DashboardLayout.tsx` | Consume `useTotalUnreadCount`, render badge on Messages sidebar link |
| `supabase/functions/send-notification-email/index.ts` | Remove role filter for `new_message` type (lines near 217-229) |

### What this deletes

The role-based filter that silently prevents creators from receiving message emails.

### What this simplifies

No new database tables, no new RPC functions — reuses the existing `useConversations` hook that already carries unread counts.

### Keystroke count removed

Zero — this is a passive notification system. Users no longer need to manually navigate to Messages to check for new conversations.

---

## Section 2: Multi-Location Social Media + Stripe

### Problem

Restaurant user coalition.joe@gmail.com has multiple locations (e.g., Uncle Rocco). When selecting a location, the user cannot add social media accounts or Stripe Connect accounts for that specific location. Stripe is stored at the `business_profiles` level (one per user), not per location. Social media account linking via Outstand has `org_unit_id` support in the database but the UI is not correctly passing the location context. Without social and Stripe connected per location, features like Campaign Generation, Promotions, and DragonShare are unusable.

### Design

**Stripe account per location.** Add `stripe_account_id TEXT` and `stripe_onboarding_complete BOOLEAN DEFAULT false` columns to the `org_units` table. Update the `create-restaurant-connect-account` edge function to accept an optional `org_unit_id` parameter. When provided, write the Stripe account ID to `org_units` instead of `business_profiles`. The existing `business_profiles.stripe_account_id` remains as a fallback for businesses that don't use the multi-location system. Multiple locations can reference the same Stripe account if the user wants.

**Fix social media account linking.** The `org_unit_id` column already exists on `business_outstand_accounts` (migration `20260511300000`). Fix the `AccountsTab` component to correctly pass `activeOrgUnit.id` to the Outstand proxy via the `X-Org-Unit-Id` header when connecting new social accounts. Verify the `outstand-proxy` edge function correctly reads and records `org_unit_id`.

**Feature gating.** New `useLocationReadiness(orgUnitId)` hook checks if both social media and Stripe are connected for the selected location. Returns `{ isReady: boolean, missingSocial: boolean, missingStripe: boolean }`. Campaign creation, promotions, and DragonShare display a gating banner with "Complete [location name]'s setup to unlock features" and a "Go to Settings" link when the location isn't ready.

**Stripe onboarding UI.** Update `StripeConnectSetup` component to be location-aware: when `activeOrgUnit` is set, show the Stripe status for that specific org unit. When `activeOrgUnit` is null ("All Locations"), show a message directing the user to select a specific location.

**Stripe resolution order.** All payment-related code follows this lookup rule: if `org_unit_id` is present, read `stripe_account_id` from `org_units` first. If null or not found, fall back to `business_profiles.stripe_account_id`. This preserves backward compatibility for existing single-location businesses that already have Stripe connected at the business level. Edge functions (`check-restaurant-payout-status`, payment flows) must implement this resolution order explicitly.

### Files to modify

| File | Change |
|------|--------|
| New migration | Add `stripe_account_id`, `stripe_onboarding_complete` to `org_units` |
| `supabase/functions/create-restaurant-connect-account/index.ts` | Accept `org_unit_id`, write to `org_units` when provided |
| `supabase/functions/check-restaurant-payout-status/index.ts` | Check `org_units` for location-specific Stripe status |
| `src/components/outstand/AccountsTab.tsx` | Fix `activeOrgUnit` conditional logic, pass `org_unit_id` to Outstand |
| `src/components/settings/StripeConnectSetup.tsx` | Read/write Stripe status from `org_units` when `activeOrgUnit` is set |
| `src/hooks/useLocationReadiness.ts` | New hook: checks social + Stripe connected for org unit |
| `src/pages/BusinessDashboard.tsx` | Show gating banner when location not ready |
| Campaign creation components | Check `useLocationReadiness` before allowing campaign creation |

### What this deletes

The assumption that one Stripe account serves all locations. The broken state where selecting a location prevents connecting social/Stripe.

### What this simplifies

Location setup is explicit: select location, connect social, connect Stripe, then create campaigns. The feature gate makes the required steps obvious.

### Keystroke count removed

Zero net new keystrokes. The flow already existed but was broken. After fix, connecting social and Stripe for a location follows the same steps as the parent business.

---

## Section 3: Campaign Invitations — Fix + Enhance

### Problem

The campaign invitation system is partially built but broken end-to-end. Brands cannot reliably see the invite button, sending invitations produces errors, and creators don't receive notifications. Additionally, only the Brand role has a Browse Creators page — Restaurant users cannot browse or invite creators. Creators have no way to formally decline an invitation (they can only ignore), and there is no dedicated place to view pending invitations.

### Design

#### Phase 1: Fix the broken pipeline

Full end-to-end audit and repair of the invitation flow:

1. **Button visibility.** Audit `BrandCreatorCard` — ensure the invite Send icon renders. Check that the `BrandCreators` page component is correctly imported and the route is accessible. Verify the `InviteToCampaignModal` opens and populates the campaign dropdown.

2. **Edge function errors.** Debug `send-campaign-invitation` edge function. Test with real campaign/creator IDs. Check RLS policies on `campaign_invitations` table — ensure INSERT is allowed by campaign owner and SELECT is allowed by invited creator. Verify campaign ownership validation logic.

3. **Notification delivery.** Verify the email template for `campaign_invitation` type fires correctly in `send-notification-email`. Verify Donny message creation succeeds (check `donny_messages` table). Test deep link URL generation (`/dashboard/creator/campaigns/{id}?invited=true`).

4. **RLS policies.** Ensure `campaign_invitations` has policies for: campaign owner can INSERT and SELECT, invited creator can SELECT and UPDATE (to accept/decline).

#### Phase 2: Restaurant Browse Creators

Add `/dashboard/restaurant/creators` route using the existing `BrandCreators` component. Add "Browse Creators" nav link in the restaurant sidebar config in `navConfig.ts`. The invite modal, campaign selector, and invitation sending all work the same as the Brand flow. **Audit item:** verify that `BrandCreators` does not hard-code `brand` role checks in the invite modal, campaign dropdown query, or creator fetch. If it does, refactor to accept the role dynamically from auth context.

#### Phase 3: Creator-facing enhancements

**Invitations tab.** Add a third tab ("Invitations") alongside "All Campaigns" and "Donny Picks" in `CreatorCampaignMarketplace`. The tab shows a pink badge with the count of pending invitations. The tab queries `campaign_invitations` where `creator_id = user.id AND status = 'pending'`, joined with campaign and profile data.

**Invitation cards.** Each pending invitation displays: business avatar and name, campaign title with emoji, budget range, deliverable count, deadline, optional personal message from the inviter (in a quote block), and two action buttons: "Apply Now" and "Decline."

**Decline action.** New `useDeclineInvitation` hook updates `campaign_invitations.status` to `'declined'`. On decline, trigger an email notification to the inviter via `send-notification-email` with a `campaign_invitation_declined` template: subject "[Creator Name] declined your campaign invitation", body shows campaign title and a "View Campaign" CTA linking to the business's campaign management page. Also create an in-app notification for the business user. Template follows the same layout as the existing `campaign_invitation` template with status-specific copy.

**Bidirectional notifications.** Both parties receive notifications at every state change:
- Invite sent: creator gets email + Donny message + in-app notification
- Creator applies (accepts): business gets email + in-app notification (this already works via `useCreateApplication` which auto-updates invitation status)
- Creator declines: business gets email + in-app notification

**No action = stays pending.** Invitations that are neither accepted nor declined remain in the Invitations tab until acted on or until the campaign deadline passes / campaign is unpublished.

### Files to modify

| File | Change |
|------|--------|
| `src/components/brand-browse/BrandCreatorCard.tsx` | Audit invite button visibility |
| `supabase/functions/send-campaign-invitation/index.ts` | Debug and fix edge function |
| RLS migrations | Fix policies on `campaign_invitations` |
| `src/lib/navConfig.ts` | Add "Browse Creators" to restaurant nav |
| `src/App.tsx` | Add `/dashboard/restaurant/creators` route |
| `src/pages/CreatorCampaignMarketplace.tsx` | Add "Invitations" tab with badge |
| `src/hooks/useCampaignInvitations.ts` | Add `useCreatorPendingInvitations` and `useDeclineInvitation` |
| `supabase/functions/send-notification-email/index.ts` | Add `campaign_invitation_declined` email template |

### What this deletes

The implicit "ignore to decline" pattern that left businesses guessing whether creators saw their invitations.

### What this simplifies

Creators see all invitations in one tab instead of relying on email/Donny to discover them. Two clear actions (Apply / Decline) replace ambiguity.

### Keystroke count removed

Creators go from "open email, click link, navigate to campaign, decide" to "tap Invitations tab, tap Apply or Decline." Roughly 4-5 taps removed per invitation.

---

## Section 4: Campaign Swipe Undo + Cycling

### Problem

When creators browse campaigns in the mobile swipe view, swiping left to skip a campaign removes it permanently from the stack. Skipped campaigns are stored only in volatile React state (`useState<Set<string>>`), so they're lost on page refresh or navigation. Creators who accidentally skip a campaign or want to revisit must navigate back to the Dashboard and re-enter Campaigns to reset — and even then, all campaigns appear again (no skip history).

### Design

**Undo toast.** After each left swipe, a dark toast appears at the bottom of the screen with "Campaign skipped" text, a 5-second countdown progress bar, and an "Undo" button (teal). Tapping Undo removes the campaign from `skippedIds` and restores it to the top of the swipe stack. The toast auto-dismisses after 5 seconds. Only one undo toast is visible at a time (swiping again replaces the previous toast).

**Database persistence.** New `campaign_skips` table:

```sql
CREATE TABLE campaign_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  skipped_at TIMESTAMPTZ DEFAULT now(),
  restored BOOLEAN DEFAULT false,
  UNIQUE(user_id, campaign_id)
);
```

RLS: users can only read/write their own skips. Skips are written on swipe (after the undo window expires), soft-deleted (set `restored = true`) on undo/restore.

**Cycling.** When the creator reaches the end of fresh campaigns (all unseen campaigns viewed), the "All caught up!" screen shows a "Show Skipped (N)" button. Tapping it loads previously-skipped campaigns back into the swipe stack for a second look. These re-shown campaigns can be skipped again or viewed. Only campaigns where `campaigns.status = 'published' AND campaigns.deadline > now()` appear in the cycling pool — expired or unpublished campaigns are excluded even if previously skipped.

**Desktop grid: "Previously Skipped" section.** On desktop, skipped campaigns appear in a collapsible section below the main campaign grid. Each card has a "Restore" button that moves the campaign back into the main feed.

**Analytics integration.** Skip data is persisted and available for Donny AI matching improvements. Frequently-skipped campaign types (by content type, budget range, distance) can be deprioritized in future "Donny Picks" recommendations.

### Files to modify

| File | Change |
|------|--------|
| New migration | Create `campaign_skips` table with RLS |
| `src/hooks/useCampaignSkips.ts` | New hook: `useSkipCampaign`, `useRestoreCampaign`, `useSkippedCampaigns` |
| `src/pages/CreatorCampaignMarketplace.tsx` | Integrate skip persistence, add cycling logic, add undo toast, add Skipped section (desktop) |
| `src/components/campaigns/CampaignSwipeCard.tsx` | Wire undo toast into swipe-left handler |
| `src/components/campaigns/UndoToast.tsx` | New component: dark toast with countdown and undo button |

### What this deletes

The volatile in-memory `skippedIds` Set that loses all skip history on navigation.

### What this simplifies

Creators never lose their place. Skip once, revisit later. No need to reset by navigating away and back.

### What this automates

Skip data feeds Donny AI matching — creators who consistently skip certain campaign types see fewer of them in recommendations, without any manual preference configuration.

### Keystroke count removed

Eliminates the 4-tap "Dashboard > Campaigns > re-swipe everything" cycle that creators had to do to see skipped campaigns again.

---

## Implementation Order

These four sections are independent and can be built in any order. Recommended sequence based on user impact and dependency simplicity:

1. **Section 1: Messaging Badges** — smallest scope, highest daily-use impact, no schema changes
2. **Section 4: Swipe Undo** — self-contained, one new table, immediate creator UX improvement
3. **Section 3: Campaign Invitations** — phased approach, fix existing code first, then enhance
4. **Section 2: Multi-Location Stripe** — deepest schema change, most edge function modifications, touches payment infrastructure
