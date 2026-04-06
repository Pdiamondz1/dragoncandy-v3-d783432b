# Creator Campaign Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill 5 gaps in the creator campaign experience: portfolio attachment, active/done tabs, footage download, and business profile link.

**Architecture:** Extend existing React Query hooks and campaign components. One new hook (`useCreatorCollaborations`) queries the existing `campaign_collaborations` table. Two new card components render active and completed campaigns. All other changes are edits to existing files. One DB migration adds a `portfolio_url` column.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Supabase (Postgres + Storage), TanStack React Query, Vite

**Spec:** `docs/superpowers/specs/2026-04-06-creator-campaign-gaps-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260406000000_add_portfolio_url.sql` | Create | DB migration — add `portfolio_url text` to `campaign_applications` |
| `src/hooks/useCreateApplication.ts` | Modify | Add `portfolioUrl` param to mutation input + `.insert()` |
| `src/components/campaigns/CampaignApplyForm.tsx` | Modify | Portfolio thumbnail picker + URL input UI |
| `src/hooks/useCreatorCollaborations.ts` | Create | Query `campaign_collaborations` joined with campaigns + business profiles |
| `src/components/campaigns/ActiveCampaignCard.tsx` | Create | Card for active collaborations with deadline, progress, upload CTA |
| `src/components/campaigns/CompletedCampaignCard.tsx` | Create | Card for completed collaborations with review state |
| `src/hooks/useCreateReview.ts` | Create | Mutation to insert into `project_reviews` |
| `src/pages/CreatorCampaignMarketplace.tsx` | Modify | Enable Active/Done tabs, wire hooks, fix self-ref bug on line 59 |
| `src/components/campaigns/CampaignDetailModal.tsx` | Modify | Conditional footage download + business profile link |
| `src/hooks/usePublicCampaigns.ts` | Modify | Add `profile_slug` to business_profile select + type |
| `src/hooks/useCreatorApplications.ts` | Modify | Add `profile_slug` to business profile select + type (for Applied tab) |

---

## Task 0: Fix pre-existing bug in CreatorCampaignMarketplace

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx:59`

- [ ] **Step 1: Fix the self-referencing assignment**

Open `src/pages/CreatorCampaignMarketplace.tsx`. Line 59 reads:

```typescript
const availableFilteredCount = availableFilteredCount;
```

This is a self-referencing assignment that causes a runtime error. It needs to be computed from the actual data. Delete this line entirely — the count will be computed later.

After the `swipeCampaigns` array is built (after line 70), add:

```typescript
const availableFilteredCount = swipeCampaigns.length;
```

This reflects the number of campaigns currently available to swipe through (including Donny picks, excluding already-applied and skipped).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (this line was likely causing a build failure or runtime crash)

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "fix: self-referencing availableFilteredCount in CreatorCampaignMarketplace"
```

---

## Task 1: DB Migration — add `portfolio_url` to applications

**Files:**
- Create: `supabase/migrations/20260406000000_add_portfolio_url.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add portfolio sample URL to campaign applications
ALTER TABLE campaign_applications
ADD COLUMN portfolio_url text;

-- Add a comment for documentation
COMMENT ON COLUMN campaign_applications.portfolio_url IS 'URL to portfolio sample attached by creator when applying';
```

- [ ] **Step 2: Update Supabase TypeScript types**

After applying the migration to the remote database (or for local dev), regenerate types:

```bash
npx supabase gen types typescript --project-id zocahiffooqdybdhguqv > src/integrations/supabase/types.ts
```

If the Supabase CLI is not available or the migration hasn't been pushed yet, manually add `portfolio_url` to the `campaign_applications` type in `src/integrations/supabase/types.ts`:
- In the `Row` type: add `portfolio_url: string | null`
- In the `Insert` type: add `portfolio_url?: string | null`
- In the `Update` type: add `portfolio_url?: string | null`

This is required for Task 2's `.insert()` call to compile without TypeScript errors.

- [ ] **Step 3: Verify migration syntax**

