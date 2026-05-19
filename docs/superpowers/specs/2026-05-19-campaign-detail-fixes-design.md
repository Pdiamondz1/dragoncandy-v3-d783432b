# Campaign Detail Page Fixes

> Three UX issues on the campaign detail page (reviews, social posting, creator
> stats) plus a backend bug in payment event tracking. Scoped as a single body
> of work, separate from the fixed-price negotiation spec.

## Problem

1. **Reviews are unbounded.** The "Leave a Review" button always appears on
   completed campaigns. The `hasReviewed` prop exists on `CampaignStatusBanner`
   but is never passed. `useProjectCompletion` already computes `can_review`
   but the value is unused. Users can submit multiple reviews per campaign.

2. **Social media posting is invisible.** Outstand.so infrastructure exists
   (edge functions auto-draft posts with AI captions, `CrossPostPrompt` and
   `SponsorshipAmplificationPrompt` components are built) but none of it is
   wired into the campaign deliverables section. Only "Download All" exists.

3. **Creator stats show $0.** The `release-creator-payout` edge function writes
   `payment_released` events with `actor_id` set to the business user who
   approved payment, not the creator who earned it. `useCreatorEarnings` queries
   `WHERE actor_id = creator_id` and finds nothing.

4. **Redundant badge.** The "MY CAMPAIGNS" page title shows a total count badge
   that duplicates the per-tab counts (Applied/Active/Done).

## Solution

### Fix 1: One Review Per Counterparty

Each campaign has one Restaurant, one Creator, and optionally one Brand. Each
party reviews each counterparty exactly once:

- **Standard campaign:** Restaurant reviews Creator, Creator reviews Restaurant.
- **Sponsored campaign:** Additionally, Restaurant reviews Brand and vice versa.

After a review is submitted, the button is replaced by a read-only summary
showing the star rating and review text. A pre-insert check in `useSubmitRating`
acts as a safety net alongside the existing DB UNIQUE constraint.

#### Files to modify

| File | Change |
|------|--------|
| `src/hooks/useHasReviewedCollaboration.ts` | New hook. Queries `project_reviews` for existing review by `(collaboration_id, reviewer_id)`. Returns boolean. Note: DB UNIQUE constraint is on `(collaboration_id, reviewer_id, reviewee_id)` — the hook query by `(collaboration_id, reviewer_id)` is sufficient because each party reviews the other party (one reviewee per reviewer per collaboration). |
| `src/pages/CampaignDetailsPage.tsx` | Consume `useHasReviewedCollaboration`, pass `hasReviewed` to `CampaignStatusBanner` and `ProgressTimeline`. Guard `RatingModal` render with `!hasReviewed`. |
| `src/components/campaigns/detail/ProgressTimeline.tsx` | Add `hasReviewed` prop. When review step is current and `hasReviewed` is true, show "Review Submitted" with star icon instead of button. |
| `src/components/campaigns/detail/SponsorshipCard.tsx` | Add inline review check query. Show read-only rating when review exists, hide "Leave Review" button. |
| `src/hooks/useSubmitRating.ts` | Pre-insert check: query for existing review by `(collaboration_id OR sponsorship_id, reviewer_id)` before insertion. Throw descriptive error if duplicate. Add `['has-reviewed-collaboration']` to cache invalidation on success. |
| New migration SQL | Add UNIQUE constraint on `(sponsorship_id, reviewer_id, reviewee_id)` to match the existing collaboration constraint. Currently sponsorship reviews have no DB-level duplicate protection. |

#### State transitions

```
Campaign not completed  → no review UI shown
Campaign completed, not reviewed  → "Leave a Review" button
Campaign completed, reviewed  → read-only card: star rating + review text
```

### Fix 2: Social Media Posting in Deliverables

Add a "Share" button next to "Download All" in the deliverables section. Only
visible after full campaign completion (payment released + content approved).

When clicked:
- **If user has connected Outstand accounts:** Opens `CrossPostPrompt`
  (Restaurant/Creator) or `SponsorshipAmplificationPrompt` (Brand) as a modal.
  These components already handle platform selection, AI-generated caption
  preview, caption editing, and post-now vs. schedule.
- **If no accounts connected:** The components already show an amber warning
  with guidance to connect accounts.

#### Files to modify

| File | Change |
|------|--------|
| `src/components/campaigns/detail/DeliverablesArchive.tsx` | Add "Share" button (Share2 icon, pink outline pill). Add `showShareModal` state. Render `CrossPostPrompt` or `SponsorshipAmplificationPrompt` based on `userRole` prop. Compute `mediaPublicUrls` from approved files. Layout: buttons side-by-side on desktop (`flex-col sm:flex-row`), stacked on mobile. |
| `src/pages/CampaignDetailsPage.tsx` | Pass new props to `DeliverablesArchive`: `campaignTitle`, `creatorName`, `userRole`. |

#### New props on DeliverablesArchive

```typescript
interface DeliverablesArchiveProps {
  campaignId: string;
  collaborationId: string;
  campaignTitle?: string;
  creatorName?: string;
  restaurantName?: string;
  userRole?: 'business' | 'creator' | 'brand';
}
```

