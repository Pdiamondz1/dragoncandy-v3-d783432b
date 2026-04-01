# Business Dashboard Command Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the business/restaurant dashboard as a professional, data-forward command center with stats, hybrid Donny AI bar, active campaigns feed, and a 5-icon bottom nav.

**Architecture:** The dashboard page (`BusinessDashboard.tsx`) is rewritten with 6 new sections composed from 3 new components and 2 new hooks. The bottom nav config is reduced from 7→5 items. All changes are scoped to the business role — creator/brand pages are untouched.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Query (TanStack), Supabase JS client v2, Lucide React icons.

**Spec:** `docs/superpowers/specs/2026-04-01-business-dashboard-command-center-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useBusinessDashboardMetrics.ts` | Create | React Query hook: fetches 4 stats (active campaigns, pending content, total spend, avg engagement) from Supabase |
| `src/hooks/useBusinessActiveCampaigns.ts` | Create | React Query hook: fetches recent campaigns with collaborator info for the feed |
| `src/components/donny/DonnyAskBar.tsx` | Create | Hybrid Donny bar: teal pill input with expandable quick-action chips, opens chat sheet on typing |
| `src/components/dashboard/BusinessStatsRow.tsx` | Create | 4-metric stat cards with trend indicators and empty states |
| `src/components/dashboard/ActiveCampaignsFeed.tsx` | Create | Campaign list with status badges, creator assignment, due dates |
| `src/lib/navConfig.ts` | Modify | `businessBottomNav` array: 7 items → 5 items |
| `src/pages/BusinessDashboard.tsx` | Modify | Full rewrite: new header, DonnyAskBar, stats row, quick actions, campaign feed, preserved side feed |

---

## Task 1: Create `useBusinessDashboardMetrics` hook

**Files:**
- Create: `src/hooks/useBusinessDashboardMetrics.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useBusinessDashboardMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BusinessMetric {
  value: number | string;
  label: string;
  trend?: { direction: 'up' | 'down'; value: string } | null;
  emptyNudge?: string;
}

export interface BusinessDashboardMetrics {
  activeCampaigns: BusinessMetric;
  pendingContent: BusinessMetric;
  totalSpend: BusinessMetric;
  avgEngagement: BusinessMetric;
}

export function useBusinessDashboardMetrics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['business_dashboard_metrics', user?.id],
    queryFn: async (): Promise<BusinessDashboardMetrics> => {
      if (!user) throw new Error('User not authenticated');

      // Active campaigns count
      const { count: activeCount, error: activeError } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['active', 'published']);

      if (activeError) throw activeError;

      // Pending content (collaborations in progress on user's campaigns)
      const { data: pendingCollabs, error: pendingError } = await supabase
        .from('campaign_collaborations')
        .select('id, campaigns!inner(user_id)')
        .eq('campaigns.user_id', user.id)
        .eq('status', 'active');

      if (pendingError) throw pendingError;

      // Total spend (sum of proposed_rate from accepted applications on user's campaigns)
      const { data: acceptedApps, error: spendError } = await supabase
        .from('campaign_applications')
        .select('proposed_rate, campaigns!inner(user_id)')
        .eq('campaigns.user_id', user.id)
        .eq('status', 'accepted');

      if (spendError) throw spendError;

      const totalSpend = acceptedApps?.reduce(
        (sum, app) => sum + (Number(app.proposed_rate) || 0),
        0
      ) ?? 0;

      const activeCampaignsVal = activeCount ?? 0;
      const pendingContentVal = pendingCollabs?.length ?? 0;

      return {
        activeCampaigns: {
          value: activeCampaignsVal,
          label: 'Active Campaigns',
          trend: null,
          emptyNudge: activeCampaignsVal === 0 ? 'Launch your first campaign' : undefined,
        },
        pendingContent: {
          value: pendingContentVal,
          label: 'Pending Content',
          trend: null,
          emptyNudge: pendingContentVal === 0 ? 'No content pending' : undefined,
        },
        totalSpend: {
          value: totalSpend > 0 ? `$${totalSpend >= 1000 ? `${(totalSpend / 1000).toFixed(1)}k` : totalSpend}` : '$0',
          label: 'Total Spend',
          trend: null,
          emptyNudge: totalSpend === 0 ? 'Track your investment' : undefined,
        },
        avgEngagement: {
          value: '—',
          label: 'Avg. Engagement',
          trend: null,
          emptyNudge: 'Coming soon',
        },
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `useBusinessDashboardMetrics`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBusinessDashboardMetrics.ts
git commit -m "feat(dashboard): add useBusinessDashboardMetrics hook"
```

