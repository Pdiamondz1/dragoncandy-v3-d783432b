# Phase 2: Creator Social Media — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give creators the ability to connect social accounts, cross-post approved campaign content to their personal channels, see campaign deadlines on the content calendar, display verified social stats on their public profile, and earn a Verified Creator badge — all without Donny AI.

**Architecture:** Phase 1 infrastructure (OAuth, Edge Function proxy, CalendarTab, AnalyticsTab, ConnectedAccountsList) is reused as-is for creators. New work is a `CrossPostPrompt` triggered on application acceptance, campaign deadline markers on the calendar, a `VerifiedSocialStats` card on the public profile, and a `VerifiedBadge` component with a `useVerifiedStatus` hook. All data reads from existing tables (`business_outstand_accounts`, `social_analytics_cache`, `campaign_applications`).

**Tech Stack:** React/TypeScript, Tailwind CSS, React Query (TanStack Query), Supabase, shadcn/ui, @outstand-so/ui SDK

**Source Spec:** `docs/superpowers/specs/2026-05-08-social-integration-gap-analysis-design.md` (Phase 2 section)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260509000001_public_read_verified_stats.sql` | RLS migration adding authenticated-read policies on `business_outstand_accounts` (status only) and `social_analytics_cache` (metrics only) for cross-user verified badge and social stats display. |
| `src/components/outstand/CrossPostPrompt.tsx` | Modal (desktop) / bottom sheet (mobile) shown when a creator's application is accepted. 4 action buttons: Cross-post Now, Schedule, Customize Caption, Skip. |
| `src/hooks/outstand/useCrossPost.ts` | Mutation hook that posts to Outstand API via Edge Function proxy using creator's connected accounts. Accepts post content + account IDs. |
| `src/components/outstand/VerifiedSocialStats.tsx` | Compact card displaying verified social metrics (followers per platform, engagement rate) with "Verified by DragonCandy" badge. |
| `src/hooks/outstand/useVerifiedStatus.ts` | Hook that checks `business_outstand_accounts` for ≥1 active connected account. Returns `{ isVerified, isLoading }`. |
| `src/components/outstand/VerifiedBadge.tsx` | Small teal badge with checkmark icon. Renders inline next to creator name. |
| `src/hooks/outstand/useCreatorSocialStats.ts` | Hook that reads `social_analytics_cache` for a given `userId` (not self — used on public profiles). Returns platform breakdown metrics. |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx:203-204` | Verify creator social routes exist (they do — `/dashboard/creator/social` and `/dashboard/creator/social/oauth-callback` already defined) |
| `src/components/applications/DetailedApplicationCard.tsx:212-238` | Add "Cross-Post to Social" CTA button in accepted application section |
| `src/components/outstand/CalendarTab.tsx` | Add campaign deadline markers — new `campaignDeadlines` prop, pink markers alongside teal scheduled posts |
| `src/components/outstand/calendar/WeekGrid.tsx` | Render campaign deadline indicators in day cells |
| `src/components/outstand/calendar/DayStrip.tsx` | Render campaign deadline indicators in mobile day strip |
| `src/components/outstand/calendar/MonthGrid.tsx` | Add pink dot for days with campaign deadlines |
| `src/pages/OutstandManager.tsx` | Pass campaign deadlines to CalendarTab |
| `src/pages/PublicCreatorProfile.tsx:340-364` | Add `VerifiedSocialStats` card below stats row and `VerifiedBadge` next to creator name |
| `src/components/creator-browse/CreatorCard.tsx:153-158` | Add `VerifiedBadge` next to creator name |

---

## Task Dependency Chain

```
Task 0 (RLS migration) → required before Tasks 2 and 4
Task 1 (verify routing) → independent, do first
Task 0 → Task 2 (useVerifiedStatus) → Task 3 (VerifiedBadge) → Task 6 (badge on profile/browse)
Task 0 → Task 4 (useCreatorSocialStats) → Task 5 (VerifiedSocialStats) → Task 6
Task 7 (useCrossPost) → Task 8 (CrossPostPrompt) → Task 9 (wire into DetailedApplicationCard)
Task 10 (calendar deadlines) → independent of other tasks
```

---

### Task 0: RLS Migration for Cross-User Reads (prerequisite)

**Files:**
- Create: `supabase/migrations/20260509000001_public_read_verified_stats.sql`