#### Prop sourcing

- `originalCaption`: Default to `campaign.description ?? ''` for both prompt
  components. The AI caption generator uses this as a seed.
- `restaurantName`: From the business profile on the campaign. Required by
  `SponsorshipAmplificationPrompt`.
- `creatorName`: From the creator profile on the collaboration.

#### Button design

- Label: "Share" (short, with Share2 icon)
- Style: outline pill, pink accent border + text (`border-dc-pink-accent text-dc-pink-accent`)
- Layout: `flex-1` alongside "Download All" on desktop, `w-full` stacked on mobile

### Fix 3: Creator Earnings (Payment Events)

#### Root cause

In `release-creator-payout/index.ts`:
- `payment_released` event sets `actor_id: callerId` (business user) instead of
  the creator's user ID
- `payout_pending_wallet` event sets no `actor_id` at all

#### Edge function fix

In `release-creator-payout/index.ts`, change both events to use
`collaboration.creator_id` as `actor_id` and `'creator'` as `actor_role`. Keep
other events (e.g., `content_approved`, `transfer_created`) unchanged since they
correctly represent the business or system actor.

#### Hook rewrite

Rewrite `useCreatorEarnings` to query by collaboration membership instead of
`actor_id`. This is more reliable because it ties earnings to the creator's
actual collaborations regardless of how events were tagged.

1. Fetch the creator's collaborations from `campaign_collaborations`
2. Query `payment_released` / `payout_pending_wallet` events by `entity_id IN (collab_ids)`
3. Query `escrow_held` events by the `campaign_id` column (NOT `entity_id` —
   note that `escrow_held` events store the campaign ID in `entity_id` despite
   `entity_type = 'collaboration'`, but the `campaign_id` column is the
   reliable join key). Exclude campaigns that already have release events to
   avoid double-counting.
4. Keep the `check-creator-payout-status` call for the available balance

#### Data migration

A one-time SQL migration updates existing `payment_released` and
`payout_pending_wallet` records to set `actor_id = creator_id` (joined via
`campaign_collaborations`). The UPDATE is idempotent (WHERE clause skips
already-correct rows).

```sql
UPDATE payment_events pe
SET actor_id = cc.creator_id, actor_role = 'creator'
FROM campaign_collaborations cc
WHERE pe.entity_id = cc.id
  AND pe.entity_type = 'collaboration'
  AND pe.event_type IN ('payment_released', 'payout_pending_wallet')
  AND (pe.actor_id IS NULL OR pe.actor_id != cc.creator_id);
```

#### Files to modify

| File | Change |
|------|--------|
| `supabase/functions/release-creator-payout/index.ts` | Change `actor_id` from `callerId` to `collaboration.creator_id` for `payment_released` and `payout_pending_wallet` events. |
| `src/hooks/useCreatorEarnings.ts` | Rewrite to query by collaboration membership. |
| New migration SQL | Fix existing records. |

### Fix 4: Remove Badge

Delete the `totalCount` calculation and badge `<span>` from `MyCampaignsPage.tsx`
(lines 44, 57-61). The per-tab counts already show the breakdown.

| File | Change |
|------|--------|
| `src/pages/MyCampaignsPage.tsx` | Remove `totalCount` variable and badge render. |

## Implementation Order

1. **Fix 3** (backend-first): edge function fix → migration → hook rewrite
2. **Fix 4** (trivial): badge removal in same file touch as Fix 3
3. **Fix 1** (frontend): new hook → wire to pages → safety net in mutation
4. **Fix 2** (frontend): add Share button + modal wiring

## Verification

### Fix 1 (Reviews)
1. Load completed campaign as Restaurant — "Leave a Review" button visible
2. Submit review — button replaced by read-only star rating + text
3. Reload page — review summary persists, no button
4. Attempt duplicate via API — DB constraint rejects
5. Load completed sponsored campaign as Brand — same behavior on SponsorshipCard

### Fix 2 (Social)
1. Complete a campaign through payment release
2. "Share" button appears next to "Download All"
3. Click Share with connected accounts — CrossPostPrompt opens with AI caption
4. Click Share without connected accounts — amber warning shown
5. Verify desktop layout: buttons side-by-side
6. Verify mobile layout: buttons stacked full-width

### Fix 3 (Stats)
1. Run migration on database
2. Creator's "MY CAMPAIGNS" shows correct earnings (not $0)
3. Campaign with escrow held shows in "In Escrow"
4. Completed campaign shows in "Earned", not double-counted
5. New campaign completion writes correct `actor_id`

### Fix 4 (Badge)
1. Creator's "MY CAMPAIGNS" title has no badge
2. Tab counts still display correctly

## Out of Scope

- Fixed-price negotiation system (separate spec)
- Auto-pilot mode (auto-publish without review)
- EarningsSummary hardcoded hex values (flag for follow-up)
- Brand sidebar "Social Media" nav item (currently missing from `brandSidebarNav`)
