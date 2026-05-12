# Platform UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four independent UX issues: messaging unread badges, multi-location Stripe/social, campaign invitations, and campaign swipe undo.

**Architecture:** Four self-contained sections executed sequentially. Each section produces a working feature with its own commit(s). Sections share notification infrastructure but have no code dependencies on each other.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Supabase (Postgres + Edge Functions + Realtime), React Query (TanStack Query), Sonner toast, react-tinder-card.

**Spec:** `docs/superpowers/specs/2026-05-12-platform-ux-fixes-design.md`

---

## File Map

### Section 1: Messaging Unread Badges
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/hooks/useUnreadCounts.ts` | Add `useTotalUnreadCount()` that sums conversation unread counts |
| Modify | `src/components/MobileBottomNav.tsx` | Render pink badge on Messages icon |
| Modify | `src/components/DashboardLayout.tsx` | Render pink badge on Messages sidebar link |
| Modify | `supabase/functions/send-notification-email/index.ts` | Remove role filter for `new_message` type |

### Section 2: Campaign Swipe Undo + Cycling
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260512100000_campaign_skips.sql` | campaign_skips table + RLS |
| Create | `src/hooks/useCampaignSkips.ts` | Skip, restore, and fetch skipped campaigns |
| Create | `src/components/campaigns/UndoToast.tsx` | Dark toast with countdown + undo button |
| Modify | `src/pages/CreatorCampaignMarketplace.tsx` | Wire skip persistence, undo, cycling, desktop skipped section |
| Modify | `src/components/campaigns/CampaignSwipeCard.tsx` | Update "All caught up" with cycling button |

### Section 3: Campaign Invitations — Fix + Enhance
| Action | File | Responsibility |
|--------|------|---------------|
| Verify | `supabase/functions/send-campaign-invitation/index.ts` | Debug and fix edge function errors |
| Verify | RLS policies in migrations | Confirm campaign_invitations policies work |
| Modify | `src/lib/navConfig.ts` | Add "Browse Creators" to restaurant sidebar nav |
| Modify | `src/App.tsx` | Add `/dashboard/restaurant/creators` route |
| Modify | `src/pages/BrandCreators.tsx` | Audit for hard-coded brand role checks |
| Modify | `src/hooks/useCampaignInvitations.ts` | Add `useCreatorPendingInvitations` + `useDeclineInvitation` |
| Modify | `src/pages/CreatorCampaignMarketplace.tsx` | Add "Invitations" tab with badge + invitation cards |
| Modify | `supabase/functions/send-notification-email/index.ts` | Add `campaign_invitation_declined` template |

### Section 4: Multi-Location Social Media + Stripe
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260512200000_org_unit_stripe.sql` | Add stripe columns to org_units |
| Modify | `supabase/functions/create-restaurant-connect-account/index.ts` | Accept org_unit_id, write to org_units |
| Modify | `supabase/functions/check-restaurant-payout-status/index.ts` | Resolution order: org_units first, then business_profiles |
| Modify | `src/components/settings/StripeConnectSetup.tsx` | Location-aware: read/write from org_units when activeOrgUnit set |
| Modify | `src/components/outstand/AccountsTab.tsx` | Fix org_unit_id passing to Outstand proxy |
| Create | `src/hooks/useLocationReadiness.ts` | Check social + Stripe connected for org unit |
| Modify | `src/pages/BusinessDashboard.tsx` | Show gating banner when location not ready |

---

## Section 1: Messaging Unread Badges

### Task 1.1: Add useTotalUnreadCount hook

**Files:**
- Modify: `src/hooks/useUnreadCounts.ts`

- [ ] **Step 1: Add the useTotalUnreadCount hook**

Open `src/hooks/useUnreadCounts.ts` and add this new hook after the existing `useUnreadMessageCounts`:

```typescript
import { useConversations } from './useConversations';

export const useTotalUnreadCount = () => {
  const { data: conversations } = useConversations();

  const total = conversations?.reduce(
    (sum, conv) => sum + (conv.unread_count ?? 0),
    0
  ) ?? 0;

  return Math.min(total, 99);
};
```

This derives total unread count from the existing `useConversations` hook. No new RPC call needed. React Query's `queryKey` deduplication handles concurrent refetches. Returns capped at 99.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useUnreadCounts.ts
git commit -m "feat: add useTotalUnreadCount hook for messaging badges"
```

---

### Task 1.2: Add unread badge to MobileBottomNav

**Files:**
- Modify: `src/components/MobileBottomNav.tsx`

- [ ] **Step 1: Import the hook and add badge rendering**

Add import at top of file:
```typescript
import { useTotalUnreadCount } from '@/hooks/useUnreadCounts';
```

Inside the component function, before the `return`, add:
```typescript
const unreadCount = useTotalUnreadCount();
```

Find the `items.map()` block where nav items are rendered (around line 26). Inside the `return` branch for non-Donny items, there is a `<Link>` element containing the icon and label. The current structure looks like:

```typescript
{/* Current code in MobileBottomNav.tsx (around lines 40-55): */}
<Link
  key={`${item.href}-${item.label}`}
  to={item.href}
  className="flex flex-col items-center gap-0.5 py-1 min-h-[44px] min-w-[44px]"
  aria-label={item.label}
>
  <Icon className={`h-5 w-5 ${active ? 'text-dc-teal font-bold' : 'text-gray-400'}`} />
  <span className={`text-[10px] leading-tight truncate ${active ? 'text-dc-teal font-semibold' : 'text-gray-400'}`}>
    {item.label}
  </span>
</Link>
```

Wrap the `<Icon>` in a `<span className="relative">` and add the badge as a sibling inside that wrapper:

```typescript
<Link
  key={`${item.href}-${item.label}`}
  to={item.href}
  className="flex flex-col items-center gap-0.5 py-1 min-h-[44px] min-w-[44px]"
  aria-label={item.label}
>
  <span className="relative">
    <Icon className={`h-5 w-5 ${active ? 'text-dc-teal font-bold' : 'text-gray-400'}`} />
    {item.label === 'Messages' && unreadCount > 0 && (
      <span className="absolute -top-1.5 -right-2.5 bg-pink-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    )}
  </span>
  <span className={`text-[10px] leading-tight truncate ${active ? 'text-dc-teal font-semibold' : 'text-gray-400'}`}>
    {item.label}
  </span>
</Link>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Visual check**

Run: `npm run dev`
Open mobile viewport in browser. Verify the Messages icon shows a pink badge when unread messages exist. Badge should show "9+" for counts above 9.

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileBottomNav.tsx
git commit -m "feat: add unread message badge to mobile bottom nav"
```

---

### Task 1.3: Add unread badge to desktop sidebar

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Import the hook**

Add import at top of `DashboardLayout.tsx`:
```typescript
import { useTotalUnreadCount } from '@/hooks/useUnreadCounts';
```

Inside the component, add:
```typescript
const unreadCount = useTotalUnreadCount();
```

- [ ] **Step 2: Add badge to sidebar nav item**

Find the `navItems.map()` block in the sidebar rendering (around lines 87-111). Inside the `<Link>` element, after the label `<span>`, add the badge:

```typescript
<Link to={item.href} className="flex items-center gap-3 px-3">
  <item.icon
    className={`h-[18px] w-[18px] transition-colors duration-200 ${
      isActive ? 'text-dc-teal' : 'text-muted-foreground'
    }`}
  />
  {!collapsed && <span className="text-sm">{item.label}</span>}
  {item.label === 'Messages' && unreadCount > 0 && (
    <span className="ml-auto bg-pink-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  )}
</Link>
```

When collapsed, also show a small badge on the icon:
```typescript
{collapsed && item.label === 'Messages' && unreadCount > 0 && (
  <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5">
    {unreadCount > 9 ? '9+' : unreadCount}
  </span>
)}
```

Make sure the icon container has `relative` positioning for the collapsed badge.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Visual check**

Run: `npm run dev`
Open desktop viewport. Verify Messages sidebar link shows badge inline when expanded, and a small badge over the icon when collapsed.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat: add unread message badge to desktop sidebar"
```

---

### Task 1.4: Enable email notifications for all roles

**Files:**
- Modify: `supabase/functions/send-notification-email/index.ts`

- [ ] **Step 1: Find and remove the role filter**

Search `send-notification-email/index.ts` for any logic near the `new_message` case that filters by role (e.g., `account_type`, `role`, `business_client`, `brand`). The role filter may be in the calling code rather than the email function itself. Check:

1. `src/hooks/useMessageMutations.ts` — the `useSendMessage` hook that triggers email notifications. Look for conditions that check recipient role before calling the edge function.
2. `supabase/functions/send-notification-email/index.ts` — check if there's role-based early return logic.

Remove any condition that prevents creators from receiving message notification emails. The email should fire for ALL recipients regardless of role.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: enable message email notifications for all roles including creators"
```

---

## Section 2: Campaign Swipe Undo + Cycling

### Task 2.1: Create campaign_skips migration

**Files:**
- Create: `supabase/migrations/20260512100000_campaign_skips.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Campaign skip tracking for swipe undo + cycling
CREATE TABLE IF NOT EXISTS public.campaign_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  skipped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, campaign_id)
);

ALTER TABLE public.campaign_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own skips"
  ON public.campaign_skips
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_campaign_skips_user ON public.campaign_skips(user_id);
CREATE INDEX idx_campaign_skips_campaign ON public.campaign_skips(campaign_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260512100000_campaign_skips.sql
git commit -m "feat: add campaign_skips table for swipe undo persistence"
```

---

### Task 2.2: Create useCampaignSkips hook

