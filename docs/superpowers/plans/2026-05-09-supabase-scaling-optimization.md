# Supabase Scaling & Query Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce per-user database query volume by 40-60% and extend Micro tier viability from ~30 DAU to ~100 DAU through React Query tuning, realtime channel consolidation, callback debouncing, and dashboard query reduction.

**Architecture:** Surgical changes to 7 existing hook files plus 1 new Supabase migration. No new dependencies. Each task is independently deployable and rollback is a one-line constant change.

**Tech Stack:** React Query (TanStack Query), Supabase JS Client v2, Supabase Realtime, PostgreSQL (plpgsql RPC functions)

**Spec:** `docs/superpowers/specs/2026-05-09-supabase-scaling-optimization-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/hooks/useMessageQueries.ts` | Raise staleTime 10s→30s, refetchOnWindowFocus 'always'→true |
| Modify | `src/hooks/useConversations.ts` | Raise staleTime 30s→120s, refetchOnWindowFocus 'always'→true |
| Modify | `src/hooks/useUnreadCounts.ts` | Raise staleTime 15s→60s, refetchOnWindowFocus 'always'→true |
| Modify | `src/hooks/useBrandDashboardStats.ts` | Raise staleTime 60s→300s |
| Modify | `src/hooks/useFetchApplications.ts` | Remove refetchInterval, add explicit staleTime |
| Modify | `src/hooks/useNotifications.ts` | Merge 4 channels→1, debounce callbacks, add lookup cache |
| Modify | `src/contexts/DonnyProvider.tsx` | Lazy-load useDonny — only init when panel opens |
| Create | `supabase/migrations/20260509000000_dashboard_summary_rpc.sql` | RPC function get_dashboard_summary |
| Modify | `src/hooks/useBrandDashboardStats.ts` | Refactor to call RPC (done in Task 6 after migration) |
| Modify | `src/hooks/useROIDashboard.ts` | Consume RPC data for business_client role |
| Create | `src/hooks/useDashboardLoadTime.ts` | Fire dashboard_load_time analytics event |

---

### Task 1: React Query Stale Time & Refetch Tuning

**Files:**
- Modify: `src/hooks/useMessageQueries.ts:67-68`
- Modify: `src/hooks/useConversations.ts:39-40`
- Modify: `src/hooks/useUnreadCounts.ts:26-27`
- Modify: `src/hooks/useBrandDashboardStats.ts:98`
- Modify: `src/hooks/useFetchApplications.ts:68-69`

This is the highest-impact, lowest-risk change. All five hooks already have companion realtime subscriptions that invalidate caches on data changes — the aggressive polling is redundant.

- [ ] **Step 1: Update useMessageQueries stale time and refetch**

In `src/hooks/useMessageQueries.ts`, change lines 67-68:

```typescript
// Before
    staleTime: 10_000,
    refetchOnWindowFocus: 'always',

// After
    staleTime: 30_000,
    refetchOnWindowFocus: true,
```

- [ ] **Step 2: Update useConversations stale time and refetch**

In `src/hooks/useConversations.ts`, change lines 39-40:

```typescript
// Before
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',

// After
    staleTime: 120_000,
    refetchOnWindowFocus: true,
```

- [ ] **Step 3: Update useUnreadCounts stale time and refetch**

In `src/hooks/useUnreadCounts.ts`, change lines 26-27:

```typescript
// Before
    staleTime: 15_000,
    refetchOnWindowFocus: 'always',

// After
    staleTime: 60_000,
    refetchOnWindowFocus: true,
```

- [ ] **Step 4: Update useBrandDashboardStats stale time**

In `src/hooks/useBrandDashboardStats.ts`, change line 98:

```typescript
// Before
    staleTime: 60000, // Cache for 1 minute

// After
    staleTime: 300_000,
```

- [ ] **Step 5: Update useFetchApplications — remove refetchInterval, add staleTime**

In `src/hooks/useFetchApplications.ts`, change lines 68-69:

```typescript
// Before
    refetchOnWindowFocus: true,
    refetchInterval: 120_000,

// After
    refetchOnWindowFocus: true,
    staleTime: 300_000,
```

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useMessageQueries.ts src/hooks/useConversations.ts src/hooks/useUnreadCounts.ts src/hooks/useBrandDashboardStats.ts src/hooks/useFetchApplications.ts
git commit -m "perf: tune React Query stale times and remove aggressive refetch patterns