The existing RLS policies on `business_outstand_accounts` and `social_analytics_cache` restrict SELECT to `auth.uid() = user_id`. This means the VerifiedBadge (Task 2) and VerifiedSocialStats (Task 4) would silently return empty when any user views another creator's profile. Both features require authenticated users to read other users' rows.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260509000001_public_read_verified_stats.sql
--
-- Allow authenticated users to read social connection status and cached
-- analytics for ANY user. This powers the VerifiedBadge (checks if a creator
-- has active connected accounts) and VerifiedSocialStats (shows follower
-- counts on public profiles).
--
-- Only SELECT is opened — INSERT/UPDATE/DELETE remain restricted to the
-- row owner via existing policies.

-- business_outstand_accounts: let any authenticated user see connection status
CREATE POLICY "authenticated_read_outstand_accounts"
  ON public.business_outstand_accounts
  FOR SELECT
  TO authenticated
  USING (true);

-- social_analytics_cache: let any authenticated user read cached metrics
CREATE POLICY "authenticated_read_analytics_cache"
  ON public.social_analytics_cache
  FOR SELECT
  TO authenticated
  USING (true);
```

Note: These policies are additive — Supabase OR's multiple SELECT policies. The existing `user_id = auth.uid()` policies remain but are now redundant for SELECT since the new policies are broader. The existing INSERT/UPDATE/DELETE policies are unaffected.

- [ ] **Step 2: Verify existing policies won't conflict**

Check that no existing SELECT policy on these tables uses a restrictive `WITH CHECK` clause that might interfere. Supabase SELECT policies only use `USING`, not `WITH CHECK`, so multiple SELECT policies are safe — any passing policy grants access.

- [ ] **Step 3: Apply and verify**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Run: `npm run build` to confirm no build impact.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260509000001_public_read_verified_stats.sql
git commit -m "feat: add RLS policies for cross-user social stats and verified badge reads"
```

---

### Task 1: Verify Creator Social Routes & Standalone Posting (2a, 2h)

**Files:**
- Read: `src/App.tsx:200-204`
- Read: `src/hooks/outstand/useOutstandPaths.ts`
- Read: `src/pages/OutstandManager.tsx:206-218`

This task is verification-only. The routes and components already exist.

- [ ] **Step 1: Verify routes in App.tsx**

Open `src/App.tsx` and confirm these routes exist (they were found at lines 200-204):
```
/dashboard/creator/social → OutstandManager (with ProtectedRoute)
/dashboard/creator/social/oauth-callback → OutstandOAuthCallbackPage (with ProtectedRoute)
```