**Files:**
- Create: `src/hooks/useCampaignSkips.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useSkippedCampaignIds = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-skips', user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();

      const { data, error } = await supabase
        .from('campaign_skips')
        .select('campaign_id')
        .eq('user_id', user.id)
        .eq('restored', false);

      if (error) throw error;
      return new Set((data ?? []).map((r: { campaign_id: string }) => r.campaign_id));
    },
    enabled: !!user,
    staleTime: 300_000,
  });
};

export const useSkipCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('campaign_skips')
        .upsert(
          { user_id: user.id, campaign_id: campaignId, restored: false, skipped_at: new Date().toISOString() },
          { onConflict: 'user_id,campaign_id' }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-skips'] });
    },
  });
};

export const useRestoreCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('campaign_skips')
        .update({ restored: true })
        .eq('user_id', user.id)
        .eq('campaign_id', campaignId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-skips'] });
    },
  });
};
```

- [ ] **Step 2: Add campaign_skips type to Supabase types**

The `campaign_skips` table does not exist in `src/integrations/supabase/types.ts` yet. Add the table definition inside the `Tables` object in the `Database["public"]` interface. Find the alphabetical insertion point (after `campaign_matches` or `campaign_invitations`) and add:

```typescript
campaign_skips: {
  Row: {
    id: string
    user_id: string
    campaign_id: string
    skipped_at: string
    restored: boolean
  }
  Insert: {
    id?: string
    user_id: string
    campaign_id: string
    skipped_at?: string
    restored?: boolean
  }
  Update: {
    id?: string
    user_id?: string
    campaign_id?: string
    skipped_at?: string
    restored?: boolean
  }
  Relationships: [
    {
      foreignKeyName: "campaign_skips_user_id_fkey"
      columns: ["user_id"]
      isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "campaign_skips_campaign_id_fkey"
      columns: ["campaign_id"]
      isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
  ]
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build with proper typing.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignSkips.ts src/integrations/supabase/types.ts
git commit -m "feat: add useCampaignSkips hooks and campaign_skips type for skip persistence"
```

---

### Task 2.3: Create UndoToast component

**Files:**
- Create: `src/components/campaigns/UndoToast.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { useEffect, useState } from 'react';

interface UndoToastProps {
  visible: boolean;
  onUndo: () => void;
  onExpire: () => void;
  duration?: number;
}

export const UndoToast = ({ visible, onUndo, onExpire, duration = 5000 }: UndoToastProps) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!visible) {
      setProgress(100);
      return;
    }

    const interval = 50;
    const decrement = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - decrement;
        if (next <= 0) {
          clearInterval(timer);
          onExpire();
          return 0;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [visible, duration, onExpire]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-80 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-gray-900 text-white rounded-xl px-4 py-3 shadow-lg flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">Campaign skipped</p>
          <div className="mt-1.5 h-0.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-dc-teal rounded-full transition-all duration-50"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <button
          onClick={onUndo}
          className="bg-dc-teal text-white text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-dc-teal/90 transition-colors shrink-0"
        >
          Undo
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/UndoToast.tsx
git commit -m "feat: add UndoToast component for campaign swipe undo"
```

---

### Task 2.4: Wire undo + cycling into CreatorCampaignMarketplace

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`
- Modify: `src/components/campaigns/CampaignSwipeCard.tsx`

- [ ] **Step 1: Update CreatorCampaignMarketplace with skip persistence and undo**

Add imports:
```typescript
import { useSkippedCampaignIds, useSkipCampaign, useRestoreCampaign } from '@/hooks/useCampaignSkips';
import { UndoToast } from '@/components/campaigns/UndoToast';
```

Replace the `skippedIds` state and `handleSwipe` logic:

```typescript
// Replace: const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
// With:
const { data: persistedSkips = new Set<string>() } = useSkippedCampaignIds();
const [sessionSkips, setSessionSkips] = useState<Set<string>>(new Set());
const skippedIds = new Set([...persistedSkips, ...sessionSkips]);

const skipCampaign = useSkipCampaign();
const restoreCampaign = useRestoreCampaign();

const [undoTarget, setUndoTarget] = useState<string | null>(null);
const [showUndo, setShowUndo] = useState(false);
const [showCycled, setShowCycled] = useState(false);
```

Update `handleSwipe`:
```typescript
const handleSwipe = (direction: string, campaign: PublicCampaign) => {
  if (direction === 'right') {
    setDetailReadOnly(false);
    setDetailCampaign(campaign);
  } else if (direction === 'left') {
    setSessionSkips((prev) => new Set(prev).add(campaign.id));
    setUndoTarget(campaign.id);
    setShowUndo(true);
  }
};

const handleUndo = () => {
  if (undoTarget) {
    setSessionSkips((prev) => {
      const next = new Set(prev);
      next.delete(undoTarget);
      return next;
    });
    restoreCampaign.mutate(undoTarget);
  }
  setShowUndo(false);
  setUndoTarget(null);
};

const handleUndoExpire = () => {
  if (undoTarget) {
    skipCampaign.mutate(undoTarget);
  }
  setShowUndo(false);
  setUndoTarget(null);
};

