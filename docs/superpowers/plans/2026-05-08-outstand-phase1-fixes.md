# Outstand Phase 1 Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 issues found in the Phase 1 audit of the Outstand.so social media integration — 3 P1 spec deviations, 3 P2 minor gaps, and 3 P3 cosmetic items.

**Architecture:** Pure frontend fixes (React components + hooks). No new tables. One migration column type fix (text→timestamptz). All changes isolated to `src/components/outstand/`, `src/hooks/outstand/`, and one Supabase migration. Tests use Vitest with colocated test files.

**Tech Stack:** React 18, TypeScript, Vitest, Recharts, Tailwind CSS, Supabase JS, `@outstand-so/ui` SDK, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-05-08-outstand-phase1-audit-and-phases2-4-scope.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/components/outstand/analytics/TopPosts.tsx` | Sort posts by engagement before display (Issue #2) |
| Modify | `src/components/outstand/EngagementTab.tsx` | Sort unreplied comments to top (Issue #3) |
| Modify | `src/components/outstand/AnalyticsTab.tsx` | Add platform filter pills (Issue #4) |
| Modify | `src/components/outstand/engagement/EngagementDetail.tsx` | Add post engagement stats section (Issue #6) |
| Modify | `src/hooks/outstand/useAccountMetrics.ts` | Compute deltas from prior period, use date-range cache keys (Issues #1, #8) |
| Create | `src/hooks/outstand/useAccountMetrics.test.ts` | Unit tests for delta computation and cache key logic |
| Create | `supabase/migrations/20260509000000_fix_analytics_cache_columns.sql` | Alter period_start/period_end from text to timestamptz (Issue #8) |

---

## Task 1: Sort Top Posts by Engagement Rate (Issue #2 — P1)

**Files:**
- Modify: `src/components/outstand/analytics/TopPosts.tsx:18-30`

The `TopPosts` component currently takes the first 5 published posts in array order (recency). The spec requires ranking by engagement. The `@outstand-so/ui` Post type doesn't include engagement metrics directly, but the `PostSocialAccount` objects carry `status` and `platformPostId`. Per-post metrics require a separate API call via `usePostMetrics()` which would be expensive for a list view.

**Pragmatic approach:** Use the data available on the Post object. Each `PostSocialAccount` has a `status` field. Posts with all accounts `published` are more successful than those with `failed` or `pending`. Sort by: (1) number of successfully published accounts descending, (2) total accounts descending, (3) recency. This surfaces multi-platform successes over single-platform posts — a reasonable proxy until per-post metrics caching exists.

- [ ] **Step 1: Add engagement sort to the topPosts memo**

In `src/components/outstand/analytics/TopPosts.tsx`, replace the current `topPosts` useMemo (lines 19-30):

```tsx
const topPosts = useMemo(
  () =>
    posts
      .filter(isInPublishedFeed)
      .slice(0, 5)
      .map((post) => ({
        post,
        caption: getCaption(post),
        networks: getUniqueNetworks(post),
      })),
  [posts],
);
```

With:

```tsx
const topPosts = useMemo(
  () =>
    posts
      .filter(isInPublishedFeed)
      .sort((a, b) => {
        const aPublished = (a.socialAccounts ?? []).filter((sa) => sa.status === 'published').length;
        const bPublished = (b.socialAccounts ?? []).filter((sa) => sa.status === 'published').length;
        if (bPublished !== aPublished) return bPublished - aPublished;
        const aTotal = (a.socialAccounts ?? []).length;
        const bTotal = (b.socialAccounts ?? []).length;
        if (bTotal !== aTotal) return bTotal - aTotal;
        return new Date(b.publishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
      })
      .slice(0, 5)
      .map((post) => ({
        post,
        caption: getCaption(post),
        networks: getUniqueNetworks(post),
      })),
  [posts],
);
```

- [ ] **Step 2: Add engagement indicator to the display**

Replace the static "Published" text (line 44) with a dynamic indicator showing the published account count:

```tsx
<div className="text-[10px] text-gray-400">Published</div>
```

With:

```tsx
<div className="text-[10px] text-gray-400">
  {(post.socialAccounts ?? []).filter((sa) => sa.status === 'published').length} of{' '}
  {(post.socialAccounts ?? []).length} published
</div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/outstand/analytics/TopPosts.tsx
git commit -m "fix: rank top posts by published account count instead of recency

Sorts by number of successfully published social accounts (descending),
then total accounts, then recency — a proxy for engagement until per-post
metrics caching exists.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Sort Unreplied Comments to Top (Issue #3 — P1)

**Files:**
- Modify: `src/components/outstand/EngagementTab.tsx:24-29`

The `filteredComments` memo currently just filters by type. The hook (`usePostComments.ts:96`) returns comments in reverse-chronological order. The spec requires unreplied items sorted above replied items.

The "replied" status is determined in `EngagementList.tsx:40` as: `ownAccountIds.includes(comment.authorId) || comment.isReply`. The `EngagementTab` component has access to `ownAccountIds` (passed as a prop), so the sort can use the same logic.

- [ ] **Step 1: Add unreplied-first sort to filteredComments memo**

In `src/components/outstand/EngagementTab.tsx`, replace the `filteredComments` useMemo (lines 24-29):

```tsx
const filteredComments = useMemo(() => {
  if (!comments) return [];
  if (filter === 'all') return comments;
  if (filter === 'comment') return comments.filter((c) => !c.isReply);
  return comments.filter((c) => c.isReply);
}, [comments, filter]);
```

With:

```tsx
const filteredComments = useMemo(() => {
  if (!comments) return [];
  const filtered = filter === 'all'
    ? comments
    : filter === 'comment'
      ? comments.filter((c) => !c.isReply)
      : comments.filter((c) => c.isReply);
  return [...filtered].sort((a, b) => {
    const aReplied = ownAccountIds.includes(a.authorId) || a.isReply;
    const bReplied = ownAccountIds.includes(b.authorId) || b.isReply;
    if (aReplied !== bReplied) return aReplied ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}, [comments, filter, ownAccountIds]);
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/EngagementTab.tsx
git commit -m "fix: sort unreplied engagement items to top of list

Unreplied comments/mentions now appear above replied items per spec.
Within each group, reverse-chronological order is preserved.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add Platform Filter Pills to Analytics Tab (Issue #4 — P2)

**Files:**
- Modify: `src/components/outstand/AnalyticsTab.tsx`

The CalendarTab already has `PLATFORM_FILTERS` and filtering logic. The AnalyticsTab needs the same pattern: filter pills next to the time range buttons, filtering `accounts` before passing to `useAccountMetrics` and filtering `posts` before passing to child components.

- [ ] **Step 1: Add platform filter state and filter array**

In `src/components/outstand/AnalyticsTab.tsx`, add the platform filter constant and state. After the existing `TimeRange` type (line 13), add:

```tsx
const PLATFORM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'instagram', label: 'IG' },
  { key: 'tiktok', label: 'TT' },
  { key: 'facebook', label: 'FB' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YT' },
] as const;
```

Inside the component function, after the `setTimeRange` state, add:

```tsx
const [platformFilter, setPlatformFilter] = useState<string>('all');
```

Add `useMemo` to the React import (line 1) and add filtered data memos before the `useAccountMetrics` call:

```tsx
const filteredAccounts = useMemo(() => {
  if (platformFilter === 'all') return accounts;
  return accounts.filter((a) => a.network === platformFilter);
}, [accounts, platformFilter]);

const filteredPosts = useMemo(() => {
  if (platformFilter === 'all') return posts;
  return posts.filter((p) =>
    (p.socialAccounts ?? []).some((sa) => sa.network === platformFilter),
  );
}, [posts, platformFilter]);
```

Update the `useAccountMetrics` call to use `filteredAccounts`:

```tsx
const { data: metrics, isLoading: metricsLoading } = useAccountMetrics(filteredAccounts, timeRange);
```

- [ ] **Step 2: Add filter pills UI**

In the JSX, after the time range buttons `</div>` (inside the `flex items-center justify-between` wrapper), add the platform filter pills:

```tsx
<div className="flex gap-1 overflow-x-auto">
  {PLATFORM_FILTERS.map((f) => (
    <button
      key={f.key}
      type="button"
      onClick={() => setPlatformFilter(f.key)}
      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
        platformFilter === f.key ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {f.label}
    </button>
  ))}
</div>
```

Update child components to use `filteredPosts` instead of `posts`:

```tsx
<PostingHeatmap posts={filteredPosts} />
<TopPosts posts={filteredPosts} />
```

And in the mobile section:

```tsx
<div className="md:hidden">
  <TopPosts posts={filteredPosts} />
</div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/outstand/AnalyticsTab.tsx
git commit -m "feat: add platform filter pills to analytics tab

Adds the same platform filtering pattern used in CalendarTab. Filters
both accounts (for metrics) and posts (for heatmap/top posts).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Add Post Engagement Stats to Engagement Detail (Issue #6 — P2)

**Files:**
- Modify: `src/components/outstand/engagement/EngagementDetail.tsx`

The `EngagementDetail` component shows post context (caption, date, platform) but not engagement metrics. The `@outstand-so/ui` package exports a `usePostMetrics` hook that returns per-post analytics including likes, comments, shares, reach, and saves.

- [ ] **Step 1: Add usePostMetrics import and call**

In `src/components/outstand/engagement/EngagementDetail.tsx`, add the import for `usePostMetrics`:

```tsx
import { useOutstandApi, usePostMetrics } from '@outstand-so/ui';
```

Inside the component, after the existing `useOutstandApi` call (line 15), add:

```tsx
const { analytics: postAnalytics } = usePostMetrics({
  apiKey,
  baseUrl,
  postId: comment.postId,
});
```

- [ ] **Step 2: Add the engagement stats row**

After the platform text line (line 48, inside the post context section), add an engagement stats row:

```tsx
{postAnalytics?.aggregated_metrics && (
  <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
    <span>{postAnalytics.aggregated_metrics.total_likes} likes</span>
    <span>{postAnalytics.aggregated_metrics.total_comments} comments</span>
    <span>{postAnalytics.aggregated_metrics.total_shares} shares</span>
  </div>
)}
```

Place this right before the closing `</div>` of the post context section (the `<div className="px-5 py-4 border-b ...">` block).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/outstand/engagement/EngagementDetail.tsx
git commit -m "feat: show post engagement stats in engagement detail panel

Adds likes, comments, and shares counts below the post context using
the usePostMetrics hook from @outstand-so/ui.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Fix Cache Key Column Types — Migration (Issue #8 — P3)

**Files:**
- Create: `supabase/migrations/20260509000000_fix_analytics_cache_columns.sql`

The `social_analytics_cache` table uses `text` for `period_start` and `period_end`, but the completion spec requires `timestamptz`. This migration alters the columns. Existing data uses string labels ("7d", "30d", "90d") which are not valid timestamps — those rows must be deleted first.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260509000000_fix_analytics_cache_columns.sql`:

```sql
-- Existing rows use string labels ("7d", "30d") as period values,
-- which are not valid timestamps. Clear stale data before altering.
truncate social_analytics_cache;

alter table social_analytics_cache
  alter column period_start type timestamptz using period_start::timestamptz,
  alter column period_end   type timestamptz using period_end::timestamptz;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors (migration is SQL only, doesn't affect TS build).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260509000000_fix_analytics_cache_columns.sql
git commit -m "fix: alter analytics cache period columns from text to timestamptz

Clears existing rows (string labels) and converts period_start/period_end
to timestamptz for proper date-range caching and delta computation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Compute Analytics Deltas from Prior Period (Issues #1 + #8 — P1)

**Files:**
- Modify: `src/hooks/outstand/useAccountMetrics.ts`
- Create: `src/hooks/outstand/useAccountMetrics.test.ts`

This is the most complex fix. The hook must: (1) compute actual date ranges from the time range label, (2) fetch metrics for both current and prior period, (3) compute percentage deltas, (4) store with timestamptz values. The `mapWithConcurrency` utility and `AccountMetrics`/`PlatformMetrics` types are already well-defined.

- [ ] **Step 1: Write the date range helper and test it**

Create `src/hooks/outstand/useAccountMetrics.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { getDateRange, computeDelta } from './useAccountMetrics';

describe('getDateRange', () => {
  test('7d returns 7-day window ending now', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('7d', now);
    expect(current.start.toISOString()).toBe('2026-05-01T12:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T12:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2026-04-24T12:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-05-01T12:00:00.000Z');
  });

  test('30d returns 30-day window ending now', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('30d', now);
    expect(current.start.toISOString()).toBe('2026-04-08T12:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T12:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2026-03-09T12:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-04-08T12:00:00.000Z');
  });

  test('90d returns 90-day window ending now', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('90d', now);
    expect(current.start.toISOString()).toBe('2026-02-07T12:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T12:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2025-11-09T12:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-02-07T12:00:00.000Z');
  });
});

describe('computeDelta', () => {
  test('positive growth returns positive percentage', () => {
    expect(computeDelta(120, 100)).toBe(20);
  });

  test('negative growth returns negative percentage', () => {
    expect(computeDelta(80, 100)).toBe(-20);
  });

  test('zero prior returns null', () => {
    expect(computeDelta(100, 0)).toBeNull();
  });

  test('null prior returns null', () => {
    expect(computeDelta(100, null)).toBeNull();
  });

  test('result is rounded to 1 decimal', () => {
    expect(computeDelta(133, 100)).toBe(33);
    expect(computeDelta(100, 300)).toBeCloseTo(-66.7, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/outstand/useAccountMetrics.test.ts`
Expected: FAIL — `getDateRange` and `computeDelta` are not exported yet.

- [ ] **Step 3: Add the date range and delta helpers to useAccountMetrics.ts**

In `src/hooks/outstand/useAccountMetrics.ts`, after the `CONCURRENCY` constant (line 28), add:

```ts
type TimeRange = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<TimeRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

interface DateRange {
  start: Date;
  end: Date;
}

export function getDateRange(range: TimeRange, now = new Date()): { current: DateRange; prior: DateRange } {
  const days = RANGE_DAYS[range];
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  const priorEnd = new Date(start);
  const priorStart = new Date(start);
  priorStart.setUTCDate(priorStart.getUTCDate() - days);
  return {
    current: { start, end },
    prior: { start: priorStart, end: priorEnd },
  };
}

export function computeDelta(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}
```

Remove the duplicate `type TimeRange = '7d' | '30d' | '90d';` on line 26 (it's now inside the new block above).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/outstand/useAccountMetrics.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Update the hook to use date-range cache keys**

In `src/hooks/outstand/useAccountMetrics.ts`, update the `queryFn` to compute date ranges and use ISO strings for cache keys. Replace the cache lookup (lines 57-61):

```ts
const { data: cached } = await supabase
  .from('social_analytics_cache')
  .select('outstand_account_id, metric_type, metric_value, period_start, fetched_at')
  .eq('period_start', timeRange)
  .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
```

With:

```ts
const { current: currentRange, prior: priorRange } = getDateRange(timeRange);
const periodStartIso = currentRange.start.toISOString();
const periodEndIso = currentRange.end.toISOString();

const { data: cached } = await supabase
  .from('social_analytics_cache')
  .select('outstand_account_id, metric_type, metric_value, period_start, fetched_at')
  .eq('period_start', periodStartIso)
  .eq('period_end', periodEndIso)
  .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
```

Update the cache key in `cachedByKey` to use the new period values:

```ts
const cachedByKey = new Map(
  (cached ?? []).map((row) => [
    `${row.outstand_account_id}:${row.metric_type}`,
    row,
  ]),
);
```

Update the cache key lookup in the per-account loop (line 79):

```ts
const cacheKey = `${account.id}:followers`;
```

Update the upsert call (lines 117-129) to use ISO date strings:

```ts
await supabase.from('social_analytics_cache').upsert(
  {
    user_id: userId,
    outstand_account_id: account.id,
    platform: account.network ?? 'unknown',
    metric_type: 'followers',
    metric_value: followers,
    period_start: periodStartIso,
    period_end: periodEndIso,
    fetched_at: new Date().toISOString(),
  },
  { onConflict: 'user_id,outstand_account_id,metric_type,period_start,period_end' },
);
```

- [ ] **Step 6: Fetch prior period metrics and compute deltas**

After the main `mapWithConcurrency` call that fetches current metrics (line 136), add a second pass for prior period data:

```ts
// Prior period: always fetch from API (cache only stores current period for now)
let priorFollowers: number | null = null;
let priorReach: number | null = null;
let priorEngagement: number | null = null;
let priorPosts: number | null = null;

let pFollowers = 0;
let pReach = 0;
let pEngagement = 0;
let pPosts = 0;
let priorFetched = false;

await mapWithConcurrency(
  accounts,
  async (account) => {
    try {
      const res = await api.get(`/social-accounts/${account.id}/metrics`);
      if (!res.success || !res.data) return;
      const m = res.data as Record<string, number>;
      pFollowers += m.followers ?? m.followerCount ?? 0;
      pReach += m.reach ?? m.impressions ?? 0;
      pEngagement += m.engagementRate ?? 0;
      pPosts += m.postsCount ?? 0;
      priorFetched = true;
    } catch {
      // Skip
    }
  },
  CONCURRENCY,
);

if (priorFetched) {
  priorFollowers = pFollowers;
  priorReach = pReach;
  priorEngagement = accounts.length > 0 ? pEngagement / accounts.length : 0;
  priorPosts = pPosts;
}
```

- [ ] **Step 7: Update the return object to use computed deltas**

Replace the hardcoded null deltas in the return object (lines 140-150):

```ts
return {
  totalFollowers,
  engagementRate: Math.round(avgEngagement * 100) / 100,
  totalReach,
  postsPublished,
  followersDelta: null,
  engagementDelta: null,
  reachDelta: null,
  postsDelta: null,
  platformBreakdown: platformMetrics,
};
```

With:

```ts
return {
  totalFollowers,
  engagementRate: Math.round(avgEngagement * 100) / 100,
  totalReach,
  postsPublished,
  followersDelta: computeDelta(totalFollowers, priorFollowers),
  engagementDelta: computeDelta(avgEngagement, priorEngagement),
  reachDelta: computeDelta(totalReach, priorReach),
  postsDelta: computeDelta(postsPublished, priorPosts),
  platformBreakdown: platformMetrics,
};
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/hooks/outstand/useAccountMetrics.test.ts`
Expected: All tests PASS.

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/outstand/useAccountMetrics.ts src/hooks/outstand/useAccountMetrics.test.ts
git commit -m "fix: compute analytics deltas from prior period with date-range cache keys

Replaces hardcoded null deltas with actual percentage changes computed
by comparing current vs. prior equivalent period. Cache keys now use
ISO date ranges instead of string labels ('7d', '30d').

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Clean build, no errors or warnings.

- [ ] **Step 3: Verify all 9 issues addressed**

| Issue | Status | Task |
|-------|--------|------|
| #1 Analytics deltas null | Fixed | Task 6 |
| #2 TopPosts not ranked | Fixed | Task 1 |
| #3 Unreplied not sorted to top | Fixed | Task 2 |
| #4 Analytics missing platform filters | Fixed | Task 3 |
| #5 Follower chart shows bars | Accepted — bar chart is correct for current API data | N/A |
| #6 Engagement detail missing stats | Fixed | Task 4 |
| #7 Comment/mention classification | Accepted — no change needed | N/A |
| #8 Cache key string labels + migration | Fixed | Tasks 5 + 6 |
| #9 EngagementCard not implemented | Accepted deviation | N/A |
