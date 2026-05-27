# Auto Cross-Scheduling Bugfixes: Date Collision, Confirm Flow, and Calendar Reschedule

**Date:** 2026-05-27
**Status:** Draft
**Author:** Dame Williams + Claude
**Parent spec:** `2026-05-26-auto-cross-scheduling-design.md`

## Context

The auto cross-scheduling feature (parent spec) was implemented end-to-end: edge functions, database migration, hooks, and UI components all exist. In production testing with the "Flavor Story: Behind the Gumbo" campaign, three bugs prevent the hassle-free UX the feature requires:

1. **Date collision**: All deliverables land on the same date instead of being spread across separate days. The `pickScheduledTime` function snaps each post independently to the nearest platform-optimal day, and multiple posts collide when no platform rule covers their initial day offsets.

2. **Confirm flow fails silently**: `confirm-posting-schedule` sends posts to the outstand-proxy without `social_account_ids` in the body. The proxy rejects these with `400 missing_social_account_ids`, so posts never actually reach Outstand even after the restaurant clicks "Confirm & Schedule All Posts."

3. **Calendar reschedule fails**: Dragging a post to a new day on the Outstand calendar produces a `403 forbidden_post` toast. The proxy's `fetchPostAccountIds` can't match the post's social accounts to the user's owned accounts due to response shape mismatches in the Outstand API.

## Goal

A restaurant user approves content, sees deliverables spread across separate days in the review screen, confirms with one tap, sees posts on the calendar, and can drag to adjust. No errors, no extra configuration.

## Fix 1: Date Collision in `content-posting-plan`

### Root cause

`pickScheduledTime` (line 115-149 of `content-posting-plan/index.ts`) computes each post's scheduled date in isolation. Given `instagram:photo` rules that only allow Monday and Wednesday, three posts starting Thursday/Friday/Saturday all snap to Monday — identical dates.

### Change

Replace the per-post `pickScheduledTime` call at line 487 with a two-pass approach: first compute collision-free times via `spreadScheduledTimes`, then reference them by index inside the existing `.map()` that builds the `PlannedPost[]` array.

**Algorithm:**

```
function spreadScheduledTimes(planSlots, baseDate, timezone):
  // Step 1: Compute initial candidate times per slot (same logic as pickScheduledTime)
  candidates = planSlots.map((slot, i) => ({
    index: i,
    time: pickScheduledTime(slot.platform, slot.content_type, slot.day_offset, baseDate, timezone)
  }))

  // Step 2: Sort by date and detect collisions
  candidates.sort_by(c => c.time)

  // Step 3: Walk sorted list, resolve collisions
  occupiedDays = Set()
  for each candidate in candidates:
    candidateDay = candidate.time.toDateString()
    if candidateDay in occupiedDays:
      // Advance to next platform-optimal day not already occupied
      candidate.time = findNextAvailableDay(planSlots[candidate.index], candidate.time, occupiedDays, timezone)
    occupiedDays.add(candidate.time.toDateString())

  // Step 4: Return times indexed by original slot position
  result = new Array(planSlots.length)
  for each candidate: result[candidate.index] = candidate.time
  return result
```

The existing `.map()` at line 474 continues to build `PlannedPost[]` with captions, hashtags, etc. — but instead of calling `pickScheduledTime` per slot, it reads from the pre-computed `spreadTimes[i]` array.

`findNextAvailableDay` walks forward from the colliding date, checking each subsequent day against the platform's time rules. If a day matches a rule and isn't in `occupiedDays`, it's selected. Falls back to the next unoccupied day with fallback times if no rule matches within 14 days.

The existing post-spread sort and `plan_order` reassignment (lines 496-497) remains necessary and must be preserved — it re-sequences posts by their final `scheduled_at` after collision resolution.

### Files changed

- `supabase/functions/content-posting-plan/index.ts`: Add `spreadScheduledTimes` and `findNextAvailableDay` functions. Pre-compute spread times before the `.map()` at line 474. Replace per-slot `pickScheduledTime` call with `spreadTimes[i]` lookup inside the map.

### Behavior