const handleShowCycled = () => {
  setShowCycled(true);
};
```

Update the campaign filtering to support cycling:
```typescript
const availableCampaigns = filteredBySearch.filter(
  (c) => !c.user_applied && !donnyPickIds.has(c.id) && (showCycled || !skippedIds.has(c.id))
);
```

Add the UndoToast at the bottom of the JSX return (before closing fragment):
```typescript
<UndoToast visible={showUndo} onUndo={handleUndo} onExpire={handleUndoExpire} />
```

- [ ] **Step 2: Update CampaignSwipeCard "All caught up" state**

In `CampaignSwipeCard.tsx`, update the empty state to include the cycling button. Add a new prop:

```typescript
interface CampaignSwipeCardProps {
  // ... existing props
  skippedCount?: number;
  onShowSkipped?: () => void;
}
```

Update the "All caught up" empty state:
```typescript
{!campaigns.length ? (
  <div className="flex flex-col items-center justify-center h-[calc(100dvh-220px)] max-h-[680px] px-6 text-center">
    <img src={logo} alt="Dragon Candy" className="w-20 h-20 mb-4 opacity-60" />
    <p className="text-white font-bold text-xl mb-2">All caught up!</p>
    <p className="text-white/70 text-sm mb-4">
      {skippedCount && skippedCount > 0
        ? "You've seen all new campaigns. Want to revisit the ones you skipped?"
        : "No more campaigns available right now. Check back soon."}
    </p>
    {skippedCount && skippedCount > 0 && onShowSkipped && (
      <button
        onClick={onShowSkipped}
        className="bg-dc-teal text-white font-semibold py-2.5 px-6 rounded-full text-sm hover:bg-dc-teal/90 transition-colors"
      >
        Show Skipped ({skippedCount})
      </button>
    )}
  </div>
)
```

Pass the props from CreatorCampaignMarketplace:
```typescript
<CampaignSwipeCard
  // ... existing props
  skippedCount={skippedIds.size}
  onShowSkipped={handleShowCycled}
/>
```

- [ ] **Step 3: Add desktop "Previously Skipped" section**

In `CreatorCampaignMarketplace.tsx`, in the desktop grid view section, add a collapsible skipped section after the main campaign grid:

```typescript
{/* Desktop: Previously Skipped Section */}
{!showCycled && skippedIds.size > 0 && (
  <div className="hidden md:block mt-8">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white">Previously Skipped</h3>
      <span className="text-sm text-white/60">{skippedIds.size} campaigns</span>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredBySearch
        .filter((c) => skippedIds.has(c.id) && !c.user_applied)
        .map((campaign) => (
          <div key={campaign.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h4 className="font-semibold text-sm text-gray-900 mb-1 truncate">{campaign.title}</h4>
            <p className="text-xs text-gray-500 mb-3 truncate">
              {campaign.business_name} &bull; ${campaign.budget_min}-${campaign.budget_max}
            </p>
            <button
              onClick={() => {
                restoreCampaign.mutate(campaign.id);
                setSessionSkips((prev) => {
                  const next = new Set(prev);
                  next.delete(campaign.id);
                  return next;
                });
              }}
              className="w-full text-center text-sm font-semibold text-dc-teal border border-dc-teal rounded-full py-1.5 hover:bg-dc-teal/5 transition-colors"
            >
              Restore
            </button>
          </div>
        ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Visual check**

Run: `npm run dev`
Test on mobile: swipe left on a campaign, verify undo toast appears, tap undo to restore. Swipe through all campaigns, verify "Show Skipped" button appears.
Test on desktop: verify "Previously Skipped" section appears below main grid with restore buttons.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx src/components/campaigns/CampaignSwipeCard.tsx
git commit -m "feat: wire campaign swipe undo, cycling, and desktop skipped section"
```

---

## Section 3: Campaign Invitations — Fix + Enhance

### Task 3.1: Audit and fix the invitation pipeline

**Files:**
- Verify: `supabase/functions/send-campaign-invitation/index.ts`
- Verify: RLS policies in `supabase/migrations/20250616224436_*.sql`
- Verify: `src/pages/BrandCreators.tsx`
- Verify: `src/components/brand-browse/BrandCreatorCard.tsx`

- [ ] **Step 1: Test the edge function locally**

Run the dev server and attempt to send an invitation from the Brand dashboard. Open browser DevTools Network tab. Look for the `send-campaign-invitation` request. Check:
- Does the request fire at all?
- What's the response status and body?
- Is `invited_by` set to the current user's ID?

Common issues to check:
1. The `useInviteCreator` hook in `useCampaignInvitations.ts` — verify it passes `invited_by: user.id` in the request body. Check if it's using the edge function correctly.
2. Campaign ownership check: the edge function checks `campaigns.user_id = invited_by`. If the brand user doesn't own the campaign directly (e.g., org-scoped ownership), this will fail.
3. RLS on `campaign_invitations` INSERT requires `auth.uid() = invited_by`. Verify the edge function uses the authenticated user's service role client correctly.

- [ ] **Step 2: Fix any identified issues**

Apply fixes based on findings. Common fixes:
- If `invited_by` isn't being passed: add `user.id` to the mutation request body
- If campaign ownership check fails for org-scoped campaigns: update the edge function to also check org membership
- If RLS blocks the insert: verify the edge function uses the correct Supabase client (service role for inserts, or ensure auth context is passed through)

- [ ] **Step 3: Test email + Donny notification delivery**

After fixing the send path, verify:
1. Email arrives for the invited creator (check Supabase logs for `send-notification-email` invocation)
2. Donny message appears in the creator's Donny conversation

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: repair campaign invitation pipeline — edge function, RLS, and notification delivery"
```

---

### Task 3.2: Add Restaurant access to Browse Creators

**Files:**
- Modify: `src/lib/navConfig.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/BrandCreators.tsx` (if hard-coded role checks found)

- [ ] **Step 1: Add nav item for restaurant sidebar**

In `navConfig.ts`, find `businessSidebarNav` array. Add the Browse Creators entry if not already present (it may exist at line ~53 as `{ icon: Users, label: 'Browse Creators', href: '/dashboard/business/creators' }`). Verify it exists. If the href is `/dashboard/business/creators`, we're good — no separate restaurant route needed since restaurants use the `/dashboard/business/` prefix.

- [ ] **Step 2: Verify the route exists in App.tsx**

Check that `/dashboard/business/creators` route exists and renders `<BrandCreators />`. If it doesn't, add it:

```typescript
<Route path="/dashboard/business/creators" element={<ProtectedRoute><BrandCreators /></ProtectedRoute>} />
```

- [ ] **Step 3: Audit BrandCreators for role-specific code**

Search `BrandCreators.tsx` for any hard-coded references to `'brand'` role. Check:
- `useBrandActiveCampaigns()` — does this filter by role? If so, it should use the user's actual role or fetch all campaigns owned by the user.
- Campaign dropdown — does it only show brand campaigns?
- Invite handler — does it check role before sending?

Fix any hard-coded role checks to use the user's actual role from auth context.

- [ ] **Step 4: Verify build and test**

Run: `npm run build`
Run: `npm run dev`
Log in as a restaurant user. Verify "Browse Creators" appears in the sidebar. Navigate to it. Verify creator cards render with Invite buttons. Test sending an invitation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/navConfig.ts src/App.tsx src/pages/BrandCreators.tsx
git commit -m "feat: enable Browse Creators page for restaurant users"
```

---

### Task 3.3: Add useCreatorPendingInvitations and useDeclineInvitation hooks

**Files:**
- Modify: `src/hooks/useCampaignInvitations.ts`

- [ ] **Step 1: Add useCreatorPendingInvitations hook**

Append to `useCampaignInvitations.ts`:

```typescript
export const useCreatorPendingInvitations = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-pending-invitations', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('campaign_invitations')
        .select(`
          *,
          campaigns:campaign_id (
            id, title, emoji, budget_min, budget_max, deadline,
            deliverable_count, content_types, cover_image_url,
            profiles:user_id ( full_name, avatar_url, business_name )
          )
        `)
        .eq('creator_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: 'always',
  });
};
```

- [ ] **Step 2: Add useDeclineInvitation hook**

Append to `useCampaignInvitations.ts`:

```typescript
export const useDeclineInvitation = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: invitation, error: fetchError } = await supabase
        .from('campaign_invitations')
        .select('campaign_id, invited_by, campaigns:campaign_id ( title )')
        .eq('id', invitationId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('campaign_invitations')
        .update({ status: 'declined' })
        .eq('id', invitationId)
        .eq('creator_id', user.id);

      if (error) throw error;

      // Send decline notification email to the inviter
      try {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'campaign_invitation_declined',
            data: {
              recipientUserId: invitation.invited_by,
              senderName: creatorProfile?.full_name ?? 'A creator',
              campaignTitle: (invitation.campaigns as any)?.title ?? 'your campaign',
              campaignId: invitation.campaign_id,
            },
          },
        });
      } catch (emailErr) {
        console.error('Failed to send decline notification:', emailErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-pending-invitations'] });
      toast({ title: 'Invitation declined' });
    },
    onError: () => {
      toast({ title: 'Failed to decline invitation', variant: 'destructive' });
    },
  });
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. If the `campaigns` join syntax has type issues, adjust the select query or use type assertions.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignInvitations.ts
git commit -m "feat: add useCreatorPendingInvitations and useDeclineInvitation hooks"
```

---

### Task 3.4: Add campaign_invitation_declined email template

**Files:**
- Modify: `supabase/functions/send-notification-email/index.ts`

- [ ] **Step 1: Add the declined template**

Find the `templates` object in `send-notification-email/index.ts`. Add the new template alongside existing ones:

```typescript
campaign_invitation_declined: {
  subject: `${esc.senderName} declined your campaign invitation`,
  html: `
    <p>Hi ${esc.recipientName},</p>
    <p><strong>${esc.senderName}</strong> has declined your invitation to "${esc.campaignTitle}".</p>
    <p style="color: #6B7280; font-size: 14px;">You can invite other creators or wait for organic applications.</p>
    <p style="margin-top: 30px;">
      <a href="${baseUrl}/dashboard/business/campaigns/${data.campaignId}" 
         style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
        View Campaign
      </a>
    </p>
  `,
},
```

Also add `'campaign_invitation_declined'` to the `NotificationType` type union if it exists.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-notification-email/index.ts
git commit -m "feat: add campaign_invitation_declined email template"
```

