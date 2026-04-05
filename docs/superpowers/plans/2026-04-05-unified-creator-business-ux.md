# Unified Creator & Business UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Creator and Business dashboards so both roles share the same visual design system — pink gradient header, teal-bordered cards, pill buttons, responsive stats grid.

**Architecture:** Extract 5 shared components from the Creator dashboard's existing patterns (`DashboardHero`, `DonnyAIBar`, `DashboardStatsGrid`, `QuickActionButtons`, `ActivityFeedCard`). Both dashboard pages import these shared components and pass role-specific content via props. Role-specific sections (Creator: Deadlines, Calendar; Business: Sponsorship Proposals, Side Feed) are preserved below the unified sections.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, Skeleton (from shadcn/ui)

**Spec:** `docs/superpowers/specs/2026-04-05-unified-creator-business-ux-design.md`

---

## File Structure

### New files (shared components)
- `src/components/dashboard/DashboardHero.tsx` — Pink gradient wrapper with welcome message
- `src/components/dashboard/DonnyAIBar.tsx` — Unified Donny search bar
- `src/components/dashboard/DashboardStatsGrid.tsx` — Responsive 2x2/4-col stats grid
- `src/components/dashboard/QuickActionButtons.tsx` — Primary + outlined button pair
- `src/components/dashboard/ActivityFeedCard.tsx` — Teal-bordered feed item card

### Modified files
- `src/pages/CreatorDashboard.tsx` — Refactor to use shared components
- `src/pages/BusinessDashboard.tsx` — Refactor to use shared components
- `src/pages/BusinessProjects.tsx` — Consistency pass (borders, buttons)
- `src/pages/BusinessActivity.tsx` — Consistency pass
- `src/pages/BusinessSettings.tsx` — Consistency pass (header only)
- `src/pages/BusinessProposals.tsx` — Consistency pass
- `src/pages/BusinessSponsorships.tsx` — Consistency pass

### Deprecated (no longer imported by dashboards, not deleted)
- `src/components/dashboard/BusinessStatsRow.tsx`
- `src/components/dashboard/ActiveCampaignsFeed.tsx`

---

## Task 1: Create `DashboardHero` Component

**Files:**
- Create: `src/components/dashboard/DashboardHero.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/DashboardHero.tsx
import React from 'react';

interface DashboardHeroProps {
  roleLabel: string;       // "Creator Dashboard" or "Business Dashboard"
  userName: string;        // Profile name to display
  children?: React.ReactNode; // Donny bar, stats, quick actions go here
}

export function DashboardHero({ roleLabel, userName, children }: DashboardHeroProps) {
  return (
    <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-8">
      <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4">
        <div className="min-w-0">
          <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
            {roleLabel}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 truncate mt-1">
            Welcome back, {userName}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Here's what's happening with your account today.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors related to DashboardHero

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardHero.tsx
git commit -m "feat: add DashboardHero shared component"
```

---

## Task 2: Create `DonnyAIBar` Component

**Files:**
- Create: `src/components/dashboard/DonnyAIBar.tsx`
- Reference: `src/components/donny/DonnyAskBar.tsx` (existing pattern to follow)

The new component is modeled after `DonnyAskBar` but simplified: same teal-bordered pill bar, role-specific placeholder, dispatches `donny-open-chat` event on submit.

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/DonnyAIBar.tsx
import React, { useState, useRef } from 'react';
import donnyIcon from '@/assets/Donny_icon.png';
import { cn } from '@/lib/utils';

interface DonnyAIBarProps {
  placeholder: string; // Role-specific placeholder text
}

