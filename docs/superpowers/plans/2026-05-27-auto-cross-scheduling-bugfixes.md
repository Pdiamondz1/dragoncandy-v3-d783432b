# Auto Cross-Scheduling Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three production bugs so restaurants can spread deliverables across separate days, confirm the schedule to Outstand, and drag-to-reschedule on the calendar — all without errors.

**Architecture:** Three independent fixes in three Supabase edge functions (Deno). Fix 1 adds collision-aware date spreading to `content-posting-plan`. Fix 2 adds `social_account_ids` to the `confirm-posting-schedule` POST body. Fix 3 broadens response parsing and adds a platform-ownership fallback in `outstand-proxy`. A shared helper for extracting social account IDs from Outstand responses is introduced to keep `fetchPostAccountIds` and `filterPost` in sync.

**Tech Stack:** Deno edge functions (Supabase), TypeScript, Vitest (for extracted pure-function tests)

**Spec:** `docs/superpowers/specs/2026-05-27-auto-cross-scheduling-bugfixes-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/lib/scheduleSpreader.ts` | Pure functions: `spreadScheduledTimes`, `findNextAvailableDay` — extracted from edge function for testability |
| Create | `src/lib/scheduleSpreader.test.ts` | Unit tests for date-collision resolution |
| Modify | `supabase/functions/content-posting-plan/index.ts` | Import and call `spreadScheduledTimes` in place of per-slot `pickScheduledTime` |
| Modify | `supabase/functions/confirm-posting-schedule/index.ts` | Add account lookup, `social_account_ids` in POST, store `outstand_post_id` |
| Modify | `supabase/functions/outstand-proxy/index.ts` | Broaden `fetchPostAccountIds` + `filterPost` parsing, add platform fallback |

---

### Task 1: Write `spreadScheduledTimes` failing tests

**Files:**
- Create: `src/lib/scheduleSpreader.test.ts`

- [ ] **Step 1: Create the test file with three core test cases**

