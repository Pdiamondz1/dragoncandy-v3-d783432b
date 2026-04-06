# Brand Dashboard Unified UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Brand dashboard to use the same shared design system components as Business and Creator dashboards, with hybrid stats (own + sponsored campaigns), 2-button quick actions, an active campaigns feed, and the preserved budget overview card.

**Architecture:** Full rewrite of `BrandDashboard.tsx` (~278 lines → ~130 lines) using 5 existing shared components. One new hook (`useBrandActiveCampaigns`) provides campaign feed data. The existing `useBrandDashboardStats` hook is updated to return hybrid metrics compatible with `DashboardStatsGrid`. No shared components are modified. No other dashboards are touched.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Query (TanStack), Supabase JS client v2, Lucide React icons.

**Spec:** `docs/superpowers/specs/2026-04-06-brand-dashboard-unified-ux-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useBrandDashboardStats.ts` | Modify | Update interface and query to return hybrid metrics: `activeCampaigns`, `totalSpend`, `creatorsConnected`, `avgROI` + budget fields |
| `src/hooks/useBrandActiveCampaigns.ts` | Create | React Query hook: fetches brand's own campaigns + sponsored campaigns for the feed |
| `src/pages/BrandDashboard.tsx` | Modify (full rewrite) | Replace inline implementations with shared components: DashboardHero, DonnyAIBar, DashboardStatsGrid, QuickActionButtons, ActivityFeedCard |

---

## Task 1: Update `useBrandDashboardStats` hook

**Files:**
- Modify: `src/hooks/useBrandDashboardStats.ts`

- [ ] **Step 1: Update the interface**

Replace the current `BrandDashboardStats` interface with hybrid metrics that work with `DashboardStatsGrid`:

```typescript
interface BrandDashboardStats {
  // Hybrid stats for DashboardStatsGrid
  activeCampaigns: number;    // own campaigns + active sponsorships
  totalSpend: number;          // sum of paid sponsorship amounts
  creatorsConnected: number;   // direct conversations count
  avgROI: number;              // average ROI percentage
  // Budget fields (unchanged)
  monthlyBudget: number;
  allocatedBudget: number;
  availableBudget: number;
  budgetPercentage: number;
}
```

- [ ] **Step 2: Update the query function**

Replace the body of the `queryFn` to compute the new metrics. Key changes:

1. `activeCampaigns` = count of brand's own campaigns (status `active` or `published`) + count of sponsorships with `status === 'accepted'` and `payment_status === 'paid'`
2. `totalSpend` = sum of `sponsorship_amount` from sponsorships where `payment_status === 'paid'`
3. `creatorsConnected` = unchanged (direct conversations count)
4. `avgROI` = unchanged placeholder logic (`activeCampaigns > 0 ? 15 : 0`)
5. Budget fields = unchanged

Add the own-campaigns query after the existing brand profile lookup:

```typescript
// Count brand's own campaigns
const { count: ownCampaignsCount, error: ownCampaignsError } = await supabase
  .from('campaigns')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .in('status', ['active', 'published']);

if (ownCampaignsError) throw ownCampaignsError;
```

Update the `activeCampaigns` computation:

```typescript
const activeCampaigns = (ownCampaignsCount || 0) + activeSponsorships;
```

Add `totalSpend` computation from the existing sponsorships data:

```typescript
const totalSpend = sponsorships?.filter(
  s => s.payment_status === 'paid'
).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;
```

Update the return to use the new field names:

```typescript
const stats: BrandDashboardStats = {
  activeCampaigns,
  totalSpend,
  creatorsConnected,
  avgROI: activeCampaigns > 0 ? 15 : 0,
  monthlyBudget,
  allocatedBudget,
  availableBudget,
  budgetPercentage,
};
```

Remove the now-unused fields: `activeSponsorships`, `campaignsDiscovered`, `marketingROI`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/GIT/dragoncandy-v3-d783432b && npx tsc --noEmit src/hooks/useBrandDashboardStats.ts`

Expected: No errors. (Note: `BrandDashboard.tsx` will break — that's expected, we rewrite it in Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBrandDashboardStats.ts
git commit -m "refactor(hooks): update useBrandDashboardStats to hybrid metrics"
```

---

## Task 2: Create `useBrandActiveCampaigns` hook

**Files:**
- Create: `src/hooks/useBrandActiveCampaigns.ts`

- [ ] **Step 1: Create the hook file**