Both routes are present. The creator social route does NOT use `BusinessRoute` wrapper (correct — creators aren't businesses).

- [ ] **Step 2: Verify OutstandManager works for creators**

`OutstandManager.tsx:207-208` reads `profile?.role` and passes it to `DashboardLayout`. The `useOutstandPaths` hook (line 14) matches both `/dashboard/business/social` and `/dashboard/creator/social` via the regex. The `DragonCandyOutstandProvider` uses the same API key for both roles (Outstand is tenant-scoped by Supabase JWT, not role).

**Verification:** No code changes needed. Run `npm run build` to confirm clean build.

- [ ] **Step 3: Confirm creator dashboard links to social manager**

Check that the creator dashboard (`src/pages/CreatorDashboard.tsx`) or creator sidebar has a navigation link to `/dashboard/creator/social`. If missing, add it as a quick action.

Run: `grep -r "creator/social" src/`

If the link exists in navigation, this task is complete. If not, add it in Task 1 Step 4.

- [ ] **Step 4: Add social manager link to creator dashboard (if missing)**

If Step 3 shows no link in creator dashboard navigation, add a Quick Action button. Check the existing `QuickActionButtons` pattern in `CreatorDashboard.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreatorDashboard.tsx
git commit -m "feat(2a/2h): verify creator social routes and add dashboard link"
```

---

### Task 2: useVerifiedStatus Hook (2f foundation)

**Files:**
- Create: `src/hooks/outstand/useVerifiedStatus.ts`
- Test: manual — query returns correct verified/unverified status

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/outstand/useVerifiedStatus.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface VerifiedStatus {
  isVerified: boolean;
  connectedCount: number;
  isLoading: boolean;
}

export function useVerifiedStatus(userId: string | undefined): VerifiedStatus {
  const { data, isLoading } = useQuery({
    queryKey: ['verified-status', userId],
    queryFn: async () => {
      if (!userId) return { isVerified: false, connectedCount: 0 };

      const { data: accounts, error } = await supabase
        .from('business_outstand_accounts')
        .select('id, status')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error || !accounts || accounts.length === 0) {
        return { isVerified: false, connectedCount: 0 };
      }

      return {
        isVerified: true,
        connectedCount: accounts.length,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    isVerified: data?.isVerified ?? false,
    connectedCount: data?.connectedCount ?? 0,
    isLoading,
  };
}
```

Note: The spec calls for a post-activity threshold (≥1 post in 30 days), but the Outstand posts API doesn't track which platform was used to create a post. Simplifying to ≥1 connected account with `status = 'active'` — this is the meaningful signal. A creator who connected their account and keeps it active has verified their social presence.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/outstand/useVerifiedStatus.ts
git commit -m "feat(2f): add useVerifiedStatus hook for creator badge"
```

---

### Task 3: VerifiedBadge Component (2f)

**Files:**
- Create: `src/components/outstand/VerifiedBadge.tsx`

- [ ] **Step 1: Create the badge component**

```typescript
// src/components/outstand/VerifiedBadge.tsx
import React from 'react';
import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ size = 'sm', className = '' }) => {
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-dc-teal ${className}`}
      title="Verified Creator — social accounts connected via DragonCandy"
    >
      <BadgeCheck className={`${iconSize} fill-dc-teal text-white`} />
    </span>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/VerifiedBadge.tsx
git commit -m "feat(2f): add VerifiedBadge component"
```

---

### Task 4: useCreatorSocialStats Hook (2e foundation)

**Files:**
- Create: `src/hooks/outstand/useCreatorSocialStats.ts`

This hook reads `social_analytics_cache` for a given user ID. Unlike `useAccountMetrics` (which calls the Outstand API for the logged-in user), this hook reads cached data for any user — enabling public profile display.

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/outstand/useCreatorSocialStats.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CreatorPlatformStat {
  platform: string;
  followers: number;
}

export interface CreatorSocialStats {
  platforms: CreatorPlatformStat[];
  totalFollowers: number;
}

export function useCreatorSocialStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-social-stats', userId],
    queryFn: async (): Promise<CreatorSocialStats> => {
      if (!userId) return { platforms: [], totalFollowers: 0 };

      const { data, error } = await supabase
        .from('social_analytics_cache')
        .select('platform, metric_type, metric_value, fetched_at')
        .eq('user_id', userId)
        .eq('metric_type', 'followers')
        .order('fetched_at', { ascending: false });

      if (error || !data || data.length === 0) {
        return { platforms: [], totalFollowers: 0 };
      }

      const seen = new Set<string>();
      const platforms: CreatorPlatformStat[] = [];
      let totalFollowers = 0;

      for (const row of data) {
        if (seen.has(row.platform)) continue;
        seen.add(row.platform);
        const followers = Number(row.metric_value) || 0;
        platforms.push({ platform: row.platform, followers });
        totalFollowers += followers;
      }

      return { platforms, totalFollowers };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/outstand/useCreatorSocialStats.ts
git commit -m "feat(2e): add useCreatorSocialStats hook for public profile stats"
```

---

### Task 5: VerifiedSocialStats Component (2e)

**Files:**
- Create: `src/components/outstand/VerifiedSocialStats.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/outstand/VerifiedSocialStats.tsx
import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { useCreatorSocialStats } from '@/hooks/outstand/useCreatorSocialStats';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  facebook: 'FB',
  x: 'X',
  youtube: 'YT',
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-[#E1306C]',
  tiktok: 'bg-black',
  facebook: 'bg-[#1877F2]',
  x: 'bg-gray-800',
  youtube: 'bg-red-600',
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface VerifiedSocialStatsProps {
  userId: string;
}

export const VerifiedSocialStats: React.FC<VerifiedSocialStatsProps> = ({ userId }) => {
  const { data, isLoading } = useCreatorSocialStats(userId);

  if (isLoading || !data || data.platforms.length === 0) return null;

  return (
    <div className="mx-4 mb-3 bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-3">
        <BadgeCheck className="h-4 w-4 fill-dc-teal text-white" />
        <h2 className="text-sm font-bold text-gray-900">Verified Social Stats</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {data.platforms.map(({ platform, followers }) => (
          <div
            key={platform}
            className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 min-w-fit"
          >
            <div
              className={`w-6 h-6 ${PLATFORM_COLORS[platform] ?? 'bg-gray-400'} rounded-md flex items-center justify-center text-white text-[9px] font-bold`}
            >
              {PLATFORM_LABELS[platform] ?? platform.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-extrabold text-gray-900 leading-none">
                {formatFollowers(followers)}
              </p>
              <p className="text-[9px] text-gray-400">followers</p>
            </div>
          </div>
        ))}
      </div>
      {data.totalFollowers > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">
          {formatFollowers(data.totalFollowers)} total followers · Verified by DragonCandy
        </p>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/VerifiedSocialStats.tsx
git commit -m "feat(2e): add VerifiedSocialStats card for creator profiles"
```

---

### Task 6: Wire Badge & Stats into Profile Pages (2e, 2f)

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx:311-312` (badge next to name)
- Modify: `src/pages/PublicCreatorProfile.tsx:364-366` (stats card after stats row)
- Modify: `src/components/creator-browse/CreatorCard.tsx:153-158` (badge next to name)

- [ ] **Step 1: Add VerifiedBadge to PublicCreatorProfile**

In `src/pages/PublicCreatorProfile.tsx`, add imports at the top:

```typescript
import { VerifiedBadge } from '@/components/outstand/VerifiedBadge';
import { VerifiedSocialStats } from '@/components/outstand/VerifiedSocialStats';
import { useVerifiedStatus } from '@/hooks/outstand/useVerifiedStatus';
```

Inside the component, add the hook call near the other data fetches:

```typescript
const { isVerified } = useVerifiedStatus(profile?.user_id);
```

At line 311-312, modify the name heading to include the badge:

```tsx
<h1 className="text-lg font-bold text-gray-900 truncate">
  {profile.creator_name}
  {isVerified && <VerifiedBadge className="ml-1" />}
</h1>
```

- [ ] **Step 2: Add VerifiedSocialStats to PublicCreatorProfile**

After the stats row section (after line ~364, before the About Card), insert:

```tsx
{profile.user_id && <VerifiedSocialStats userId={profile.user_id} />}
```

- [ ] **Step 3: Add VerifiedBadge to CreatorCard**

In `src/components/creator-browse/CreatorCard.tsx`, add imports:

```typescript
import { VerifiedBadge } from '@/components/outstand/VerifiedBadge';
import { useVerifiedStatus } from '@/hooks/outstand/useVerifiedStatus';
```

Inside the component (after line 41), add:

```typescript
const { isVerified } = useVerifiedStatus(creator.user_id);
```

At lines 153-158, modify the name + rating row to include the badge:

```tsx
<div className="flex items-center gap-1.5 mb-0.5 pr-8">
  <span className="font-bold text-gray-900 text-sm truncate">{creator.creator_name || 'Unknown Creator'}</span>
  {isVerified && <VerifiedBadge />}
  {creator.average_rating != null && (
    <span className="text-yellow-400 text-xs flex-shrink-0">★ {creator.average_rating.toFixed(1)}</span>
  )}
</div>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx src/components/creator-browse/CreatorCard.tsx
git commit -m "feat(2e/2f): display VerifiedBadge and VerifiedSocialStats on creator profiles"
```

---

### Task 7: useCrossPost Hook (2b foundation)

**Files:**
- Create: `src/hooks/outstand/useCrossPost.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/outstand/useCrossPost.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { toast } from 'sonner';

interface CrossPostInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  scheduledAt?: string;
}

export function useCrossPost() {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ caption, mediaUrls, accountIds, scheduledAt }: CrossPostInput) => {
      const body: Record<string, unknown> = {
        text: caption,
        socialAccountIds: accountIds,
      };
      if (mediaUrls.length > 0) {
        body.mediaUrls = mediaUrls;
      }
      if (scheduledAt) {
        body.scheduledAt = scheduledAt;
      }
      const res = await api.post('/posts', body);
      if (!res.success) throw new Error(res.error || 'Failed to create cross-post');
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['outstand'] });
      toast.success(variables.scheduledAt ? 'Cross-post scheduled!' : 'Cross-post published!');
    },
    onError: (error: Error) => {
      toast.error(`Cross-post failed: ${error.message}`);
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/outstand/useCrossPost.ts
git commit -m "feat(2b): add useCrossPost mutation hook"
```

---

### Task 8: CrossPostPrompt Component (2b)

**Files:**
- Create: `src/components/outstand/CrossPostPrompt.tsx`

This component is a modal (desktop) / bottom sheet (mobile) that appears when a creator clicks "Cross-Post" on an accepted application. It shows 4 options: Cross-post Now, Schedule for Later, Customize Caption, and Skip.

- [ ] **Step 1: Create the component**

```typescript
// src/components/outstand/CrossPostPrompt.tsx
import React, { useState, useEffect } from 'react';
import { X, Send, CalendarDays, Edit3, SkipForward } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';

interface CrossPostPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignTitle: string;
  creatorName: string;
  mediaUrls: string[];
  originalCaption: string;
}

