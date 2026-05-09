# Supabase Scaling & Query Optimization — Design Spec

**Date**: 2026-05-09
**Source**: Supabase dashboard audit (Micro compute, 41% RAM at ~30 DAU) + codebase query pattern analysis
**Scope**: React Query tuning, realtime channel consolidation, dashboard query reduction, Supabase compute scaling ladder

## Problem Statement

DragonCandy's Supabase instance runs on a Micro compute tier (t4g.micro, 1 GB RAM, 60 max connections) in us-east-2. With ~30 mostly-idle users, RAM sits at 41% and 18/60 connections are in use. The codebase generates 15-20+ database queries per dashboard page load, opens 6+ realtime channels per user, and uses aggressive refetch patterns (10-second stale times, `refetchOnWindowFocus: 'always'`) that compound at scale.

At the target of 250 daily active users (100 restaurants, 100 creators, 50 brands), the current configuration will exhaust RAM and connections well before reaching that number. Most of the load is self-inflicted — the realtime subscriptions already push updates, making the aggressive polling redundant.

## Goals

- Reduce per-user query volume by 40-60% through React Query tuning and realtime consolidation
- Cut dashboard page-load queries from ~15-20 to ~8-10
- Eliminate cascading queries inside realtime callbacks
- Extend Micro tier viability from ~30 DAU to ~100 DAU with code changes alone
- Define clear compute upgrade triggers and a scaling ladder through Year 2

## Non-Goals

- Migrating off Supabase (evaluated and rejected — not justified pre-revenue)
- Adding third-party caching layers (Redis, Upstash) — premature at this scale
- Rewriting the messaging or notification architecture — surgical fixes only
- Setting up external monitoring infrastructure (Supabase dashboard is sufficient through 500 DAU)

## Design

### 1. Realtime Channel Consolidation

**Current state**: Each user opens 6+ simultaneous realtime channels:

| Channel | Source Hook | Table |
|---------|-----------|-------|
| `messages-${id}` | `useMessageQueries` | `messages` |
| `user-presence-changes` | `useUserPresence` | `user_presence` |
| `application-updates` | `useNotifications` | `campaign_applications` |
| `sponsorship-updates` | `useNotifications` | `campaign_sponsorships` |
| `content-likes` | `useNotifications` | `analytics_events` |
| `invitation-updates` | `useNotifications` | `campaign_invitations` |
| `donny-messages-${id}` | `useDonny` | `donny_messages` |

The 4 notification channels are created in `useNotifications.ts`, each with its own `.channel()` call and `.subscribe()`.

**Change**: Merge the 4 notification channels into a single `notifications-${userId}` channel with chained `.on()` filters:

```typescript
supabase.channel(`notifications-${userId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaign_applications' }, handleApplicationUpdate)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_sponsorships' }, handleSponsorshipChange)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'analytics_events', filter: 'event_type=eq.dragon_feed_like' }, handleContentLike)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_invitations' }, handleInvitationInsert)
  .subscribe()
```

**Impact**: Per-user realtime channels drop from 6+ to 3 (messages, presence, consolidated notifications). At 50 concurrent users, this eliminates ~150 active channel subscriptions.

**Files affected**: `src/hooks/useNotifications.ts`

### 2. React Query Stale Time & Refetch Tuning

**Current state**: Several hooks use aggressive polling that duplicates work already handled by realtime subscriptions.

**Changes**:

| Hook | File | Current staleTime | New staleTime | Current refetchOnWindowFocus | New | Rationale |
|------|------|-------------------|---------------|------------------------------|-----|-----------|
| `useMessageQueries` | `src/hooks/useMessageQueries.ts` | 10s | 30s | `'always'` | `true` | Realtime INSERT/UPDATE subscription handles instant updates; 10s poll is redundant |
| `useConversations` | `src/hooks/useConversations.ts` | 30s | 120s | `'always'` | `true` | Conversation list changes infrequently; realtime invalidation covers new messages |
| `useUnreadMessageCounts` | `src/hooks/useUnreadCounts.ts` | 15s | 60s | `'always'` | `true` | Unread counts update via realtime message subscriptions |
| `useBrandDashboardStats` | `src/hooks/useBrandDashboardStats.ts` | 60s | 300s | default | default | Dashboard stats don't change second-to-second; 5-min cache is appropriate |
| `useCampaignApplications` | `src/hooks/useFetchApplications.ts` | default (5min) | 300s | `true` | `true` | Remove `refetchInterval: 120_000` — realtime subscription on applications handles updates |

**Why this is safe**: Every hook being tuned already has a companion realtime subscription that invalidates the React Query cache on INSERT/UPDATE events. The stale time only governs the fallback polling interval — raising it doesn't delay updates because realtime pushes trigger immediate cache invalidation. The `refetchOnWindowFocus: 'always'` override forces a refetch on every tab switch regardless of cache freshness, which is unnecessary when realtime keeps the cache warm.

**Impact**: ~60% reduction in background polling queries. At 50 concurrent users switching tabs throughout the day, this eliminates hundreds of unnecessary round trips per hour.

**Files affected**: `src/hooks/useMessageQueries.ts`, `src/hooks/useConversations.ts`, `src/hooks/useUnreadCounts.ts`, `src/hooks/useBrandDashboardStats.ts`, `src/hooks/useFetchApplications.ts`

### 3. Realtime Callback Optimization

**Current state**: In `useNotifications.ts`, realtime INSERT handlers fire follow-up database queries inside every callback:

```
Realtime INSERT on campaign_sponsorships →
  supabase.from('campaigns').select(...).eq('id', payload.campaign_id).single()  → query 1
  supabase.from('business_profiles').select(...).eq('id', payload.brand_id).single()  → query 2
  → show toast notification