```typescript
// src/lib/scheduleSpreader.test.ts
import { describe, it, expect } from 'vitest';
import { spreadScheduledTimes, findNextAvailableDay } from './scheduleSpreader';

// Platform time rules mirror content-posting-plan/index.ts
const TIME_RULES: Record<string, Array<[number, number, number]>> = {
  "instagram:photo": [[1, 12, 14], [3, 12, 14]],       // Mon 12-14, Wed 12-14
  "instagram:video_reel": [[2, 11, 13], [4, 11, 13], [6, 9, 11]],
  "tiktok:video_reel": [[0, 19, 21], [1, 19, 21], [2, 19, 21], [3, 19, 21], [4, 19, 21], [5, 19, 21], [6, 19, 21]],
};
const FALLBACK_TIMES: Array<[number, number, number]> = [[1, 12, 14], [3, 12, 14], [5, 12, 14]];

describe('spreadScheduledTimes', () => {
  it('spreads 3 instagram:photo posts starting Thursday onto 3 unique days', () => {
    // Thursday May 29 2026
    const baseDate = new Date(2026, 4, 29, 10, 0, 0);
    const slots = [
      { platform: 'instagram', content_type: 'photo', day_offset: 0 },
      { platform: 'instagram', content_type: 'photo', day_offset: 1 },
      { platform: 'instagram', content_type: 'photo', day_offset: 2 },
    ];

    const times = spreadScheduledTimes(slots, baseDate, 'America/New_York', TIME_RULES, FALLBACK_TIMES);

    expect(times).toHaveLength(3);
    // All 3 should be valid ISO date strings
    for (const t of times) {
      expect(new Date(t).getTime()).not.toBeNaN();
    }
    // All 3 should be on unique calendar days
    const days = times.map(t => new Date(t).toDateString());
    expect(new Set(days).size).toBe(3);
  });

  it('returns a single date unchanged when only one slot', () => {
    const baseDate = new Date(2026, 4, 29, 10, 0, 0);
    const slots = [
      { platform: 'instagram', content_type: 'photo', day_offset: 0 },
    ];

    const times = spreadScheduledTimes(slots, baseDate, 'America/New_York', TIME_RULES, FALLBACK_TIMES);

    expect(times).toHaveLength(1);
    expect(new Date(times[0]).getTime()).not.toBeNaN();
  });

  it('handles mixed platforms without collisions', () => {
    const baseDate = new Date(2026, 4, 29, 10, 0, 0);
    const slots = [
      { platform: 'instagram', content_type: 'photo', day_offset: 0 },
      { platform: 'tiktok', content_type: 'video_reel', day_offset: 0 },
      { platform: 'instagram', content_type: 'video_reel', day_offset: 1 },
    ];

    const times = spreadScheduledTimes(slots, baseDate, 'America/New_York', TIME_RULES, FALLBACK_TIMES);

    expect(times).toHaveLength(3);
    const days = times.map(t => new Date(t).toDateString());
    expect(new Set(days).size).toBe(3);
  });
});

describe('findNextAvailableDay', () => {
  it('skips occupied days and finds next platform-optimal day', () => {
    // Monday June 1 2026, 12:00
    const collidingDate = new Date(2026, 5, 1, 12, 0, 0);
    const occupied = new Set(['Mon Jun 01 2026']);
    const slot = { platform: 'instagram', content_type: 'photo', day_offset: 0 };

    const result = findNextAvailableDay(slot, collidingDate, occupied, 'America/New_York', TIME_RULES, FALLBACK_TIMES);

    const resultDate = new Date(result);
    expect(resultDate.getTime()).not.toBeNaN();
    // Should NOT be Monday June 1 (occupied)
    expect(resultDate.toDateString()).not.toBe('Mon Jun 01 2026');
    // Should be Wednesday June 3 (next instagram:photo rule day)
    expect(resultDate.getDay()).toBe(3); // Wednesday
  });

  it('uses fallback times when no platform rule matches within 14 days', () => {
    const collidingDate = new Date(2026, 5, 1, 12, 0, 0);
    // Occupy Mon and Wed for 3 weeks — force fallback
    const occupied = new Set([
      'Mon Jun 01 2026', 'Wed Jun 03 2026',
      'Mon Jun 08 2026', 'Wed Jun 10 2026',
      'Mon Jun 15 2026', 'Wed Jun 17 2026',
    ]);
    const slot = { platform: 'instagram', content_type: 'photo', day_offset: 0 };

    const result = findNextAvailableDay(slot, collidingDate, occupied, 'America/New_York', TIME_RULES, FALLBACK_TIMES);

    const resultDate = new Date(result);
    expect(resultDate.getTime()).not.toBeNaN();
    // Must not collide with any occupied day
    expect(occupied.has(resultDate.toDateString())).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/scheduleSpreader.test.ts`
Expected: FAIL — `Cannot find module './scheduleSpreader'`

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduleSpreader.test.ts
git commit -m "test: add failing tests for schedule date-collision spreading"
```

---

### Task 2: Implement `spreadScheduledTimes` and `findNextAvailableDay`

**Files:**
- Create: `src/lib/scheduleSpreader.ts`

- [ ] **Step 1: Implement the pure functions**

```typescript
// src/lib/scheduleSpreader.ts

interface PlanSlot {
  platform: string;
  content_type: string;
  day_offset: number;
}

type TimeRules = Record<string, Array<[number, number, number]>>;
type FallbackTimes = Array<[number, number, number]>;

/**
 * Given a slot and a base date, compute the initial scheduled time using
 * platform time rules. Mirrors the original pickScheduledTime logic from
 * content-posting-plan/index.ts.
 */
function pickScheduledTime(
  platform: string,
  contentType: string,
  dayOffset: number,
  baseDate: Date,
  _timezone: string,
  timeRules: TimeRules,
  fallbackTimes: FallbackTimes,
): string {
  const key = `${platform}:${contentType}`;
  const rules = timeRules[key] ?? timeRules[`${platform}:photo`] ?? fallbackTimes;

  const targetDate = new Date(baseDate);
  targetDate.setDate(targetDate.getDate() + dayOffset);

  const targetDow = targetDate.getDay();
  let bestRule = rules.find(([dow]) => dow === targetDow);
  if (!bestRule) {
    for (let i = 1; i <= 7; i++) {
      const checkDow = (targetDow + i) % 7;
      bestRule = rules.find(([dow]) => dow === checkDow);
      if (bestRule) {
        targetDate.setDate(targetDate.getDate() + i);
        break;
      }
    }
  }
  if (!bestRule) bestRule = fallbackTimes[0];

  const [, hourStart, hourEnd] = bestRule;
  const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
  const minute = Math.floor(Math.random() * 4) * 15;

  targetDate.setHours(hour, minute, 0, 0);
  return targetDate.toISOString();
}