Run: `npx supabase db push --dry-run` (if Supabase CLI is available) or verify file is valid SQL.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260406000000_add_portfolio_url.sql src/integrations/supabase/types.ts
git commit -m "migration: add portfolio_url column to campaign_applications"
```

---

## Task 2: Wire `portfolioUrl` into `useCreateApplication`

**Files:**
- Modify: `src/hooks/useCreateApplication.ts:14-48`

- [ ] **Step 1: Add `portfolioUrl` to mutation input type**

In `src/hooks/useCreateApplication.ts`, at lines 14-28 (the `mutationFn` destructured params), the type already has `portfolioFiles` and `relevantExperience` (unused). Add `portfolioUrl`:

Replace the mutation input type (lines 14-28):

```typescript
    mutationFn: async ({
      campaignId,
      introMessage,
      proposedTimeline,
      proposedRate,
      portfolioUrl,
    }: {
      campaignId: string;
      introMessage: string;
      proposedTimeline?: string;
      proposedRate?: number;
      portfolioUrl?: string;
    }) => {
```

Remove the unused `portfolioFiles` and `relevantExperience` params and their console.log references.

- [ ] **Step 2: Add `portfolio_url` to the `.insert()` call**

At lines 40-48, add `portfolio_url` to the insert object:

```typescript
      const { data, error } = await supabase
        .from('campaign_applications')
        .insert({
          campaign_id: campaignId,
          creator_id: user!.id,
          intro_message: introMessage,
          proposed_timeline: proposedTimeline,
          proposed_rate: proposedRate,
          portfolio_url: portfolioUrl,
        })
        .select()
        .single();
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCreateApplication.ts
git commit -m "feat: add portfolioUrl to campaign application mutation"
```

---

## Task 3: Portfolio attachment UI in `CampaignApplyForm`

**Files:**
- Modify: `src/components/campaigns/CampaignApplyForm.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `CampaignApplyForm.tsx`, add imports:

```typescript
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
```

Inside the component function, after the existing state declarations (around line 55-57), add:

```typescript
  const { user } = useAuth();
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [selectedThumbIndex, setSelectedThumbIndex] = useState<number | null>(null);

  // Fetch creator's portfolio URLs and convert storage paths to public URLs
  const { data: portfolioThumbnails = [] } = useQuery({
    queryKey: ['creator-portfolio-urls', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: profile } = await supabase
        .from('creator_profiles')
        .select('portfolio_urls')
        .eq('user_id', user.id)
        .single();

      if (!profile?.portfolio_urls?.length) return [];

      return Promise.all(
        profile.portfolio_urls.map(async (path: string) => {
          if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
          }
          const { data } = supabase.storage
            .from('profile-assets')
            .getPublicUrl(path);
          return data.publicUrl;
        })
      );
    },
    enabled: !!user?.id,
  });
```

- [ ] **Step 2: Pass `portfolioUrl` to the mutation**

In the `handleSubmit` function (around line 66), add `portfolioUrl` to the `createApplication.mutateAsync` call:

```typescript
      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage: pitch || '',
        proposedTimeline: getISODate(selectedDate),
        proposedRate: isFixedPrice ? undefined : Number(proposedRate),
        portfolioUrl: portfolioUrl || undefined,
      });
```

- [ ] **Step 3: Add portfolio section UI**

After the "Quick Pitch" section (after the closing `</div>` of the pitch section around line 175), add this new section BEFORE the DragonDash urgency warning:

```tsx
      {/* Portfolio Sample */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-700 block mb-1.5">
          📎 Attach a Sample <span className="font-normal text-gray-400">(optional)</span>
        </label>

        {/* Thumbnail selector from existing portfolio */}
        {portfolioThumbnails.length > 0 && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {portfolioThumbnails.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (selectedThumbIndex === i) {
                      setSelectedThumbIndex(null);
                      setPortfolioUrl('');
                    } else {
                      setSelectedThumbIndex(i);
                      setPortfolioUrl(url);
                    }
                  }}
                  className={`w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                    selectedThumbIndex === i
                      ? 'border-dc-teal ring-2 ring-dc-teal'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img src={url} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mb-2">— or paste a link —</p>
          </>
        )}

        {/* Custom URL input — always enabled; typing deselects any thumbnail */}
        <input
          type="url"
          value={portfolioUrl}
          onChange={(e) => {
            setPortfolioUrl(e.target.value);
            setSelectedThumbIndex(null);
          }}
          placeholder="https://your-portfolio.com/sample"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
        />
      </div>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/CampaignApplyForm.tsx
