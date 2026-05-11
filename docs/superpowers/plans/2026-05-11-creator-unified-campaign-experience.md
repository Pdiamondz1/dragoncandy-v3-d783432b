# Creator Unified Campaign Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate My Applications, My Projects, and Project Details into a single "My Campaigns" hub with a phase-dependent detail view, and strip the Campaign Marketplace to discovery-only.

**Architecture:** Two new pages (MyCampaignsPage list + MyCampaignDetailPage detail) replace three old pages. The detail page detects the creator's lifecycle phase (applied/active/completed) and renders the appropriate view with tabbed access to the full campaign brief. All data comes from existing React Query hooks — no database changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, React Router v6, TanStack Query (React Query), Supabase JS client, shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-05-11-creator-unified-campaign-experience-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/my-campaigns/MyCampaignCard.tsx` | Compact campaign card for the list page — adapts CTA and styling per status |
| `src/components/my-campaigns/AppliedPhaseView.tsx` | Detail view for applied/pending/counter-offered campaigns |
| `src/components/my-campaigns/ActivePhaseView.tsx` | Detail view for active collaborations (Project tab + Brief tab) |
| `src/components/my-campaigns/CompletedPhaseView.tsx` | Detail view for completed collaborations (Summary tab + Brief tab) |
| `src/components/my-campaigns/CampaignDetailHeader.tsx` | Shared header for detail page — title, badges, stats row |
| `src/components/CollaborationRedirect.tsx` | Redirect `/projects/:id` → `/dashboard/creator/my-campaigns/:campaignId` |
| `src/pages/MyCampaignsPage.tsx` | List page: earnings summary + Applied/Active/Done tabs |
| `src/pages/MyCampaignDetailPage.tsx` | Orchestrator: phase detection + renders the correct phase view |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/navConfig.ts` | Replace My Applications + My Projects with My Campaigns in `creatorSidebarNav` (lines 85-86) and `creatorDrawerMenu` (lines 213-214) |
| `src/App.tsx` | Add new routes, add redirects for old routes, remove old route entries |
| `src/pages/CreatorCampaignMarketplace.tsx` | Remove Applied/Active/Done tabs, keep Available + add Donny Picks tab |
| `src/pages/CreatorDashboard.tsx` | Update Recent Activity (line 185) and Upcoming Deadlines (line 231) link targets |

### Deleted Files
| File | Replaced By |
|------|------------|
| `src/pages/CreatorApplications.tsx` | MyCampaignsPage (Applied tab) |
| `src/pages/CreatorProjects.tsx` | MyCampaignsPage (Active/Done tabs) + earnings summary |
| `src/pages/ProjectDetailsPage.tsx` | MyCampaignDetailPage (active/completed phase views) |

---

## Task 1: Update Navigation Config

**Files:**
- Modify: `src/lib/navConfig.ts:85-86,213-214`

- [ ] **Step 1: Replace sidebar nav items**

In `creatorSidebarNav` array (line 85-86), replace:
```typescript
  { icon: Briefcase, label: 'My Applications', href: '/dashboard/creator/applications' },
  { icon: Target, label: 'My Projects', href: '/dashboard/creator/projects' },
```
With:
```typescript
  { icon: Target, label: 'My Campaigns', href: '/dashboard/creator/my-campaigns' },
```

- [ ] **Step 2: Replace drawer menu items**

In `creatorDrawerMenu` array (lines 213-214), replace:
```typescript
      { icon: Briefcase, label: 'My Applications', href: '/dashboard/creator/applications' },
      { icon: Target, label: 'My Projects', href: '/dashboard/creator/projects' },