---

### Task 3.5: Add Invitations tab to CreatorCampaignMarketplace

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`

- [ ] **Step 1: Add the invitations tab definition**

Update the `Tab` type and `tabs` array:

```typescript
type Tab = 'all' | 'donny' | 'invitations';

// In the tabs array:
const tabs: { id: Tab; label: string; badge?: number }[] = [
  { id: 'all', label: 'All Campaigns' },
  { id: 'donny', label: 'Donny Picks' },
  { id: 'invitations', label: 'Invitations', badge: pendingInvitations?.length ?? 0 },
];
```

- [ ] **Step 2: Import hooks, useNavigate, and add queries**

Add imports at the top of the file:
```typescript
import { useNavigate } from 'react-router-dom';
import { useCreatorPendingInvitations, useDeclineInvitation } from '@/hooks/useCampaignInvitations';
```

Inside the component function, add:
```typescript
const navigate = useNavigate();
const { data: pendingInvitations = [] } = useCreatorPendingInvitations();
const declineInvitation = useDeclineInvitation();
```

- [ ] **Step 3: Update tab badge rendering**

In the tab button rendering, add badge support. Find where tabs are mapped and rendered as buttons. Add a badge after the label text:

```typescript
{tab.badge && tab.badge > 0 ? (
  <span className="ml-1.5 bg-pink-500 text-white text-[10px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
    {tab.badge}
  </span>
) : null}
```

- [ ] **Step 4: Add invitations tab content**

Add a new conditional block for the invitations tab content:

```typescript
{activeTab === 'invitations' && (
  <div className="space-y-3 px-4 md:px-0">
    {pendingInvitations.length === 0 ? (
      <div className="text-center py-12">
        <p className="text-white font-semibold text-lg">No pending invitations</p>
        <p className="text-white/60 text-sm mt-1">When brands invite you to campaigns, they'll appear here.</p>
      </div>
    ) : (
      pendingInvitations.map((inv: any) => {
        const campaign = inv.campaigns;
        const business = campaign?.profiles;
        return (
          <div key={inv.id} className="bg-teal-50 border-2 border-dc-teal rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-dc-teal flex items-center justify-center text-white font-bold text-sm">
                {business?.business_name?.[0] ?? business?.full_name?.[0] ?? '?'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900">{business?.business_name ?? business?.full_name}</p>
                <p className="text-xs text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</p>
              </div>
              <span className="text-[10px] font-semibold text-dc-teal bg-white border border-dc-teal px-2 py-0.5 rounded-full">
                Invited
              </span>
            </div>
            <p className="font-semibold text-gray-900 mb-1">
              {campaign?.emoji ?? ''} {campaign?.title}
            </p>
            <p className="text-xs text-gray-500 mb-2">
              ${campaign?.budget_min} - ${campaign?.budget_max}
              {campaign?.deliverable_count ? ` · ${campaign.deliverable_count} deliverables` : ''}
              {campaign?.deadline ? ` · Due ${new Date(campaign.deadline).toLocaleDateString()}` : ''}
            </p>
            {inv.invitation_message && (
              <div className="bg-white rounded-lg border-l-3 border-dc-teal px-3 py-2 mb-3 italic text-sm text-gray-600">
                "{inv.invitation_message}"
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigate(`/dashboard/creator/campaigns/${campaign?.id}?invited=true`);
                }}
                className="flex-1 bg-dc-teal text-white font-semibold py-2 rounded-full text-sm hover:bg-dc-teal/90 transition-colors"
              >
                Apply Now
              </button>
              <button
                onClick={() => declineInvitation.mutate(inv.id)}
                disabled={declineInvitation.isPending}
                className="flex-1 bg-white text-pink-500 font-semibold py-2 rounded-full text-sm border-2 border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        );
      })
    )}
  </div>
)}
```

Make sure `navigate` is imported from `react-router-dom` (likely already imported in this file).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 6: Visual check**

Run: `npm run dev`
Log in as a creator. Navigate to Campaigns. Verify the "Invitations" tab appears. If there are pending invitations, verify the cards render with Apply Now and Decline buttons.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "feat: add Invitations tab with decline action to creator campaign marketplace"
```

---

## Section 4: Multi-Location Social Media + Stripe

### Task 4.1: Add Stripe columns to org_units

**Files:**
- Create: `supabase/migrations/20260512200000_org_unit_stripe.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-location Stripe Connect support
ALTER TABLE public.org_units
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_balance NUMERIC DEFAULT 0;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260512200000_org_unit_stripe.sql
git commit -m "feat: add Stripe columns to org_units for per-location payments"
```

---

### Task 4.2: Update Stripe Connect edge functions

**Files:**
- Modify: `supabase/functions/create-restaurant-connect-account/index.ts`
- Modify: `supabase/functions/check-restaurant-payout-status/index.ts`

- [ ] **Step 1: Update create-restaurant-connect-account**

The function needs to accept `org_unit_id` from the request body and write Stripe data to `org_units` when provided.

After reading the request body, extract `org_unit_id`:
```typescript
const { org_unit_id } = await req.json().catch(() => ({}));
```

Update the Stripe account lookup to check org_units first:
```typescript
let stripeAccountId: string | null = null;
let source: 'org_unit' | 'business_profile' = 'business_profile';

if (org_unit_id) {
  const { data: orgUnit } = await supabaseClient
    .from('org_units')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', org_unit_id)
    .single();

  if (orgUnit?.stripe_account_id) {
    stripeAccountId = orgUnit.stripe_account_id;
    source = 'org_unit';
  }
}

if (!stripeAccountId) {
  // Fall back to business_profiles (existing logic)
  const { data: businessProfile } = await supabaseClient
    .from('business_profiles')
    .select('stripe_account_id, stripe_onboarding_complete, business_name')
    .eq('user_id', user.id)
    .eq('account_type', 'restaurant')
    .single();

  if (businessProfile?.stripe_account_id) {
    stripeAccountId = businessProfile.stripe_account_id;
  }
}
```

When saving the new Stripe account, write to the appropriate table:
```typescript
if (org_unit_id) {
  await supabaseClient
    .from('org_units')
    .update({ stripe_account_id: accountId })
    .eq('id', org_unit_id);
} else {
  // Existing logic: write to business_profiles
  await supabaseClient
    .from('business_profiles')
    .update({ stripe_account_id: accountId })
    .eq('user_id', user.id);
}
```

Add `org_unit_id` to Stripe metadata:
```typescript
metadata: {
  user_id: user.id,
  platform: 'dragoncandy',
  account_type: 'restaurant',
  org_unit_id: org_unit_id ?? '',
},
```

- [ ] **Step 2: Update check-restaurant-payout-status**

Apply the same resolution order: check `org_units` first if `org_unit_id` is provided, fall back to `business_profiles`.

Read `org_unit_id` from query params or request body:
```typescript
const url = new URL(req.url);
const org_unit_id = url.searchParams.get('org_unit_id');
```

Resolution logic:
```typescript
let stripeAccountId: string | null = null;

if (org_unit_id) {
  const { data: orgUnit } = await supabaseClient
    .from('org_units')
    .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
    .eq('id', org_unit_id)
    .single();

  stripeAccountId = orgUnit?.stripe_account_id ?? null;
}

if (!stripeAccountId) {
  const { data: businessProfile } = await supabaseClient
    .from('business_profiles')
    .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
    .eq('user_id', user.id)
    .eq('account_type', 'restaurant')
    .single();

  stripeAccountId = businessProfile?.stripe_account_id ?? null;
}
```

- [ ] **Step 3: Verify build**

Edge functions don't build with `npm run build`. Verify syntax by checking for TypeScript errors manually or deploying to Supabase staging.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/create-restaurant-connect-account/index.ts supabase/functions/check-restaurant-payout-status/index.ts
git commit -m "feat: make Stripe Connect edge functions location-aware with org_unit_id"
```

---

### Task 4.3: Update StripeConnectSetup component

**Files:**
- Modify: `src/components/settings/StripeConnectSetup.tsx`

- [ ] **Step 1: Make the component location-aware**

Import auth context:
```typescript
import { useAuth } from '@/hooks/useAuth';
```

Inside the component, get the active org unit and check for multiple locations:
```typescript
const { activeOrgUnit, activeOrg } = useAuth();
```

Import and use the org units hook to determine if the user has multiple locations:
```typescript
import { useOrgUnits } from '@/hooks/useOrgUnits';

// Inside component:
const { data: orgUnits = [] } = useOrgUnits(activeOrg?.id);
const hasMultipleLocations = orgUnits.length > 1;
```

Update the `checkStatus` function to pass `org_unit_id`:
```typescript
const checkStatus = async () => {
  const params = activeOrgUnit ? `?org_unit_id=${activeOrgUnit.id}` : '';
  const { data, error } = await supabase.functions.invoke(
    `check-restaurant-payout-status${params}`
  );
  // ... existing handling
};
```

Update the `handleConnect` function to pass `org_unit_id`:
```typescript
const handleConnect = async () => {
  const { data, error } = await supabase.functions.invoke('create-restaurant-connect-account', {
    body: { org_unit_id: activeOrgUnit?.id ?? null },
  });
  // ... existing handling
};
```

When `activeOrgUnit` is null and the user has multiple locations, show guidance:
```typescript
if (!activeOrgUnit && hasMultipleLocations) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
      <p className="text-sm text-amber-800">
        Switch to a specific location to manage its Stripe account.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/StripeConnectSetup.tsx
git commit -m "feat: make StripeConnectSetup location-aware with org_unit_id"
```

---

### Task 4.4: Fix AccountsTab social media linking

**Files:**
- Modify: `src/components/outstand/AccountsTab.tsx`

- [ ] **Step 1: Verify org_unit_id is passed to Outstand proxy**

Check the AccountsTab component's "Connect a network" flow. When `activeOrgUnit` is set, the Outstand proxy call should include `org_unit_id` in the request. Verify:

1. The connect button handler passes `activeOrgUnit.id`
2. The `outstand-proxy` edge function receives and records `org_unit_id` via the `X-Org-Unit-Id` header
3. The `useLocationSocialAccounts` hook correctly filters by `org_unit_id`

If the connect flow doesn't pass `org_unit_id`, trace the flow from button click to Outstand proxy call and add the header:

```typescript
headers: {
  'X-Org-Unit-Id': activeOrgUnit?.id ?? '',
}
```

- [ ] **Step 2: Fix conditional rendering**

Verify that when `activeOrgUnit` is set, the "Connect a network" button is visible (not hidden). The current code at lines 116-154 should show the connect button when `activeOrgUnit` exists. If the logic is inverted, fix it.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/outstand/AccountsTab.tsx
git commit -m "fix: ensure AccountsTab passes org_unit_id to Outstand proxy for location-scoped social accounts"
```

---

### Task 4.5: Create useLocationReadiness hook and gating banner

**Files:**
- Create: `src/hooks/useLocationReadiness.ts`
- Modify: `src/pages/BusinessDashboard.tsx`

- [ ] **Step 1: Create the readiness hook**

```typescript
import { useAuth } from '@/hooks/useAuth';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useLocationReadiness = () => {
  const { user, activeOrgUnit } = useAuth();

  const { data: socialAccounts = [] } = useLocationSocialAccounts(
    user?.id,
    activeOrgUnit?.id ?? null
  );

  const { data: orgUnit } = useQuery({
    queryKey: ['org-unit-stripe', activeOrgUnit?.id],
    queryFn: async () => {
      if (!activeOrgUnit) return null;
      const { data, error } = await supabase
        .from('org_units')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', activeOrgUnit.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!activeOrgUnit,
  });

  const hasSocial = socialAccounts.length > 0;
  const hasStripe = !!orgUnit?.stripe_account_id && !!orgUnit?.stripe_onboarding_complete;

  return {
    isReady: hasSocial && hasStripe,
    missingSocial: !hasSocial,
    missingStripe: !hasStripe,
    locationName: activeOrgUnit?.name ?? null,
    hasActiveLocation: !!activeOrgUnit,
  };
};
```

- [ ] **Step 2: Add gating banner to BusinessDashboard**

In `BusinessDashboard.tsx`, import and use the hook:

```typescript
import { useLocationReadiness } from '@/hooks/useLocationReadiness';
```

Inside the component:
```typescript
const { isReady, missingSocial, missingStripe, locationName, hasActiveLocation } = useLocationReadiness();
```

Add the banner in the JSX, before the main dashboard content:
```typescript
{hasActiveLocation && !isReady && (
  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 mb-4">
    <span className="text-2xl shrink-0">⚠️</span>
    <div className="text-sm text-amber-900">
      <p className="font-semibold mb-1">Complete {locationName}'s setup to unlock features</p>
      <p>
        This location needs
        {missingStripe && ' a connected Stripe account'}
        {missingStripe && missingSocial && ' and'}
        {missingSocial && ' at least one social media account'}
        {' '}before you can create campaigns, promotions, or use DragonShare.
      </p>
      <button
        onClick={() => navigate('/dashboard/business/settings')}
        className="text-dc-teal font-semibold mt-2 hover:underline"
      >
        Go to Settings →
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Visual check**

Run: `npm run dev`
Log in as a restaurant user with multiple locations. Select a location that doesn't have Stripe/social connected. Verify the gating banner appears on the dashboard.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLocationReadiness.ts src/pages/BusinessDashboard.tsx
git commit -m "feat: add useLocationReadiness hook and gating banner for incomplete location setup"
```

---

## Follow-up: Campaign Creation Gating

The spec calls for gating campaign creation, promotions, and DragonShare on location readiness (social + Stripe connected). Task 4.5 adds the gating banner to `BusinessDashboard` only. Extending the readiness check to campaign creation wizard components, promotion creation, and DragonShare pages is a follow-up task — use the same `useLocationReadiness` hook in each component and show the same banner pattern. This is deferred to keep this plan focused on the four core issues.

---

## Implementation Checklist

| # | Section | Tasks | Est. Commits |
|---|---------|-------|-------------|
| 1 | Messaging Badges | 1.1–1.4 | 4 |
| 2 | Swipe Undo + Cycling | 2.1–2.4 | 4 |
| 3 | Campaign Invitations | 3.1–3.5 | 5 |
| 4 | Multi-Location Stripe | 4.1–4.5 | 5 |
| **Total** | | **18 tasks** | **18 commits** |