export const CrossPostPrompt: React.FC<CrossPostPromptProps> = ({
  open,
  onOpenChange,
  campaignTitle,
  creatorName,
  mediaUrls,
  originalCaption,
}) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const crossPost = useCrossPost();
  const [caption, setCaption] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (open) {
      setCaption(
        `Just wrapped up an amazing campaign with ${campaignTitle}! 🎬\n\n${originalCaption}\n\n#DragonCandy #DragonDashed #ContentCreator`
      );
      setSelectedAccountIds(accounts.map((a) => a.id));
      setIsEditing(false);
    }
  }, [open, campaignTitle, originalCaption, accounts]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCrossPostNow = () => {
    if (selectedAccountIds.length === 0) return;
    crossPost.mutate(
      { caption, mediaUrls, accountIds: selectedAccountIds },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleSchedule = () => {
    onOpenChange(false);
    window.location.href = '/dashboard/creator/social?tab=compose';
  };

  const connectedCount = accounts?.length ?? 0;

  const content = (
    <div className="space-y-4">
      {connectedCount === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-800 font-medium">No connected social accounts</p>
          <p className="text-xs text-amber-700 mt-1">
            Connect your social accounts in Settings to cross-post content.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide mb-2">
              Post to ({selectedAccountIds.length} of {connectedCount})
            </p>
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => {
                const selected = selectedAccountIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => toggleAccount(account.id)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      selected
                        ? 'bg-dc-teal text-white border-dc-teal'
                        : 'bg-white text-gray-500 border-gray-200'
                    }`}
                  >
                    {account.username ?? account.network}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide mb-2">
              Caption Preview
            </p>
            {isEditing ? (
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-2 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-dc-teal"
                autoFocus
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCrossPostNow}
              disabled={crossPost.isPending || selectedAccountIds.length === 0}
              className="flex items-center justify-center gap-1.5 bg-dc-teal text-white text-sm font-bold py-3 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Post Now
            </button>
            <button
              type="button"
              onClick={handleSchedule}
              className="flex items-center justify-center gap-1.5 bg-white text-gray-700 text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center justify-center gap-1.5 bg-white text-dc-pink-accent text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5" />
              {isEditing ? 'Done' : 'Edit Caption'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center gap-1.5 bg-white text-gray-400 text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle className="text-sm font-bold text-gray-900">
              Cross-Post to Your Socials
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-gray-900">
            Cross-Post to Your Socials
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/CrossPostPrompt.tsx
git commit -m "feat(2b): add CrossPostPrompt modal/bottom-sheet component"
```

---

### Task 9: Wire CrossPostPrompt into DetailedApplicationCard (2b)

**Files:**
- Modify: `src/components/applications/DetailedApplicationCard.tsx:212-238`

- [ ] **Step 1: Add cross-post button to accepted application section**

In `src/components/applications/DetailedApplicationCard.tsx`, add imports at the top:

```typescript
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { CrossPostPrompt } from '@/components/outstand/CrossPostPrompt';
import { Share2 } from 'lucide-react';
```

Add state for the cross-post prompt (near other useState calls):

```typescript
const [showCrossPost, setShowCrossPost] = useState(false);
```

After line 222 (after the green "Your application has been accepted" box, before the ContactRestaurantModal), add:

```tsx
<DragonCandyOutstandProvider>
  <Button
    onClick={() => setShowCrossPost(true)}
    className="w-full bg-dc-teal text-white rounded-full font-bold hover:bg-teal-500"
  >
    <Share2 className="h-4 w-4 mr-2" />
    Cross-Post to Your Socials
  </Button>
  <CrossPostPrompt
    open={showCrossPost}
    onOpenChange={setShowCrossPost}
    campaignTitle={application.campaign?.title ?? 'Campaign'}
    creatorName={application.creator_profile?.creator_name ?? 'Creator'}
    mediaUrls={[]}
    originalCaption={application.campaign?.description ?? ''}
  />
</DragonCandyOutstandProvider>
```

Note: `mediaUrls` is empty for now because campaign deliverables are stored in `file_uploads`, not directly on the application. The cross-post prompt uses the campaign description as the base caption. Media attachment from deliverables can be added as a follow-up enhancement.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/applications/DetailedApplicationCard.tsx
git commit -m "feat(2b): wire CrossPostPrompt into accepted application card"
```

---

### Task 10: Campaign Deadline Markers on Calendar (2d)

**Files:**
- Modify: `src/pages/OutstandManager.tsx` (fetch deadlines, pass to CalendarTab)
- Modify: `src/components/outstand/CalendarTab.tsx` (accept deadlines prop, pass to sub-components)
- Modify: `src/components/outstand/calendar/WeekGrid.tsx` (render deadline markers)
- Modify: `src/components/outstand/calendar/DayStrip.tsx` (render deadline markers)
- Modify: `src/components/outstand/calendar/MonthGrid.tsx` (render pink dots for deadline days)

This task adds campaign deadline markers to the creator's content calendar. Deadlines appear as pink indicators (vs. teal for scheduled posts) so creators can see upcoming content delivery dates alongside their posting schedule.

- [ ] **Step 1: Define the CampaignDeadline type**

Add to `src/components/outstand/CalendarTab.tsx` or a shared types location:

```typescript
export interface CampaignDeadline {
  id: string;
  title: string;
  deadline: Date;
  campaignId: string;
}
```

- [ ] **Step 2: Fetch campaign deadlines in OutstandManager**

In `src/pages/OutstandManager.tsx`, add a query to fetch accepted campaign deadlines for the current creator. Add imports:

```typescript
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
```

Note: `useAuth` is already imported at line 15. Inside `OutstandManagerInner`, add a query:

```typescript
const { user } = useAuth();

const { data: campaignDeadlines } = useQuery({
  queryKey: ['creator-campaign-deadlines', user?.id],
  queryFn: async () => {
    if (!user?.id) return [];
    const { data, error } = await supabase
      .from('campaign_applications')
      .select('id, campaign_id, campaigns!campaign_id(title, deadline)')
      .eq('creator_id', user.id)
      .eq('status', 'accepted');
    if (error || !data) return [];

    type Row = typeof data[number];
    return data
      .filter((row: Row) => {
        const c = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
        return c?.deadline;
      })
      .map((row: Row) => {
        const c = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
        // campaigns.deadline is a DATE column — Supabase returns "YYYY-MM-DD".
        // Parse without timezone to avoid UTC midnight shifting to previous day.
        const [y, m, d] = c!.deadline!.split('-').map(Number);
        return {
          id: row.id,
          title: c!.title,
          deadline: new Date(y, m - 1, d),
          campaignId: row.campaign_id,
        };
      });
  },
  enabled: !!user?.id,
  staleTime: 5 * 60 * 1000,
});
```

Pass to CalendarTab:

```tsx
<CalendarTab
  posts={posts ?? []}
  isLoading={postsLoading}
  onChanged={refetchPosts}
  onSwitchTab={setActiveTab}
  campaignDeadlines={campaignDeadlines ?? []}
/>
```

- [ ] **Step 3: Update CalendarTab to accept and pass deadlines**

In `src/components/outstand/CalendarTab.tsx`, update the interface:

```typescript
import type { CampaignDeadline } from './CalendarTab'; // or wherever the type lives

interface CalendarTabProps {
  posts: Post[];
  isLoading: boolean;
  onChanged?: () => void;
  onSwitchTab?: (tab: string) => void;
  campaignDeadlines?: CampaignDeadline[];
}
```

Update the component signature:

```typescript
export const CalendarTab: React.FC<CalendarTabProps> = ({
  posts, isLoading, onChanged, onSwitchTab, campaignDeadlines = [],
}) => {
```

Pass `campaignDeadlines` to WeekGrid, DayStrip, and MonthGrid:

```tsx
<WeekGrid
  posts={filteredPosts}
  weekStart={currentDate}
  onReschedule={handleReschedule}
  onPostClick={handlePostClick}
  campaignDeadlines={campaignDeadlines}
/>

<MonthGrid
  posts={filteredPosts}
  year={currentDate.getFullYear()}
  month={currentDate.getMonth()}
  onDayClick={handleDayClick}
  campaignDeadlines={campaignDeadlines}
/>

<DayStrip
  posts={filteredPosts}
  weekStart={currentDate}
  selectedDay={selectedDay}
  onDaySelect={setSelectedDay}
  onPostClick={handlePostClick}
  onScheduleClick={() => onSwitchTab?.('compose')}
  campaignDeadlines={campaignDeadlines}
/>
```

- [ ] **Step 4: Update WeekGrid to render deadline markers**

In `src/components/outstand/calendar/WeekGrid.tsx`, add the `campaignDeadlines` prop to the interface and render a pink marker for each deadline that falls on a given day.

Add to the props interface:

```typescript
campaignDeadlines?: CampaignDeadline[];
```

In each day cell, after the existing post cards, add:

```tsx
{(campaignDeadlines ?? [])
  .filter((d) => isSameDay(d.deadline, dayDate))
  .map((d) => (
    <div
      key={d.id}
      className="text-[9px] bg-pink-100 text-pink-700 border border-pink-200 rounded px-1.5 py-0.5 truncate"
      title={`Campaign deadline: ${d.title}`}
    >
      📅 {d.title}
    </div>
  ))}
```

Where `isSameDay` is a utility from `calendarUtils.ts` or inline:

```typescript
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
```

- [ ] **Step 5: Update DayStrip to render deadline markers**

In `src/components/outstand/calendar/DayStrip.tsx`, add the same `campaignDeadlines` prop. For the selected day's post list, append deadline entries with a pink card style matching the existing `CalendarPostCard` pattern but in pink instead of teal.

- [ ] **Step 6: Update MonthGrid to show pink dots for deadline days**

In `src/components/outstand/calendar/MonthGrid.tsx`, add the `campaignDeadlines` prop. For each day cell, add a pink dot alongside the existing teal/amber dots:

```tsx
{deadlinesOnDay.length > 0 && (
  <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
)}
```

- [ ] **Step 7: Update calendar legend**

In `src/components/outstand/CalendarTab.tsx`, update the legend (line 216-220) to include the new deadline color:

```tsx
<span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pink-400" /> Deadline</span>
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 9: Commit**

```bash
git add src/pages/OutstandManager.tsx src/components/outstand/CalendarTab.tsx src/components/outstand/calendar/WeekGrid.tsx src/components/outstand/calendar/DayStrip.tsx src/components/outstand/calendar/MonthGrid.tsx
git commit -m "feat(2d): add campaign deadline markers to creator content calendar"
```

---

## Deferred: Donny-Blocked Deliverables (2c, 2g)

These deliverables are explicitly deferred per spec. Template-based stopgaps are available but should be implemented when Donny AI integration (MCP wiring, model routing) is ready.

**2c — Donny caption rewriter:** Template tone-swap logic (swap hashtags, adjust tone keywords) can be added to `CrossPostPrompt.tsx` as a `rewriteCaption()` function. Full version needs Haiku T1 AI call + `voice_profile` JSONB field on `creator_profiles`.

**2g — Growth insights:** Stats-only version (best platform, engagement trends) can be built from `social_analytics_cache` data. Full version needs Sonnet T2 AI call for cross-post performance analysis and campaign recommendations.

---

## Summary

| Task | Deliverable | Effort | New Files | Modified Files |
|------|-------------|--------|-----------|----------------|
| 0 | RLS migration for cross-user reads | Low | 1 | 0 |
| 1 | 2a, 2h — Verify routes & standalone posting | Minimal | 0 | 0–1 |
| 2 | 2f — useVerifiedStatus hook | Low | 1 | 0 |
| 3 | 2f — VerifiedBadge component | Low | 1 | 0 |
| 4 | 2e — useCreatorSocialStats hook | Low | 1 | 0 |
| 5 | 2e — VerifiedSocialStats component | Low | 1 | 0 |
| 6 | 2e, 2f — Wire into profile pages | Low | 0 | 2 |
| 7 | 2b — useCrossPost hook | Low | 1 | 0 |
| 8 | 2b — CrossPostPrompt component | Medium | 1 | 0 |
| 9 | 2b — Wire into DetailedApplicationCard | Low | 0 | 1 |
| 10 | 2d — Calendar deadline markers | Medium | 0 | 5 |

**Total:** 7 new files, 8 modified files, 11 tasks with ~50 steps.