This hook fetches both the brand's own campaigns and their sponsored campaigns, returning a unified list for the `ActivityFeedCard` components.

```typescript
// src/hooks/useBrandActiveCampaigns.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BrandCampaignItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
}

export function useBrandActiveCampaigns() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand_active_campaigns', user?.id],
    queryFn: async (): Promise<BrandCampaignItem[]> => {
      if (!user) throw new Error('User not authenticated');

      // 1. Get brand's own campaigns
      const { data: ownCampaigns, error: ownError } = await supabase
        .from('campaigns')
        .select('id, title, status, deadline')
        .eq('user_id', user.id)
        .in('status', ['draft', 'published', 'active'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (ownError) throw ownError;

      // 2. Get brand's sponsorships with campaign details
      const { data: brandProfile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('account_type', 'brand')
        .maybeSingle();

      let sponsoredItems: BrandCampaignItem[] = [];

      if (brandProfile) {
        const { data: sponsorships, error: sponsorError } = await supabase
          .from('campaign_sponsorships')
          .select(`
            id,
            sponsorship_amount,
            status,
            campaigns (id, title, status)
          `)
          .eq('brand_id', brandProfile.id)
          .in('status', ['pending', 'accepted'])
          .order('created_at', { ascending: false })
          .limit(5);

        if (sponsorError) throw sponsorError;

        sponsoredItems = (sponsorships || [])
          .filter((s) => s.campaigns)
          .map((s) => {
            const campaign = s.campaigns as unknown as { id: string; title: string; status: string };
            return {
              id: campaign.id,
              title: campaign.title,
              subtitle: `Sponsored · $${Number(s.sponsorship_amount).toLocaleString()} budget`,
              status: s.status,
            };
          });
      }

      // 3. Map own campaigns
      const ownItems: BrandCampaignItem[] = (ownCampaigns || []).map((c) => {
        const deadline = c.deadline
          ? new Date(c.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'No deadline';
        return {
          id: c.id,
          title: c.title,
          subtitle: `Due ${deadline}`,
          status: c.status,
        };
      });

      // 4. Merge, deduplicate by id, return max 8
      const seen = new Set<string>();
      const merged: BrandCampaignItem[] = [];
      for (const item of [...ownItems, ...sponsoredItems]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }

      return merged.slice(0, 8);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/dragoncandy-v3-d783432b && npx tsc --noEmit src/hooks/useBrandActiveCampaigns.ts`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBrandActiveCampaigns.ts