---

## Task 2: Create `useBusinessActiveCampaigns` hook

**Files:**
- Create: `src/hooks/useBusinessActiveCampaigns.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useBusinessActiveCampaigns.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActiveCampaignItem {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  deadline: string | null;
  creatorName: string | null;
}

export function useBusinessActiveCampaigns() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['business_active_campaigns', user?.id],
    queryFn: async (): Promise<ActiveCampaignItem[]> => {
      if (!user) throw new Error('User not authenticated');

      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, title, status, deadline')
        .eq('user_id', user.id)
        .in('status', ['draft', 'published', 'active'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      if (!campaigns || campaigns.length === 0) return [];

      // Fetch collaborations for these campaigns to get creator names
      const campaignIds = campaigns.map((c) => c.id);
      const { data: collabs, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select('campaign_id, creator_id, profiles:creator_id(full_name)')
        .in('campaign_id', campaignIds)
        .eq('status', 'active');

      if (collabError) throw collabError;

      // Map creator names by campaign_id
      const creatorMap = new Map<string, string>();
      collabs?.forEach((c) => {
        const name = (c.profiles as unknown as { full_name: string | null })?.full_name;
        if (name) creatorMap.set(c.campaign_id, name);
      });

      return campaigns.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status as ActiveCampaignItem['status'],
        deadline: c.deadline,
        creatorName: creatorMap.get(c.id) ?? null,
      }));
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `useBusinessActiveCampaigns`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBusinessActiveCampaigns.ts
git commit -m "feat(dashboard): add useBusinessActiveCampaigns hook"
```

---

## Task 3: Create `DonnyAskBar` component

**Files:**
- Create: `src/components/donny/DonnyAskBar.tsx`

- [ ] **Step 1: Create the component file**

```tsx
// src/components/donny/DonnyAskBar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DonnyAskBarProps {
  userRole: string;
}

const quickChips = [
  { label: 'Generate Campaign', href: '/dashboard/business/campaigns/create' },
  { label: 'Find Creators', href: '/dashboard/business/creators' },
  { label: 'Check Analytics', href: '/dashboard/analytics' },
];

export function DonnyAskBar({ userRole }: DonnyAskBarProps) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Close chips on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    // Open DonnyChatSheet with the query pre-filled
    window.dispatchEvent(
      new CustomEvent('donny-open-chat', { detail: { message: query.trim() } })
    );
    setQuery('');
    setFocused(false);
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3 bg-white border-2 border-dc-teal rounded-full transition-all duration-200',
            focused && 'shadow-md ring-2 ring-dc-teal/20'
          )}
          onClick={() => inputRef.current?.focus()}
        >
          <Sparkles className="w-5 h-5 text-dc-teal flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Ask Donny anything... &quot;Create a campaign for our new brunch menu&quot;"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
          />
        </div>
      </form>

      {/* Quick-action chips — visible on focus */}
      <div
        className={cn(
          'flex gap-2 flex-wrap px-1 transition-all duration-200 overflow-hidden',
          focused ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        {quickChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => {
              navigate(chip.href);
              setFocused(false);
            }}
            className="text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `DonnyAskBar`

- [ ] **Step 3: Commit**

```bash
git add src/components/donny/DonnyAskBar.tsx
git commit -m "feat(dashboard): add DonnyAskBar hybrid component with chips"
```

---

## Task 4: Create `BusinessStatsRow` component

**Files:**
- Create: `src/components/dashboard/BusinessStatsRow.tsx`

- [ ] **Step 1: Create the dashboard directory and component**

```tsx
// src/components/dashboard/BusinessStatsRow.tsx
import { useBusinessDashboardMetrics, type BusinessMetric } from '@/hooks/useBusinessDashboardMetrics';
import { Loader2 } from 'lucide-react';

