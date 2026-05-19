# Campaign Detail Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four campaign detail page issues: creator earnings showing $0, redundant badge on MY CAMPAIGNS, reviews repeatable instead of one-per-counterparty, and no social media posting option in deliverables.

**Architecture:** Backend-first (fix payment event actor_id + migration), then frontend review wiring (new hook + prop threading), then social Share button (surface existing Outstand components in deliverables section).

**Tech Stack:** React 18 + TypeScript, Supabase (Postgres + Edge Functions), React Query, Tailwind CSS, Outstand.so SDK

**Spec:** `docs/superpowers/specs/2026-05-19-campaign-detail-fixes-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/functions/release-creator-payout/index.ts` | Modify | Fix `actor_id` on payment events |
| `supabase/migrations/*_fix_creator_payment_events.sql` | Create | Backfill existing records + add sponsorship review constraint |
| `src/hooks/useCreatorEarnings.ts` | Rewrite | Query by collaboration membership instead of actor_id |
| `src/pages/MyCampaignsPage.tsx` | Modify | Remove redundant badge |
| `src/hooks/useHasReviewedCollaboration.ts` | Create | Check if user already reviewed a collaboration |
| `src/pages/CampaignDetailsPage.tsx` | Modify | Wire review hook + pass social props to DeliverablesArchive |
| `src/components/campaigns/detail/ProgressTimeline.tsx` | Modify | Add `hasReviewed` prop, show "Review Submitted" state |
| `src/components/campaigns/detail/SponsorshipCard.tsx` | Modify | Add review check, hide button when already reviewed |
| `src/hooks/useSubmitRating.ts` | Modify | Pre-insert duplicate check + cache invalidation |
| `src/components/campaigns/detail/DeliverablesArchive.tsx` | Modify | Add Share button + social prompt modal |

---

### Task 1: Fix payment event actor_id in edge function

**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts:151-160,228-236`

- [ ] **Step 1: Fix `payment_released` event actor_id (Stripe transfer path)**

In `supabase/functions/release-creator-payout/index.ts`, change lines 151-160 from:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'payment_released',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: campaign.id,
      actor_id: callerId ?? undefined,
      actor_role: 'business',
      amount_cents: Math.round(creatorPayout * 100),
      stripe_id: transfer.id,
    }, '[RELEASE-CREATOR-PAYOUT]');
```

to:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'payment_released',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: campaign.id,
      actor_id: collaboration.creator_id,
      actor_role: 'creator',
      amount_cents: Math.round(creatorPayout * 100),
      stripe_id: transfer.id,
    }, '[RELEASE-CREATOR-PAYOUT]');
```

- [ ] **Step 2: Fix `payout_pending_wallet` event actor_id (pending balance path)**

In the same file, change lines 228-236 from:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'payout_pending_wallet',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: campaign.id,
      actor_role: 'system',
      amount_cents: Math.round(creatorPayout * 100),
      metadata: { reason: 'Creator Stripe onboarding incomplete' },
    }, '[RELEASE-CREATOR-PAYOUT]');
```

to:

```typescript
    await writePaymentEvent(supabaseClient, {
      event_type: 'payout_pending_wallet',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: campaign.id,
      actor_id: collaboration.creator_id,
      actor_role: 'creator',
      amount_cents: Math.round(creatorPayout * 100),
      metadata: { reason: 'Creator Stripe onboarding incomplete' },
    }, '[RELEASE-CREATOR-PAYOUT]');
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/release-creator-payout/index.ts
git commit -m "fix: set creator as actor_id on payment_released and payout_pending_wallet events"
```

---

### Task 2: SQL migration to backfill existing records + add sponsorship review constraint

**Files:**
- Create: `supabase/migrations/20260519120000_fix_creator_payment_events.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260519120000_fix_creator_payment_events.sql`:

```sql
-- Fix existing payment_released events: actor_id should be the creator, not the business
UPDATE payment_events pe
SET actor_id = cc.creator_id,
    actor_role = 'creator'
FROM campaign_collaborations cc
WHERE pe.entity_id = cc.id
  AND pe.entity_type = 'collaboration'
  AND pe.event_type = 'payment_released'
  AND (pe.actor_id IS NULL OR pe.actor_id != cc.creator_id);

-- Fix existing payout_pending_wallet events: set actor_id to creator
UPDATE payment_events pe
SET actor_id = cc.creator_id,
    actor_role = 'creator'
FROM campaign_collaborations cc
WHERE pe.entity_id = cc.id
  AND pe.entity_type = 'collaboration'
  AND pe.event_type = 'payout_pending_wallet'
  AND (pe.actor_id IS NULL OR pe.actor_id != cc.creator_id);

-- Add UNIQUE constraint for sponsorship reviews (matches existing collaboration review constraint)
ALTER TABLE project_reviews
ADD CONSTRAINT project_reviews_sponsorship_reviewer_reviewee_unique
UNIQUE (sponsorship_id, reviewer_id, reviewee_id);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` to apply the migration.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260519120000_fix_creator_payment_events.sql
git commit -m "fix: backfill creator actor_id on payment events + add sponsorship review unique constraint"
```

---

### Task 3: Rewrite useCreatorEarnings hook

**Files:**
- Modify: `src/hooks/useCreatorEarnings.ts`

- [ ] **Step 1: Rewrite the hook to query by collaboration membership**

Replace the entire contents of `src/hooks/useCreatorEarnings.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CreatorEarningsSummary {
  totalEarned: number;
  inEscrow: number;
  available: number;
  onboardingComplete: boolean;
}