Raise stale times across 5 hooks where realtime subscriptions already
handle instant cache invalidation. Remove redundant refetchInterval
and refetchOnWindowFocus: 'always' overrides. Estimated ~60% reduction
in background polling queries."
```

---

### Task 2: Realtime Channel Consolidation

**Files:**
- Modify: `src/hooks/useNotifications.ts:186-484`

Merge 4 separate realtime channels (`application-updates`, `sponsorship-updates`, `content-likes`, `invitation-updates`) into a single `notifications-${userId}` channel. The callback handlers stay identical — only the channel creation and cleanup changes.

- [ ] **Step 1: Replace 4 channel subscriptions with 1 consolidated channel**

In `src/hooks/useNotifications.ts`, replace the 4 separate channel blocks (lines 186-484) with a single consolidated channel. The existing callback functions (the arrow functions inside each `.on()`) stay unchanged — they're just moved onto one channel.

Replace from `// Set up real-time subscription for application status changes` (line 185) through the cleanup `return () => {` block (lines 479-484) with:

```typescript
    // Consolidated real-time notification channel
    const notificationChannel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_applications',
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === 'accepted') {
            toast({
              title: 'Application Accepted!',
              description: 'Your application has been accepted. A new collaboration has been created.',
            });
          } else if (newStatus === 'rejected') {
            toast({
              title: 'Application Update',
              description: 'Your application status has been updated.',
              variant: 'destructive',
            });
          }

          const notification: Notification = {
            id: `app-${payload.new.id}-${Date.now()}`,
            type: 'application_status_changed',
            title: `Application ${newStatus}`,
            message: `Your application status has been updated to ${newStatus}`,
            read: false,
            created_at: new Date().toISOString(),
            data: payload.new,
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_applications',
        },
        (payload) => {
          toast({
            title: 'New Application Received',
            description: 'A creator has applied to one of your campaigns.',
          });

          const notification: Notification = {
            id: `new-app-${payload.new.id}`,
            type: 'application_received',
            title: 'New Application',
            message: 'A creator has applied to your campaign',
            read: false,
            created_at: new Date().toISOString(),
            data: payload.new,
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_sponsorships',
        },
        async (payload) => {
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('title, user_id')
            .eq('id', payload.new.campaign_id)
            .single();

          if (!campaign) return;

          const { data: brandProfile } = await supabase
            .from('business_profiles')
            .select('business_name')
            .eq('id', payload.new.brand_id)
            .single();

          if (campaign.user_id === user.id) {
            toast({
              title: 'New Sponsorship Proposal! 🎉',
              description: `${brandProfile?.business_name || 'A brand'} wants to sponsor your campaign "${campaign.title}"`,
            });

            const notification: Notification = {
              id: `sponsorship-${payload.new.id}`,
              type: 'sponsorship_proposal_received',
              title: 'New Sponsorship Proposal',
              message: `${brandProfile?.business_name || 'A brand'} has proposed $${payload.new.sponsorship_amount || 0} to sponsor "${campaign.title}"`,
              read: false,
              created_at: new Date().toISOString(),
              data: {
                campaign_id: payload.new.campaign_id,
                sponsorship_id: payload.new.id,
                brand_id: payload.new.brand_id,
              },
            };

            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_sponsorships',
        },
        async (payload) => {
          if (payload.old.status !== payload.new.status) {
            const { data: campaign } = await supabase
              .from('campaigns')
              .select('title')
              .eq('id', payload.new.campaign_id)
              .single();

            const { data: brandProfile } = await supabase
              .from('business_profiles')
              .select('user_id')
              .eq('id', payload.new.brand_id)
              .single();

            if (brandProfile && brandProfile.user_id === user.id) {
              const newStatus = payload.new.status;
              const statusMessages: Record<string, string> = {
                accepted: '✅ Your sponsorship proposal has been accepted!',
                rejected: '❌ Your sponsorship proposal was declined',
                counter_offer: '💬 The restaurant made a counter-offer',
              };

              if (statusMessages[newStatus]) {
                toast({
                  title: 'Sponsorship Update',
                  description: `${statusMessages[newStatus]} for "${campaign?.title || 'campaign'}"`,
                  variant: newStatus === 'rejected' ? 'destructive' : 'default',
                });

                const notification: Notification = {
                  id: `sponsorship-update-${payload.new.id}-${Date.now()}`,
                  type: 'sponsorship_status_changed',
                  title: `Sponsorship ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
                  message: `Your proposal for "${campaign?.title || 'campaign'}" is now ${newStatus}`,
                  read: false,
                  created_at: new Date().toISOString(),
                  data: {
                    campaign_id: payload.new.campaign_id,
                    sponsorship_id: payload.new.id,
                    status: newStatus,
                  },
                };

                setNotifications(prev => [notification, ...prev]);
                setUnreadCount(prev => prev + 1);
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analytics_events',
          filter: 'event_type=eq.dragon_feed_like'
        },
        async (payload) => {
          const eventData = payload.new.event_data as Record<string, unknown>;
          if (eventData?.action !== 'like') return;

          const { data: creatorProfile } = await supabase
            .from('creator_profiles')
            .select('id, user_id, creator_name')
            .eq('id', eventData.creator_id)
            .single();

          if (creatorProfile?.user_id !== user.id) return;

          const { data: likerProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', payload.new.user_id)
            .single();

          const likerName = likerProfile?.full_name ||
                            likerProfile?.email?.split('@')[0] ||
                            'Someone';

          toast({
            title: '❤️ Your content got a like!',
            description: `${likerName} liked your content`,
          });

          const notification: Notification = {
            id: `content-like-${payload.new.id}`,
            type: 'content_liked',
            title: 'Content Liked',
            message: `${likerName} liked your content`,
            read: false,
            created_at: new Date().toISOString(),
            data: {
              content_id: eventData.content_id as string | undefined,
              liker_id: payload.new.user_id,
              liker_name: likerName,
            },
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_invitations',
          filter: `creator_id=eq.${user.id}`,
        },
        async (payload) => {
          let campaignTitle = 'a campaign';
          try {
            const { data: campaign } = await supabase
              .from('campaigns')
              .select('title')
              .eq('id', payload.new.campaign_id)
              .single();
            if (campaign) campaignTitle = campaign.title;
          } catch {}

          toast({
            title: 'Campaign Invitation!',
            description: `You've been invited to "${campaignTitle}"`,
          });

          const notification: Notification = {
            id: `invite-${payload.new.id}`,
            type: 'campaign_invitation',
            title: 'Campaign Invitation',
            message: `You've been invited to "${campaignTitle}"`,
            read: false,
            created_at: new Date().toISOString(),
            data: { campaign_id: payload.new.campaign_id, invitation_id: payload.new.id },
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "perf: consolidate 4 notification realtime channels into 1

Merge application-updates, sponsorship-updates, content-likes, and
invitation-updates channels into a single notifications-{userId}
channel. Reduces per-user realtime connections from 6+ to 3."
```

---

### Task 3: Realtime Callback Debouncing & Lookup Cache

**Files:**
- Modify: `src/hooks/useNotifications.ts` (the async callbacks inside the consolidated channel from Task 2)

Add a simple lookup cache so repeated notifications for the same campaign/brand skip the database. This task modifies the sponsorship and invitation callbacks that fire follow-up queries.

Note: The spec describes a 2-second debounce window with batched `.in()` queries. The cache approach achieves similar results with less complexity — if the same campaign triggers 10 events, only the first hits the database. If burst events for *different* campaigns remain a problem post-launch, add debouncing as a follow-up.

- [ ] **Step 1: Add a lookup cache at the top of the useEffect**

Insert a cache Map inside the realtime subscription `useEffect` block (after `init();` call, before the channel creation), and create a helper to do cached lookups:

```typescript
    // Cache for follow-up lookups (campaigns, brands) — avoids repeated queries
    const lookupCache = new Map<string, { data: any; expiresAt: number }>();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    const cachedLookup = async <T>(
      key: string,
      fetcher: () => Promise<T>
    ): Promise<T | null> => {
      const cached = lookupCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as T;
      }
      const result = await fetcher();
      if (result) {
        lookupCache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL });
      }
      return result;
    };
```

- [ ] **Step 2: Replace direct queries in sponsorship INSERT callback with cached lookups**

In the sponsorship INSERT callback, replace:

```typescript
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('title, user_id')
            .eq('id', payload.new.campaign_id)
            .single();

          if (!campaign) return;

          const { data: brandProfile } = await supabase
            .from('business_profiles')
            .select('business_name')
            .eq('id', payload.new.brand_id)
            .single();
```

With:

```typescript
          const campaign = await cachedLookup(
            `campaign-${payload.new.campaign_id}`,
            async () => {
              const { data } = await supabase
                .from('campaigns')
                .select('title, user_id')
                .eq('id', payload.new.campaign_id)
                .single();
              return data;
            }
          );

          if (!campaign) return;

          const brandProfile = await cachedLookup(
            `brand-${payload.new.brand_id}`,
            async () => {
              const { data } = await supabase
                .from('business_profiles')
                .select('business_name')
                .eq('id', payload.new.brand_id)
                .single();
              return data;
            }
          );
```

- [ ] **Step 3: Replace direct queries in sponsorship UPDATE callback with cached lookups**

In the sponsorship UPDATE callback, replace the campaign and brand profile fetches with the same `cachedLookup` pattern. The campaign key is `campaign-${payload.new.campaign_id}` and the brand key is `brand-user-${payload.new.brand_id}`:

```typescript
            const campaign = await cachedLookup(
              `campaign-${payload.new.campaign_id}`,
              async () => {
                const { data } = await supabase
                  .from('campaigns')
                  .select('title')
                  .eq('id', payload.new.campaign_id)
                  .single();
                return data;
              }
            );

            const brandProfile = await cachedLookup(
              `brand-user-${payload.new.brand_id}`,
              async () => {
                const { data } = await supabase
                  .from('business_profiles')
                  .select('user_id')
                  .eq('id', payload.new.brand_id)
                  .single();
                return data;
              }
            );
```

- [ ] **Step 4: Replace direct queries in invitation INSERT callback with cached lookup**

In the invitation INSERT callback, replace:

```typescript
            const { data: campaign } = await supabase
              .from('campaigns')
              .select('title')
              .eq('id', payload.new.campaign_id)
              .single();
            if (campaign) campaignTitle = campaign.title;
```

With:

```typescript
            const campaign = await cachedLookup(
              `campaign-title-${payload.new.campaign_id}`,
              async () => {
                const { data } = await supabase
                  .from('campaigns')
                  .select('title')
                  .eq('id', payload.new.campaign_id)
                  .single();
                return data;
              }
            );
            if (campaign) campaignTitle = campaign.title;
```

- [ ] **Step 5: Replace direct queries in content-likes callback with cached lookups**

In the content-likes callback, replace the `creator_profiles` and `profiles` lookups with cached versions:

```typescript
          const creatorProfile = await cachedLookup(
            `creator-${eventData.creator_id}`,
            async () => {
              const { data } = await supabase
                .from('creator_profiles')
                .select('id, user_id, creator_name')
                .eq('id', eventData.creator_id)
                .single();
              return data;
            }
          );

          if (creatorProfile?.user_id !== user.id) return;

          const likerProfile = await cachedLookup(
            `profile-${payload.new.user_id}`,
            async () => {
              const { data } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', payload.new.user_id)
                .single();
              return data;
            }
          );
```

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "perf: add lookup cache to notification realtime callbacks

Cache campaign/brand/profile lookups in realtime handlers with 5-min
TTL. Eliminates 2+ follow-up queries per notification event when the
same campaign or brand triggers multiple events."
```

---

### Task 4: Lazy-Load Donny Chat

**Files:**
- Modify: `src/hooks/useDonny.ts:31-32,47,77,94`
- Modify: `src/contexts/DonnyProvider.tsx:96`

Add an `enabled` option to `useDonny` so its queries and realtime subscription only fire when the Donny panel is open. This avoids conditional hook calls (which break React's rules of hooks) and child-component state-lifting patterns (which cause infinite render loops since `useDonny` returns new object refs every render).

- [ ] **Step 1: Add `enabled` option to useDonny**

In `src/hooks/useDonny.ts`, update the options interface (line 31) and add an `isEnabled` guard:

```typescript
interface UseDonnyOptions {
  campaignContext?: { campaign_id: string; title: string; status: string } | null;
  enabled?: boolean;
}

export function useDonny(options?: UseDonnyOptions) {
  const isEnabled = options?.enabled !== false;
```

- [ ] **Step 2: Gate the conversation query on isEnabled**

In `src/hooks/useDonny.ts`, update the conversation query's `enabled` field (line 72):

```typescript
    enabled: !!user && isEnabled,
```

- [ ] **Step 3: Gate the messages query on isEnabled**

Update the messages query's `enabled` field (around line 91):

```typescript
    enabled: !!conversation && isEnabled,
```

- [ ] **Step 4: Gate the realtime subscription on isEnabled**

Update the realtime `useEffect` (around line 94) to check `isEnabled`:

```typescript
  useEffect(() => {
    if (!conversation || !isEnabled) return;
```

Add `isEnabled` to the dependency array of this effect.

- [ ] **Step 5: Pass enabled from DonnyProvider**

In `src/contexts/DonnyProvider.tsx`, update line 96:

```typescript
  // Lazy-load chat — queries and realtime only fire when panel is open
  const donny = useDonny({ campaignContext, enabled: stage !== 'closed' });
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 6: Manual test**

Run: `npm run dev`
Test in browser:
1. Navigate to dashboard — Donny panel should be closed, no Donny queries in Supabase logs
2. Open Donny panel — conversation should load, messages should appear
3. Send a message — should stream response normally
4. Close panel, reopen — conversation should persist

- [ ] **Step 7: Commit**

```bash
git add src/contexts/DonnyProvider.tsx
git commit -m "perf: lazy-load Donny chat — skip queries when panel is closed

Move useDonny hook into a conditionally-rendered child component so
the conversation query, message query, and realtime subscription only
initialize when the user opens the Donny panel. Saves 2 queries and
1 realtime channel on every page mount."
```

---

### Task 5: Dashboard Summary RPC Function

**Files:**
- Create: `supabase/migrations/20260509000000_dashboard_summary_rpc.sql`

Create a single RPC function that returns campaign count, collaboration count, application stats, and review averages in one round trip.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260509000000_dashboard_summary_rpc.sql`:

```sql
-- Dashboard summary RPC: replaces 8 sequential queries with 1 call
-- Uses SECURITY DEFINER to bypass RLS for cross-table aggregation,
-- but guards with auth.uid() check to prevent unauthorized access.

CREATE OR REPLACE FUNCTION get_dashboard_summary(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN (
    SELECT json_build_object(
      'campaign_count', (
        SELECT count(*) FROM campaigns WHERE user_id = p_user_id
      ),
      'active_campaigns', (
        SELECT count(*) FROM campaigns
        WHERE user_id = p_user_id AND status IN ('active', 'published')
      ),
      'active_collaborations', (
        SELECT count(*) FROM campaign_collaborations cc
        JOIN campaigns c ON cc.campaign_id = c.id
        WHERE c.user_id = p_user_id AND cc.status = 'active'
      ),
      'completed_collaborations', (
        SELECT count(*) FROM campaign_collaborations cc
        JOIN campaigns c ON cc.campaign_id = c.id
        WHERE c.user_id = p_user_id AND cc.status = 'completed'
      ),
      'pending_applications', (
        SELECT count(*) FROM campaign_applications ca
        JOIN campaigns c ON ca.campaign_id = c.id
        WHERE c.user_id = p_user_id AND ca.status = 'pending'
      ),
      'total_applications', (
        SELECT count(*) FROM campaign_applications ca
        JOIN campaigns c ON ca.campaign_id = c.id
        WHERE c.user_id = p_user_id
      ),
      'avg_review_score', (
        SELECT coalesce(avg(rating), 0) FROM project_reviews
        WHERE reviewee_id = p_user_id
      ),
      'total_spent', (
        SELECT coalesce(sum(coalesce(c.fixed_price, c.budget_min, 0)), 0)
        FROM campaigns c
        WHERE c.user_id = p_user_id AND c.status IN ('completed', 'published')
      ),
      'monthly_data', (
        SELECT coalesce(json_agg(month_row ORDER BY month_row.month), '[]'::json)
        FROM (
          SELECT
            date_trunc('month', cc.created_at) AS month,
            count(*) AS collaborations
          FROM campaign_collaborations cc
          JOIN campaigns c ON cc.campaign_id = c.id
          WHERE c.user_id = p_user_id
            AND cc.created_at > now() - interval '6 months'
          GROUP BY 1
        ) month_row
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

- [ ] **Step 2: Apply the migration**

Run via Supabase dashboard SQL editor or CLI:
`supabase db push` (if CLI is configured) or paste the SQL into the Supabase SQL Editor and execute.

- [ ] **Step 3: Verify the function works**

In Supabase SQL Editor, test with a known user ID:

```sql
SELECT get_dashboard_summary('YOUR_USER_UUID_HERE');
```

Expected: JSON object with campaign_count, active_campaigns, active_collaborations, etc.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260509000000_dashboard_summary_rpc.sql
git commit -m "feat: add get_dashboard_summary RPC function

Single Postgres function that returns campaign count, collaboration
stats, application counts, review averages, and 6-month revenue data
in one round trip. Replaces 8 sequential queries on dashboard mount.
Guarded with auth.uid() check despite SECURITY DEFINER."
```

---

### Task 6: Refactor Dashboard Hooks to Use RPC

**Files:**
- Modify: `src/hooks/useBrandDashboardStats.ts`
- Modify: `src/hooks/useROIDashboard.ts:57-137`

Wire `useBrandDashboardStats` to call the new RPC for its core metrics (keeping the sponsorship-specific stats as a second query since those come from brand profile context, not user_id). Wire `useROIDashboard`'s `fetchBusinessROI` to consume the same RPC data.

- [ ] **Step 1: Refactor useBrandDashboardStats to use RPC**

In `src/hooks/useBrandDashboardStats.ts`, the `Promise.all` block (lines 26-40) and sequential sponsorship query (lines 49-53) can be partially replaced. The RPC gives us campaign counts and collaboration data, but sponsorship stats still need the brand_id-based query. Refactor the queryFn:

```typescript
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Get dashboard summary in one call (replaces 4+ queries)
      const [summaryResult, profileResult] = await Promise.all([
        supabase.rpc('get_dashboard_summary', { p_user_id: user.id }),
        supabase
          .from('business_profiles')
          .select('id, sponsorship_budget')
          .eq('user_id', user.id)
          .eq('account_type', 'brand')
          .maybeSingle(),
      ]);

      if (summaryResult.error) throw summaryResult.error;
      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data) throw new Error('Brand profile not found');

      const summary = summaryResult.data as {
        campaign_count: number;
        active_campaigns: number;
        active_collaborations: number;
        completed_collaborations: number;
        pending_applications: number;
        total_applications: number;
        avg_review_score: number;
        total_spent: number;
        monthly_data: Array<{ month: string; collaborations: number }>;
      };

      const brandProfile = profileResult.data;

      // Sponsorship stats still need brand_id
      const { data: sponsorships, error: sponsorshipsError } = await supabase
        .from('campaign_sponsorships')
        .select('sponsorship_amount, status, payment_status')
        .eq('brand_id', brandProfile.id);

      if (sponsorshipsError) throw sponsorshipsError;

      const activeSponsorships = sponsorships?.filter(
        s => s.status === 'accepted' && s.payment_status === 'paid'
      ).length || 0;

      const activeCampaigns = summary.active_campaigns + activeSponsorships;

      const totalSpend = sponsorships?.filter(
        s => s.payment_status === 'paid'
      ).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;

      const allocatedBudget = sponsorships?.filter(
        s => s.status === 'accepted' || s.status === 'pending'
      ).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;

      const monthlyBudget = Number(brandProfile.sponsorship_budget) || 0;
      const availableBudget = monthlyBudget - allocatedBudget;
      const budgetPercentage = monthlyBudget > 0
        ? Math.round((allocatedBudget / monthlyBudget) * 100)
        : 0;

      // Use RPC conversations count via a lightweight query
      const { data: conversations } = await supabase
        .rpc('get_user_conversations', { user_uuid: user.id });

      const creatorsConnected = conversations?.filter(
        (c: { conversation_type: string }) => c.conversation_type === 'direct'
      ).length || 0;

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

      return stats;
    },
```

- [ ] **Step 2: Refactor useROIDashboard fetchBusinessROI to use RPC**

In `src/hooks/useROIDashboard.ts`, replace the `fetchBusinessROI` function (lines 57-137) to use the same RPC:

```typescript
async function fetchBusinessROI(userId: string): Promise<ROIMetrics> {
  const { data: summary, error } = await supabase
    .rpc('get_dashboard_summary', { p_user_id: userId });

  if (error) throw error;

  const s = summary as {
    campaign_count: number;
    active_campaigns: number;
    active_collaborations: number;
    completed_collaborations: number;
    pending_applications: number;
    total_applications: number;
    avg_review_score: number;
    total_spent: number;
    monthly_data: Array<{ month: string; collaborations: number }>;
  };

  const totalSpent = s.total_spent;
  const conversionRate = s.total_applications > 0
    ? Math.round((s.completed_collaborations / s.total_applications) * 100)
    : 0;

  const monthlyData: MonthlyDataPoint[] = s.monthly_data.map(m => ({
    month: getMonthLabel(new Date(m.month)),
    revenue: 0,
    projects: m.collaborations || 0,
  }));

  // Pad to 6 months if RPC returned fewer
  const buckets = buildMonthlyBuckets();
  for (const point of monthlyData) {
    buckets.set(point.month, point);
  }

  return {
    totalRevenue: totalSpent,
    activeProjects: s.active_collaborations,
    completedProjects: s.completed_collaborations,
    averageRating: Math.round(s.avg_review_score * 10) / 10,
    conversionRate,
    campaignsCreated: s.campaign_count,
    totalSpent,
    avgCostPerContent: s.completed_collaborations > 0 ? Math.round(totalSpent / s.completed_collaborations) : 0,
    contentDelivered: s.completed_collaborations,
    monthlyData: Array.from(buckets.values()),
  };
}
```

- [ ] **Step 3: Update staleTime on useROIDashboard**

The existing `staleTime: 60000` on line 303 can stay (1 minute is reasonable for ROI data since the RPC is now a single fast query).

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 5: Manual test**

Run: `npm run dev`
Test in browser:
1. Log in as a business user
2. Navigate to dashboard — stats should load correctly
3. Check browser DevTools network tab — should see 1 `rpc/get_dashboard_summary` call instead of 8 separate table queries
4. Navigate to ROI/analytics section — data should match previous behavior

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBrandDashboardStats.ts src/hooks/useROIDashboard.ts
git commit -m "perf: wire dashboard hooks to get_dashboard_summary RPC

Replace 8 sequential dashboard queries with 1 RPC call for
business_client role. useBrandDashboardStats and useROIDashboard
now share the same RPC response. Sponsorship-specific stats still
use a separate brand_id query."
```

---

### Task 7: Dashboard Load Time Monitoring

**Files:**
- Create: `src/hooks/useDashboardLoadTime.ts`

Fire a `dashboard_load_time` analytics event on dashboard mount to track whether the optimizations are working. Uses the existing `useAnalyticsBatch` hook pattern.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useDashboardLoadTime.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useDashboardLoadTime = (isDataReady: boolean) => {
  const { user } = useAuth();
  const mountTimeRef = useRef(performance.now());
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!isDataReady || reportedRef.current || !user) return;
    reportedRef.current = true;

    const loadTimeMs = Math.round(performance.now() - mountTimeRef.current);

    supabase.from('analytics_events').insert({
      event_type: 'dashboard_load_time',
      user_id: user.id,
      event_data: { load_time_ms: loadTimeMs },
      page_url: window.location.pathname,
    });
  }, [isDataReady, user]);
};
```

- [ ] **Step 2: Wire into BrandDashboard page**

In `src/pages/BrandDashboard.tsx`, import and call the hook after the stats query:

```typescript
import { useDashboardLoadTime } from '@/hooks/useDashboardLoadTime';

// Inside the component, after the stats query:
const { data: stats, isLoading } = useBrandDashboardStats();
useDashboardLoadTime(!isLoading && !!stats);
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDashboardLoadTime.ts
git commit -m "feat: add dashboard load time monitoring hook

Fires a dashboard_load_time analytics event with millisecond precision
when dashboard data finishes loading. Reports once per mount to the
existing analytics_events table."
```

---

## Deferred Spec Sections

**Section 5 (Supabase Compute Scaling Ladder)** — Configuration only, no code changes. Upgrade triggers and tier thresholds are documented in the spec for reference when Supabase dashboard metrics hit thresholds. No tasks needed.

**Section 6 (Monitoring — Supabase dashboard and React Query devtools)** — The Supabase dashboard monitoring is already available with no setup. React Query Devtools is a dev dependency toggle, not worth a task. Task 7 covers the one application-level monitoring addition (dashboard load time event).