```

Every sponsorship, application update, or invitation triggers 2+ cascading queries with no throttling. If 10 events arrive in quick succession (e.g., campaign launch), that's 20+ unthrottled queries.

**Change**:

1. **Debounce realtime callbacks** — collect events arriving within a 2-second window, then batch the follow-up queries using `.in()`:

```typescript
// Instead of: per-event fetch
const campaign = await supabase.from('campaigns').select(...).eq('id', id).single()

// Batch: collect IDs for 2 seconds, then fetch once
const campaigns = await supabase.from('campaigns').select(...).in('id', collectedIds)
```

2. **Cache lookup results** — campaign names and brand names change rarely. Cache the results of follow-up queries in a local Map with a 5-minute TTL. Subsequent notifications for the same campaign skip the database entirely.

**Impact**: Eliminates 2 queries per realtime event. During campaign launch bursts (10+ events), reduces cascading queries from 20+ to 2 (one batched campaign fetch, one batched brand fetch).

**Files affected**: `src/hooks/useNotifications.ts`

### 4. Dashboard Query Waterfall Reduction

**Current state**: A business dashboard mount triggers ~15-20 queries in a waterfall:

| Source | Queries | Pattern |
|--------|---------|---------|
| Auth context (`useAuth`) | 2-3 | profile + role-specific profile |
| `useBrandDashboardStats` | 4 | 3 parallel (Promise.all) + 1 sequential |
| `useROIDashboard` | 4 | sequential: campaigns → collaborations → application count → reviews |
| `useCampaignsList` | 1 | single fetch |
| `useNotifications` | 3+ | parallel fetches for campaigns, proposals, brands |
| `useDonny` | 2 | conversation lookup + message load |

**Changes**:

**4a. Create RPC function `get_dashboard_summary`**

A single Postgres function that returns campaign count, collaboration count, application stats, and review averages in one round trip. Replaces the 4 queries in `useBrandDashboardStats` and the 4 sequential queries in `useROIDashboard`.

```sql
CREATE OR REPLACE FUNCTION get_dashboard_summary(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  -- RLS guard: only allow users to query their own dashboard
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN (
    SELECT json_build_object(
      'campaign_count', (SELECT count(*) FROM campaigns WHERE user_id = p_user_id),
      'active_collaborations', (SELECT count(*) FROM campaign_collaborations cc
        JOIN campaigns c ON cc.campaign_id = c.id WHERE c.user_id = p_user_id AND cc.status = 'active'),
      'pending_applications', (SELECT count(*) FROM campaign_applications ca
        JOIN campaigns c ON ca.campaign_id = c.id WHERE c.user_id = p_user_id AND ca.status = 'pending'),
      'avg_review_score', (SELECT avg(rating) FROM project_reviews WHERE reviewee_id = p_user_id),
      'monthly_revenue', (SELECT json_agg(month_data) FROM (
        SELECT date_trunc('month', cc.created_at) AS month,
               count(*) AS collaborations,
               sum(cc.agreed_amount) AS revenue
        FROM campaign_collaborations cc
        JOIN campaigns c ON cc.campaign_id = c.id
        WHERE c.user_id = p_user_id AND cc.created_at > now() - interval '6 months'
        GROUP BY 1 ORDER BY 1
      ) month_data)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

The function uses `SECURITY DEFINER` to bypass RLS for the aggregation subqueries (which span multiple tables), but includes an explicit `auth.uid()` guard at the top to prevent any user from querying another user's data.

This replaces 8 queries (4 from dashboard stats + 4 from ROI) with 1 RPC call.

**4b. Lazy-load Donny**

The `useDonny` hook is called inside `DonnyProvider` (`src/contexts/DonnyProvider.tsx`), which wraps the entire app. This means every dashboard mount creates/fetches a Donny conversation and subscribes to a realtime channel even when the Donny panel is closed. Split `DonnyProvider` so the context shell (UI state, stage management) remains app-wide, but the chat and realtime portion (`useDonny` hook invocation) initializes lazily only when the user opens the Donny panel.

**Impact**: Dashboard load drops from ~15-20 queries to ~8-10. The RPC consolidation eliminates 7 round trips and removes the sequential query waterfall in `useROIDashboard`.

**Files affected**:
- New Supabase migration: `get_dashboard_summary` RPC function
- `src/hooks/useBrandDashboardStats.ts` — refactor to call RPC
- `src/hooks/useROIDashboard.ts` — refactor to call RPC (or remove if fully replaced)
- Donny panel component — move `useDonny` hook invocation here

### 5. Supabase Compute Scaling Ladder

All thresholds assume Sections 1-4 optimizations are in place. Without them, shift each DAU threshold down by ~40%.

**Upgrade triggers** — act when any metric sustains these levels for 1+ hour during peak:

| Metric | Current Value | Upgrade Trigger |
|--------|---------------|-----------------|
| RAM % | 41% | >70% sustained |
| CPU % | 3% | >60% sustained |
| Connections | 18/60 | >45/60 |
| API latency (p95) | unknown | >500ms |

**Scaling ladder**:

| Stage | DAU Range | Peak Concurrent | Compute Tier | RAM | Max Connections | Est. Monthly Cost | Trigger to Next |
|-------|-----------|-----------------|--------------|-----|-----------------|-------------------|-----------------|
| Launch | 0-100 | 10-25 | Micro (current) | 1 GB | 60 | ~$25 | RAM >70% or connections >45 |
| Traction | 100-250 | 25-60 | Small | 2 GB | 90 | ~$40 | RAM >70% or concurrent >60 |
| Growth | 250-500 | 60-120 | Medium | 4 GB | 120 | ~$85 | RAM >70% or latency >500ms |
| Scale | 500-1000 | 120-250 | Large + read replica | 8 GB | 200 | ~$220 | Year 2 growth |

**Connection pooling**: Enable Supavisor in transaction mode via the Supabase dashboard when connections consistently exceed 40/60. This is a configuration change — no code modifications required. Supavisor multiplexes many client requests through fewer Postgres connections, effectively raising the connection ceiling.

**Read replicas**: At the Growth stage (250+ DAU), add a read replica in the same region. Route read-heavy hooks (`useBrandDashboardStats`, `useROIDashboard`, `useFetchApplications`) to the replica. Supabase supports this via the `db.replica()` client option.

### 6. Application-Level Monitoring

**Supabase dashboard** (already available, no setup needed):
- RAM %, CPU %, disk I/O — visible on the project overview page
- Connection count — current vs. max
- API request logs — requests per second by endpoint, identifies chattiest hooks

**Application-level signal** (one addition):
- Fire a `dashboard_load_time` event to the existing `analytics_events` table on dashboard mount, recording the time from navigation start to data-ready state.
- Query this weekly: when median exceeds 2 seconds, investigate the slowest queries.

**Development tooling**:
- Enable React Query Devtools in development builds to visualize cache hit rates, stale query counts, and refetch patterns.
- No third-party monitoring tools needed through 500 DAU.

## Alternatives Considered

### Full migration off Supabase (Neon, PlanetScale, Firebase, AWS)
Rejected. Massive migration effort (42 edge functions, all RLS policies, auth flows, Lovable.dev integration). Supabase scales to millions of users on higher tiers. Not justified for a pre-revenue startup targeting 250 DAU.

### Supabase + supplementary services (Redis, dedicated realtime)
Deferred. Adding Upstash Redis or Ably for dedicated realtime is a valid optimization at 500+ DAU if specific bottlenecks emerge, but premature at launch. The code optimizations in this spec achieve similar gains without adding vendor complexity.

### Database-level query optimization (indexes, materialized views)
Out of scope for this spec but worth noting: if `get_dashboard_summary` RPC shows slow execution at 500+ DAU, add composite indexes on `(user_id, status)` for campaigns, collaborations, and applications tables. Materialized views for dashboard stats are a Growth-stage optimization.

## Risk & Rollback

**Risk**: Raising stale times could cause users to see briefly outdated data if a realtime subscription drops silently.

**Mitigation**: Supabase Realtime includes automatic reconnection. The stale times proposed (30s-120s) ensure that even in a subscription outage, data refreshes within 2 minutes via polling fallback. Current behavior (10-second polling) masks subscription failures but at unsustainable query volume.

**Rollback**: Every change is a constant adjustment in a hook file. Reverting a stale time or refetch config is a one-line change with no migration involved. The RPC function is additive (doesn't remove existing queries until the hooks are updated to use it).

## Implementation Order

1. React Query tuning (Section 2) — highest impact, lowest risk, no migrations
2. Realtime channel consolidation (Section 1) — medium effort, significant connection reduction
3. Realtime callback optimization (Section 3) — medium effort, prevents cascade storms
4. Dashboard RPC function (Section 4) — requires Supabase migration, highest effort
5. Monitoring additions (Section 6) — lightweight, do alongside any of the above
6. Compute scaling (Section 5) — ongoing, triggered by monitoring thresholds