export function DonnyAIBar({ placeholder }: DonnyAIBarProps) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    window.dispatchEvent(
      new CustomEvent('donny-open-chat', { detail: { message: query.trim() } })
    );
    setQuery('');
    setFocused(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 bg-white border-2 border-dc-teal rounded-full transition-all duration-200',
          focused && 'shadow-md ring-2 ring-dc-teal/20'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <img
          src={donnyIcon}
          alt="Donny"
          className="w-8 h-8 md:w-9 md:h-9 flex-shrink-0 rounded-full object-contain shadow-[0_0_8px_rgba(77,217,192,0.4)]"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
        />
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DonnyAIBar.tsx
git commit -m "feat: add DonnyAIBar shared component"
```

---

## Task 3: Create `DashboardStatsGrid` Component

**Files:**
- Create: `src/components/dashboard/DashboardStatsGrid.tsx`
- Reference: `src/components/dashboard/BusinessStatsRow.tsx` (existing, will be replaced)
- Reference: `src/pages/CreatorDashboard.tsx:112-167` (existing inline stats)

This component takes an array of stat items and renders them in a responsive grid: 2 columns on mobile, 4 on tablet+. Each card has a teal border, icon, label, value, optional subtitle, and loading state.

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/DashboardStatsGrid.tsx
import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { type LucideIcon } from 'lucide-react';

export interface StatItem {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
}

interface DashboardStatsGridProps {
  stats: StatItem[];
  isLoading: boolean;
}

export function DashboardStatsGrid({ stats, isLoading }: DashboardStatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-9 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
              {stat.label}
            </p>
            <stat.icon className="h-4 w-4 text-dc-teal" />
          </div>
          <div className="text-3xl font-extrabold text-gray-900">
            {stat.value}
          </div>
          {stat.subtitle && (
            <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardStatsGrid.tsx
git commit -m "feat: add DashboardStatsGrid shared component"
```

---

## Task 4: Create `QuickActionButtons` Component

**Files:**
- Create: `src/components/dashboard/QuickActionButtons.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/QuickActionButtons.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export interface QuickAction {
  label: string;
  to: string;
  variant: 'primary' | 'secondary';
}

interface QuickActionButtonsProps {
  actions: [QuickAction, QuickAction]; // Exactly 2 buttons
}

export function QuickActionButtons({ actions }: QuickActionButtonsProps) {
  return (
    <div className="flex gap-3">
      {actions.map((action) => (
        <Button
          key={action.label}
          asChild
          className={
            action.variant === 'primary'
              ? 'flex-1 rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-semibold'
              : 'flex-1 rounded-full border-2 border-dc-teal bg-white text-gray-900 hover:bg-dc-teal/10 font-semibold'
          }
          variant={action.variant === 'primary' ? 'default' : 'outline'}
        >
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/QuickActionButtons.tsx
git commit -m "feat: add QuickActionButtons shared component"
```

---

## Task 5: Create `ActivityFeedCard` Component

**Files:**
- Create: `src/components/dashboard/ActivityFeedCard.tsx`
- Reference: `src/components/dashboard/ActiveCampaignsFeed.tsx` (existing, will be replaced)

Generic teal-bordered card for activity/campaign items. Accepts title, subtitle, status, and onClick.

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/ActivityFeedCard.tsx
import React from 'react';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  published: 'bg-emerald-100 text-emerald-700',
  'in progress': 'bg-emerald-100 text-emerald-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  review: 'bg-amber-100 text-amber-800',
  reviewing: 'bg-amber-100 text-amber-800',
  completed: 'bg-gray-100 text-gray-600',
  draft: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
  rejected: 'bg-red-100 text-red-600',
};

interface ActivityFeedCardProps {
  title: string;
  subtitle: string;
  status: string;
  onClick?: () => void;
}