git commit -m "feat(hooks): add useBrandActiveCampaigns for brand campaign feed"
```

---

## Task 3: Rewrite `BrandDashboard.tsx`

**Files:**
- Modify: `src/pages/BrandDashboard.tsx` (full rewrite)

**Reference files** (read these for pattern matching — do NOT modify them):
- `src/pages/BusinessDashboard.tsx` — header pattern with shared components
- `src/pages/CreatorDashboard.tsx` — single-column body pattern
- `src/components/dashboard/DashboardHero.tsx` — props: `roleLabel`, `userName`, `children`
- `src/components/dashboard/DonnyAIBar.tsx` — props: `placeholder`
- `src/components/dashboard/DashboardStatsGrid.tsx` — props: `stats: StatItem[]`, `isLoading`
- `src/components/dashboard/QuickActionButtons.tsx` — props: `actions: [QuickAction, QuickAction]`
- `src/components/dashboard/ActivityFeedCard.tsx` — props: `title`, `subtitle`, `status`, `onClick?`

- [ ] **Step 1: Replace the entire file**

Replace the contents of `src/pages/BrandDashboard.tsx` with:

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBrandDashboardStats } from '@/hooks/useBrandDashboardStats';
import { useBrandActiveCampaigns } from '@/hooks/useBrandActiveCampaigns';
import DashboardLayout from '@/components/DashboardLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DonnyAIBar } from '@/components/dashboard/DonnyAIBar';
import { DashboardStatsGrid, type StatItem } from '@/components/dashboard/DashboardStatsGrid';
import { QuickActionButtons, type QuickAction } from '@/components/dashboard/QuickActionButtons';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { Rocket, DollarSign, Users, TrendingUp, Loader2, AlertCircle } from 'lucide-react';

const BrandDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useBrandDashboardStats();
  const { data: campaigns, isLoading: campaignsLoading } = useBrandActiveCampaigns();

  if (!profile) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-white flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
  }

  const formatSpend = (amount: number) => {
    if (amount === 0) return '$0';
    return amount >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${amount}`;
  };

  const brandStats: StatItem[] = [
    { label: 'Active Campaigns', value: statsLoading ? '...' : stats?.activeCampaigns ?? 0, icon: Rocket },
    { label: 'Total Spend', value: statsLoading ? '...' : formatSpend(stats?.totalSpend ?? 0), icon: DollarSign },
    { label: 'Creators', value: statsLoading ? '...' : stats?.creatorsConnected ?? 0, subtitle: 'In your network', icon: Users },
    { label: 'Avg. ROI', value: statsLoading ? '...' : `${stats?.avgROI ?? 0}%`, icon: TrendingUp },
  ];

  const brandActions: [QuickAction, QuickAction] = [
    { label: 'Create Sponsorship Campaign', to: '/dashboard/business/campaigns/create', variant: 'primary' },
    { label: 'Browse & Sponsor', to: '/dashboard/brand/discover-campaigns', variant: 'secondary' },
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Unified gradient header */}
        <DashboardHero
          roleLabel="Brand Dashboard"
          userName={profile.business_name || 'Brand Partner'}
        >
          <DonnyAIBar placeholder='Ask Donny... "Create a sponsored campaign for 5 cities"' />
          <DashboardStatsGrid stats={brandStats} isLoading={statsLoading} />
          <QuickActionButtons actions={brandActions} />
        </DashboardHero>

        {/* White body content */}
        <div className="px-4 py-6 pb-24 md:pb-0">
          <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">

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
                      subtitle={campaign.subtitle}
                      status={campaign.status}
                      onClick={() => navigate(`/dashboard/brand/discover-campaigns`)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Budget Overview */}
            <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-dc-teal" />
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                  Marketing Budget
                </p>
              </div>
              <div className="px-4 pb-4">
                {statsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
                  </div>
                ) : statsError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Unable to load budget data. Please refresh the page.</AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Monthly</p>
                      <p className="text-3xl font-extrabold text-gray-900">
                        ${stats?.monthlyBudget.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats?.monthlyBudget ? 'Set in profile' : 'Not set'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Allocated</p>
                      <p className="text-3xl font-extrabold text-gray-900">
                        ${stats?.allocatedBudget.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats?.budgetPercentage || 0}% of budget
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Available</p>
                      <p className="text-3xl font-extrabold text-dc-teal">
                        ${stats?.availableBudget.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Ready to allocate</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandDashboard;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/dragoncandy-v3-d783432b && npx tsc --noEmit`

Expected: No errors across the full project.

- [ ] **Step 3: Verify build succeeds**

Run: `cd C:/GIT/dragoncandy-v3-d783432b && npm run build`

Expected: Build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BrandDashboard.tsx
git commit -m "brand-dashboard: unified UX with business design system"
```

---

## Task 4: Visual Verification

This task is manual / dev-server verification. No code changes.

- [ ] **Step 1: Start dev server**

Run: `cd C:/GIT/dragoncandy-v3-d783432b && npm run dev`

- [ ] **Step 2: Verify Brand dashboard renders**

Navigate to the Brand dashboard in the browser. Confirm:
- DashboardHero header shows "Brand Dashboard" label and "Welcome back, [name]"
- DonnyAIBar shows brand-specific placeholder
- Stats grid shows 4 metrics: Active Campaigns, Total Spend, Creators, Avg. ROI
- Quick action buttons show: "Create Sponsorship Campaign" (teal) + "Browse & Sponsor" (outlined)
- Active Campaigns feed renders (or shows empty state)
- Budget Overview card shows 3-column grid with loading/error handling
- Bottom nav is present and consistent

- [ ] **Step 3: Compare with Business dashboard**

Open the Business dashboard in a second tab. Verify visual parity:
- Same pink gradient header
- Same stats card styling (teal border, same font sizes)
- Same button pill shapes
- Same white body background
- Same section label typography (uppercase teal)

- [ ] **Step 4: Check responsive breakpoints**

Resize browser to mobile (375px) and desktop (1280px). Confirm:
- Stats grid: 2-col on mobile, 4-col on `md:` breakpoint
- Max width: `max-w-2xl` on mobile, `lg:max-w-4xl` on desktop
- Bottom padding: `pb-24` on mobile (for bottom nav), `md:pb-0` on desktop
- No horizontal overflow at any breakpoint
