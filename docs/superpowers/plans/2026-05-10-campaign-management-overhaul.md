# Campaign Management Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six campaign management issues across the Restaurant/Brand experience — project status limbo, missing reuse, broken deletion, cryptic CTA, wrong inspiration data, broken mobile layout.

**Architecture:** Two chunks executed sequentially. Chunk 1 (Tasks 1–3) adds a campaign-specific Project Detail page, a template/reuse system backed by completed campaigns, and a cascade deletion flow with notifications. Chunk 2 (Tasks 4–6) replaces the "+" icon with a full-width CTA, swaps InspirationStrip to liked DragonFeed content, and fixes mobile card layout. Each task is independently shippable.

**Tech Stack:** React + TypeScript, Tailwind CSS, TanStack Query, Supabase (Postgres + Edge Functions), react-router-dom

**Spec:** `docs/superpowers/specs/2026-05-10-campaign-management-overhaul-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useCampaignProject.ts` | Create | Fetches collaboration + campaign + creator for project detail page |
| `src/pages/CampaignProjectPage.tsx` | Create | Campaign-specific project detail page with timeline + dynamic CTA |
| `src/App.tsx` | Modify (line ~187) | Add route for `/dashboard/business/campaigns/:id/project` |
| `src/components/campaigns/CampaignCard.tsx` | Modify | Change Project Status route, add Re-Launch button, wire new delete dialog |
| `src/hooks/useCampaignMutations.ts` | Modify | Add `useDuplicateCampaign`, rewrite `useDeleteCampaign` with cascade |
| `src/hooks/useCampaignTemplates.ts` | Create | Fetches completed campaigns with duplication counts |
| `src/components/campaign-creator/TemplateStrip.tsx` | Create | Horizontal scrollable template cards for Create a Campaign page |
| `src/components/campaign-creator/DropScreen.tsx` | Modify (line ~27) | Add TemplateStrip above InspirationStrip |
| `src/components/campaigns/DeleteCampaignDialog.tsx` | Create | Confirmation modal showing deletion impact |
| `src/pages/CampaignsPage.tsx` | Modify (lines ~118-126) | Replace "+" icon with full-width CTA button |
| `src/hooks/useInspirationStrip.ts` | Modify | Swap data source to liked DragonFeed content only |
| `src/components/campaign-creator/InspirationStrip.tsx` | Modify | New title, empty state, heart badge cards, mobile fix |

---

## Chunk 1: Campaign Lifecycle Overhaul

### Task 1: Project Detail Page

**Files:**
- Create: `src/hooks/useCampaignProject.ts`
- Create: `src/pages/CampaignProjectPage.tsx`
- Modify: `src/App.tsx:187`
- Modify: `src/components/campaigns/CampaignCard.tsx:394-403`

- [ ] **Step 1: Create the `useCampaignProject` hook**

