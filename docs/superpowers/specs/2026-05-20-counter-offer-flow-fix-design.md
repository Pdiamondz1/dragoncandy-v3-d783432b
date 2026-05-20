# Counter-Offer Flow Fix — Design Spec

> **Date:** 2026-05-20
> **Author:** Dame Williams + Claude Code
> **Status:** Draft
> **Scope:** Fix multi-round counter-offer negotiation, add real-time notifications, verify Stripe price flow

## Context

The counter-offer negotiation flow between businesses (restaurants/brands) and creators is broken for multi-round negotiations. When a business submits a counter-offer in response to a creator's offer, the new counter-offer displays with incorrect status ('accepted' instead of 'pending'), the creator never sees it, and no in-app notifications fire. The root causes are: (1) new counter-offers rely on a DB DEFAULT for status instead of explicitly setting it, (2) old pending offers from the other party aren't superseded when a new counter is sent, and (3) the Supabase Realtime subscription doesn't include the `application_counter_offers` table.

The Stripe escrow price flow is correct by design — the agreed amount from the accepted counter-offer feeds into both the frontend Pay Escrow button and the `create-campaign-escrow` edge function. The fix is entirely upstream: correct counter-offer status management.

## Requirements

- Unlimited negotiation rounds between business and creator
- Each side sees the other's counter-offer instantly (Realtime)
- Toast + bell icon + email notifications for every counter-offer event
- Asymmetric accept: business accept = hire + price agreement; creator accept = price agreement only
- Final agreed price flows correctly to Stripe checkout
- Minimal schema changes (one small migration for Realtime publication only)

## Design

### 1. Counter-Offer State Management

**File:** `src/hooks/useCounterOffers.ts`

**In `useCreateCounterOffer` mutation function, three changes:**

**A. Explicitly set `status: 'pending'` on INSERT (line 69-80).** Don't rely on DB DEFAULT:

```typescript
.insert({
  application_id: applicationId,
  sender_id: user.id,
  sender_role: senderRole,
  proposed_rate: proposedRate || null,
  proposed_timeline: proposedTimeline || null,
  message,
  status: 'pending',
})
```

**B. Supersede the OTHER party's pending offers before the INSERT.** After the application status update and before the INSERT, run:

```typescript
await supabase
  .from('application_counter_offers')
  .update({ status: 'declined' })
  .eq('application_id', applicationId)
  .eq('status', 'pending')
  .neq('sender_id', user.id);
```

The `.neq('sender_id', user.id)` filter targets only the other party's offers, which the RLS UPDATE policy allows (it requires `sender_id != auth.uid()`). This is a best-effort operation — if it affects zero rows (no pending offers from the other party), that's fine.

**RLS constraint:** A user cannot supersede their OWN previous pending offers because the UPDATE policy requires `sender_id != auth.uid()`. If a user sends two counter-offers in a row without the other party responding, both remain 'pending' from the same sender. This is functionally safe because: (a) all UI filters use `.at(-1)` to show only the most recent pending offer, (b) the response buttons always reference the latest offer's ID, and (c) the other party's `latestPendingOffer` filter returns the most recent one.

**C. Improve the race-condition error message in `useRespondToCounterOffer` (lines 159-161).** Change from generic "no longer pending" to:

```typescript
throw new Error('This offer was replaced by a newer counter-offer. The page will refresh with updated terms.');
```

And in the `onError` handler, invalidate counter-offers queries to refresh the UI:

```typescript
onError: (error) => {
  queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
  toast({ title: 'Offer updated', description: error.message, variant: 'destructive' });
},
```

### 2. Realtime Notifications

**File:** `src/hooks/useNotifications.ts`

**New import:** Add `useQueryClient` from `@tanstack/react-query`. Obtain `queryClient` instance at hook top level:

```typescript
const queryClient = useQueryClient();
```

**Add two subscriptions** to the existing `notifications-${user.id}` channel:

**Counter-offer INSERT:**
```
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'application_counter_offers' }, handler)
```