git commit -m "feat: portfolio sample attachment on campaign application form"
```

---

## Task 4: `useCreatorCollaborations` hook

**Files:**
- Create: `src/hooks/useCreatorCollaborations.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useCreatorCollaborations.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CollaborationCampaign {
  id: string;
  title: string;
  user_id: string;
  budget_min: number | null;
  budget_max: number | null;
  fixed_price: number | null;
  pricing_type: string | null;
  delivery_type: string | null;
}

export interface CollaborationBusinessProfile {
  business_name: string;
  logo_url: string | null;
  profile_slug: string | null;
}

export type DeliverableStatus = 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved';

export interface CreatorCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: 'active' | 'completed' | 'cancelled';
  content_deadline: string | null;
  content_status: string | null;
  deliverables_status: Record<string, DeliverableStatus> | null;
  revision_count: number | null;
  completed_at: string | null;
  created_at: string;
  campaign: CollaborationCampaign;
  business_profile?: CollaborationBusinessProfile;
  existing_review_id?: string;
  existing_review_rating?: number;
}

export const useCreatorCollaborations = (statusFilter: 'active' | 'completed') => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-collaborations', user?.id, statusFilter],
    queryFn: async (): Promise<CreatorCollaboration[]> => {
      if (!user?.id) throw new Error('Not authenticated');

      // Step 1: Fetch collaborations with campaign data
      const { data: collabs, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select(`
          id, campaign_id, creator_id, status, content_deadline, content_status,
          deliverables_status, revision_count, completed_at, created_at,
          campaign:campaigns!inner(id, title, user_id, budget_min, budget_max, fixed_price, pricing_type, delivery_type)
        `)
        .eq('creator_id', user.id)
        .eq('status', statusFilter)
        .order('created_at', { ascending: false });

      if (collabError) throw collabError;
      if (!collabs || collabs.length === 0) return [];

      // Step 2: Fetch business profiles for campaign owners
      const campaignUserIds = [...new Set(
        collabs
          .map(c => (c.campaign as unknown as CollaborationCampaign)?.user_id)
          .filter(Boolean)
      )];

      const { data: businessProfiles, error: profileError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, profile_slug')
        .in('user_id', campaignUserIds);

      if (profileError) throw profileError;

      const profileMap = new Map(
        (businessProfiles || []).map(p => [p.user_id, p])
      );

      // Step 3: For completed collaborations, check for existing reviews
      let reviewMap = new Map<string, string>();
      let reviewRatingMap = new Map<string, number>();
      if (statusFilter === 'completed') {
        const collabIds = collabs.map(c => c.id);
        const { data: reviews } = await supabase
          .from('project_reviews')
          .select('id, collaboration_id, rating')
          .eq('reviewer_id', user.id)
          .in('collaboration_id', collabIds);

        if (reviews) {
          reviewMap = new Map(
            reviews.map(r => [r.collaboration_id!, r.id])
          );
          reviewRatingMap = new Map(
            reviews.map(r => [r.collaboration_id!, r.rating])
          );
        }
      }

      // Step 4: Merge
      return collabs.map(collab => {
        const campaign = collab.campaign as unknown as CollaborationCampaign;
        const businessProfile = campaign ? profileMap.get(campaign.user_id) : undefined;

        return {
          id: collab.id,
          campaign_id: collab.campaign_id,
          creator_id: collab.creator_id,
          status: collab.status as CreatorCollaboration['status'],
          content_deadline: collab.content_deadline,
          content_status: collab.content_status,
          deliverables_status: collab.deliverables_status as Record<string, DeliverableStatus> | null,
          revision_count: collab.revision_count,
          completed_at: collab.completed_at,
          created_at: collab.created_at,
          campaign,
          business_profile: businessProfile ? {
            business_name: businessProfile.business_name,
            logo_url: businessProfile.logo_url,
            profile_slug: businessProfile.profile_slug,
          } : undefined,
          existing_review_id: reviewMap.get(collab.id),
          existing_review_rating: reviewRatingMap.get(collab.id),
        };
      });
    },
    enabled: !!user?.id,
  });
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. Hook compiles but isn't used yet.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreatorCollaborations.ts
git commit -m "feat: useCreatorCollaborations hook for active/completed campaigns"
```

---

## Task 5: `ActiveCampaignCard` component

**Files:**
- Create: `src/components/campaigns/ActiveCampaignCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/campaigns/ActiveCampaignCard.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { CreatorCollaboration, DeliverableStatus } from '@/hooks/useCreatorCollaborations';
import { mapDeliveryType, formatBudget } from '@/lib/campaignUtils';
import DeliveryBadge from './DeliveryBadge';