Create `src/hooks/useCampaignProject.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CampaignProject {
  collaboration: {
    id: string;
    status: string;
    content_status: string | null;
    revision_count: number;
    business_completion_status: string | null;
    creator_completion_status: string | null;
    completed_at: string | null;
  };
  campaign: {
    id: string;
    title: string;
    description: string;
    status: string;
    deadline: string | null;
    budget_min: number | null;
    budget_max: number | null;
    deliverables: string[] | null;
    platforms: string[] | null;
    escrow_status: string | null;
    delivery_type: string | null;
  };
  creator: {
    user_id: string;
    creator_name: string;
    avatar_url: string | null;
    bio: string | null;
    rating: number | null;
    completed_projects: number;
  };
}

type ProjectStep = 'hired' | 'submitted' | 'review' | 'payment' | 'review_left';

export function deriveCurrentStep(project: CampaignProject): ProjectStep {
  const { collaboration } = project;
  if (collaboration.status === 'completed') return 'review_left';
  if (
    collaboration.business_completion_status === 'requested' ||
    collaboration.creator_completion_status === 'requested'
  ) return 'payment';
  if (collaboration.content_status === 'submitted') return 'review';
  if (collaboration.content_status === 'approved') return 'payment';
  return collaboration.content_status ? 'review' : 'submitted';
}

export function useCampaignProject(campaignId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-project', campaignId],
    queryFn: async (): Promise<CampaignProject | null> => {
      if (!user) return null;

      const { data: collabs, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          id, status, content_status, revision_count,
          business_completion_status, creator_completion_status,
          completed_at, creator_id,
          campaigns!inner (
            id, title, description, status, deadline,
            budget_min, budget_max, deliverables, platforms,
            escrow_status, delivery_type, user_id
          )
        `)
        .eq('campaign_id', campaignId)
        .eq('campaigns.user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!collabs || collabs.length === 0) return null;

      const collab = collabs[0];
      const campaign = Array.isArray(collab.campaigns)
        ? collab.campaigns[0]
        : collab.campaigns;

      // Fetch creator profile
      const [{ data: creatorProfile }, { data: projectCount }] = await Promise.all([
        supabase
          .from('creator_profiles')
          .select('user_id, creator_name, avatar_url, bio')
          .eq('user_id', collab.creator_id)
          .maybeSingle(),
        supabase
          .from('campaign_collaborations')
          .select('id')
          .eq('creator_id', collab.creator_id)
          .eq('status', 'completed'),
      ]);

      // Fetch average rating
      const { data: reviews } = await supabase
        .from('project_reviews')
        .select('rating')
        .eq('reviewee_id', collab.creator_id);

      const avgRating = reviews?.length
        ? reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length
        : null;

      return {
        collaboration: {
          id: collab.id,
          status: collab.status,
          content_status: collab.content_status ?? null,
          revision_count: collab.revision_count ?? 0,
          business_completion_status: collab.business_completion_status ?? null,
          creator_completion_status: collab.creator_completion_status ?? null,
          completed_at: collab.completed_at ?? null,
        },
        campaign: {
          id: campaign.id,
          title: campaign.title,
          description: campaign.description,
          status: campaign.status,
          deadline: campaign.deadline,
          budget_min: campaign.budget_min,
          budget_max: campaign.budget_max,
          deliverables: campaign.deliverables as string[] | null,
          platforms: campaign.platforms as string[] | null,
          escrow_status: campaign.escrow_status,
          delivery_type: campaign.delivery_type,
        },
        creator: {
          user_id: collab.creator_id,
          creator_name: creatorProfile?.creator_name ?? 'Creator',
          avatar_url: creatorProfile?.avatar_url ?? null,
          bio: creatorProfile?.bio ?? null,
          rating: avgRating,
          completed_projects: projectCount?.length ?? 0,
        },
      };
    },
    enabled: !!user && !!campaignId,
  });
}
```

- [ ] **Step 2: Create the `CampaignProjectPage` component**

Create `src/pages/CampaignProjectPage.tsx`:

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, MessageCircle, User, CheckCircle2,
  Loader2, Star, DollarSign, ArrowRight,
} from 'lucide-react';
import { useCampaignProject, deriveCurrentStep } from '@/hooks/useCampaignProject';
import { useProjectComplete } from '@/hooks/useProjectComplete';
import { RatingModal } from '@/components/reviews/RatingModal';
import { useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';

const STEPS = [
  { key: 'hired', label: 'Creator hired & escrow held' },
  { key: 'submitted', label: 'Content submitted by creator' },
  { key: 'review', label: 'Review & approve content' },
  { key: 'payment', label: 'Release payment' },
  { key: 'review_left', label: 'Leave review' },
] as const;

function stepIndex(step: string): number {
  return STEPS.findIndex((s) => s.key === step);
}

export default function CampaignProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, isError } = useCampaignProject(id ?? '');
  const { requestCompletion, requestingId } = useProjectComplete();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !project) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full border-2 border-teal-300">
            <h3 className="font-bold text-gray-900 mb-2">Project not found</h3>
            <p className="text-gray-500 text-sm mb-4">This campaign may not have an active collaboration yet.</p>
            <Button
              onClick={() => navigate('/dashboard/business/campaigns')}
              className="rounded-full bg-teal-400 text-white font-bold w-full"
            >
              Back to Campaigns
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const currentStep = deriveCurrentStep(project);
  const currentIdx = stepIndex(currentStep);
  const { campaign, creator, collaboration } = project;

  const avatarUrl = creator.avatar_url
    ? creator.avatar_url.startsWith('http')
      ? creator.avatar_url
      : `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${creator.avatar_url}`
    : null;

  const formatBudget = () => {
    if (campaign.budget_min && campaign.budget_max) return `$${campaign.budget_min}–$${campaign.budget_max}`;
    if (campaign.budget_min) return `From $${campaign.budget_min}`;
    if (campaign.budget_max) return `Up to $${campaign.budget_max}`;
    return 'Budget TBD';
  };

  const getCtaConfig = () => {
    if (collaboration.status === 'completed') {
      return { label: 'Campaign Complete ✓', disabled: true, onClick: () => {} };
    }
    switch (currentStep) {
      case 'hired':
      case 'submitted':
        return { label: 'Waiting for Creator to Submit', disabled: true, onClick: () => {} };
      case 'review':
        return {
          label: 'Review & Approve Content →',
          disabled: false,
          onClick: () => navigate(`/dashboard/business/projects?highlight=${collaboration.id}`),
        };
      case 'payment':
        return {
          label: 'Mark Complete & Release Payment →',
          disabled: requestingId === collaboration.id,
          onClick: () => requestCompletion({ collaborationId: collaboration.id, userRole: 'business_client' }),
        };
      case 'review_left':
        return {
          label: 'Leave a Review →',
          disabled: false,
          onClick: () => setReviewModalOpen(true),
        };
      default:
        return { label: 'View Project', disabled: false, onClick: () => {} };
    }
  };

  const cta = getCtaConfig();

  const getEscrowLabel = () => {
    switch (campaign.escrow_status) {
      case 'held': return 'Escrow Held';
      case 'released': return 'Paid Out';
      case 'pending': return 'Payment Pending';
      default: return null;
    }
  };

  const getEscrowColor = () => {
    switch (campaign.escrow_status) {
      case 'held': return 'bg-green-100 text-green-800';
      case 'released': return 'bg-purple-100 text-purple-800';
      case 'pending': return 'bg-amber-100 text-amber-800';
      default: return '';
    }
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-gray-100 md:max-w-4xl md:mx-auto">
        <PageHeader>
          <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="text-pink-500 mr-2">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              Project Status
            </h1>
            <span className="w-5" />
          </div>
        </PageHeader>

        <div className="px-4 pt-4 pb-24 md:pb-8 space-y-3">
          {/* Campaign Header Card */}
          <div className="bg-white rounded-2xl p-4">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Campaign</span>
            <h2 className="font-bold text-lg text-gray-900 mt-1">{campaign.title}</h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge className="bg-green-100 text-green-800 text-xs">{campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}</Badge>
              {getEscrowLabel() && (
                <Badge className={`${getEscrowColor()} text-xs`}>{getEscrowLabel()}</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatBudget()}
              {campaign.deliverables?.length ? ` · ${campaign.deliverables.length} item${campaign.deliverables.length !== 1 ? 's' : ''}` : ''}
              {campaign.deadline ? ` · Due ${new Date(campaign.deadline).toLocaleDateString()}` : ''}
            </p>
          </div>

          {/* Assigned Creator Card */}
          <div className="bg-white rounded-2xl p-4 border-2 border-teal-400">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Assigned Creator</span>
            <div className="flex items-center gap-3 mt-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full ring-2 ring-teal-400 object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full ring-2 ring-teal-400 bg-gradient-to-br from-teal-300 to-pink-300 flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
              )}
              <div>
                <p className="font-bold text-gray-900">{creator.creator_name}</p>
                <p className="text-xs text-gray-500">
                  {creator.rating !== null ? `⭐ ${creator.rating.toFixed(1)} · ` : ''}
                  {creator.completed_projects} project{creator.completed_projects !== 1 ? 's' : ''} completed
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                className="flex-1 rounded-full bg-teal-400 text-white font-semibold text-xs hover:bg-teal-500"
                size="sm"
                onClick={() => navigate(`/dashboard/business/messages/campaign/${campaign.id}`)}
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1" /> Message
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-full border-gray-200 text-pink-500 font-semibold text-xs"
                size="sm"
                onClick={() => navigate(`/creator/${creator.user_id}`)}
              >
                <User className="h-3.5 w-3.5 mr-1" /> View Portfolio
              </Button>
            </div>
          </div>

          {/* Progress Timeline */}
          <div className="bg-white rounded-2xl p-4">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Progress</span>
            <div className="mt-3 space-y-3">
              {STEPS.map((step, idx) => {
                const isComplete = idx < currentIdx || (idx === currentIdx && currentStep === 'review_left' && collaboration.status === 'completed');
                const isCurrent = idx === currentIdx && collaboration.status !== 'completed';
                const isFuture = idx > currentIdx;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isComplete ? 'bg-teal-400 text-white' :
                      isCurrent ? 'bg-yellow-400 text-white' :
                      'bg-gray-200 text-gray-400'
                    }`}>
                      {isComplete ? '✓' : isCurrent ? <ArrowRight className="h-3.5 w-3.5" /> : idx + 1}
                    </div>
                    <span className={`text-sm ${
                      isComplete ? 'text-gray-900' :
                      isCurrent ? 'text-gray-900 font-bold' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary CTA */}
          <Button
            className={`w-full rounded-full font-bold py-3 text-[15px] ${
              cta.disabled
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-teal-400 text-white hover:bg-teal-500'
            }`}
            disabled={cta.disabled}
            onClick={cta.onClick}
          >
            {requestingId === collaboration.id ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
            ) : (
              cta.label
            )}
          </Button>
        </div>
      </div>

      {/* Rating Modal */}
      <RatingModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        collaborationId={collaboration.id}
        revieweeId={creator.user_id}
        revieweeName={creator.creator_name}
        reviewType="business_to_creator"
      />
    </DashboardLayout>
  );
}
```

- [ ] **Step 3: Add the route in `App.tsx`**

In `src/App.tsx`, add a lazy import at the top with the other page imports and a new route line after line 187 (the existing `/dashboard/business/projects` route):

Add import near top of file:
```tsx
const CampaignProjectPage = React.lazy(() => import('@/pages/CampaignProjectPage'));
```

Add route after the existing business projects route (after line 187):
```tsx
<Route path="/dashboard/business/campaigns/:id/project" element={<ProtectedRoute><BusinessRoute><CampaignProjectPage /></BusinessRoute></ProtectedRoute>} />
```

- [ ] **Step 4: Update the "Project Status" button route in `CampaignCard.tsx`**

In `src/components/campaigns/CampaignCard.tsx`, change lines 394-403 from:

```tsx
{applicationCounts && applicationCounts.accepted > 0 && (
  <Button 
    variant="secondary" 
    size="sm" 
    className="text-xs"
    onClick={() => navigate('/dashboard/business/projects')}
  >
    <FolderOpen className="h-3 w-3 mr-1" aria-hidden="true" />
    Project Status
  </Button>
)}
```

to:

```tsx
{applicationCounts && applicationCounts.accepted > 0 && (
  <Button 
    variant="secondary" 
    size="sm" 
    className="text-xs"
    onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/project`)}
  >
    <FolderOpen className="h-3 w-3 mr-1" aria-hidden="true" />
    Project Status
  </Button>
)}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCampaignProject.ts src/pages/CampaignProjectPage.tsx src/App.tsx src/components/campaigns/CampaignCard.tsx
git commit -m "feat: campaign-specific project detail page with progress timeline"
```

---

### Task 2: Campaign Template & Reuse System

**Files:**
- Modify: `src/hooks/useCampaignMutations.ts`
- Create: `src/hooks/useCampaignTemplates.ts`
- Create: `src/components/campaign-creator/TemplateStrip.tsx`
- Modify: `src/components/campaigns/CampaignCard.tsx`
- Modify: `src/components/campaign-creator/DropScreen.tsx`

- [ ] **Step 1: Add `useDuplicateCampaign` mutation to `useCampaignMutations.ts`**

Add this export at the end of `src/hooks/useCampaignMutations.ts` (after the `useDeleteCampaign` export):

```typescript
export const useDuplicateCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceCampaignId: string) => {
      const { data: source, error: fetchError } = await supabase
        .from('campaigns')
        .select('title, description, goals, deliverables, platforms, budget_min, budget_max, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, ai_analysis')
        .eq('id', sourceCampaignId)
        .single();

      if (fetchError || !source) throw fetchError ?? new Error('Campaign not found');

      const { data: newCampaign, error: insertError } = await supabase
        .from('campaigns')
        .insert({
          ...source,
          title: `${source.title} (Copy)`,
          status: 'draft',
          escrow_status: 'pending',
          deadline: null,
          user_id: user!.id,
          duplicated_from: sourceCampaignId,
        } as unknown as Database['public']['Tables']['campaigns']['Insert'])
        .select('id')
        .single();

      if (insertError) throw insertError;
      return newCampaign;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Campaign duplicated!', description: 'Edit the draft to customize and publish.' });
    },
    onError: () => {
      toast({ title: 'Failed to duplicate campaign', description: 'Please try again.', variant: 'destructive' });
    },
  });
};
```

- [ ] **Step 2: Create `useCampaignTemplates` hook**

Create `src/hooks/useCampaignTemplates.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CampaignTemplate {
  id: string;
  title: string;
  deliverables: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  platforms: string[] | null;
  use_count: number;
}