Handler:
- Skip if `payload.new.sender_id === user.id` (current user sent it — they already got the "Counter offer sent!" toast from the mutation's `onSuccess`)
- Fetch application + campaign title via existing `cachedLookup` pattern
- Show toast: "New counter-offer on {campaign}: ${proposed_rate}"
- Add notification to bell: type `'counter_offer_received'`, links to campaign page
- Invalidate `['counter-offers']` React Query key for instant UI update

**Counter-offer UPDATE:**
```
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'application_counter_offers' }, handler)
```

Handler:
- Only act when `payload.new.status` is 'accepted' or 'declined' (ignore 'pending' and supersede events)
- **Notify when `payload.new.sender_id === user.id`** — this means someone ELSE responded to the current user's offer (the sender of the offer gets notified about the response)
- **Skip when `payload.new.sender_id !== user.id`** — the current user is the one who responded, they already got a toast from their own mutation
- Show toast: "Your counter-offer was {accepted/declined} on {campaign}"
- Add notification to bell: type `'counter_offer_responded'`
- Invalidate `['counter-offers']` and `['campaign-applications']` React Query keys

**Note on filtering:** These subscriptions have no server-side `filter` clause, consistent with the existing `campaign_applications` and `campaign_sponsorships` subscriptions in the same channel. Client-side filtering (sender_id check) handles relevance. At 30 users this is fine; at scale, add server-side RLS filtering.

**File:** `src/hooks/useNotifications.ts` (type definition, line 24)

Append to the Notification type union:

```typescript
type: 'application_received' | 'application_status_changed' | 'milestone_completed' | 'sponsorship_proposal_received' | 'sponsorship_status_changed' | 'content_liked' | 'campaign_invitation' | 'message_received' | 'counter_offer_received' | 'counter_offer_responded';
```

**File:** `src/components/notifications/NotificationDropdown.tsx`

Add click navigation for counter-offer notification types:
- `counter_offer_received` → `/dashboard/business/campaigns/{campaignId}` or `/dashboard/creator/my-campaigns/{campaignId}` based on user's account type
- `counter_offer_responded` → same navigation

### 3. Realtime Publication

**Migration needed:** Verify that `application_counter_offers` is in the Supabase Realtime publication. If not, add it:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE application_counter_offers;
```

Without this, the Realtime subscriptions will silently receive nothing. This is a one-line migration with zero risk to existing functionality.

### 4. UI Thread Display

**File:** `src/components/campaigns/CounterOfferThread.tsx`

For offers with `status === 'declined'`: check if a newer offer exists from the opposite party (created after this one). If yes, display as "Superseded" with reduced opacity (`opacity-50`) instead of "declined" with destructive badge. This gives users clear visual history of how the negotiation progressed.

### 5. Counter Modal Pre-fill Fix

**File:** `src/components/campaigns/ApplicationCard.tsx` (line 357)

Change `currentRate` prop from `application.proposed_rate` to:

```typescript
currentRate={latestCreatorOffer?.proposed_rate || application.proposed_rate}
```

This pre-fills the counter modal with the latest negotiated rate (the other party's offer), not the original application rate.

### 6. Email Notifications (No Changes)

The existing email notification flow works correctly:
- `useCreateCounterOffer` calls `sendNotification('counter_offer')` on success
- `useRespondToCounterOffer` calls `sendNotification('counter_offer_response')` on success
- Edge function `send-notification-email` has templates for both types
- Recipients are correctly determined (sender is business → notify creator, and vice versa)

Verify during testing that emails are actually delivered.

### 7. Stripe Price Flow (No Changes)

The price resolution chain is correct:
- **Frontend** (`ApplicationCard.tsx:146-147`): `counterOffers.find(o => o.status === 'accepted')?.proposed_rate || application.proposed_rate`
- **Edge function** (`create-campaign-escrow/index.ts:68-97`): Same hierarchy — accepted counter-offer rate → accepted application rate → campaign fixed_price

With the state management fix, only the final agreed offer will have `status === 'accepted'`, ensuring the correct price reaches Stripe.

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useCounterOffers.ts` | Supersede other party's pending offers; explicit `status: 'pending'` on INSERT; better race-condition error; `queryClient` invalidation in `onError` |
| `src/hooks/useNotifications.ts` | Add `useQueryClient` import; Realtime subscriptions for counter-offer INSERT/UPDATE; new notification types; React Query invalidation on events |
| `src/components/notifications/NotificationDropdown.tsx` | Handle counter-offer notification click navigation |
| `src/components/campaigns/CounterOfferThread.tsx` | "Superseded" display for replaced offers |
| `src/components/campaigns/ApplicationCard.tsx` | Fix `currentRate` prop on CounterOfferModal |
| New migration file | `ALTER PUBLICATION supabase_realtime ADD TABLE application_counter_offers` |

## Files NOT Modified

| File | Reason |
|------|--------|
| `supabase/functions/send-notification-email/index.ts` | Email templates already exist and work |
| `supabase/functions/create-campaign-escrow/index.ts` | Price resolution logic is correct |
| `src/components/my-campaigns/AppliedPhaseView.tsx` | Already handles latestPendingOffer correctly |
| `src/components/applications/DetailedApplicationCard.tsx` | Same filtering as AppliedPhaseView |

## Verification Plan

1. **Creator applies** to "Summer Menu Drop" → submits counter-offer at $750
2. **Business sees** creator's $750 counter → clicks Counter → submits $650
3. **Verify state:** Creator's old $750 now 'declined' (superseded), business's $650 is 'pending'
4. **Verify business UI:** Shows "Counter offer pending — waiting for response" (not Accept/Counter/Reject buttons)
5. **Verify notifications:** Creator receives toast + bell notification + email about $650 counter
6. **Creator sees** business's $650 → accepts
7. **Verify state:** Business's $650 now 'accepted', application status → 'pending' (price agreed)
8. **Verify notifications:** Business receives toast + bell + email about acceptance
9. **Business accepts** application → hires creator → application status → 'accepted'
10. **Business clicks** Pay Escrow → Stripe checkout shows $650 (the agreed amount)
11. **Race condition test:** Open creator and business views simultaneously, have business counter while creator is viewing — verify creator's UI updates in real-time via Realtime event
12. **Multi-round test:** Do 3+ rounds of back-and-forth countering, verify each round works
13. **Repeat** steps 1-12 with Brand account to confirm both business types work
14. **Check** Chrome DevTools console for errors at each step
15. **Check** desktop and mobile layouts at each step