function StatCard({ metric }: { metric: BusinessMetric }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm text-center">
      <div className="text-xl font-extrabold text-gray-900">{metric.value}</div>
      <div className="text-[10px] text-gray-500 mt-1 leading-tight">{metric.label}</div>
      {metric.trend && (
        <div
          className={`text-[10px] mt-1 ${
            metric.trend.direction === 'up' ? 'text-emerald-600' : 'text-red-500'
          }`}
        >
          {metric.trend.direction === 'up' ? '↑' : '↓'} {metric.trend.value}
        </div>
      )}
      {metric.emptyNudge && !metric.trend && (
        <div className="text-[10px] text-gray-400 mt-1">{metric.emptyNudge}</div>
      )}
    </div>
  );
}

export function BusinessStatsRow() {
  const { data: metrics, isLoading, isError } = useBusinessDashboardMetrics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-center h-20">
            <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !metrics) return null;

  const cards = [
    metrics.activeCampaigns,
    metrics.pendingContent,
    metrics.totalSpend,
    metrics.avgEngagement,
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {cards.map((metric) => (
        <StatCard key={metric.label} metric={metric} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `BusinessStatsRow`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/BusinessStatsRow.tsx
git commit -m "feat(dashboard): add BusinessStatsRow with 4 metric cards"
```

---

## Task 5: Create `ActiveCampaignsFeed` component

**Files:**
- Create: `src/components/dashboard/ActiveCampaignsFeed.tsx`

- [ ] **Step 1: Create the component file**

```tsx
// src/components/dashboard/ActiveCampaignsFeed.tsx
import { useNavigate } from 'react-router-dom';
import { useBusinessActiveCampaigns, type ActiveCampaignItem } from '@/hooks/useBusinessActiveCampaigns';
import { Loader2 } from 'lucide-react';

const statusStyles: Record<ActiveCampaignItem['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  published: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  completed: 'bg-gray-100 text-gray-600',
  draft: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-red-50 text-red-600',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActiveCampaignsFeed() {
  const { data: campaigns, isLoading, isError } = useBusinessActiveCampaigns();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-900">Active Campaigns</h3>
        <div className="bg-white rounded-xl p-6 shadow-sm flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
        </div>
      </div>
    );
  }

  if (isError) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-gray-900">Active Campaigns</h3>

      {!campaigns || campaigns.length === 0 ? (
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-sm text-gray-500">No active campaigns yet.</p>
          <button
            onClick={() => navigate('/dashboard/business/campaigns/create')}
            className="text-sm font-semibold text-dc-teal hover:underline mt-1"
          >
            Let Donny help you create one
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">{campaign.title}</div>
                <div className="text-xs text-gray-500">
                  {campaign.creatorName ? `@${campaign.creatorName}` : 'Unassigned'} · Due {formatDate(campaign.deadline)}
                </div>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-3 flex-shrink-0 capitalize ${
                  statusStyles[campaign.status] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {campaign.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `ActiveCampaignsFeed`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ActiveCampaignsFeed.tsx
git commit -m "feat(dashboard): add ActiveCampaignsFeed with status badges"
```

---

## Task 6: Update `businessBottomNav` in navConfig

**Files:**
- Modify: `src/lib/navConfig.ts:83-91`

- [ ] **Step 1: Replace the businessBottomNav array**

Replace lines 83-91 in `src/lib/navConfig.ts`:

```typescript
// OLD (7 items):
export const businessBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/business' },
  { icon: Heart, label: 'Feed', href: '/dashboard/business/dragon-feed' },
  { icon: Play, label: 'Inspire', href: '/dashboard/business/activity' },
  { icon: Plus, label: 'Create', href: '/dashboard/business/campaigns/create', isCenter: true, isDonny: true },
  { icon: List, label: 'Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Megaphone, label: 'Promos', href: '/dashboard/business/promotions' },
  { icon: User, label: 'Profile', href: '/dashboard/business/settings' },
];
```

Replace with:

```typescript
// NEW (5 items):
export const businessBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/business' },
  { icon: Megaphone, label: 'Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Plus, label: 'Create', href: '/dashboard/business/campaigns/create', isCenter: true },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/business/messages' },
  { icon: User, label: 'Profile', href: '/dashboard/business/settings' },
];
```

Note: `isDonny` is removed from the center button. `MessageSquare` is already imported at the top of the file (line 8). `Megaphone` is already imported (line 18). `Heart`, `Play`, and `List` are no longer used by this array but are still used by creator/brand nav arrays — do NOT remove their imports.

- [ ] **Step 2: Verify TypeScript compiles and other nav arrays are untouched**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors. Creator and brand bottom nav arrays unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/lib/navConfig.ts
git commit -m "feat(nav): reduce business bottom nav from 7 to 5 icons"
```

---

## Task 7: Rewrite `BusinessDashboard.tsx`

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`

This is the main rewrite. It replaces the entire content area inside `DashboardLayout` while preserving the desktop side feed and lightbox.

- [ ] **Step 1: Rewrite the dashboard page**

Replace the full contents of `src/pages/BusinessDashboard.tsx` with:

```tsx
// src/pages/BusinessDashboard.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Bell, Rocket, Users, DollarSign } from 'lucide-react';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import SponsorshipProposalCard from '@/components/campaigns/SponsorshipProposalCard';
import { BusinessDashboardSideFeed } from '@/components/dragon-feed/BusinessDashboardSideFeed';
import { FeedLightbox } from '@/components/dragon-feed/FeedLightbox';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';
import { DonnyAskBar } from '@/components/donny/DonnyAskBar';
import { BusinessStatsRow } from '@/components/dashboard/BusinessStatsRow';
import { ActiveCampaignsFeed } from '@/components/dashboard/ActiveCampaignsFeed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import dragonEmblem from '@/assets/dragon-emblem.png';

const BusinessDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { proposals, isLoading: proposalsLoading, updateProposalStatus } = useSponsorshipProposals();
  const [selectedFeedItem, setSelectedFeedItem] = useState<FeedMediaItem | null>(null);
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const [allFeedItems, setAllFeedItems] = useState<FeedMediaItem[]>([]);

  const pendingProposals = proposals.filter(p => p.status === 'pending');

  const handleFeedItemClick = (item: FeedMediaItem, index: number) => {
    setSelectedFeedItem(item);
    setCurrentFeedIndex(index);
  };

  const handleFeedNavigate = (index: number) => {
    if (allFeedItems[index]) {
      setSelectedFeedItem(allFeedItems[index]);
      setCurrentFeedIndex(index);
    }
  };

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex h-full overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-2xl lg:max-w-4xl mx-auto">

            {/* 1. Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
              <img
                src={dragonEmblem}
                alt="DragonCandy"
                className="w-10 h-10 rounded-full object-contain flex-shrink-0"
              />
              <div className="text-center flex-1 px-3 min-w-0">
                <h1 className="text-sm font-bold text-gray-900 truncate">
                  Welcome back, {profile.business_name || 'Business'}
                </h1>
                <p className="text-xs text-gray-500">Create content and drive revenue</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <Bell className="w-4 h-4 text-gray-600" />
                </button>
                <div className="w-8 h-8 rounded-full bg-dc-teal flex items-center justify-center ring-2 ring-teal-400">
                  <span className="text-xs font-bold text-white">
                    {(profile.business_name || 'B').charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Content sections with padding */}
            <div className="p-4 sm:p-6 space-y-4">

              {/* 2. Donny AI Bar */}
              <DonnyAskBar userRole="business_client" />

              {/* 3. Stats Row */}
              <BusinessStatsRow />

              {/* 4. Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => navigate('/dashboard/business/campaigns/create')}
                  className="bg-dc-teal rounded-xl p-4 text-center hover:bg-dc-teal/90 transition-colors"
                >
                  <Rocket className="w-6 h-6 text-white mx-auto mb-2" />
                  <div className="text-sm font-bold text-white">Create Campaign</div>
                  <div className="text-xs text-white/80 mt-1">Launch a new content campaign</div>
                </button>
                <button
                  onClick={() => navigate('/dashboard/business/creators')}
                  className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center hover:border-dc-teal/50 transition-colors"
                >
                  <Users className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                  <div className="text-sm font-bold text-gray-900">Browse Creators</div>
                  <div className="text-xs text-gray-500 mt-1">Find talent for your brand</div>
                </button>
              </div>

              {/* 5. Active Campaigns Feed */}
              <ActiveCampaignsFeed />

              {/* Review Prompts */}
              <RatingPromptManager />

              {/* Sponsorship Proposals (preserved, moved below feed) */}
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

        {/* Side Feed — Desktop only (preserved) */}
        <div className="hidden lg:block w-80 shrink-0 border-l bg-muted/10 sticky top-14 h-[calc(100vh-56px)] overflow-hidden">
          <BusinessDashboardSideFeed
            onItemClick={handleFeedItemClick}
            onFeedItemsLoaded={setAllFeedItems}
          />
        </div>
      </div>

      {/* Lightbox Modal (preserved) */}
      <FeedLightbox
        item={selectedFeedItem}
        allItems={allFeedItems}
        currentIndex={currentFeedIndex}
        onClose={() => setSelectedFeedItem(null)}
        onNavigate={handleFeedNavigate}
      />
    </DashboardLayout>
  );
};

export default BusinessDashboard;
```

Key changes from the original:
- Removed: `useAIChatModal`, `DonnyCard`, `AskBar` imports and usage
- Removed: DragonDash CTA card, 3-column quick actions, script-font heading
- Added: Header with logo/welcome/bell/avatar
- Added: `DonnyAskBar`, `BusinessStatsRow`, `ActiveCampaignsFeed`
- Preserved: `DashboardLayout` wrapper, side feed, lightbox, sponsorship proposals, `RatingPromptManager`
- Preserved: All `FeedMediaItem` state management for lightbox

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Verify the app builds**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessDashboard.tsx
git commit -m "dashboard: professional restaurant command center with stats"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with 0 errors

- [ ] **Step 2: Start dev server and verify mobile layout**

Run: `npm run dev`

Open browser at the dev server URL. Navigate to `/dashboard/business`.
Verify at 375px width:
- White header with logo, welcome text, bell, avatar
- Donny bar with teal border and sparkle icon
- Chips appear on focus
- 4 stat cards in a row
- 2 quick action cards (teal + outlined)
- Active campaigns feed (or empty state)
- 5-icon bottom nav: Home, Campaigns, +Create, Messages, Profile

- [ ] **Step 3: Verify desktop layout**

Verify at 1440px width:
- Side feed visible on the right
- Dashboard content fills the main area
- Bottom nav hidden (desktop uses sidebar)

- [ ] **Step 4: Verify creator/brand navs unchanged**

Navigate to a creator dashboard URL and verify the bottom nav still shows 7 icons.
Navigate to a brand dashboard URL and verify the bottom nav still shows 7 icons.

- [ ] **Step 5: Final commit if any fixes needed**

If any adjustments were made during verification, commit them:

```bash
git add -u
git commit -m "fix(dashboard): address verification issues"
```