export function useCreatorEarnings(userId: string | undefined) {
  return useQuery<CreatorEarningsSummary>({
    queryKey: ['creator-earnings-summary', userId],
    queryFn: async () => {
      const { data: collabs } = await supabase
        .from('campaign_collaborations')
        .select('id, campaign_id')
        .eq('creator_id', userId!);

      const collabIds = (collabs ?? []).map(c => c.id);
      const campaignIds = (collabs ?? []).map(c => c.campaign_id);

      if (collabIds.length === 0) {
        const payoutStatus = await supabase.functions.invoke('check-creator-payout-status');
        return {
          totalEarned: 0,
          inEscrow: 0,
          available: payoutStatus.data?.platformPendingBalance ?? 0,
          onboardingComplete: payoutStatus.data?.onboardingComplete ?? false,
        };
      }

      const [earnedResult, escrowResult, releasedResult, payoutStatusResult] = await Promise.all([
        supabase
          .from('payment_events')
          .select('amount_cents')
          .in('entity_id', collabIds)
          .eq('entity_type', 'collaboration')
          .in('event_type', ['payment_released', 'payout_pending_wallet']),
        supabase
          .from('payment_events')
          .select('amount_cents, campaign_id')
          .in('campaign_id', campaignIds)
          .eq('event_type', 'escrow_held'),
        supabase
          .from('payment_events')
          .select('campaign_id')
          .in('campaign_id', campaignIds)
          .in('event_type', ['payment_released', 'payout_pending_wallet']),
        supabase.functions.invoke('check-creator-payout-status'),
      ]);

      const releasedCampaignIds = new Set(
        (releasedResult.data ?? []).map(e => e.campaign_id)
      );

      const totalEarned = (earnedResult.data ?? []).reduce(
        (sum, e) => sum + (e.amount_cents ?? 0), 0
      ) / 100;

      const inEscrow = (escrowResult.data ?? [])
        .filter(e => !releasedCampaignIds.has(e.campaign_id))
        .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0) / 100;

      const payoutStatus = payoutStatusResult.data;

      return {
        totalEarned,
        inEscrow,
        available: payoutStatus?.platformPendingBalance ?? 0,
        onboardingComplete: payoutStatus?.onboardingComplete ?? false,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors related to `useCreatorEarnings`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreatorEarnings.ts
git commit -m "fix: rewrite useCreatorEarnings to query by collaboration membership"
```

---

### Task 4: Remove redundant badge from MY CAMPAIGNS

**Files:**
- Modify: `src/pages/MyCampaignsPage.tsx:44,57-61`

- [ ] **Step 1: Remove totalCount and badge**

In `src/pages/MyCampaignsPage.tsx`, delete line 44:

```typescript
  const totalCount = pendingApps.length + activeCollabs.length + completedCollabs.length;
```

And delete lines 57-61 (the badge span inside the title div):

```typescript
          {totalCount > 0 && (
            <span className="bg-dc-teal text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {totalCount}
            </span>
          )}
```

The `<div>` on line 55 with `flex items-center justify-between` can be simplified to just hold the `<h1>`, or kept as-is (no visual difference when badge is gone).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyCampaignsPage.tsx
git commit -m "fix: remove redundant campaign count badge from MY CAMPAIGNS title"
```

---

### Task 5: Create useHasReviewedCollaboration hook

**Files:**
- Create: `src/hooks/useHasReviewedCollaboration.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useHasReviewedCollaboration.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useHasReviewedCollaboration(
  collaborationId: string | undefined,
  reviewerId: string | undefined,
) {
  return useQuery({
    queryKey: ['has-reviewed-collaboration', collaborationId, reviewerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_reviews')
        .select('id, rating, review_text')
        .eq('collaboration_id', collaborationId!)
        .eq('reviewer_id', reviewerId!)
        .maybeSingle();
      return data;
    },
    enabled: !!collaborationId && !!reviewerId,
    staleTime: 2 * 60 * 1000,
  });
}
```

Returns the review record (with `id`, `rating`, `review_text`) or `null`. Callers use `!!data` for boolean checks and `data.rating` for display.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useHasReviewedCollaboration.ts
git commit -m "feat: add useHasReviewedCollaboration hook for review-once enforcement"
```

---

### Task 6: Wire review state to CampaignDetailsPage + ProgressTimeline

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx:39,438-467,474-487,558-567`
- Modify: `src/components/campaigns/detail/ProgressTimeline.tsx:1-84`

- [ ] **Step 1: Import and use the hook in CampaignDetailsPage**

In `src/pages/CampaignDetailsPage.tsx`, add import after line 39 (after `RatingModal` import):

```typescript
import { useHasReviewedCollaboration } from '@/hooks/useHasReviewedCollaboration';
```

After line 401 (`const currentStep = ...`), add:

```typescript
  const { data: existingReview } = useHasReviewedCollaboration(
    collaborationData?.id,
    user?.id,
  );
  const hasReviewed = !!existingReview;
```

- [ ] **Step 2: Pass hasReviewed to CampaignStatusBanner**

In the `<CampaignStatusBanner>` render (lines 438-467), add the `hasReviewed` prop after `creatorName`:

```typescript
        <CampaignStatusBanner
          campaign={campaign}
          phase={phase}
          currentStep={currentStep}
          applicationCount={applicationCount}
          creatorName={creatorData?.creator_name}
          hasReviewed={hasReviewed}
          isLoading={false}
          // ... rest of props unchanged
```

- [ ] **Step 3: Pass hasReviewed to ProgressTimeline**

In the `<ProgressTimeline>` render (lines 474-487), add the `hasReviewed` prop:

```typescript
            {phase !== 'cancelled' && currentStep && (
              <ProgressTimeline
                currentStep={currentStep}
                phase={phase}
                hasReviewed={hasReviewed}
                onLeaveReview={() => setShowRatingModal(true)}
                onMarkComplete={() => {
                  // ... unchanged
                }}
              />
            )}
```

- [ ] **Step 4: Guard RatingModal with !hasReviewed**

Change line 558 from:

```typescript
      {showRatingModal && collaborationData && creatorData && (
```

to:

```typescript
      {showRatingModal && collaborationData && creatorData && !hasReviewed && (
```

- [ ] **Step 5: Update ProgressTimeline to accept and use hasReviewed**

In `src/components/campaigns/detail/ProgressTimeline.tsx`, add `Star` to imports:

```typescript
import { Star } from 'lucide-react';
```

Update the interface (line 10):

```typescript
interface ProgressTimelineProps {
  currentStep: ProjectStep | null;
  phase: CampaignPhase;
  hasReviewed?: boolean;
  onLeaveReview: () => void;
  onMarkComplete: () => void;
}
```

Update the destructuring (line 17):

```typescript
export const ProgressTimeline: React.FC<ProgressTimelineProps> = ({
  currentStep,
  phase,
  hasReviewed,
  onLeaveReview,
  onMarkComplete,
}) => {
```

Replace lines 58-66 (the review button block):

```typescript
                {isCurrent && step.key === 'review_left' && !hasReviewed && (
                  <Button
                    onClick={onLeaveReview}
                    size="sm"
                    className="mt-1.5 rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold text-xs h-7"
                  >
                    Leave a Review →
                  </Button>
                )}

                {isCurrent && step.key === 'review_left' && hasReviewed && (
                  <span className="inline-flex items-center gap-1 text-xs text-dc-teal font-semibold mt-1.5">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    Review Submitted
                  </span>
                )}
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx src/components/campaigns/detail/ProgressTimeline.tsx
git commit -m "fix: wire hasReviewed to CampaignStatusBanner and ProgressTimeline"
```

---

### Task 7: Add review check to SponsorshipCard

**Files:**
- Modify: `src/components/campaigns/detail/SponsorshipCard.tsx`

- [ ] **Step 1: Add review check query and conditional rendering**

In `src/components/campaigns/detail/SponsorshipCard.tsx`, add imports:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
```

Inside the component, after line 19 (`const [ratingModal, setRatingModal] = useState(false);`), add:

```typescript
  const { user } = useAuth();

  const { data: existingSponsorshipReview } = useQuery({
    queryKey: ['sponsorship-review-check', sponsorship?.id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_reviews')
        .select('id, rating')
        .eq('sponsorship_id', sponsorship!.id)
        .eq('reviewer_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!sponsorship?.id && !!user?.id && isCompleted,
  });
```

Replace lines 137-146 (the review button block):

```typescript
            {isCompleted && !existingSponsorshipReview && (
              <Button
                size="sm"
                className="rounded-full bg-pink-500 hover:bg-pink-600 text-white flex-1"
                onClick={() => setRatingModal(true)}
              >
                <Star className="h-3 w-3 mr-1" />
                Leave Review
              </Button>
            )}
            {isCompleted && existingSponsorshipReview && (
              <span className="inline-flex items-center gap-1 text-xs text-dc-teal font-semibold flex-1 justify-center">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                {existingSponsorshipReview.rating}/5 — Review Submitted
              </span>
            )}
```

Also guard the `ResponsiveRatingModal` render at line 151:

```typescript
      {ratingModal && sponsorship.brand_profile && !existingSponsorshipReview && (
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/detail/SponsorshipCard.tsx
git commit -m "fix: hide Leave Review button on SponsorshipCard when already reviewed"
```

---

### Task 8: Add pre-insert safety check to useSubmitRating

**Files:**
- Modify: `src/hooks/useSubmitRating.ts:10-34,36-41`

- [ ] **Step 1: Add duplicate check before insert**

In `src/hooks/useSubmitRating.ts`, replace the `mutationFn` (lines 10-34) with:

```typescript
    mutationFn: async (reviewData: CreateReviewData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (reviewData.collaboration_id) {
        const { data: existing } = await supabase
          .from('project_reviews')
          .select('id')
          .eq('collaboration_id', reviewData.collaboration_id)
          .eq('reviewer_id', user.id)
          .maybeSingle();
        if (existing) throw new Error('You have already submitted a review for this collaboration.');
      }

      if (reviewData.sponsorship_id) {
        const { data: existing } = await supabase
          .from('project_reviews')
          .select('id')
          .eq('sponsorship_id', reviewData.sponsorship_id)
          .eq('reviewer_id', user.id)
          .maybeSingle();
        if (existing) throw new Error('You have already submitted a review for this sponsorship.');
      }

      const { data, error } = await supabase
        .from('project_reviews')
        .insert({
          ...reviewData,
          reviewer_id: user.id,
        })
        .select('id, collaboration_id, sponsorship_id, reviewer_id, reviewee_id, rating, review_text, created_at')
        .single();

      if (error) throw error;

      if (reviewData.sponsorship_id) {
        await updateSponsorshipReviewStatus(reviewData.sponsorship_id, user.id);
      } else if (reviewData.collaboration_id) {
        await updateCollaborationReviewStatus(reviewData.collaboration_id, user.id);
      }

      return data;
    },
```

- [ ] **Step 2: Add cache invalidation for review check queries**

In the `onSuccess` handler (lines 36-45), add two more invalidations:

```typescript
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-completion'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-completion'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-review-completion'] });
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['profile-ratings'] });
      queryClient.invalidateQueries({ queryKey: ['has-reviewed-collaboration'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-review-check'] });
      toast({
        title: "Review submitted successfully",
        description: "Thank you for your feedback!",
      });
    },
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSubmitRating.ts
git commit -m "fix: add pre-insert duplicate check and cache invalidation to useSubmitRating"
```

---

### Task 9: Add Share button to DeliverablesArchive

**Files:**
- Modify: `src/components/campaigns/detail/DeliverablesArchive.tsx`

- [ ] **Step 1: Extend the component interface and add Share state**

In `src/components/campaigns/detail/DeliverablesArchive.tsx`, add imports:

```typescript
import { Download, FileText, Loader2, Play, Share2 } from 'lucide-react';
import { CrossPostPrompt } from '@/components/outstand/CrossPostPrompt';
import { SponsorshipAmplificationPrompt } from '@/components/outstand/SponsorshipAmplificationPrompt';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
```

(Replace the existing `lucide-react` import to add `Share2`.)

Update the interface (lines 11-14):

```typescript
interface DeliverablesArchiveProps {
  campaignId: string;
  collaborationId: string;
  campaignTitle?: string;
  campaignDescription?: string;
  creatorName?: string;
  restaurantName?: string;
  userRole?: 'business' | 'creator' | 'brand';
}
```

Update the destructuring (lines 16-19):

```typescript
export const DeliverablesArchive: React.FC<DeliverablesArchiveProps> = ({
  campaignId,
  collaborationId,
  campaignTitle,
  campaignDescription,
  creatorName,
  restaurantName,
  userRole,
}) => {
```

Add state after `selectedFileIndex` (line 24):

```typescript
  const [showShareModal, setShowShareModal] = useState(false);
```

- [ ] **Step 2: Compute media URLs and add Share button + modal**

After the `downloadAll` function (line 69), add:

```typescript
  const mediaPublicUrls = (files ?? [])
    .filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'))
    .map(f => supabase.storage.from(f.bucket_name).getPublicUrl(f.file_path).data.publicUrl);
```

Replace the "Download All" button block (lines 148-159) with a two-button layout:

```typescript
          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={downloadAll}
              disabled={downloadingAll}
              className="flex-1 rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold"
            >
              {downloadingAll ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Downloading…</>
              ) : (
                <><Download className="h-4 w-4 mr-2" />Download All ({files.length})</>
              )}
            </Button>
            <Button
              onClick={() => setShowShareModal(true)}
              variant="outline"
              className="flex-1 rounded-full border-dc-pink-accent text-dc-pink-accent hover:bg-pink-50 font-semibold"
            >
              <Share2 className="h-4 w-4 mr-2" />Share
            </Button>
          </div>
```

After the `WatermarkedLightbox` closing tag (line 168), before the closing `</>`, add:

```typescript
          {/* Social posting modal */}
          {showShareModal && (
            <DragonCandyOutstandProvider>
              {userRole === 'brand' ? (
                <SponsorshipAmplificationPrompt
                  open={showShareModal}
                  onOpenChange={setShowShareModal}
                  campaignId={campaignId}
                  campaignTitle={campaignTitle ?? ''}
                  restaurantName={restaurantName ?? ''}
                  creatorName={creatorName ?? null}
                  mediaUrls={mediaPublicUrls}
                  originalCaption={campaignDescription ?? ''}
                />
              ) : (
                <CrossPostPrompt
                  open={showShareModal}
                  onOpenChange={setShowShareModal}
                  campaignId={campaignId}
                  campaignTitle={campaignTitle ?? ''}
                  creatorName={creatorName ?? ''}
                  mediaUrls={mediaPublicUrls}
                  originalCaption={campaignDescription ?? ''}
                />
              )}
            </DragonCandyOutstandProvider>
          )}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/detail/DeliverablesArchive.tsx
git commit -m "feat: add Share button to deliverables for social media posting"
```

---

### Task 10: Pass new props to DeliverablesArchive from CampaignDetailsPage

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx:533-536`

- [ ] **Step 1: Pass new props**

In `src/pages/CampaignDetailsPage.tsx`, change the `DeliverablesArchive` render (lines 533-536) from:

```typescript
                  <DeliverablesArchive
                    campaignId={campaign.id}
                    collaborationId={collaborationData.id}
                  />
```

to:

```typescript
                  <DeliverablesArchive
                    campaignId={campaign.id}
                    collaborationId={collaborationData.id}
                    campaignTitle={campaign.title}
                    campaignDescription={campaign.description}
                    creatorName={creatorData?.creator_name}
                    restaurantName={businessName}
                    userRole="business"
                  />
```

The `businessName` variable is already defined on line 96-98 from `enrichedDetail?.businessProfile?.business_name`.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: pass campaign context props to DeliverablesArchive for social sharing"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No new lint errors (only pre-existing warnings).

- [ ] **Step 4: Browser verification — Creator stats**

Log in as Creator (damewillie@gmail.com / Pdi@mondz1). Navigate to MY CAMPAIGNS. Verify:
- Earnings show real values (not all $0) if payment events exist
- No badge next to "MY CAMPAIGNS" title
- Tab counts (Applied/Active/Done) still display correctly

- [ ] **Step 5: Browser verification — Reviews**

Log in as Restaurant (dwilliams@harbormill.net / Pdi@mondz1). Open completed campaign "Opening Night Takeover". Verify:
- If not yet reviewed: "Leave a Review" button visible in status banner
- Submit review — button replaced by "Review Submitted" in ProgressTimeline
- Reload page — review state persists, no review button shown
- If sponsored: SponsorshipCard shows same one-review behavior

- [ ] **Step 6: Browser verification — Social Share**

On same completed campaign, verify:
- "Share" button appears next to "Download All" in deliverables section
- Click "Share" — CrossPostPrompt modal opens
- Desktop layout: buttons side by side
- Mobile layout: buttons stacked

- [ ] **Step 7: Check console for errors**

Open Chrome DevTools. Check for console errors on each page visited above. Fix any new errors before finalizing.