interface ActiveCampaignCardProps {
  collaboration: CreatorCollaboration;
}

function getDeadlineDisplay(deadline: string | null): { text: string; urgent: boolean; overdue: boolean } {
  if (!deadline) return { text: 'No deadline set', urgent: false, overdue: false };

  const now = Date.now();
  const due = new Date(deadline).getTime();
  const diffMs = due - now;

  if (diffMs < 0) {
    const overMs = Math.abs(diffMs);
    const overHrs = Math.floor(overMs / 3600000);
    const overDays = Math.floor(overMs / 86400000);
    if (overDays > 0) return { text: `Overdue by ${overDays}d`, urgent: true, overdue: true };
    return { text: `Overdue by ${overHrs}h`, urgent: true, overdue: true };
  }

  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const days = Math.floor(diffMs / 86400000);

  if (days > 0) return { text: `Due in ${days}d ${hrs % 24}h`, urgent: false, overdue: false };
  if (hrs > 0) return { text: `Due in ${hrs}h ${mins}m`, urgent: hrs < 1, overdue: false };
  return { text: `Due in ${mins}m`, urgent: true, overdue: false };
}

function getProgress(status: Record<string, DeliverableStatus> | null): { done: number; total: number } | null {
  if (!status) return null;
  const entries = Object.values(status);
  if (entries.length === 0) return null;
  const done = entries.filter(s => s === 'submitted' || s === 'approved').length;
  return { done, total: entries.length };
}

function getStatusBadge(contentStatus: string | null): { label: string; className: string } {
  switch (contentStatus) {
    case 'revision_requested':
      return { label: 'Revision Requested', className: 'bg-orange-100 text-orange-700' };
    case 'submitted':
      return { label: 'Submitted', className: 'bg-teal-50 text-teal-700' };
    default:
      return { label: 'In Progress', className: 'bg-gray-100 text-gray-600' };
  }
}