- 3 photo deliverables with `instagram:photo` rules (Mon/Wed) starting Thursday → posts on next Monday, next Wednesday, following Monday (spread, not collided)
- Single deliverable → unchanged behavior (no collision to resolve)
- `posting_preferences` with explicit `spread_strategy` (`even`, `front_loaded`, `custom`) still use `assignDatesFromPreferences` for date assignment — the collision resolver only kicks in for the `auto`/default path as a safety net

## Fix 2: `confirm-posting-schedule` Social Account IDs

### Root cause

`confirm-posting-schedule` (line 103-117) sends post data to `outstand-proxy/v1/posts` without `social_account_ids`. The proxy's `enforceScope` for `POST /posts` requires this field and returns `400 missing_social_account_ids`.

### Change

Before the scheduling loop, fetch the user's connected Outstand accounts and build a platform-to-account-ID map. Include the correct account ID in each post's request body.

**Steps:**

1. After user JWT validation, look up the `user_id` from the draft posts themselves (query one draft by `plan_group_id` to get `user_id`). Use this ID — not the JWT caller's ID — for the account lookup. This ensures correctness if an org admin or future role calls the confirm endpoint on behalf of the campaign owner.

2. Query `business_outstand_accounts` for the campaign owner's active accounts:
   ```sql
   SELECT outstand_social_account_id, platform
   FROM business_outstand_accounts
   WHERE user_id = $draftOwnerId AND status != 'revoked'
   ```

3. Build map: `{ instagram: "acc_123", tiktok: "acc_456" }`

4. For each draft post, include `social_account_ids: [platformAccountMap[post.platform]]` in the POST body. Note: `content_type` from `donny_scheduled_posts` uses DragonCandy vocabulary (`video_reel`, `photo`, `carousel`). The Outstand API accepts these as-is in the `content_type` field — no mapping required, since `content_type` is a DragonCandy metadata field, not an Outstand-native concept. The Outstand post payload only requires `caption`, `media_urls`, `scheduled_at`, and `social_account_ids`.

5. If no connected account exists for a post's platform, mark the post as `failed` with error `no_connected_account_for_platform` and continue to the next post. The response includes `failed_posts: [{ id, platform, reason }]` so the caller can surface failures.

6. On successful Outstand post creation, extract the Outstand post ID from the proxy's normalized response at `response.data?.post?.id` (the proxy wraps raw Outstand `{ success, post }` into `{ success, data: { post } }` at lines 595-609) and store it in `donny_scheduled_posts.metadata.outstand_post_id`. This links our internal record to the Outstand post for future reschedule/cancel operations.

### Files changed