export function ActivityFeedCard({ title, subtitle, status, onClick }: ActivityFeedCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  const statusClass = statusStyles[status.toLowerCase()] ?? 'bg-gray-100 text-gray-600';

  return (
    <Wrapper
      onClick={onClick}
      className={`w-full border-2 border-dc-teal rounded-2xl p-4 bg-white text-left ${
        onClick ? 'hover:bg-gray-50 transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-dc-dark truncate">{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${statusClass}`}
        >
          {status}
        </span>
      </div>
    </Wrapper>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ActivityFeedCard.tsx
git commit -m "feat: add ActivityFeedCard shared component"
```

---

## Task 6: Refactor `CreatorDashboard.tsx` to Use Shared Components

**Files:**
- Modify: `src/pages/CreatorDashboard.tsx`

This is the biggest task. Replace the inline header, stats, and buttons with shared components. Preserve: Recent Activity, Upcoming Deadlines, Calendar, RatingPromptManager.

- [ ] **Step 1: Read current file to understand exact structure**

Read: `src/pages/CreatorDashboard.tsx` (entire file, 289 lines)

- [ ] **Step 2: Rewrite the page using shared components**

**Imports to ADD:**
```tsx
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DonnyAIBar } from '@/components/dashboard/DonnyAIBar';
import { DashboardStatsGrid, type StatItem } from '@/components/dashboard/DashboardStatsGrid';
import { QuickActionButtons, type QuickAction } from '@/components/dashboard/QuickActionButtons';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
```

**Imports to REMOVE:**
```tsx
// DELETE these lines:
import { AskBar } from '@/components/ai-assistant';
import { useAIChatModal } from '@/contexts/AIChatModalContext';
import { DonnyCard } from '@/components/donny/DonnyCard';
```

**Remove from component body:** `const { openModal } = useAIChatModal();`

**Keep existing imports:** `useCreatorDashboardStats`, `useCreatorRecentActivity`, `useCreatorUpcomingDeadlines`, `RatingPromptManager`, `Calendar`, `Badge`, `Skeleton`, `DollarSign`, `Target`, `Clock`, `Star`

**Full JSX structure** (replace everything inside `<DashboardLayout userRole="content_creator">`):

```tsx
<div className="min-h-screen bg-white overflow-x-hidden">
  {/* Unified gradient header */}
  <DashboardHero
    roleLabel="Creator Dashboard"
    userName={profile.creator_name || profile.full_name}
  >
    {/* Donny AI Bar */}
    <DonnyAIBar placeholder='Ask Donny... "Find campaigns near me"' />

    {/* Rating Prompts */}
    <RatingPromptManager />

    {/* Stats Grid */}
    <DashboardStatsGrid stats={creatorStats} isLoading={statsLoading} />

    {/* Quick Actions */}
    <QuickActionButtons actions={creatorActions} />
  </DashboardHero>

  {/* White body content */}
  <div className="px-4 py-6 pb-24 md:pb-0">
    <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">

      {/* Recent Activity */}
      <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
            Recent Activity
          </p>
        </div>
        <div className="px-4 pb-4">
          {activitiesLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : activities && activities.length > 0 ? (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-center space-x-4">
                  <Badge variant={getActivityBadgeVariant(activity.status)}>
                    {activity.status}
                  </Badge>
                  <span className="text-sm text-gray-700">{activity.description}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No recent activity yet</p>
              <p className="text-xs mt-1">Start applying to campaigns to see your activity here</p>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Deadlines — PRESERVED from existing */}
      <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
            Upcoming Deadlines
          </p>
        </div>
        <div className="px-4 pb-4">
          {/* Keep existing deadlines rendering logic unchanged */}
          {deadlinesLoading ? (
            /* existing skeleton */
          ) : deadlines && deadlines.length > 0 ? (
            /* existing deadline items with getDeadlineColor */
          ) : (
            /* existing empty state */
          )}
        </div>
      </div>

      {/* Calendar — PRESERVED from existing */}
      <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
            Calendar
          </p>
        </div>
        <div className="px-4 pb-4 flex justify-center">
          <Calendar />
        </div>
      </div>

    </div>
  </div>
</div>
```

**Stats array** (defined inside component body, after hooks):

```tsx
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const creatorStats: StatItem[] = [
  { label: 'Revenue', value: formatCurrency(stats?.totalRevenue || 0), subtitle: 'From completed projects', icon: DollarSign },
  { label: 'Applied', value: stats?.campaignsApplied || 0, subtitle: 'Total applications', icon: Target },
  { label: 'Completed', value: stats?.projectsCompleted || 0, subtitle: 'Successfully delivered', icon: Clock },
  { label: 'Rating', value: stats?.averageRating ? stats.averageRating.toFixed(1) : 'N/A', subtitle: 'Client feedback score', icon: Star },
];

const creatorActions: [QuickAction, QuickAction] = [
  { label: 'Browse Campaigns', to: '/dashboard/creator/campaigns', variant: 'primary' },
  { label: 'Update Portfolio', to: '/dashboard/creator/settings', variant: 'secondary' },
];
```

**Note:** The "Quick Actions" card section (3 outline buttons: Browse New Campaigns, View Active Projects, Manage Reviews) is intentionally REMOVED — replaced by the two `QuickActionButtons` in the header. The Deadlines and Calendar sections use their existing rendering logic verbatim (copy from current file lines 232-279).

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify page loads in browser**

Run: `npm run dev` (if not already running)
Navigate to creator dashboard and verify:
- Pink gradient header appears
- Stats show in 2x2 grid on mobile
- Donny bar has creator placeholder
- Quick action buttons are pill-shaped
- Deadlines, Calendar still appear below
- RatingPromptManager still renders

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreatorDashboard.tsx
git commit -m "refactor: CreatorDashboard uses shared dashboard components"
```

---

## Task 7: Refactor `BusinessDashboard.tsx` to Use Shared Components

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`

Replace the flat white layout with shared components. Preserve: Sponsorship Proposals section, Dragon Feed side panel (desktop `lg:`), Feed Lightbox modal, RatingPromptManager.

- [ ] **Step 1: Read current file to understand exact structure**

Read: `src/pages/BusinessDashboard.tsx` (entire file, 149 lines)

- [ ] **Step 2: Rewrite the page using shared components**

**Imports to ADD:**
```tsx
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DonnyAIBar } from '@/components/dashboard/DonnyAIBar';
import { DashboardStatsGrid, type StatItem } from '@/components/dashboard/DashboardStatsGrid';
import { QuickActionButtons, type QuickAction } from '@/components/dashboard/QuickActionButtons';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { useBusinessActiveCampaigns } from '@/hooks/useBusinessActiveCampaigns';
import { useBusinessDashboardMetrics } from '@/hooks/useBusinessDashboardMetrics';
import { Rocket, Clock, DollarSign, Target } from 'lucide-react';
import { Loader2 } from 'lucide-react';
```

**Imports to REMOVE:**
```tsx
// DELETE these lines:
import { DonnyAskBar } from '@/components/donny/DonnyAskBar';
import { BusinessStatsRow } from '@/components/dashboard/BusinessStatsRow';
import { ActiveCampaignsFeed } from '@/components/dashboard/ActiveCampaignsFeed';
```

**Keep existing imports:** `useSponsorshipProposals`, `SponsorshipProposalCard`, `BusinessDashboardSideFeed`, `FeedLightbox`, `FeedMediaItem`, `RatingPromptManager`, `useNavigate`, `useAuth`, `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`

**Helper function** (add inside component or above it):
```tsx
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

**Hook calls** (add inside component body):
```tsx
const { data: metrics, isLoading: metricsLoading } = useBusinessDashboardMetrics();
const { data: campaigns, isLoading: campaignsLoading } = useBusinessActiveCampaigns();
```

**Stats & actions arrays** (inside component body):
```tsx
const businessStats: StatItem[] = metrics ? [
  { label: metrics.activeCampaigns.label, value: metrics.activeCampaigns.value, icon: Rocket },
  { label: metrics.pendingContent.label, value: metrics.pendingContent.value, icon: Clock },
  { label: metrics.totalSpend.label, value: metrics.totalSpend.value, icon: DollarSign },
  { label: metrics.avgEngagement.label, value: metrics.avgEngagement.value, icon: Target },
] : [];

const businessActions: [QuickAction, QuickAction] = [
  { label: 'Create Campaign', to: '/dashboard/business/campaigns/create', variant: 'primary' },
  { label: 'Browse Creators', to: '/dashboard/business/creators', variant: 'secondary' },
];
```

**Full JSX structure** (replace everything inside `<DashboardLayout userRole="business_client">`):

```tsx
<div className="flex h-full overflow-hidden">
  {/* Main Content Area */}
  <div className="flex-1 overflow-y-auto overflow-x-hidden">

    {/* Unified gradient header */}
    <DashboardHero
      roleLabel="Business Dashboard"
      userName={profile.full_name || 'there'}
    >
      <DonnyAIBar placeholder='Ask Donny... "Find creators near me"' />
      <RatingPromptManager />
      <DashboardStatsGrid stats={businessStats} isLoading={metricsLoading} />
      <QuickActionButtons actions={businessActions} />
    </DashboardHero>

    {/* White body content */}
    <div className="p-4 sm:p-6 space-y-4">
      <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4">

        {/* Active Campaigns Feed */}
        <div>
          <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal mb-2">
            Active Campaigns
          </p>
          {campaignsLoading ? (
            <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-dc-teal animate-spin" />
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white text-center">
              <p className="text-sm text-gray-500">No active campaigns yet.</p>
              <button
                onClick={() => navigate('/dashboard/business/campaigns/create')}
                className="text-sm font-semibold text-dc-teal hover:underline mt-1"
              >
                Let Donny help you create one
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <ActivityFeedCard
                  key={campaign.id}
                  title={campaign.title}
                  subtitle={`${campaign.creatorName ? `@${campaign.creatorName}` : 'Unassigned'} · Due ${formatDate(campaign.deadline)}`}
                  status={campaign.status}
                  onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sponsorship Proposals — PRESERVED, same conditional logic */}
        {pendingProposals.length > 0 && (
          <Card className="border-2 border-dc-teal rounded-2xl bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <DollarSign className="h-5 w-5 text-dc-teal" />
                Sponsorship Proposals ({pendingProposals.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                You have {pendingProposals.length} pending sponsorship {pendingProposals.length === 1 ? 'proposal' : 'proposals'} from brands interested in funding your campaigns.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingProposals.slice(0, 4).map((proposal) => (
                  <SponsorshipProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onAccept={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'accepted' })}
                    onReject={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'rejected' })}
                  />
                ))}
              </div>
              {pendingProposals.length > 4 && (
                <Button
                  variant="outline"
                  className="w-full mt-4 rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                  onClick={() => navigate('/dashboard/business/sponsorships')}
                >
                  View All Proposals
                </Button>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>

  </div>

  {/* Side Feed — Desktop only (PRESERVED, no changes to this block) */}
  <div className="hidden lg:block w-80 shrink-0 border-l bg-muted/10 sticky top-14 h-[calc(100vh-56px)] overflow-hidden">
    <BusinessDashboardSideFeed
      onItemClick={handleFeedItemClick}
      onFeedItemsLoaded={setAllFeedItems}
    />
  </div>
</div>

{/* Lightbox Modal (PRESERVED, no changes) */}
<FeedLightbox
  item={selectedFeedItem}
  allItems={allFeedItems}
  currentIndex={currentFeedIndex}
  onClose={() => setSelectedFeedItem(null)}
  onNavigate={handleFeedNavigate}
/>
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify page loads in browser**

Navigate to business dashboard and verify:
- Pink gradient header appears (was flat white before)
- Stats show in 2x2 grid on mobile with teal borders (was 4-col, no borders)
- Donny bar has business placeholder
- Quick action buttons are pill-shaped (was rounded-xl)
- Active Campaigns feed uses teal-bordered cards
- Sponsorship Proposals still visible below feed
- Desktop side feed panel still works
- RatingPromptManager still renders

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusinessDashboard.tsx
git commit -m "refactor: BusinessDashboard uses shared dashboard components"
```

---

## Task 8: Secondary Pages Consistency Pass

**Files:**
- Modify: `src/pages/BusinessProjects.tsx`
- Modify: `src/pages/BusinessActivity.tsx`
- Modify: `src/pages/BusinessSettings.tsx`
- Modify: `src/pages/BusinessProposals.tsx`
- Modify: `src/pages/BusinessSponsorships.tsx`

For each file, search for and make two types of changes:
1. Replace `border-gray-200` with `border-dc-teal` on card elements
2. Replace `rounded-xl` with `rounded-full` on button elements

**Known occurrences from codebase grep:**
- `BusinessProposals.tsx` — 1 occurrence of `border-gray-200`
- `BusinessProjects.tsx`, `BusinessActivity.tsx`, `BusinessSettings.tsx`, `BusinessSponsorships.tsx` — may have zero occurrences. If a file has no `border-gray-200` or `rounded-xl` to replace, skip it — no changes needed.

- [ ] **Step 1: Search each file for inconsistencies**

```bash
grep -n "border-gray-200\|rounded-xl" src/pages/BusinessProjects.tsx src/pages/BusinessActivity.tsx src/pages/BusinessSettings.tsx src/pages/BusinessProposals.tsx src/pages/BusinessSponsorships.tsx
```

Review results. Only modify files that have matches.

- [ ] **Step 2: Fix BusinessProposals.tsx**

This file has a confirmed `border-gray-200` occurrence. Replace with `border-dc-teal`.

- [ ] **Step 3: Fix any other files with matches**

For each file with matches from Step 1, replace `border-gray-200` → `border-dc-teal` and `rounded-xl` → `rounded-full` on buttons. Skip files with zero matches.

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/BusinessProjects.tsx src/pages/BusinessActivity.tsx src/pages/BusinessSettings.tsx src/pages/BusinessProposals.tsx src/pages/BusinessSponsorships.tsx
git commit -m "style: unify card borders and button shapes on secondary business pages"
```

---

## Task 9: Final Verification & Build

**Files:** None (verification only)

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Visual verification checklist**

Run: `npm run dev`

Check each item:
- [ ] Creator Dashboard: pink gradient header, 2x2 stats (mobile), Donny bar with creator placeholder, pill buttons, activity feed with teal cards, deadlines section, calendar
- [ ] Business Dashboard: pink gradient header (same as Creator), 2x2 stats (mobile), Donny bar with business placeholder, pill buttons, active campaigns with teal cards, sponsorship proposals, desktop side feed
- [ ] Resize to tablet+ width: both dashboards show 4-col stats
- [ ] BusinessProjects page: teal card borders, pill buttons
- [ ] BusinessProposals page: teal card borders

- [ ] **Step 3: Check for uncommitted changes**

```bash
git status
```

If any changes remain uncommitted from prior tasks, stage and commit them:
```bash
git add -A && git commit -m "creator-ux: unified design system with business dashboard"
```

If `git status` is clean, all work is already committed — done.