export const ActiveCampaignCard: React.FC<ActiveCampaignCardProps> = ({ collaboration }) => {
  const navigate = useNavigate();
  const { campaign, business_profile } = collaboration;
  const businessName = business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = business_profile?.logo_url;
  const deliveryTier = mapDeliveryType(campaign.delivery_type);
  const deadline = getDeadlineDisplay(collaboration.content_deadline);
  const progress = getProgress(collaboration.deliverables_status);
  const statusBadge = getStatusBadge(collaboration.content_status);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      {/* Header: logo + title + status badge */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
          {businessLogo ? (
            <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-dc-teal-dark">
              {businessName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{campaign.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{businessName} <span className="text-dc-teal">✓</span></p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 ${statusBadge.className}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Revision requested alert */}
      {collaboration.content_status === 'revision_requested' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-2.5 mt-3 flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <p className="text-xs text-orange-800 font-medium">Revision requested · Check deliverable feedback</p>
        </div>
      )}

      {/* Deadline + delivery tier */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">⏱</span>
          <span className={`text-xs font-semibold ${
            deadline.overdue ? 'text-red-600' : deadline.urgent ? 'text-orange-600' : 'text-gray-700'
          }`}>
            {deadline.text}
          </span>
        </div>
        {deliveryTier && <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />}
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray-500">📦 {progress.done}/{progress.total} deliverables submitted</span>
            <span className="text-[11px] text-gray-400">{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-dc-teal rounded-full h-1.5 transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={() => navigate(`/campaigns/${campaign.id}`)}
        className="w-full bg-dc-teal text-white rounded-full py-2.5 font-bold text-sm mt-4 hover:bg-dc-teal-dark transition-colors active:scale-95 flex items-center justify-center gap-2"
      >
        <Upload className="w-4 h-4" />
        Upload Content
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. Component compiles but isn't rendered yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ActiveCampaignCard.tsx
git commit -m "feat: ActiveCampaignCard component with deadline, progress, upload CTA"
```

---

## Task 6: `useCreateReview` hook

**Files:**
- Create: `src/hooks/useCreateReview.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useCreateReview.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface CreateReviewInput {
  collaborationId: string;
  revieweeId: string;
  rating: number;
  reviewText?: string;
}

export const useCreateReview = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collaborationId, revieweeId, rating, reviewText }: CreateReviewInput) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('project_reviews')
        .insert({
          collaboration_id: collaborationId,
          reviewer_id: user.id,
          reviewee_id: revieweeId,
          review_type: 'creator_to_business',
          rating,
          review_text: reviewText || null,
          is_public: true,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-collaborations'] });
      toast({
        title: 'Review submitted!',
        description: 'Thanks for your feedback.',
      });
    },
    onError: (error) => {
      console.error('Failed to submit review:', error);
      toast({
        title: 'Failed to submit review',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreateReview.ts
git commit -m "feat: useCreateReview hook for creator-to-business reviews"
```

---

## Task 7: `CompletedCampaignCard` component

**Files:**
- Create: `src/components/campaigns/CompletedCampaignCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/campaigns/CompletedCampaignCard.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Loader2 } from 'lucide-react';
import { CreatorCollaboration } from '@/hooks/useCreatorCollaborations';
import { useCreateReview } from '@/hooks/useCreateReview';
import { formatBudget } from '@/lib/campaignUtils';

interface CompletedCampaignCardProps {
  collaboration: CreatorCollaboration;
}

const StarRating: React.FC<{ rating: number; onRate?: (r: number) => void; interactive?: boolean }> = ({
  rating,
  onRate,
  interactive = false,
}) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        disabled={!interactive}
        onClick={() => onRate?.(star)}
        className={interactive ? 'cursor-pointer' : 'cursor-default'}
      >
        <Star
          className={`w-4 h-4 ${
            star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
          }`}
        />
      </button>
    ))}
  </div>
);

export const CompletedCampaignCard: React.FC<CompletedCampaignCardProps> = ({ collaboration }) => {
  const navigate = useNavigate();
  const { campaign, business_profile } = collaboration;
  const businessName = business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = business_profile?.logo_url;
  const completedDate = collaboration.completed_at
    ? new Date(collaboration.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const createReview = useCreateReview();
  const hasReview = !!collaboration.existing_review_id || submitted;

  const handleSubmitReview = async () => {
    if (reviewRating === 0) return;
    try {
      await createReview.mutateAsync({
        collaborationId: collaboration.id,
        revieweeId: campaign.user_id,
        rating: reviewRating,
        reviewText: reviewText || undefined,
      });
      setSubmitted(true);
      setShowReviewForm(false);
    } catch {
      // Error handled by mutation's onError
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      {/* Header: logo + title */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
          {businessLogo ? (
            <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-dc-teal-dark">
              {businessName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{campaign.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{businessName} <span className="text-dc-teal">✓</span></p>
        </div>
      </div>

      {/* Completion + budget */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">✅</span>
          <span className="text-xs text-gray-600">
            Completed{completedDate ? ` · ${completedDate}` : ''}
          </span>
        </div>
        <span className="text-xs font-semibold text-dc-teal">💰 {formatBudget(campaign)}</span>
      </div>

      {/* Review state */}
      <div className="mt-3">
        {hasReview ? (
          <div className="flex items-center gap-2">
            <StarRating rating={submitted ? reviewRating : (collaboration.existing_review_rating ?? 5)} />
            <span className="text-[11px] text-gray-400">Review submitted</span>
          </div>
        ) : showReviewForm ? (
          <div className="border border-gray-200 rounded-xl p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Rate your experience</p>
              <StarRating rating={reviewRating} onRate={setReviewRating} interactive />
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
              placeholder="How was working with this business? (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal resize-none h-16"
              maxLength={500}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReviewForm(false)}
                className="flex-1 text-xs text-gray-500 py-2 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={reviewRating === 0 || createReview.isPending}
                className="flex-1 bg-dc-teal text-white rounded-full py-2 text-xs font-bold hover:bg-dc-teal-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {createReview.isPending ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Submitting...</>
                ) : (
                  'Submit Review'
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowReviewForm(true)}
            className="text-xs text-dc-teal font-semibold border border-dc-teal rounded-full px-4 py-1.5 hover:bg-teal-50 transition-colors"
          >
            Leave a Review
          </button>
        )}
      </div>

      {/* View Details link */}
      <button
        onClick={() => navigate(`/campaigns/${campaign.id}`)}
        className="text-xs text-dc-teal font-semibold hover:underline mt-2"
      >
        View Details →
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CompletedCampaignCard.tsx
git commit -m "feat: CompletedCampaignCard with inline review form"
```

---

## Task 8: Enable Active & Done tabs in `CreatorCampaignMarketplace`

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`

- [ ] **Step 1: Add imports**

At the top of `CreatorCampaignMarketplace.tsx`, add:

```typescript
import { useCreatorCollaborations } from '@/hooks/useCreatorCollaborations';
import { ActiveCampaignCard } from '@/components/campaigns/ActiveCampaignCard';
import { CompletedCampaignCard } from '@/components/campaigns/CompletedCampaignCard';
```

- [ ] **Step 2: Add hook calls**

Inside the component, after the existing `useCreatorApplications()` call (around line 29), add:

```typescript
  const { data: activeCollabs = [], isLoading: activeLoading } = useCreatorCollaborations('active');
  const { data: completedCollabs = [], isLoading: completedLoading } = useCreatorCollaborations('completed');
```

- [ ] **Step 3: Enable the tabs**

Find the `tabs` array definition (around line 131-136). Change it to:

```typescript
  const tabs: { id: Tab; label: string; badge?: number; disabled?: boolean }[] = [
    { id: 'available', label: 'Available' },
    { id: 'applied', label: 'Applied', badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'active', label: 'Active', badge: activeCollabs.length > 0 ? activeCollabs.length : undefined },
    { id: 'done', label: 'Done' },
  ];
```

Remove `disabled: true` from both Active and Done tabs.

- [ ] **Step 4: Add Active tab content**

After the `{activeTab === 'applied' && (...)}` block (around line 321), add:

```tsx
        {activeTab === 'active' && (
          <div className="flex-1 px-4 py-4">
            {activeLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeCollabs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white font-semibold mb-2">No active campaigns yet.</p>
                <p className="text-white/60 text-sm mb-4">When a business accepts your application, your campaign will appear here.</p>
                <button
                  onClick={() => setActiveTab('available')}
                  className="text-dc-teal text-sm font-semibold border border-dc-teal rounded-full px-6 py-2 hover:bg-teal-50/10 transition-colors"
                >
                  Browse Campaigns
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeCollabs.map((collab) => (
                  <ActiveCampaignCard key={collab.id} collaboration={collab} />
                ))}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 5: Add Done tab content**

After the Active tab block, add:

```tsx
        {activeTab === 'done' && (
          <div className="flex-1 px-4 py-4">
            {completedLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : completedCollabs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white font-semibold mb-2">No completed campaigns yet.</p>
                <p className="text-white/60 text-sm">Your finished campaigns and earnings will show up here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {completedCollabs.map((collab) => (
                  <CompletedCampaignCard key={collab.id} collaboration={collab} />
                ))}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "feat: enable Active and Done tabs with collaboration cards"
```

---

## Task 9: Add `profile_slug` to campaign hooks

**Files:**
- Modify: `src/hooks/usePublicCampaigns.ts:8-15,104`
- Modify: `src/hooks/useCreatorApplications.ts:21-26,73`

- [ ] **Step 1: Update the `PublicCampaign` interface**

In `src/hooks/usePublicCampaigns.ts`, at lines 7-23, add `profile_slug` to the `business_profile` type:

```typescript
export interface PublicCampaign extends Campaign {
  business_profile?: {
    business_name: string;
    logo_url?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    location?: string;
    profile_slug?: string;
  };
  application_count?: number;
  user_applied?: boolean;
  application_status?: 'pending' | 'accepted' | 'rejected';
  cover_image_url?: string;
  cover_image_type?: 'reference' | 'ai_preview' | 'logo' | 'gradient';
  deliverable_count?: number;
  content_types?: string[];
}
```

- [ ] **Step 2: Add `profile_slug` to the business profiles query**

At line 104, update the `.select()` call to include `profile_slug`:

```typescript
      const { data: businessProfiles, error: profilesError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, postal_code, city, country, location, profile_slug')
        .in('user_id', userIds);
```

- [ ] **Step 3: Add `profile_slug` to the mapping**

At lines 181-188, where the `business_profile` object is constructed, add the field:

```typescript
            business_profile: businessProfile ? {
              business_name: businessProfile.business_name,
              logo_url: businessProfile.logo_url,
              postal_code: businessProfile.postal_code,
              city: businessProfile.city,
              country: businessProfile.country,
              location: businessProfile.location,
              profile_slug: businessProfile.profile_slug,
            } : undefined,
```

- [ ] **Step 4: Update `useCreatorApplications` — interface**

In `src/hooks/useCreatorApplications.ts`, at lines 21-26, add `profile_slug` to `ApplicationBusinessProfile`:

```typescript
interface ApplicationBusinessProfile {
  business_name: string;
  logo_url: string | null;
  city: string | null;
  country: string | null;
  profile_slug: string | null;
}
```

- [ ] **Step 5: Update `useCreatorApplications` — query**

At line 73, add `profile_slug` to the `.select()` call:

```typescript
      const { data: businessProfiles, error: profileError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, city, country, profile_slug')
        .in('user_id', campaignUserIds);
```

At lines 99-104 in the mapping, add `profile_slug`:

```typescript
          business_profile: businessProfile ? {
            business_name: businessProfile.business_name,
            logo_url: businessProfile.logo_url,
            city: businessProfile.city,
            country: businessProfile.country,
            profile_slug: businessProfile.profile_slug,
          } : undefined,
```

Also update `handleViewApplicationDetail` in `CreatorCampaignMarketplace.tsx` to pass `profile_slug` through when building the `pseudoCampaign` business_profile object. Add `profile_slug: application.business_profile?.profile_slug ?? undefined` to the business_profile spread.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePublicCampaigns.ts src/hooks/useCreatorApplications.ts
git commit -m "feat: add profile_slug to business_profile in campaign hooks"
```

---

## Task 10: Raw footage download + business profile link in `CampaignDetailModal`

**Files:**
- Modify: `src/components/campaigns/CampaignDetailModal.tsx`

- [ ] **Step 1: Add imports**

At the top of `CampaignDetailModal.tsx`, add:

```typescript
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
```

- [ ] **Step 2: Replace the raw footage section**

Find the `{hasRawFootage && (...)}` block (around lines 174-184). Replace it with:

```tsx
            {/* Raw Footage */}
            {hasRawFootage && (
              <div className="px-4 py-4 border-b border-gray-100">
                {campaign.application_status === 'accepted' ? (
                  <>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">📹 Raw Footage</h3>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {detail?.media
                        .filter(m => m.media_type === 'raw_footage')
                        .map((item) => (
                          <div key={item.id} className="flex-shrink-0">
                            <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 group">
                              <img
                                src={item.thumbnail_url || item.file_url}
                                alt={item.file_name}
                                className="w-full h-full object-cover"
                              />
                              <a
                                href={item.file_url}
                                download={item.file_name}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="w-5 h-5 text-white" />
                              </a>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1 truncate w-24">{item.file_name}</p>
                            {item.file_size_bytes && (
                              <p className="text-[10px] text-gray-400">
                                {(item.file_size_bytes / 1048576).toFixed(1)} MB
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-xl">📹</span>
                    <div>
                      <div className="text-sm font-semibold text-teal-700">Raw Footage Provided</div>
                      <div className="text-xs text-gray-600 mt-0.5">The business has footage for you to use. Available after acceptance.</div>
                    </div>
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 3: Add business profile link**

Find the "About the Business" section (the `<div>` containing the business avatar, name, and location — around lines 260-275). After the business info inner div (the one with `businessName` and `location`), add the profile link:

```tsx
                <div>
                  <div className="text-sm font-semibold text-gray-700">{businessName} <span className="text-dc-teal">✓</span></div>
                  {location && <div className="text-xs text-gray-500">{location}</div>}
                </div>
              </div>
              {campaign.business_profile?.profile_slug && (
                <Link
                  to={`/business/${campaign.business_profile.profile_slug}`}
                  className="text-xs text-dc-teal font-semibold hover:underline mt-2 inline-block"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Business Profile →
                </Link>
              )}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/CampaignDetailModal.tsx
git commit -m "feat: raw footage download after acceptance + business profile link"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`
Verify in browser at the creator campaigns page:
- Available tab: swipe cards render with existing data
- Applied tab: application cards render
- Active tab: shows empty state (or cards if test data exists)
- Done tab: shows empty state (or cards if test data exists)
- Tap a campaign card → detail modal opens
- Scroll to "About the Business" → "View Business Profile →" link appears
- If campaign has raw footage + accepted status → footage thumbnails with download
- Tap "Apply for This Campaign" → apply form includes portfolio section

- [ ] **Step 3: Final commit**

```bash
git commit -m "creator-campaigns: full campaign details with visual briefs"
```

Only create this commit if there are any remaining changes not yet committed. If all changes were committed in prior tasks, skip this step.