- `supabase/functions/confirm-posting-schedule/index.ts`: Add account query (using draft owner's `user_id`), build platform map, include `social_account_ids` in POST body, extract and store `outstand_post_id` on success, return `failed_posts` in response.

### Behavior

- Confirm with Instagram connected → posts created in Outstand with correct account, appear on calendar
- Confirm with no TikTok account but a TikTok post in the plan → that post fails gracefully with clear reason, others succeed, campaign status shows `in_progress` (partial success)
- ScheduleReviewScreen already renders posts with `status: 'failed'` in the error state — failed posts from partial confirmation are visible to the user with a retry option

## Fix 3: Calendar Reschedule `forbidden_post`

### Root cause

The outstand-proxy's `fetchPostAccountIds` (line 149-169) fetches a post from the Outstand API and extracts `socialAccounts[].id`. Two failure modes:

1. **Response shape mismatch**: The raw Outstand API may return social account data under different field names (`social_accounts`, `accounts`, `connectedAccounts`) than what the function checks (`socialAccounts`).

2. **Empty social accounts**: Some Outstand post types may not include social account data in the GET response at all, returning an empty array regardless of parsing.

In both cases, `fetchPostAccountIds` returns `[]`, the ownership check `accountIds.some(id => ownedIds.has(id))` returns false, and the proxy returns `403 forbidden_post`.

### Change

Two layers of fix:

**Layer 1 — Expand response parsing in `fetchPostAccountIds`:**

Check all plausible field names for the social accounts array:
- `socialAccounts` (current)
- `social_accounts` (snake_case variant)
- `connectedAccounts` (used elsewhere in Outstand responses)
- `accounts` (shorthand)

Also check for a single-account shape: `social_account_id`, `socialAccountId`, `account_id` directly on the post object (partial handling exists, extend it).

Add `console.warn` logging when the function returns an empty array, including the response keys found — this helps diagnose future Outstand API changes without blocking the user.

**Also expand `filterListBody`'s `filterPost` function** (lines 301-313) with the same broadened parsing. `filterPost` uses the same narrow `socialAccounts` field name check when filtering GET /posts list responses. If Outstand returns account data under `social_accounts` or `accounts`, the filter would hide all posts from the user. Both functions must parse consistently.

**Layer 2 — Platform-based ownership fallback:**

If `fetchPostAccountIds` returns empty (Outstand genuinely doesn't include account data), fall back to a platform-ownership check: extract the post's platform from the response, then check if the user owns *any* account on that platform via `ownedIds`. A restaurant with a connected Instagram account should always be able to reschedule their Instagram posts.

**Security scope**: This fallback is strictly less restrictive than the per-account check. In the current deployment model, each DragonCandy business has its own Outstand social accounts — there is no shared Outstand org across businesses. The `business_outstand_accounts` table is keyed by `user_id`, so `ownedIds` only contains the requesting user's accounts. Cross-business access is still blocked: user A's `ownedIds` won't contain user B's accounts, so even the platform fallback only allows operations on platforms user A is connected to. If a multi-tenant Outstand org model is ever introduced, this fallback should be revisited with per-post `campaign_id` verification.

### Files changed

- `supabase/functions/outstand-proxy/index.ts`: Expand `fetchPostAccountIds` parsing, expand `filterPost` parsing in `filterListBody`, add platform extraction, add fallback logic in `enforceScope` for the `/posts/{id}` path.

### Behavior

- Drag post to new day → post moves, success toast, calendar updates
- If PATCH fails at Outstand level (not proxy), existing fallback (delete + recreate) kicks in
- Cross-tenant access still blocked (user without any Instagram account can't touch Instagram posts)
- GET /posts list correctly returns all user-owned posts regardless of Outstand response field naming

## End-to-End UX Flow (Post-Fix)

1. **Content approved, payment released** → `release-creator-payout` triggers `generateAutoSchedule`
2. **Donny generates spread schedule** → 3 deliverables land on 3 separate days (e.g., Wednesday, Friday, next Monday) based on platform rules, no collisions
3. **Restaurant sees ScheduleReviewScreen** → 3 PostCards with distinct dates, timeline visualization shows the spread
4. **Restaurant taps "Confirm & Schedule All Posts"** → `confirm-posting-schedule` sends each post to Outstand with the correct social account IDs, stores Outstand post IDs
5. **Posts appear on calendar** → each on its assigned day, with platform badges
6. **Restaurant drags a post to adjust** → proxy ownership check passes, post moves cleanly, success toast

No configuration, no error states, no extra steps.

## Testing

- **Date collision**: Unit test `spreadScheduledTimes` with 3 instagram:photo deliverables starting on a Thursday (no rule for Thu/Fri/Sat). Verify all 3 get unique dates.
- **Confirm flow**: Integration test `confirm-posting-schedule` with mock outstand-proxy. Verify `social_account_ids` present in POST body. Verify `outstand_post_id` stored in metadata on success.
- **Calendar reschedule**: Manual test on dragoncandy.io — drag a scheduled post to a new day, verify no error toast and post moves.
- **Edge cases**: Single deliverable (no collision possible), campaign with no connected accounts (graceful failure), post on platform with no time rules (fallback times used).

## Files Changed Summary

| File | Change |
|------|--------|
| `supabase/functions/content-posting-plan/index.ts` | Add `spreadScheduledTimes`, `findNextAvailableDay`; replace per-slot scheduling |
| `supabase/functions/confirm-posting-schedule/index.ts` | Add account query, platform map, `social_account_ids` in POST body, store `outstand_post_id` |
| `supabase/functions/outstand-proxy/index.ts` | Expand `fetchPostAccountIds` and `filterPost` parsing, add platform-based ownership fallback |