```
With:
```typescript
      { icon: Target, label: 'My Campaigns', href: '/dashboard/creator/my-campaigns' },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build (routes still work because old pages still exist — we haven't removed them yet)

- [ ] **Step 4: Commit**

```bash
git add src/lib/navConfig.ts
git commit -m "refactor: consolidate My Applications + My Projects into My Campaigns nav item"
```

---

## Task 2: Create MyCampaignCard Component

**Files:**
- Create: `src/components/my-campaigns/MyCampaignCard.tsx`

This compact card adapts its appearance and CTA based on campaign status. Used in the MyCampaignsPage list.

- [ ] **Step 1: Create the card component**

Create `src/components/my-campaigns/MyCampaignCard.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { CreatorApplication } from '@/hooks/useCreatorApplications';
import type { CreatorCollaboration } from '@/hooks/useCreatorCollaborations';

type CardVariant = 'applied' | 'counter_offered' | 'active' | 'completed';

interface MyCampaignCardProps {
  variant: CardVariant;
  campaignId: string;
  title: string;
  businessName: string;
  businessLocation?: string | null;
  price: number | null;
  application?: CreatorApplication;
  collaboration?: CreatorCollaboration;
}

const borderColors: Record<CardVariant, string> = {
  applied: 'border-l-yellow-400',
  counter_offered: 'border-l-orange-500',
  active: 'border-l-dc-teal',
  completed: 'border-l-green-500',
};

const statusConfig: Record<CardVariant, { label: string; className: string }> = {
  applied: { label: '⏳ Pending', className: 'bg-yellow-50 text-yellow-800' },
  counter_offered: { label: '💬 Counter Offer', className: 'bg-orange-50 text-orange-800' },
  active: { label: 'Active', className: 'bg-teal-50 text-teal-800' },
  completed: { label: '✅ Completed', className: 'bg-green-50 text-green-800' },
};

const ctaConfig: Record<CardVariant, { label: string; className: string }> = {
  applied: { label: 'View →', className: 'text-dc-teal' },
  counter_offered: { label: 'Respond →', className: 'text-pink-500' },
  active: { label: 'Upload →', className: 'text-white bg-dc-teal px-3 py-1.5 rounded-full text-xs' },
  completed: { label: 'Review →', className: 'text-dc-teal' },
};

export function MyCampaignCard({
  variant,
  campaignId,
  title,
  businessName,
  businessLocation,
  price,
  application,
  collaboration,
}: MyCampaignCardProps) {
  const navigate = useNavigate();

  const timeContext = getTimeContext(variant, application, collaboration);
  const status = statusConfig[variant];
  const cta = ctaConfig[variant];
  const deliverableProgress = getDeliverableProgress(collaboration);
  const deadlineUrgency = getDeadlineUrgency(collaboration);

  return (
    <div
      onClick={() => navigate(`/dashboard/creator/my-campaigns/${campaignId}`)}
      className={`bg-white rounded-2xl p-4 border-l-4 ${borderColors[variant]} cursor-pointer hover:shadow-md transition-shadow`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900 text-sm truncate">{title}</div>
          <div className="text-xs text-gray-500">
            {businessName}{businessLocation ? ` • ${businessLocation}` : ''}
          </div>
        </div>
        <Badge className={`ml-2 shrink-0 text-[11px] ${status.className}`}>
          {status.label}
        </Badge>
      </div>

      {variant === 'active' && collaboration?.campaign?.delivery_type && (
        <Badge className="mb-2 bg-green-50 text-green-800 text-[11px]">
          ⚡ {collaboration.campaign.delivery_type === 'dragonrush' ? 'DragonRush' :
              collaboration.campaign.delivery_type === 'expedited' ? 'Expedited' : 'Standard'}
        </Badge>
      )}

      {variant === 'active' && deliverableProgress && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Deliverables</span>
            <span>{deliverableProgress.done}/{deliverableProgress.total} done</span>
          </div>
          <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-dc-teal h-full rounded-full transition-all"
              style={{ width: `${deliverableProgress.total > 0 ? (deliverableProgress.done / deliverableProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {price != null && `$${price}`}
          {timeContext && <span className="text-gray-400"> · {timeContext}</span>}
          {variant === 'active' && deadlineUrgency && (
            <span className={`ml-1 font-semibold ${deadlineUrgency.color}`}>
              ⏰ {deadlineUrgency.label}
            </span>
          )}
        </div>
        <span className={`text-sm font-semibold ${cta.className}`}>{cta.label}</span>
      </div>
    </div>
  );
}

function getTimeContext(
  variant: CardVariant,
  application?: CreatorApplication,
  collaboration?: CreatorCollaboration,
): string | null {
  if (variant === 'applied' || variant === 'counter_offered') {
    if (!application?.created_at) return null;
    const days = Math.floor((Date.now() - new Date(application.created_at).getTime()) / 86400000);
    return days === 0 ? 'Applied today' : `Applied ${days}d ago`;
  }
  if (variant === 'completed') {
    if (!collaboration?.completed_at) return null;
    return `Completed ${new Date(collaboration.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return null;
}

function getDeliverableProgress(collaboration?: CreatorCollaboration) {
  if (!collaboration?.deliverables_status) return null;
  const statuses = Object.values(collaboration.deliverables_status);
  const total = statuses.length;
  const done = statuses.filter((s) => s === 'approved' || s === 'submitted').length;
  return { done, total };
}

function getDeadlineUrgency(collaboration?: CreatorCollaboration) {
  if (!collaboration?.content_deadline) return null;
  const days = Math.ceil((new Date(collaboration.content_deadline).getTime() - Date.now()) / 86400000);
  if (days <= 2) return { label: `Due in ${days}d`, color: 'text-red-500' };
  if (days <= 5) return { label: `Due in ${days}d`, color: 'text-yellow-600' };
  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build (component not imported anywhere yet)

- [ ] **Step 3: Commit**

```bash
git add src/components/my-campaigns/MyCampaignCard.tsx
git commit -m "feat: add MyCampaignCard component with status-adaptive styling and CTAs"
```

---

## Task 3: Create MyCampaignsPage

**Files:**
- Create: `src/pages/MyCampaignsPage.tsx`

The unified list page with Applied/Active/Done tabs and earnings summary.

- [ ] **Step 1: Create the page**

Create `src/pages/MyCampaignsPage.tsx`:

```typescript
import { useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorApplications } from '@/hooks/useCreatorApplications';
import { useCreatorCollaborations } from '@/hooks/useCreatorCollaborations';
import { useCreatorEarnings } from '@/hooks/useCreatorEarnings';
import { EarningsSummary } from '@/components/projects/EarningsSummary';
import { MyCampaignCard } from '@/components/my-campaigns/MyCampaignCard';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

type TabId = 'applied' | 'active' | 'done';

export default function MyCampaignsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: applications = [], isLoading: appsLoading } = useCreatorApplications();
  const { data: activeCollabs = [], isLoading: activeLoading } = useCreatorCollaborations('active');
  const { data: completedCollabs = [], isLoading: completedLoading } = useCreatorCollaborations('completed');
  const { data: earnings } = useCreatorEarnings(user?.id);

  const isLoading = appsLoading || activeLoading || completedLoading;

  const pendingApps = useMemo(
    () => applications.filter((a) => a.status === 'pending' || a.status === 'counter_offered'),
    [applications],
  );

  const defaultTab: TabId = activeCollabs.length > 0 ? 'active' : 'applied';
  const activeTab = (searchParams.get('tab') as TabId) || defaultTab;

  const setTab = (tab: TabId) => {
    setSearchParams({ tab }, { replace: true });
  };

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'applied', label: 'Applied', count: pendingApps.length },
    { id: 'active', label: 'Active', count: activeCollabs.length },
    { id: 'done', label: 'Done', count: completedCollabs.length },
  ];

  const totalCount = pendingApps.length + activeCollabs.length + completedCollabs.length;

  const handleSetupPayouts = async () => {
    const { data } = await supabase.functions.invoke('create-creator-connect-account');
    if (data?.url) window.location.href = data.url;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-200 to-pink-100">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard/creator')} className="text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 tracking-wide">MY CAMPAIGNS</h1>
        </div>
        {totalCount > 0 && (
          <span className="bg-dc-teal text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
            {totalCount}
          </span>
        )}
      </div>

      {/* Earnings Summary */}
      {earnings && (
        <div className="px-4 pb-3">
          <EarningsSummary
            totalEarned={earnings.totalEarned}
            inEscrow={earnings.inEscrow}
            available={earnings.available}
            onboardingComplete={earnings.onboardingComplete}
            onSetupPayouts={handleSetupPayouts}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex px-4 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex-1 text-center py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'text-gray-900 border-b-[3px] border-dc-teal'
                : 'text-gray-400 border-b-[3px] border-transparent'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-4 pb-24 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))
        ) : (
          <>
            {activeTab === 'applied' && (
              pendingApps.length === 0 ? (
                <EmptyState message="No pending applications" sub="Browse campaigns to find your next gig" />
              ) : (
                pendingApps.map((app) => (
                  <MyCampaignCard
                    key={app.id}
                    variant={app.status === 'counter_offered' ? 'counter_offered' : 'applied'}
                    campaignId={app.campaign_id}
                    title={app.campaign?.title || 'Untitled Campaign'}
                    businessName={app.business_profile?.business_name || 'Unknown Business'}
                    businessLocation={app.business_profile?.city}
                    price={app.proposed_rate ?? app.campaign?.fixed_price ?? null}
                    application={app}
                  />
                ))
              )
            )}

            {activeTab === 'active' && (
              activeCollabs.length === 0 ? (
                <EmptyState message="No active projects" sub="Applied campaigns will appear here once accepted" />
              ) : (
                activeCollabs.map((collab) => (
                  <MyCampaignCard
                    key={collab.id}
                    variant="active"
                    campaignId={collab.campaign_id}
                    title={collab.campaign?.title || 'Untitled Campaign'}
                    businessName={collab.business_profile?.business_name || 'Unknown Business'}
                    price={collab.campaign?.fixed_price ?? null}
                    collaboration={collab}
                  />
                ))
              )
            )}

            {activeTab === 'done' && (
              completedCollabs.length === 0 ? (
                <EmptyState message="No completed projects yet" sub="Completed work will appear here" />
              ) : (
                completedCollabs.map((collab) => (
                  <MyCampaignCard
                    key={collab.id}
                    variant="completed"
                    campaignId={collab.campaign_id}
                    title={collab.campaign?.title || 'Untitled Campaign'}
                    businessName={collab.business_profile?.business_name || 'Unknown Business'}
                    price={collab.campaign?.fixed_price ?? null}
                    collaboration={collab}
                  />
                ))
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-gray-600 font-semibold">{message}</p>
      <p className="text-gray-400 text-sm mt-1">{sub}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build (page not routed yet)

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyCampaignsPage.tsx
git commit -m "feat: add MyCampaignsPage with unified Applied/Active/Done tabs"
```

---

## Task 4: Create CampaignDetailHeader Component

**Files:**
- Create: `src/components/my-campaigns/CampaignDetailHeader.tsx`

Shared header for the detail page — renders differently per phase.

- [ ] **Step 1: Create the header component**

Create `src/components/my-campaigns/CampaignDetailHeader.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignDetailHeaderProps {
  campaign: Campaign;
  phase: 'applied' | 'active' | 'completed';
  stats?: { label: string; value: string; color?: string }[];
  applicationStatus?: string;
}

const phaseGradients: Record<string, string> = {
  applied: 'from-pink-200 to-pink-50',
  active: 'from-pink-200 to-pink-50',
  completed: 'from-green-100 to-green-50',
};

const phaseBadges: Record<string, { label: string; className: string }> = {
  applied: { label: '⏳ Pending', className: 'bg-yellow-50 text-yellow-800' },
  active: { label: 'Active', className: 'bg-teal-50 text-teal-800' },
  completed: { label: '✅ Completed', className: 'bg-green-50 text-green-800' },
};

export function CampaignDetailHeader({
  campaign,
  phase,
  stats,
  applicationStatus,
}: CampaignDetailHeaderProps) {
  const navigate = useNavigate();
  const badge = applicationStatus === 'counter_offered'
    ? { label: '💬 Counter Offer', className: 'bg-orange-50 text-orange-800' }
    : phaseBadges[phase];

  return (
    <div className={`bg-gradient-to-b ${phaseGradients[phase]} px-5 pt-4 pb-4`}>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => navigate('/dashboard/creator/my-campaigns')} className="text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900 truncate">{campaign.title}</h1>
      </div>

      <div className="flex gap-1.5 mb-3">
        <Badge className={badge.className}>{badge.label}</Badge>
        {campaign.delivery_type && campaign.delivery_type !== 'standard' && (
          <Badge className="bg-teal-50 text-teal-800">
            ⚡ {campaign.delivery_type === 'dragonrush' ? 'DragonRush' : 'Expedited'}
          </Badge>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="flex gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <span className={`text-lg font-extrabold ${stat.color || 'text-gray-900'}`}>
                {stat.value}
              </span>
              <br />
              <span className="text-[10px] text-gray-500">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/components/my-campaigns/CampaignDetailHeader.tsx
git commit -m "feat: add CampaignDetailHeader with phase-adaptive gradient and stats"
```

---

## Task 5: Create Phase View Components

**Files:**
- Create: `src/components/my-campaigns/AppliedPhaseView.tsx`
- Create: `src/components/my-campaigns/ActivePhaseView.tsx`
- Create: `src/components/my-campaigns/CompletedPhaseView.tsx`

Three focused components — one per lifecycle phase. Each is rendered by the orchestrator page.

- [ ] **Step 1: Create AppliedPhaseView**

Create `src/components/my-campaigns/AppliedPhaseView.tsx`:

```typescript
import type { CreatorApplication } from '@/hooks/useCreatorApplications';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';

interface AppliedPhaseViewProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  application: CreatorApplication;
}

export function AppliedPhaseView({ campaign, enrichedDetail, application }: AppliedPhaseViewProps) {
  const isCounterOffer = application.status === 'counter_offered';

  return (
    <div className="space-y-3 px-4 pb-24">
      {/* Application Status Card */}
      <div className={`bg-white rounded-2xl p-4 border-2 ${isCounterOffer ? 'border-orange-400' : 'border-yellow-400'}`}>
        <div className="text-sm font-bold text-gray-900 mb-2">YOUR APPLICATION</div>

        {application.proposed_rate != null && (
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Proposed rate</span>
            <span className="font-semibold">${application.proposed_rate}</span>
          </div>
        )}

        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Applied</span>
          <span>{new Date(application.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {application.proposed_timeline && (
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Timeline</span>
            <span>{application.proposed_timeline}</span>
          </div>
        )}

        <div className={`mt-3 p-2 rounded-lg text-xs text-center ${
          isCounterOffer ? 'bg-orange-50 text-orange-800' : 'bg-yellow-50 text-yellow-800'
        }`}>
          {isCounterOffer
            ? 'The business sent a counter offer — review and respond'
            : `Waiting for ${application.business_profile?.business_name || 'the business'} to respond`}
        </div>
      </div>

      {/* Full Campaign Brief */}
      <div className="bg-white rounded-2xl p-4">
        <div className="text-sm font-bold text-gray-900 mb-3">CAMPAIGN BRIEF</div>
        <CreatorCampaignDetails
          campaign={campaign}
          enrichedDetail={enrichedDetail}
          hasApplied={true}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ActivePhaseView**

Create `src/components/my-campaigns/ActivePhaseView.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';
import { ProjectStepper, getCreatorStep } from '@/components/projects/ProjectStepper';
import { DeliverableCard } from '@/components/projects/DeliverableCard';
import { ProjectFileUpload } from '@/components/projects/ProjectFileUpload';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useFileUploads } from '@/hooks/useFileQuery';

interface ActivePhaseViewProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  collaborationId: string;
}

type ActiveTab = 'project' | 'brief';

export function ActivePhaseView({ campaign, enrichedDetail, collaborationId }: ActivePhaseViewProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('project');
  const navigate = useNavigate();

  const { data: collaboration } = useCollaboration(collaborationId);
  const { data: files } = useFileUploads(collaboration?.campaign_id, 'deliverable');

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'project', label: 'PROJECT' },
    { id: 'brief', label: 'BRIEF' },
  ];

  if (!collaboration) return null;

  const deliverablesStatus = collaboration.deliverables_status as Record<string, string> | null;
  const campaignDeliverables = (collaboration.campaign?.ai_analysis?.deliverables as
    | { id: string; content_type: string; platform?: string; description?: string }[]
    | undefined);
  const hasUploadedFiles = (files?.length ?? 0) > 0;
  const currentStep = getCreatorStep(collaboration.content_status, hasUploadedFiles);
  const tierColor = collaboration.campaign?.delivery_type === 'dragonrush' ? '#EF4444' :
    collaboration.campaign?.delivery_type === 'expedited' ? '#F59E0B' : '#4DD9C0';

  return (
    <div>
      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-center py-3 text-sm font-bold transition-colors ${
              activeTab === tab.id
                ? 'text-dc-teal border-b-[3px] border-dc-teal'
                : 'text-gray-400 border-b-[3px] border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'project' ? (
        <div className="px-4 pt-4 pb-24 space-y-3">
          {/* Stepper */}
          <div className="bg-white rounded-2xl p-4">
            <ProjectStepper currentStep={currentStep} role="creator" tierColor={tierColor} />
          </div>

          {/* Deliverables */}
          {campaignDeliverables && campaignDeliverables.length > 0 && (
            <div className="bg-white rounded-2xl p-4 space-y-3">
              <div className="text-sm font-bold text-gray-900">DELIVERABLES</div>
              {campaignDeliverables.map((d) => {
                const status = (deliverablesStatus?.[d.id] as 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved') || 'pending';
                const matchingFile = files?.find(
                  (f) => f.original_filename?.includes(d.id) || (f.metadata as Record<string, unknown>)?.deliverable_id === d.id,
                );
                return (
                  <DeliverableCard
                    key={d.id}
                    deliverable={d}
                    status={status}
                    uploadedFile={matchingFile ? { file_name: matchingFile.original_filename, file_size_bytes: matchingFile.file_size } : null}
                    feedback={collaboration.revision_feedback?.[d.id] ?? null}
                    disabled={collaboration.campaign?.escrow_status !== 'held'}
                  />
                );
              })}
            </div>
          )}

          {/* File Upload — renders its own dialog trigger button */}
          <ProjectFileUpload
            campaignId={collaboration.campaign_id}
            campaignTitle={collaboration.campaign?.title || campaign.title}
          />

          {/* Messages CTA */}
          <Button
            variant="outline"
            className="w-full rounded-full border-2 border-dc-teal text-dc-teal font-bold py-3"
            onClick={() => navigate(`/messages/${collaboration.campaign_id}`)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Open Messages
          </Button>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-24">
          <CreatorCampaignDetails
            campaign={campaign}
            enrichedDetail={enrichedDetail}
            hasApplied={true}
          />
        </div>
      )}
    </div>
  );
}
```

**Note:** Props for `DeliverableCard` (expects `content_type` field), `ProjectFileUpload` (manages its own dialog state, takes `campaignId` + `campaignTitle`), and `ProjectStepper` have been verified against current source.

- [ ] **Step 3: Create CompletedPhaseView**

Create `src/components/my-campaigns/CompletedPhaseView.tsx`:

```typescript
import { useState } from 'react';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import type { CreatorCollaboration } from '@/hooks/useCreatorCollaborations';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';

interface CompletedPhaseViewProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  collaboration: CreatorCollaboration;
}

type CompletedTab = 'summary' | 'brief';

export function CompletedPhaseView({ campaign, enrichedDetail, collaboration }: CompletedPhaseViewProps) {
  const [activeTab, setActiveTab] = useState<CompletedTab>('summary');

  const tabs: { id: CompletedTab; label: string }[] = [
    { id: 'summary', label: 'SUMMARY' },
    { id: 'brief', label: 'BRIEF' },
  ];

  const deliverablesStatus = collaboration.deliverables_status as Record<string, string> | null;
  const campaignDeliverables = campaign.ai_analysis?.deliverables as
    | { id: string; content_type: string; platform?: string; description?: string }[]
    | undefined;
  const price = collaboration.campaign?.fixed_price ?? campaign.fixed_price ?? 0;
  const platformFee = Math.round(price * 0.1);
  const netEarnings = price - platformFee;

  return (
    <div>
      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-center py-3 text-sm font-bold transition-colors ${
              activeTab === tab.id
                ? 'text-dc-teal border-b-[3px] border-dc-teal'
                : 'text-gray-400 border-b-[3px] border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' ? (
        <div className="px-4 pt-4 pb-24 space-y-3">
          {/* Delivered Items */}
          {campaignDeliverables && campaignDeliverables.length > 0 && (
            <div className="bg-white rounded-2xl p-4">
              <div className="text-sm font-bold text-gray-900 mb-3">DELIVERED</div>
              <div className="space-y-2">
                {campaignDeliverables.map((d) => {
                  const status = deliverablesStatus?.[d.id] || 'pending';
                  return (
                    <div key={d.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                      <span className="text-sm text-gray-700">
                        {d.content_type === 'video' ? '📹' : '📸'} {d.description || d.content_type}
                      </span>
                      <span className="text-xs font-semibold text-green-700">
                        {status === 'approved' ? '✓ Approved' : status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment Breakdown */}
          <div className="bg-white rounded-2xl p-4">
            <div className="text-sm font-bold text-gray-900 mb-3">PAYMENT</div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Campaign fee</span>
                <span className="font-semibold text-gray-900">${price}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Platform fee (10%)</span>
                <span className="text-gray-900">-${platformFee}</span>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-sm">
                <span className="font-bold text-gray-900">Net earnings</span>
                <span className="font-bold text-dc-teal">${netEarnings}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-24">
          <CreatorCampaignDetails
            campaign={campaign}
            enrichedDetail={enrichedDetail}
            hasApplied={true}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build (components not imported into a route yet)

- [ ] **Step 5: Commit**

```bash
git add src/components/my-campaigns/AppliedPhaseView.tsx src/components/my-campaigns/ActivePhaseView.tsx src/components/my-campaigns/CompletedPhaseView.tsx
git commit -m "feat: add phase view components for applied, active, and completed campaign states"
```

---

## Task 6: Create MyCampaignDetailPage

**Files:**
- Create: `src/pages/MyCampaignDetailPage.tsx`

The orchestrator page — detects the creator's lifecycle phase for the given campaign and renders the appropriate view.

- [ ] **Step 1: Create the page**

Create `src/pages/MyCampaignDetailPage.tsx`:

```typescript
import { useParams } from 'react-router-dom';
import { useCampaignById } from '@/hooks/useCampaignQueries';
import { useCampaignDetailEnriched } from '@/hooks/useCampaignDetailEnriched';
import { useCreatorApplications } from '@/hooks/useCreatorApplications';
import { useCreatorCollaborations } from '@/hooks/useCreatorCollaborations';
import { CampaignDetailHeader } from '@/components/my-campaigns/CampaignDetailHeader';
import { AppliedPhaseView } from '@/components/my-campaigns/AppliedPhaseView';
import { ActivePhaseView } from '@/components/my-campaigns/ActivePhaseView';
import { CompletedPhaseView } from '@/components/my-campaigns/CompletedPhaseView';
import { Skeleton } from '@/components/ui/skeleton';

export default function MyCampaignDetailPage() {
  const { id: campaignId } = useParams<{ id: string }>();

  const { data: campaign, isLoading: campaignLoading } = useCampaignById(campaignId!);
  const { data: enrichedDetail } = useCampaignDetailEnriched(campaignId || null, campaign?.user_id || null);
  const { data: applications = [] } = useCreatorApplications();
  const { data: activeCollabs = [] } = useCreatorCollaborations('active');
  const { data: completedCollabs = [] } = useCreatorCollaborations('completed');

  const application = applications.find((a) => a.campaign_id === campaignId);
  const activeCollab = activeCollabs.find((c) => c.campaign_id === campaignId);
  const completedCollab = completedCollabs.find((c) => c.campaign_id === campaignId);

  const isLoading = campaignLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-300 p-4 space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gray-300 flex items-center justify-center">
        <p className="text-gray-600">Campaign not found</p>
      </div>
    );
  }

  // Phase detection: active > completed > applied
  const phase = activeCollab ? 'active' : completedCollab ? 'completed' : 'applied';

  const stats = buildStats(phase, campaign, activeCollab, completedCollab);

  return (
    <div className="min-h-screen bg-gray-300">
      <CampaignDetailHeader
        campaign={campaign}
        phase={phase}
        stats={stats}
        applicationStatus={application?.status}
      />

      {phase === 'active' && activeCollab && (
        <ActivePhaseView
          campaign={campaign}
          enrichedDetail={enrichedDetail}
          collaborationId={activeCollab.id}
        />
      )}

      {phase === 'completed' && completedCollab && (
        <CompletedPhaseView
          campaign={campaign}
          enrichedDetail={enrichedDetail}
          collaboration={completedCollab}
        />
      )}

      {phase === 'applied' && application && (
        <AppliedPhaseView
          campaign={campaign}
          enrichedDetail={enrichedDetail}
          application={application}
        />
      )}

      {phase === 'applied' && !application && (
        <div className="px-4 pt-4 pb-24">
          <p className="text-gray-500 text-center">No application found for this campaign.</p>
        </div>
      )}
    </div>
  );
}

function buildStats(
  phase: 'applied' | 'active' | 'completed',
  campaign: { fixed_price?: number; budget_min?: number; budget_max?: number; deadline?: string },
  activeCollab?: { content_deadline?: string | null } | null,
  completedCollab?: { completed_at?: string | null; existing_review_rating?: number } | null,
): { label: string; value: string; color?: string }[] {
  if (phase === 'active') {
    const price = campaign.fixed_price ?? campaign.budget_min ?? 0;
    const deadline = activeCollab?.content_deadline || campaign.deadline;
    const daysLeft = deadline ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000) : null;
    return [
      { label: 'Value', value: `$${price}` },
      { label: 'Deadline', value: deadline ? new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—' },
      ...(daysLeft != null ? [{ label: 'Remaining', value: `${daysLeft} days`, color: daysLeft <= 2 ? 'text-red-500' : undefined }] : []),
    ];
  }
  if (phase === 'completed') {
    const price = campaign.fixed_price ?? campaign.budget_min ?? 0;
    const completedDate = completedCollab?.completed_at
      ? new Date(completedCollab.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '—';
    const rating = completedCollab?.existing_review_rating;
    return [
      { label: 'Earned', value: `$${price}` },
      { label: 'Completed', value: completedDate },
      ...(rating ? [{ label: 'Rating', value: `⭐ ${rating}` }] : []),
    ];
  }
  return [];
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build (page not routed yet)

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyCampaignDetailPage.tsx
git commit -m "feat: add MyCampaignDetailPage with phase-dependent view orchestration"
```

---

## Task 7: Create CollaborationRedirect Component

**Files:**
- Create: `src/components/CollaborationRedirect.tsx`

Handles the legacy `/projects/:id` route by looking up the collaboration's campaign_id and redirecting.

- [ ] **Step 1: Create the redirect component**

Create `src/components/CollaborationRedirect.tsx`:

```typescript
import { useParams, Navigate } from 'react-router-dom';
import { useCollaboration } from '@/hooks/useCollaboration';
import { Skeleton } from '@/components/ui/skeleton';

export function CollaborationRedirect() {
  const { id } = useParams<{ id: string }>();
  const { data: collaboration, isLoading, error } = useCollaboration(id!);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (error || !collaboration) {
    return <Navigate to="/dashboard/creator/my-campaigns" replace />;
  }

  return <Navigate to={`/dashboard/creator/my-campaigns/${collaboration.campaign_id}`} replace />;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/components/CollaborationRedirect.tsx
git commit -m "feat: add CollaborationRedirect for legacy /projects/:id URLs"
```

---

## Task 8: Wire Routes in App.tsx

**Files:**
- Modify: `src/App.tsx`

Add new routes, add redirects for old routes. Keep old page imports temporarily until Task 11 deletes them.

- [ ] **Step 1: Add lazy imports for new pages**

Near the existing lazy imports (around lines 41-59), add:

```typescript
const MyCampaignsPage = lazy(() => import("./pages/MyCampaignsPage"));
const MyCampaignDetailPage = lazy(() => import("./pages/MyCampaignDetailPage"));
```

- [ ] **Step 2: Add import for CollaborationRedirect**

Add at the top of the file with other component imports:

```typescript
import { CollaborationRedirect } from './components/CollaborationRedirect';
```

- [ ] **Step 3: Add new routes**

Near the existing creator campaign routes (around line 249), add the new routes BEFORE the existing ones:

```typescript
{/* My Campaigns (unified) */}
<Route path="/dashboard/creator/my-campaigns" element={<ProtectedRoute><MyCampaignsPage /></ProtectedRoute>} />
<Route path="/dashboard/creator/my-campaigns/:id" element={<ProtectedRoute><MyCampaignDetailPage /></ProtectedRoute>} />
```

- [ ] **Step 4: Replace old routes with redirects**

Replace the old route entries (lines 252-253) with redirects:

Change:
```typescript
<Route path="/dashboard/creator/applications" element={<ProtectedRoute><CreatorApplications /></ProtectedRoute>} />
<Route path="/dashboard/creator/projects" element={<ProtectedRoute><CreatorProjects /></ProtectedRoute>} />
```
To:
```typescript
<Route path="/dashboard/creator/applications" element={<Navigate to="/dashboard/creator/my-campaigns?tab=applied" replace />} />
<Route path="/dashboard/creator/projects" element={<Navigate to="/dashboard/creator/my-campaigns?tab=active" replace />} />
```

Replace the `/projects/:id` route (line 271) with the redirect component:

Change:
```typescript
<Route path="/projects/:id" element={<ProtectedRoute><ProjectDetailsPage /></ProtectedRoute>} />
```
To:
```typescript
<Route path="/projects/:id" element={<ProtectedRoute><CollaborationRedirect /></ProtectedRoute>} />
```

Ensure `Navigate` is imported from `react-router-dom` (it likely already is).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean build. Old page imports may generate unused-import warnings — that's OK, they'll be removed in Task 11.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire My Campaigns routes and redirect legacy creator URLs"
```

---

## Task 9: Strip Marketplace to Discovery Only

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`

Remove the Applied, Active, Done tabs. Keep the Available campaign content. Add a Donny Picks tab.

- [ ] **Step 1: Update tab type and definition**

At line 31, change:
```typescript
type Tab = 'available' | 'applied' | 'active' | 'done';
```
To:
```typescript
type Tab = 'all' | 'donny';
```

At lines 151-156, replace the tabs array with:
```typescript
const tabs: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All Campaigns' },
  { id: 'donny', label: 'Donny Picks' },
];
```

Update the default tab state (find the `useState` for `activeTab`):
```typescript
const [activeTab, setActiveTab] = useState<Tab>('all');
```

- [ ] **Step 2: Remove unused hook calls**

Remove or comment out the data fetching for applications and collaborations (lines 41-43):
```typescript
// REMOVE these lines:
const { data: applications = [], isLoading: appsLoading } = useCreatorApplications();
const { data: activeCollabs = [], isLoading: activeLoading } = useCreatorCollaborations('active');
const { data: completedCollabs = [], isLoading: completedLoading } = useCreatorCollaborations('completed');
```

Also remove the `pendingCount` calculation that depends on `applications`.

- [ ] **Step 3: Update tab content rendering**

Replace the tab content section (lines 208-393). The structure changes from four tab branches to two:

```typescript
{/* Tab Content */}
{activeTab === 'all' && (
  <>
    {/* Keep ALL existing Available tab content as-is (lines 208-323):
        - CampaignSearchFilters
        - Mobile swipe card stack (CampaignSwipeCard)
        - Desktop grid (DonnyPicksRow + campaign grid)
        - Empty states
        This block already exists — just change the condition from
        activeTab === 'available' to activeTab === 'all'. */}
  </>
)}

{activeTab === 'donny' && (
  <div className="px-4 py-4">
    {donnyPicks && donnyPicks.length > 0 ? (
      <div className="space-y-3">
        {donnyPicks.map((pick) => (
          <div
            key={pick.campaign.id}
            onClick={() => handleViewDetail(pick.campaign)}
            className="bg-white rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow border border-teal-200"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-bold text-gray-900 text-sm">{pick.campaign.title}</div>
                <div className="text-xs text-gray-500">{pick.campaign.business_profile?.business_name || 'Unknown Business'}</div>
              </div>
              <span className="bg-teal-50 text-teal-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {pick.score || 0}% match
              </span>
            </div>
            {pick.matchReasons?.length > 0 && (
              <p className="text-xs text-gray-500">{pick.matchReasons[0]}</p>
            )}
          </div>
        ))}
      </div>
    ) : (
      <div className="text-center py-12">
        <p className="text-gray-600 font-semibold">No Donny Picks yet</p>
        <p className="text-gray-400 text-sm mt-1">Apply to more campaigns so Donny can learn your preferences</p>
      </div>
    )}
  </div>
)}
```

**Key:** The existing Available tab content (search filters, swipe stack, desktop grid) is kept exactly as-is — only the `activeTab === 'available'` condition changes to `activeTab === 'all'`. Delete the `activeTab === 'applied'`, `activeTab === 'active'`, and `activeTab === 'done'` blocks entirely (lines 324-393).

Verify that `donnyPicks` and `handleViewDetail` (or equivalent callback that opens the campaign detail modal) already exist in the component scope — they're used in the existing `DonnyPicksRow` rendering within the Available tab.

- [ ] **Step 4: Clean up unused imports**

Remove imports that are no longer needed:
- `useCreatorApplications` / `CreatorApplication`
- `useCreatorCollaborations`
- `CreatorApplicationCard`
- `ActiveCampaignCard`
- `CompletedCampaignCard`

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean build with no unused import warnings from this file.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "refactor: strip Marketplace to discovery-only with All Campaigns and Donny Picks tabs"
```

---

## Task 10: Update Dashboard Navigation Targets

**Files:**
- Modify: `src/pages/CreatorDashboard.tsx:185,231`

Update links from Recent Activity and Upcoming Deadlines to point to the new My Campaigns detail page.

- [ ] **Step 1: Update Recent Activity links**

At line 185, change:
```typescript
<Link key={activity.id} to={`/dashboard/creator/campaigns/${activity.campaign_id}`}>
```
To:
```typescript
<Link key={activity.id} to={`/dashboard/creator/my-campaigns/${activity.campaign_id}`}>
```

- [ ] **Step 2: Update Upcoming Deadlines links**

At line 231, change:
```typescript
<Link key={deadline.id} to={`/dashboard/creator/campaigns/${deadline.campaign_id}`}>
```
To:
```typescript
<Link key={deadline.id} to={`/dashboard/creator/my-campaigns/${deadline.campaign_id}`}>
```

- [ ] **Step 3: Update any stats card links**

Search the file for any link to `/dashboard/creator/applications` or `/dashboard/creator/projects` and replace:
- `/dashboard/creator/applications` → `/dashboard/creator/my-campaigns?tab=applied`
- `/dashboard/creator/projects` → `/dashboard/creator/my-campaigns?tab=active`

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreatorDashboard.tsx
git commit -m "fix: update dashboard links to point to unified My Campaigns page"
```

---

## Task 11: Delete Old Pages and Clean Up

**Files:**
- Delete: `src/pages/CreatorApplications.tsx`
- Delete: `src/pages/CreatorProjects.tsx`
- Delete: `src/pages/ProjectDetailsPage.tsx`
- Modify: `src/App.tsx` (remove old lazy imports)

- [ ] **Step 1: Delete old page files**

```bash
rm src/pages/CreatorApplications.tsx
rm src/pages/CreatorProjects.tsx
rm src/pages/ProjectDetailsPage.tsx
```

- [ ] **Step 2: Remove old lazy imports from App.tsx**

Remove these lines from App.tsx (around lines 51, 58-59):
```typescript
const CreatorApplications = lazy(() => import("./pages/CreatorApplications"));
const CreatorProjects = lazy(() => import("./pages/CreatorProjects"));
const ProjectDetailsPage = lazy(() => import("./pages/ProjectDetailsPage"));
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build with no missing module errors. All old routes now use redirects or the CollaborationRedirect component.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete CreatorApplications, CreatorProjects, and ProjectDetailsPage (replaced by My Campaigns)"
```

---

## Task 12: Smoke Test and Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: Clean build, zero errors, zero TypeScript errors.

- [ ] **Step 2: Start dev server and test**

Run: `npm run dev`

Test the following flows:

1. **Navigation:** Sidebar shows "My Campaigns" (not "My Applications" or "My Projects"). Clicking it navigates to `/dashboard/creator/my-campaigns`.

2. **My Campaigns list:** Page loads with Applied/Active/Done tabs. Earnings summary shows at top. Cards display correctly with status colors and smart CTAs.

3. **Applied tab:** Shows pending applications with yellow left border and "View →" CTA.

4. **Active tab:** Shows active projects with teal left border, progress bar, deadline urgency, and "Upload →" CTA.

5. **Done tab:** Shows completed projects with green left border and "Review →" CTA.

6. **Campaign detail — Applied:** Tap a pending application card → shows application status card + full campaign brief below.

7. **Campaign detail — Active:** Tap an active project card → shows Project tab (stepper, deliverables, upload, messages) and Brief tab (full campaign details).

8. **Campaign detail — Completed:** Tap a completed project → shows Summary tab (delivered items, payment) and Brief tab.

9. **Brief tab:** Verify the full campaign brief is accessible via the Brief tab in both Active and Completed states.

10. **Marketplace:** Only shows "All Campaigns" and "Donny Picks" tabs. No Applied/Active/Done tabs.

11. **Redirects:** Navigate to old URLs and verify redirects:
    - `/dashboard/creator/applications` → `/dashboard/creator/my-campaigns?tab=applied`
    - `/dashboard/creator/projects` → `/dashboard/creator/my-campaigns?tab=active`

12. **Dashboard links:** Recent Activity and Upcoming Deadlines link to `/dashboard/creator/my-campaigns/:id`.

13. **Business side unaffected:** Navigate to business dashboard and campaign views — no changes.

- [ ] **Step 3: Fix any issues found during testing**

Address any TypeScript errors, missing props, broken imports, or UI issues discovered during the smoke test. Each fix should be a separate commit.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address smoke test issues from campaign experience consolidation"
```