export function useCampaignTemplates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-templates', user?.id],
    queryFn: async (): Promise<CampaignTemplate[]> => {
      if (!user) return [];

      const { data: completed, error } = await supabase
        .from('campaigns')
        .select('id, title, deliverables, budget_min, budget_max, platforms')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!completed?.length) return [];

      const ids = completed.map((c) => c.id);
      const { data: dupes } = await supabase
        .from('campaigns')
        .select('duplicated_from')
        .in('duplicated_from', ids);

      const countMap = new Map<string, number>();
      dupes?.forEach((d) => {
        const from = (d as unknown as { duplicated_from: string }).duplicated_from;
        countMap.set(from, (countMap.get(from) ?? 0) + 1);
      });

      return completed.map((c) => ({
        id: c.id,
        title: c.title,
        deliverables: c.deliverables as string[] | null,
        budget_min: c.budget_min,
        budget_max: c.budget_max,
        platforms: c.platforms as string[] | null,
        use_count: countMap.get(c.id) ?? 0,
      }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Create `TemplateStrip` component**

Create `src/components/campaign-creator/TemplateStrip.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { useCampaignTemplates } from '@/hooks/useCampaignTemplates';
import { useDuplicateCampaign } from '@/hooks/useCampaignMutations';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export function TemplateStrip() {
  const { data: templates, isLoading } = useCampaignTemplates();
  const duplicateCampaign = useDuplicateCampaign();
  const navigate = useNavigate();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const handleDuplicate = async (templateId: string) => {
    setDuplicatingId(templateId);
    try {
      const result = await duplicateCampaign.mutateAsync(templateId);
      navigate(`/dashboard/business/campaigns/${result.id}/edit`);
    } finally {
      setDuplicatingId(null);
    }
  };

  if (isLoading || !templates?.length) return null;

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">🔥 Your Templates</span>
        <button className="text-xs font-semibold text-pink-500">See all →</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => handleDuplicate(t.id)}
            disabled={duplicatingId === t.id}
            className="min-w-[140px] bg-gray-50 rounded-xl p-3 border border-gray-200 text-left flex-shrink-0 hover:border-teal-300 transition-colors disabled:opacity-50"
          >
            {duplicatingId === t.id ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
              </div>
            ) : (
              <>
                <p className="font-bold text-sm text-gray-900 line-clamp-1">{t.title}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {t.deliverables?.length ?? 0} item{(t.deliverables?.length ?? 0) !== 1 ? 's' : ''}
                  {t.budget_min ? ` · $${t.budget_min}` : ''}
                  {t.budget_max ? `–$${t.budget_max}` : ''}
                </p>
                <p className="text-[11px] text-teal-500 mt-1">
                  {t.use_count > 0 ? `Used ${t.use_count} time${t.use_count !== 1 ? 's' : ''}` : 'New'}
                </p>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add "Re-Launch Campaign" button to completed campaign cards**

In `src/components/campaigns/CampaignCard.tsx`, add the import at the top:

```tsx
import { useDuplicateCampaign } from '@/hooks/useCampaignMutations';
```

Inside the component, after the `deleteCampaign` declaration (line 35), add:

```tsx
const duplicateCampaign = useDuplicateCampaign();
```

In the `CardFooter` section (after the Project Status button block ending at line ~403, before the `canDelete` block), add:

```tsx
{campaign.status === 'completed' && (
  <Button
    variant="default"
    size="sm"
    className="text-xs bg-teal-400 hover:bg-teal-500 text-white"
    onClick={async () => {
      const result = await duplicateCampaign.mutateAsync(campaign.id);
      navigate(`/dashboard/business/campaigns/${result.id}/edit`);
    }}
    disabled={duplicateCampaign.isPending}
  >
    {duplicateCampaign.isPending ? (
      <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
    ) : (
      <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
    )}
    Re-Launch
  </Button>
)}
```

- [ ] **Step 5: Add `TemplateStrip` to DropScreen**

In `src/components/campaign-creator/DropScreen.tsx`, add import:

```tsx
import { TemplateStrip } from './TemplateStrip';
```

Insert `<TemplateStrip />` right before the `<InspirationStrip>` line (before line 27):

```tsx
        <TemplateStrip />
        <InspirationStrip
```

- [ ] **Step 6: Apply DB migration for `duplicated_from` column**

Run via Supabase MCP or SQL editor:

```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS duplicated_from UUID REFERENCES campaigns(id) ON DELETE SET NULL;
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useCampaignMutations.ts src/hooks/useCampaignTemplates.ts src/components/campaign-creator/TemplateStrip.tsx src/components/campaigns/CampaignCard.tsx src/components/campaign-creator/DropScreen.tsx
git commit -m "feat: campaign template reuse system with Re-Launch and TemplateStrip"
```

---

### Task 3: Campaign Deletion Cascade & Notifications

**Files:**
- Create: `src/components/campaigns/DeleteCampaignDialog.tsx`
- Modify: `src/hooks/useCampaignMutations.ts`
- Modify: `src/components/campaigns/CampaignCard.tsx`

- [ ] **Step 1: Create `DeleteCampaignDialog` component**

Create `src/components/campaigns/DeleteCampaignDialog.tsx`:

```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface DeleteCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignTitle: string;
  applicationCount: number;
  invitationCount: number;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteCampaignDialog({
  open, onOpenChange, campaignTitle,
  applicationCount, invitationCount, onConfirm, isDeleting,
}: DeleteCampaignDialogProps) {
  const hasImpact = applicationCount > 0 || invitationCount > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{campaignTitle}"?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {hasImpact ? (
                <p>
                  This will permanently remove the campaign and notify{' '}
                  <strong>{applicationCount} creator{applicationCount !== 1 ? 's' : ''}</strong> who applied
                  {invitationCount > 0 && (
                    <> and <strong>{invitationCount} brand{invitationCount !== 1 ? 's' : ''}</strong> invited</>
                  )}
                  {' '}that the campaign has been cancelled.
                </p>
              ) : (
                <p>This will permanently remove the campaign. No one will be notified.</p>
              )}
              <div className="bg-red-50 rounded-lg p-3 text-sm text-red-800">
                <p className="font-semibold">This action cannot be undone:</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-red-700">
                  <li>Campaign removed from all views</li>
                  {applicationCount > 0 && <li>{applicationCount} pending application{applicationCount !== 1 ? 's' : ''} cancelled</li>}
                  {invitationCount > 0 && <li>{invitationCount} brand invitation{invitationCount !== 1 ? 's' : ''} withdrawn</li>}
                  {hasImpact && <li>Creators and brands notified</li>}
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</>
            ) : (
              'Delete Campaign'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Rewrite `useDeleteCampaign` with cascade logic and notifications**

Replace the existing `useDeleteCampaign` export in `src/hooks/useCampaignMutations.ts` (lines 359–392) with:

```typescript
export const useDeleteCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      // 1. Fetch campaign title + owner name for notifications
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('title, user_id')
        .eq('id', campaignId)
        .single();
      const campaignTitle = campaign?.title ?? 'Untitled Campaign';

      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user!.id)
        .maybeSingle();
      const businessName = ownerProfile?.full_name ?? 'A business';

      // 2. Collect applicant user IDs before deletion
      const { data: applications } = await supabase
        .from('campaign_applications')
        .select('creator_id')
        .eq('campaign_id', campaignId);
      const applicantIds = (applications ?? []).map((a) => a.creator_id).filter(Boolean);

      // 3. Collect invited brand user IDs
      const { data: invitations } = await supabase
        .from('campaign_invitations')
        .select('brand_id')
        .eq('campaign_id', campaignId);
      const invitedBrandIds = (invitations ?? []).map((i) => (i as unknown as { brand_id: string }).brand_id).filter(Boolean);

      // 4. Cascade delete related records
      await supabase.from('campaign_applications').delete().eq('campaign_id', campaignId);
      await supabase.from('campaign_invitations').delete().eq('campaign_id', campaignId);
      await supabase.from('campaign_matches').delete().eq('campaign_id', campaignId);
      await supabase.from('campaign_sponsorships').delete().eq('campaign_id', campaignId);

      // 5. Delete the campaign
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('user_id', user!.id);
      if (error) throw error;

      // 6. Notify applicants (fire-and-forget)
      if (applicantIds.length > 0) {
        const { data: creatorProfiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', applicantIds);

        const promises = (creatorProfiles ?? []).map((p) =>
          supabase.functions.invoke('send-notification-email', {
            body: {
              to: p.email,
              recipientName: p.full_name,
              type: 'campaign_cancelled',
              data: { campaignTitle, businessName },
            },
          }).catch((err) => console.error(`Failed to notify creator ${p.id}:`, err))
        );
        await Promise.allSettled(promises);
      }

      // 7. Notify invited brands (fire-and-forget)
      if (invitedBrandIds.length > 0) {
        const { data: brandProfiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', invitedBrandIds);

        const promises = (brandProfiles ?? []).map((p) =>
          supabase.functions.invoke('send-notification-email', {
            body: {
              to: p.email,
              recipientName: p.full_name,
              type: 'campaign_cancelled_brand',
              data: { campaignTitle, businessName },
            },
          }).catch((err) => console.error(`Failed to notify brand ${p.id}:`, err))
        );
        await Promise.allSettled(promises);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Campaign deleted successfully!' });
    },
    onError: (error) => {
      console.error('Campaign deletion failed:', error);
      toast({ title: 'Failed to delete campaign', description: 'Please try again later.', variant: 'destructive' });
    },
  });
};
```

- [ ] **Step 3: Update CampaignCard to use new `DeleteCampaignDialog` and stricter guard**

In `src/components/campaigns/CampaignCard.tsx`:

Add import at top:
```tsx
import { DeleteCampaignDialog } from './DeleteCampaignDialog';
import { useDuplicateCampaign } from '@/hooks/useCampaignMutations';
```

(If `useDuplicateCampaign` was already imported in Task 2, skip that line.)

Update the `canDelete` guard (line 46) from:
```tsx
const canDelete = !applicationCounts || applicationCounts.accepted === 0;
```
to:
```tsx
const canDelete = (!applicationCounts || applicationCounts.accepted === 0) && campaign.escrow_status !== 'held';
```

Add state for invitation count after `showDeleteConfirm` state (around line 34):
```tsx
const [invitationCount, setInvitationCount] = useState(0);
```

Update `handleDelete` to fetch invitation count before showing dialog — actually, fetch invitation count when opening the dialog. Replace the delete button's `onClick` from `() => setShowDeleteConfirm(true)` to:

```tsx
onClick={async () => {
  const { count } = await supabase
    .from('campaign_invitations')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id);
  setInvitationCount(count ?? 0);
  setShowDeleteConfirm(true);
}}
```

Replace the entire `<AlertDialog>` block at the bottom of the component (lines 434–452) with:

```tsx
<DeleteCampaignDialog
  open={showDeleteConfirm}
  onOpenChange={setShowDeleteConfirm}
  campaignTitle={campaign.title}
  applicationCount={applicationCounts?.total ?? 0}
  invitationCount={invitationCount}
  onConfirm={handleDelete}
  isDeleting={deleteCampaign.isPending}
/>
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/DeleteCampaignDialog.tsx src/hooks/useCampaignMutations.ts src/components/campaigns/CampaignCard.tsx
git commit -m "feat: cascade campaign deletion with impact dialog and notifications"
```

---

## Chunk 2: Campaign Creation UX Polish

### Task 4: Replace "+" Icon with "Create a Campaign" Button

**Files:**
- Modify: `src/pages/CampaignsPage.tsx:106-126`

- [ ] **Step 1: Replace the header section**

In `src/pages/CampaignsPage.tsx`, replace lines 106–126 (the `<PageHeader>` block) with:

```tsx
<PageHeader>
  <div className="flex items-center">
    <button
      onClick={() => navigate('/dashboard/business')}
      className="text-dc-pink-accent mr-2"
      aria-label="Back"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
    <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
      Campaigns
    </h1>
    <span className="w-5" />
  </div>
</PageHeader>

{/* Create Campaign CTA */}
<div className="px-4 pt-3 pb-1">
  <button
    onClick={() => navigate('/dashboard/business/campaigns/create')}
    className="w-full bg-teal-400 text-white font-bold py-3 rounded-full text-[15px] hover:bg-teal-500 transition-colors"
  >
    Create a Campaign
  </button>
</div>
```

Also remove the `Plus` import from the lucide-react import line (line 5) since it's no longer used.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build. No unused import warnings for `Plus`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CampaignsPage.tsx
git commit -m "feat: replace cryptic + icon with full-width Create a Campaign button"
```

---

### Task 5: InspirationStrip → Your Liked Content

**Files:**
- Modify: `src/hooks/useInspirationStrip.ts`
- Modify: `src/components/campaign-creator/InspirationStrip.tsx`

- [ ] **Step 1: Rewrite `useInspirationStrip` to fetch only liked content**

Replace the entire contents of `src/hooks/useInspirationStrip.ts` with:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';

export interface InspirationItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorId: string;
  contentLabel: string;
  isLiked: boolean;
}

export function useInspirationStrip() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['inspiration-strip', user?.id],
    queryFn: async (): Promise<InspirationItem[]> => {
      if (!user?.id) return [];

      // Fetch all dragon_feed_like events for this user
      const { data: likeEvents } = await supabase
        .from('analytics_events')
        .select('event_data, created_at')
        .eq('user_id', user.id)
        .eq('event_type', 'dragon_feed_like')
        .order('created_at', { ascending: false });

      if (!likeEvents?.length) return [];

      // Deduplicate: latest action per content_id wins
      const contentMap = new Map<string, { creatorId: string; action: string }>();
      for (const event of likeEvents) {
        const d = event.event_data as Record<string, string> | null;
        if (!d?.content_id || !d?.creator_id) continue;
        if (contentMap.has(d.content_id)) continue;
        contentMap.set(d.content_id, { creatorId: d.creator_id, action: d.action ?? 'like' });
      }

      // Filter to only currently-liked items
      const likedEntries = Array.from(contentMap.entries())
        .filter(([_, v]) => v.action === 'like');

      if (likedEntries.length === 0) return [];

      // Get unique creator IDs and fetch their profiles
      const creatorIds = [...new Set(likedEntries.map(([_, v]) => v.creatorId))];
      const { data: creators } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, portfolio_urls, profile_slug')
        .in('user_id', creatorIds);

      const creatorMap = new Map((creators ?? []).map((c) => [c.user_id, c]));

      // Resolve each liked item to a displayable InspirationItem
      const items: InspirationItem[] = [];
      for (const [contentId, { creatorId }] of likedEntries) {
        const creator = creatorMap.get(creatorId);
        if (!creator) continue;

        const urlPart = contentId.replace(`${creator.id}-`, '');
        const portfolio = Array.isArray(creator.portfolio_urls) ? creator.portfolio_urls : [];
        const matchedUrl = portfolio.find((u: string) => u === urlPart);
        if (!matchedUrl) continue;

        const resolvedUrl = matchedUrl.startsWith('http')
          ? matchedUrl
          : `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${matchedUrl}`;
        const isVideo = /\.(mp4|webm|mov|avi)$/i.test(matchedUrl);

        items.push({
          id: contentId,
          url: resolvedUrl,
          type: isVideo ? 'video' : 'image',
          creatorName: creator.creator_name ?? 'Creator',
          creatorId: creator.user_id,
          contentLabel: isVideo ? 'Video content' : 'Photo content',
          isLiked: true,
        });

        if (items.length >= 8) break;
      }

      return items;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Update `InspirationStrip` component with new title, empty state, and heart badges**

Replace the entire contents of `src/components/campaign-creator/InspirationStrip.tsx` with:

```tsx
import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInspirationStrip, type InspirationItem } from '@/hooks/useInspirationStrip';
import type { InspirationRef } from '@/types/firstRun';