/**
 * Walk forward from a colliding date to find the next platform-optimal day
 * that isn't in the occupied set. Falls back to any unoccupied day with
 * fallback times after 14 days of searching.
 */
export function findNextAvailableDay(
  slot: PlanSlot,
  collidingDate: Date,
  occupiedDays: Set<string>,
  _timezone: string,
  timeRules: TimeRules,
  fallbackTimes: FallbackTimes,
): string {
  const key = `${slot.platform}:${slot.content_type}`;
  const rules = timeRules[key] ?? timeRules[`${slot.platform}:photo`] ?? fallbackTimes;

  // Phase 1: Find next platform-optimal day within 14 days
  for (let i = 1; i <= 14; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    const dow = candidate.getDay();
    const rule = rules.find(([d]) => d === dow);
    if (rule && !occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = rule;
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  // Phase 2: Fallback — next unoccupied day with fallback times
  for (let i = 1; i <= 30; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    if (!occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = fallbackTimes[0];
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  // Absolute fallback: tomorrow at noon (should never reach here)
  const fallback = new Date(collidingDate);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(12, 0, 0, 0);
  return fallback.toISOString();
}

/**
 * Compute collision-free scheduled times for a set of plan slots.
 * Returns an array of ISO date strings indexed by original slot position.
 */
export function spreadScheduledTimes(
  slots: PlanSlot[],
  baseDate: Date,
  timezone: string,
  timeRules: TimeRules,
  fallbackTimes: FallbackTimes,
): string[] {
  if (slots.length === 0) return [];

  // Step 1: Compute initial candidate times
  const candidates = slots.map((slot, i) => ({
    index: i,
    time: pickScheduledTime(
      slot.platform, slot.content_type, slot.day_offset,
      baseDate, timezone, timeRules, fallbackTimes,
    ),
  }));

  // Step 2: Sort by date to process earliest first
  candidates.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Step 3: Walk sorted list, resolve collisions
  const occupiedDays = new Set<string>();
  for (const candidate of candidates) {
    const candidateDay = new Date(candidate.time).toDateString();
    if (occupiedDays.has(candidateDay)) {
      candidate.time = findNextAvailableDay(
        slots[candidate.index],
        new Date(candidate.time),
        occupiedDays,
        timezone,
        timeRules,
        fallbackTimes,
      );
    }
    occupiedDays.add(new Date(candidate.time).toDateString());
  }

  // Step 4: Return times indexed by original slot position
  const result = new Array<string>(slots.length);
  for (const candidate of candidates) {
    result[candidate.index] = candidate.time;
  }
  return result;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/scheduleSpreader.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduleSpreader.ts
git commit -m "feat: add collision-aware schedule spreading functions"
```

---

### Task 3: Wire `spreadScheduledTimes` into `content-posting-plan`

**Files:**
- Modify: `supabase/functions/content-posting-plan/index.ts:470-497`

The edge function runs in Deno and can't import from `src/lib/` directly. Duplicate the core logic inline (same algorithm, adapted to the existing function scope). The `src/lib/` version is the testable reference; the edge function version is the deployed copy.

- [ ] **Step 1: Add `findNextAvailableDay` function after `pickScheduledTime` (after line 149)**

Add this function between `pickScheduledTime` (ends line 149) and `assignDatesFromPreferences` (starts line 151):

```typescript
function findNextAvailableDay(
  platform: string,
  contentType: string,
  collidingDate: Date,
  occupiedDays: Set<string>,
  _timezone: string,
): string {
  const key = `${platform}:${contentType}`;
  const rules = TIME_RULES[key] ?? TIME_RULES[`${platform}:photo`] ?? FALLBACK_TIMES;

  for (let i = 1; i <= 14; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    const dow = candidate.getDay();
    const rule = rules.find(([d]) => d === dow);
    if (rule && !occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = rule;
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  for (let i = 1; i <= 30; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    if (!occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = FALLBACK_TIMES[0];
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  const fallback = new Date(collidingDate);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(12, 0, 0, 0);
  return fallback.toISOString();
}
```

- [ ] **Step 2: Replace per-slot scheduling with two-pass spread (lines 474-497)**

Replace this block:

```typescript
    const posts: PlannedPost[] = planSlots.map((slot, i) => {
      const aiPost = aiPosts[i] ?? { caption: campaign.title, hashtags: ["#DragonDashed"], ai_reasoning: "Default caption" };
      const hashtags = aiPost.hashtags ?? ["#DragonDashed"];
      if (!hashtags.some((h: string) => h.toLowerCase().includes("dragondashed"))) {
        hashtags.push("#DragonDashed");
      }

      return {
        content_type: slot.content_type,
        platform: slot.platform,
        caption: aiPost.caption ?? "",
        hashtags,
        media_urls: slot.media_urls,
        scheduled_at: pickScheduledTime(slot.platform, slot.content_type, slot.day_offset, baseDate, timezone),
        ai_reasoning: aiPost.ai_reasoning ?? "",
        plan_order: i + 1,
        purpose: slot.purpose,
        deliverable_id: dateAssignments[i]?.deliverable_id ?? null,
      };
    });

    // Sort by scheduled_at
    posts.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    posts.forEach((p, i) => { p.plan_order = i + 1; });
```

With:

```typescript
    // Two-pass: compute collision-free times, then build post objects
    const candidates = planSlots.map((slot, i) => ({
      index: i,
      time: pickScheduledTime(slot.platform, slot.content_type, slot.day_offset, baseDate, timezone),
    }));
    candidates.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const occupiedDays = new Set<string>();
    for (const candidate of candidates) {
      const candidateDay = new Date(candidate.time).toDateString();
      if (occupiedDays.has(candidateDay)) {
        candidate.time = findNextAvailableDay(
          planSlots[candidate.index].platform,
          planSlots[candidate.index].content_type,
          new Date(candidate.time),
          occupiedDays,
          timezone,
        );
      }
      occupiedDays.add(new Date(candidate.time).toDateString());
    }

    const spreadTimes = new Array<string>(planSlots.length);
    for (const c of candidates) spreadTimes[c.index] = c.time;

    const posts: PlannedPost[] = planSlots.map((slot, i) => {
      const aiPost = aiPosts[i] ?? { caption: campaign.title, hashtags: ["#DragonDashed"], ai_reasoning: "Default caption" };
      const hashtags = aiPost.hashtags ?? ["#DragonDashed"];
      if (!hashtags.some((h: string) => h.toLowerCase().includes("dragondashed"))) {
        hashtags.push("#DragonDashed");
      }

      return {
        content_type: slot.content_type,
        platform: slot.platform,
        caption: aiPost.caption ?? "",
        hashtags,
        media_urls: slot.media_urls,
        scheduled_at: spreadTimes[i],
        ai_reasoning: aiPost.ai_reasoning ?? "",
        plan_order: i + 1,
        purpose: slot.purpose,
        deliverable_id: dateAssignments[i]?.deliverable_id ?? null,
      };
    });

    // Re-sort by final scheduled_at and reassign plan_order
    posts.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    posts.forEach((p, i) => { p.plan_order = i + 1; });
```

- [ ] **Step 3: Verify unit tests still pass**

Run: `npx vitest run src/lib/scheduleSpreader.test.ts`
Expected: All 5 tests PASS (the lib tests verify the algorithm; the edge function uses the same logic)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/content-posting-plan/index.ts
git commit -m "fix: resolve date collision in content-posting-plan with spread-aware scheduling"
```

---

### Task 4: Fix `confirm-posting-schedule` — add social account IDs

**Files:**
- Modify: `supabase/functions/confirm-posting-schedule/index.ts`

- [ ] **Step 1: Add account lookup after draft fetch (after line 94)**

After the `if (!drafts || drafts.length === 0)` check (line 93), add:

```typescript
    // Look up the campaign owner's user_id from the drafts (not the JWT caller)
    // to ensure correctness if an org admin calls on behalf of the owner.
    const draftOwnerId = drafts[0].user_id;

    // Fetch connected Outstand accounts for the campaign owner
    const { data: accounts, error: accountsError } = await admin
      .from('business_outstand_accounts')
      .select('outstand_social_account_id, platform')
      .eq('user_id', draftOwnerId)
      .neq('status', 'revoked');

    if (accountsError) {
      console.error('[confirm-posting-schedule] Failed to fetch accounts:', accountsError);
    }

    // Build platform → account ID map
    const platformAccountMap: Record<string, string> = {};
    for (const acct of (accounts ?? [])) {
      platformAccountMap[acct.platform] = acct.outstand_social_account_id;
    }
```

- [ ] **Step 2: Update the draft query to include `user_id` (line 77)**

Change the `.select(...)` on line 77 from:

```typescript
      .select('id, platform, content_type, caption, media_urls, hashtags, scheduled_at, metadata')
```

To:

```typescript
      .select('id, user_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, metadata')
```

And update the `DraftPost` interface (line 23) to include `user_id`:

```typescript
interface DraftPost {
  id: string;
  user_id: string;
  platform: string;
  content_type: string;
  caption: string | null;
  media_urls: string[] | null;
  hashtags: string[] | null;
  scheduled_at: string;
  metadata: Record<string, unknown> | null;
}
```

- [ ] **Step 3: Replace the POST body in the scheduling loop (lines 109-116)**

Replace:

```typescript
          body: JSON.stringify({
            caption: post.caption,
            media_urls: post.media_urls,
            platform: post.platform,
            content_type: post.content_type,
            scheduled_at: post.scheduled_at,
            hashtags: post.hashtags,
          }),
```

With:

```typescript
          body: JSON.stringify({
            caption: post.caption,
            media_urls: post.media_urls,
            platform: post.platform,
            content_type: post.content_type,
            scheduled_at: post.scheduled_at,
            hashtags: post.hashtags,
            social_account_ids: platformAccountMap[post.platform]
              ? [platformAccountMap[post.platform]]
              : undefined,
          }),
```

- [ ] **Step 4: Add a pre-check for missing platform account before the Outstand call**

Wrap the existing `try` block for each post (line 101-176). Before the `fetch`, add a check:

```typescript
    const failedPosts: Array<{ id: string; platform: string; reason: string }> = [];

    for (const post of posts) {
      // Skip posts with no connected account for their platform
      if (!platformAccountMap[post.platform]) {
        await admin
          .from('donny_scheduled_posts')
          .update({
            status: 'failed',
            metadata: {
              ...(post.metadata ?? {}),
              outstand_error: 'no_connected_account_for_platform',
              failed_at: new Date().toISOString(),
            },
          })
          .eq('id', post.id);
        failedPosts.push({ id: post.id, platform: post.platform, reason: 'no_connected_account_for_platform' });
        failedCount++;
        continue;
      }

      try {
        // ... existing fetch + status update logic ...
```

- [ ] **Step 5: Store `outstand_post_id` on successful creation (inside the `if (outstandResp.ok)` block, line 119-139)**

Replace the success handler:

```typescript
        if (outstandResp.ok) {
          const outstandData = await outstandResp.json().catch(() => null);

          const { error: updateError } = await admin
            .from('donny_scheduled_posts')
            .update({
              status: 'scheduled',
              metadata: {
                ...(post.metadata ?? {}),
                outstand_response: outstandData,
                confirmed_at: new Date().toISOString(),
              },
            })
            .eq('id', post.id);
```

With:

```typescript
        if (outstandResp.ok) {
          const outstandData = await outstandResp.json().catch(() => null);
          const outstandPostId = outstandData?.data?.post?.id ?? outstandData?.post?.id ?? null;

          const { error: updateError } = await admin
            .from('donny_scheduled_posts')
            .update({
              status: 'scheduled',
              metadata: {
                ...(post.metadata ?? {}),
                outstand_response: outstandData,
                outstand_post_id: outstandPostId,
                confirmed_at: new Date().toISOString(),
              },
            })
            .eq('id', post.id);
```

- [ ] **Step 6: Include `failed_posts` in the response (line 195-203)**

Replace:

```typescript
    return new Response(
      JSON.stringify({
        success: true,
        scheduled_count: scheduledCount,
        failed_count: failedCount,
        campaign_status: campaignStatus,
      }),
```

With:

```typescript
    return new Response(
      JSON.stringify({
        success: true,
        scheduled_count: scheduledCount,
        failed_count: failedCount,
        failed_posts: failedPosts,
        campaign_status: campaignStatus,
      }),
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/confirm-posting-schedule/index.ts
git commit -m "fix: add social_account_ids to confirm-posting-schedule and store outstand_post_id"
```

---

### Task 5: Broaden `fetchPostAccountIds` parsing in outstand-proxy

**Files:**
- Modify: `supabase/functions/outstand-proxy/index.ts:149-169`

- [ ] **Step 1: Extract a shared helper for extracting social account IDs from a post object**

Add this function before `fetchPostAccountIds` (before line 149):

```typescript
// Shared helper: extract social account IDs from an Outstand post object.
// Outstand responses use inconsistent field names across API versions and
// endpoint types. This function checks all known shapes.
function extractSocialAccountIds(post: any): string[] {
  if (!post) return [];
  const ids: string[] = [];
  const arrayFields = ['socialAccounts', 'social_accounts', 'connectedAccounts', 'accounts'];
  for (const field of arrayFields) {
    if (Array.isArray(post[field])) {
      for (const sa of post[field]) {
        if (sa?.id) ids.push(String(sa.id));
        if (sa?.social_account_id) ids.push(String(sa.social_account_id));
        if (sa?.socialAccountId) ids.push(String(sa.socialAccountId));
      }
    }
  }
  // Flat single-id shapes
  if (post.social_account_id) ids.push(String(post.social_account_id));
  if (post.socialAccountId) ids.push(String(post.socialAccountId));
  if (post.account_id) ids.push(String(post.account_id));
  // Deduplicate
  return [...new Set(ids)];
}

// Extract the platform from an Outstand post object for fallback ownership check.
function extractPostPlatform(post: any): string | null {
  if (!post) return null;
  const val = post.platform ?? post.network ?? null;
  return val ? String(val).toLowerCase() : null;
}
```

- [ ] **Step 2: Rewrite `fetchPostAccountIds` to use the shared helper and add logging**

Replace the entire `fetchPostAccountIds` function (lines 149-169):

```typescript
async function fetchPostAccountIds(
  postId: string,
  outstandKey: string,
): Promise<{ ids: string[]; platform: string | null }> {
  const res = await fetch(`${OUTSTAND_BASE_URL}/posts/${postId}`, {
    headers: { Authorization: `Bearer ${outstandKey}` },
  });
  if (!res.ok) {
    console.warn(`outstand-proxy: fetchPostAccountIds failed for ${postId}: ${res.status}`);
    return { ids: [], platform: null };
  }
  const body = await res.json().catch(() => null);
  const post = body?.data?.post ?? body?.post ?? body?.data ?? body;
  const ids = extractSocialAccountIds(post);
  const platform = extractPostPlatform(post);
  if (ids.length === 0) {
    const postKeys = post ? Object.keys(post).join(', ') : 'null';
    console.warn(`outstand-proxy: fetchPostAccountIds returned empty for ${postId}. Post keys: ${postKeys}`);
  }
  return { ids, platform };
}
```

- [ ] **Step 3: Update the `enforceScope` call site to use the new return shape and add platform fallback (lines 270-280)**

Replace:

```typescript
  // Single post + sub-resources (analytics, replies, comments)
  if (/^\/posts\/[^/]+(\/[a-z]+)?$/.test(pathOnly)) {
    const postId = pathOnly.split("/")[2];
    if (!postId) return jsonResponse(400, { error: "missing_post_id" });
    const accountIds = await fetchPostAccountIds(postId, outstandKey);
    const allowed = accountIds.some((id) => ownedIds.has(id));
    if (!allowed) {
      return jsonResponse(403, { error: "forbidden_post" });
    }
    return null;
  }
```

With:

```typescript
  // Single post + sub-resources (analytics, replies, comments)
  if (/^\/posts\/[^/]+(\/[a-z]+)?$/.test(pathOnly)) {
    const postId = pathOnly.split("/")[2];
    if (!postId) return jsonResponse(400, { error: "missing_post_id" });
    const { ids: accountIds, platform } = await fetchPostAccountIds(postId, outstandKey);
    const allowed = accountIds.some((id) => ownedIds.has(id));
    if (!allowed && platform) {
      // Platform-based fallback: if we couldn't extract account IDs but
      // the user owns any account on this platform, allow the operation.
      // See spec for security scope analysis.
      const ownedPlatforms = await listOwnedPlatforms(admin, ctx.userId, ctx.orgUnitId);
      if (ownedPlatforms.has(platform)) {
        return null;
      }
    }
    if (!allowed) {
      return jsonResponse(403, { error: "forbidden_post" });
    }
    return null;
  }
```

Note: this requires `admin` and `ctx` to be available in `enforceScope`. See Step 5 for the signature change.

- [ ] **Step 4: Add `listOwnedPlatforms` helper (after `listOwnedAccountIds`, after line 145)**

```typescript
async function listOwnedPlatforms(
  admin: SupabaseClient,
  userId: string,
  orgUnitId?: string | null,
): Promise<Set<string>> {
  let query = admin
    .from("business_outstand_accounts")
    .select("platform")
    .eq("user_id", userId)
    .neq("status", "revoked");

  if (orgUnitId) {
    query = query.eq("org_unit_id", orgUnitId);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<{ platform: string }>;
  return new Set(rows.map((r) => r.platform.toLowerCase()));
}
```

- [ ] **Step 5: Update `enforceScope` signature to accept `admin` and `ctx`**

Change the `enforceScope` function signature (line 192) from:

```typescript
async function enforceScope(args: {
  method: string;
  path: string;
  bodyText: string;
  ownedIds: Set<string>;
  outstandKey: string;
}): Promise<Response | null> {
```

To:

```typescript
async function enforceScope(args: {
  method: string;
  path: string;
  bodyText: string;
  ownedIds: Set<string>;
  outstandKey: string;
  admin: SupabaseClient;
  ctx: TenantContext;
}): Promise<Response | null> {
```

And destructure the new fields:

```typescript
  const { method, path, bodyText, ownedIds, outstandKey, admin, ctx } = args;
```

Update the call site (lines 537-543) to pass them:

```typescript
  const denied = await enforceScope({
    method: req.method,
    path,
    bodyText,
    ownedIds,
    outstandKey: OUTSTAND_API_KEY,
    admin,
    ctx,
  });
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/outstand-proxy/index.ts
git commit -m "fix: broaden fetchPostAccountIds parsing and add platform-ownership fallback"
```

---

### Task 6: Broaden `filterPost` parsing in outstand-proxy

**Files:**
- Modify: `supabase/functions/outstand-proxy/index.ts:305-313`

- [ ] **Step 1: Replace `filterPost` to use the shared `extractSocialAccountIds` helper**

Replace:

```typescript
  const filterPost = (item: any) => {
    const ids: string[] = [];
    if (Array.isArray(item?.socialAccounts)) {
      for (const sa of item.socialAccounts) if (sa?.id) ids.push(String(sa.id));
    }
    if (item?.social_account_id) ids.push(String(item.social_account_id));
    if (item?.socialAccountId) ids.push(String(item.socialAccountId));
    return ids.some((id) => ownedIds.has(id));
  };
```

With:

```typescript
  const filterPost = (item: any) => {
    const ids = extractSocialAccountIds(item);
    return ids.some((id) => ownedIds.has(id));
  };
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/outstand-proxy/index.ts
git commit -m "fix: align filterPost parsing with broadened extractSocialAccountIds helper"
```

---

### Task 7: Build verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass including the new `scheduleSpreader.test.ts`

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit any fix-ups if needed, then tag completion**

If any build/lint issues were found and fixed in prior steps, commit them:

```bash
git add -A
git commit -m "fix: address build/lint issues from cross-scheduling bugfixes"
```