interface InspirationStripProps {
  onSelectionChange: (refs: InspirationRef[]) => void;
  onScrolled?: () => void;
}

export function InspirationStrip({ onSelectionChange, onScrolled }: InspirationStripProps) {
  const { data: items, isLoading } = useInspirationStrip();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hasScrolled = useRef(false);
  const navigate = useNavigate();

  const handleScroll = useCallback(() => {
    if (!hasScrolled.current) {
      hasScrolled.current = true;
      onScrolled?.();
    }
  }, [onScrolled]);

  const toggleItem = (item: InspirationItem) => {
    const next = new Set(selected);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
    }
    setSelected(next);

    const refs: InspirationRef[] = (items ?? [])
      .filter((i) => next.has(i.id))
      .map((i) => ({
        media_url: i.url,
        creator_name: i.creatorName,
        content_label: i.contentLabel,
        media_type: i.type,
      }));
    onSelectionChange(refs);
  };

  if (isLoading) {
    return (
      <div className="mt-4">
        <div className="flex gap-2 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-[90px] h-[90px] lg:w-[120px] lg:h-[120px] rounded-xl bg-gray-200 animate-pulse flex-shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="mt-4 bg-white rounded-2xl border border-dashed border-gray-300 p-5 text-center">
        <p className="text-2xl mb-2">🐉</p>
        <p className="text-sm text-gray-500">Like content on the DragonFeed to use as style inspiration here</p>
        <button
          onClick={() => navigate('/dashboard/business/dragon-feed')}
          className="mt-3 bg-teal-400 text-white font-semibold text-xs px-5 py-2 rounded-full hover:bg-teal-500 transition-colors"
        >
          Explore DragonFeed
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-bold text-gray-900">❤️ Your Liked Content</span>
        <button className="text-xs font-semibold text-pink-500">See all →</button>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">From your DragonFeed — Donny uses it as a style reference</p>
      <div
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
        onScroll={handleScroll}
      >
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item)}
              className={`w-[90px] h-[90px] lg:w-[120px] lg:h-[120px] rounded-xl relative flex-shrink-0 overflow-hidden border-2 transition-all ${
                isSelected ? 'border-teal-400 ring-2 ring-teal-200' : 'border-transparent'
              }`}
            >
              {item.type === 'video' ? (
                <video
                  src={item.url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={item.url}
                  alt={item.contentLabel}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              {/* Heart badge */}
              <div className="absolute top-1 left-1 bg-white rounded-full px-1.5 py-0.5 text-[9px]">❤️</div>
              {/* Selection checkmark */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-teal-400 flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}
              {/* Creator handle */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 rounded-b-xl">
                <span className="text-[9px] text-white font-semibold">@{item.creatorName.toLowerCase().replace(/\s+/g, '_')}</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-gray-500 mt-1">
        Tap content you like — Donny uses it as a style reference
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useInspirationStrip.ts src/components/campaign-creator/InspirationStrip.tsx
git commit -m "feat: InspirationStrip shows only liked DragonFeed content with empty state"
```

---

### Task 6: Mobile Layout Fix for Liked Content Cards

This was already addressed in Task 5. The new `InspirationStrip` component uses `w-[90px] h-[90px] flex-shrink-0` on each card and `overflow-x-auto` on the container, which fixes the mobile layout. The loading skeleton was also updated to match (`w-[90px] h-[90px] flex-shrink-0`).

- [ ] **Step 1: Verify mobile layout visually**

Run: `npm run dev`

Open Chrome DevTools → toggle device toolbar → select iPhone SE (375px).
Navigate to the Create a Campaign page.
Confirm: liked content cards are square (90×90), don't compress, and scroll horizontally.
Confirm: on desktop (resize wider), cards scale up to 120×120 via `lg:` prefix.

- [ ] **Step 2: Commit (if any additional tweaks were needed)**

If the layout looks correct as-is from Task 5, no additional commit needed. If tweaks were required:

```bash
git add src/components/campaign-creator/InspirationStrip.tsx
git commit -m "fix: mobile InspirationStrip card sizing and scroll behavior"
```

---

## Verification Checklist

After all tasks are complete, do a final pass:

- [ ] `npm run build` passes cleanly
- [ ] My Campaigns page: "Create a Campaign" full-width teal button appears instead of "+"
- [ ] Campaign card for completed campaign: "Re-Launch" button present, creates draft copy
- [ ] Campaign card with accepted creator: "Project Status" button navigates to `/dashboard/business/campaigns/:id/project`
- [ ] Project Detail page: shows campaign header, creator card, progress timeline, dynamic CTA
- [ ] Delete campaign: shows confirmation dialog with impact counts, cascades to all related tables, notifies creators/brands
- [ ] Create a Campaign page: "Your Templates" strip appears if user has completed campaigns
- [ ] Create a Campaign page: "Your Liked Content" section shows only liked DragonFeed content
- [ ] Create a Campaign page: empty state shows dragon icon + "Explore DragonFeed" CTA when no likes
- [ ] Mobile view (375px): liked content cards are 90×90 squares, horizontally scrollable
