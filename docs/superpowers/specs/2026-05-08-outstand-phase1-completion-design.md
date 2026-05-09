# Outstand.so Phase 1 Completion — Design Spec

**Date:** May 8, 2026
**Status:** Approved Design — Ready for Implementation Planning
**Scope:** Complete the remaining Phase 1 (Restaurant Social Media) features
**Parent Spec:** [Outstand Social Media Integration Strategy](2026-05-03-outstand-social-media-integration-design.md)
**Cost Governance:** Inherits from [Donny AI Cost Architecture](2026-05-03-donny-ai-cost-architecture-design.md)

---

## Executive Summary

Phase 1 of the Outstand.so integration is roughly 55% complete. The foundation — OAuth account connections, post composer, scheduling, multi-platform publishing, per-post analytics, and the secure Edge Function proxy — all work on both mobile and desktop. Four features remain to reach the Phase 1 restaurant MVP defined in the parent spec:

1. **Content Calendar** — visual weekly/monthly grid with drag-and-drop rescheduling
2. **Engagement Hub** — unified inbox for comments and mentions across platforms
3. **Analytics Dashboard** — account-level metrics: followers, engagement, reach, best times
4. **Settings Integration** — replace manual URL fields with connected accounts display

Additionally, the OutstandManager tab bar expands from 4 tabs to 6 to match the parent spec's frontend architecture diagram.

### What's NOT in scope

- Google Business Profile support (parked — requires confirming Outstand API availability)
- Donny AI integration (MCP wiring, caption generation, auto-scheduling — Phase 2+ dependency)
- Creator cross-posting, brand amplification, campaign social hooks (Phases 2-4)
- Realtime websocket for engagement (Phase 1 uses 60s polling)

---

## 1. Tab Bar Restructure

### Current State

4 tabs: Compose | Scheduled | Published | Accounts

### Target State

6 tabs: **Compose | Calendar | Published | Engagement | Analytics | Accounts**

The Scheduled tab is removed — its functionality is absorbed by the Content Calendar, which shows all scheduled posts in a grid view with the same data source (`usePosts()` hook).

### Label Strategy

| Tab | Desktop Label | Mobile Label | Icon |
|-----|--------------|-------------|------|
| Compose | Compose | New | Send |
| Calendar | Calendar | Calendar | CalendarDays |
| Published | Published | Posts | BarChart3 |
| Engagement | Engagement | Engage | MessageCircle |
| Analytics | Analytics | Stats | TrendingUp |
| Accounts | Accounts | Accounts | Link |

Mobile uses shorter labels via the existing `hidden sm:inline` / `sm:hidden` pattern already in OutstandManager. The 6-tab grid fits at 375px with icon + short label at 10px font.

### Tab URL Params

Extends the existing `?tab=` query param pattern: `compose`, `calendar`, `published`, `engagement`, `analytics`, `accounts`. Default tab remains `compose`.

---

## 2. Content Calendar Tab

### Purpose

Visual weekly/monthly view of all scheduled and published posts. Replaces the old Scheduled tab list with a grid that gives restaurant owners a glanceable content plan.

### Desktop Layout (768px+)

Seven-column weekly grid. Each column is a day (Mon–Sun) with:
- Day name header (abbreviated)
- Date number (today highlighted in teal)
- Stacked post cards sorted by scheduled time

Each **post card** shows:
- Scheduled time (e.g., "9:00 AM")
- Caption preview (truncated to ~30 chars)
- Platform badges (IG, TT, FB, X, YT) using brand colors
- Left border color: teal = scheduled, amber = published, red = failed
- `cursor: grab` on scheduled posts (drag-and-drop enabled)

**Header bar** contains:
- Left/right arrows to navigate weeks/months
- Week / Month / Today toggle buttons
- Active view highlighted in teal

**Platform filter pills** below header: All (default) | Instagram | TikTok | Facebook | X | YouTube. Filters posts to show only those targeting the selected platform.

**Legend** at bottom: Scheduled (teal), Published (amber), Failed (red), drag indicator.

**Month view**: 5-row × 7-column mini-grid. Each cell shows the date number and colored dots indicating posts (no card detail). Click a day to drill into that day's posts in a side panel or switch to week view centered on that day.

### Mobile Layout (<768px)

Horizontal scrolling **day strip** at top showing Mon–Sun with date numbers. Colored dots below each date indicate posts on that day. Selected day highlighted with teal underline.

Below the strip: **stacked post cards** for the selected day. Each card shows time, caption, platform badges, and status. Tap a card to open a detail sheet with edit/cancel/reschedule options.

No drag-and-drop on mobile. Instead, tap a post card → datetime picker bottom sheet to reschedule. This calls the same Outstand API update as the desktop drag handler.

"+ Schedule a Post" CTA button shown when a day has no posts. Links to the Compose tab with the selected date pre-filled.

### Drag-and-Drop (Desktop Only)

Uses HTML5 Drag API (no library dependency):
- `draggable` attribute on scheduled post cards
- Drop targets are day columns (week view) or day cells (month view)
- On drop: reschedule the post to the new date, preserving the original time
- Optimistic UI update with rollback on API failure
- Only scheduled posts are draggable (published/failed are static)

**Reschedule API strategy**: The parent spec's Outstand API reference lists `POST`, `GET`, `GET/{id}`, and `DELETE` for posts but does not document a `PATCH /v1/posts/{id}` endpoint. Implementation must first verify whether Outstand supports `PATCH` with a `scheduledAt` field update. If not, use a **delete-and-recreate** fallback: delete the existing post, then create a new post with the same content/media/platforms but the updated `scheduledAt`. This approach preserves the user experience regardless of API support. The Edge Function proxy already allows both `DELETE` and `POST` on post endpoints.

### Data Source

Same `usePosts()` hook from `@outstand-so/ui` already used by the current Scheduled and Published tabs. The calendar filters posts by `scheduledAt` date range for the visible week/month. No new API endpoints needed.

The `isScheduled()` and `isInPublishedFeed()` helper functions in OutstandManager.tsx are reused for status classification.

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `CalendarTab` | `src/components/outstand/CalendarTab.tsx` | Tab container, view toggle, date navigation state |
| `WeekGrid` | `src/components/outstand/calendar/WeekGrid.tsx` | 7-column desktop grid with drag-and-drop |
| `MonthGrid` | `src/components/outstand/calendar/MonthGrid.tsx` | 5×7 mini-grid with dot indicators |
| `DayStrip` | `src/components/outstand/calendar/DayStrip.tsx` | Mobile horizontal day selector |
| `CalendarPostCard` | `src/components/outstand/calendar/CalendarPostCard.tsx` | Compact post card for calendar cells |

---

## 3. Engagement Hub Tab

### Purpose

Unified inbox for comments and mentions across all connected social platforms. Restaurant staff can read and reply to social interactions without leaving DragonCandy. Phase 1 is manual replies only — Donny-suggested replies are a Phase 2+ feature.

### Desktop Layout (768px+)

Two-panel layout:

**Left panel (320px fixed)**: Chronological conversation list.
- Each item shows: platform avatar (brand color circle), username, comment/mention preview (truncated), timestamp, type badge (Comment / Mention), status badge (Unreplied in red / Replied in green)
- Unreplied items sort to top
- Replied items are dimmed (opacity 0.65)
- Selected item has teal left border + light teal background
- Type filter bar at top: All / Comments (with badge count) / Mentions (with badge count)
- Platform filter pills: IG / TT / FB / X / YT

**Right panel (flex)**: Detail view for selected item.
- Top section: original post context — thumbnail, caption, engagement stats (likes, comments, shares), platform, posted date
- Middle section: comment thread — commenter avatar, username, timestamp, full comment text
- Bottom section: reply input — text input with send button. Calls Outstand `POST /v1/posts/{id}/comments`

### Mobile Layout (<768px)

Single-column card layout. Each comment/mention is a self-contained card:
- Platform avatar, username, preview text, timestamp
- Type badge + status badge
- "on: [post title]" chip showing which post it's on
- "Reply" pill button on each card

Tapping "Reply" opens a bottom sheet with the full comment context and reply input. The bottom sheet shows:
- Original post thumbnail + title
- Full comment text
- Reply text input + send button

Filter bar scrolls horizontally with type pills (All / Comments / Mentions). Platform filter omitted on mobile for space.

### Data Flow

Comments are fetched via Outstand `GET /v1/posts/{id}/comments` for each published post. Since there's no "get all comments across all posts" endpoint, the implementation:

1. Fetches all published posts via `usePosts()`
2. Sorts by `publishedAt` descending and takes the **50 most recent** posts with `commentCount > 0` (scalability cap — prevents firing hundreds of parallel requests for accounts with large post histories)
3. For each qualifying post, fetches comments via `GET /v1/posts/{id}/comments`
4. Merges all comments into a single chronological feed
5. Caches in React Query with a 60-second stale time
6. "Load older comments" button at the bottom fetches the next 50 posts' comments on demand

Replies are sent via `POST /v1/posts/{id}/comments` through the Edge Function proxy (which validates account ownership).

### Polling

Refreshes every 60 seconds when the Engagement tab is active. Uses React Query's `refetchInterval` option. Manual refresh available via the global Refresh button. No realtime websocket for Phase 1 — acceptable because comment response times in restaurants are measured in minutes/hours, not seconds.

### Status Tracking

"Replied" status is determined by checking if any reply in the comment thread is from the connected account (the restaurant's account). This comes from the Outstand API response — each comment includes the author's social account ID, which can be matched against `business_outstand_accounts`.

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `EngagementTab` | `src/components/outstand/EngagementTab.tsx` | Tab container, filter state, data fetching orchestration |
| `EngagementList` | `src/components/outstand/engagement/EngagementList.tsx` | Left panel conversation list (desktop) / card list (mobile) |
| `EngagementDetail` | `src/components/outstand/engagement/EngagementDetail.tsx` | Right panel detail + reply (desktop) |
| `EngagementCard` | `src/components/outstand/engagement/EngagementCard.tsx` | Self-contained card for mobile layout |
| `ReplySheet` | `src/components/outstand/engagement/ReplySheet.tsx` | Mobile bottom sheet for replying |

### Edge Function Changes

The existing `outstand-proxy` Edge Function already allows `GET` and `POST` on `/v1/posts/{id}/comments` (comments endpoints are scoped to posts owned by the user). No Edge Function changes needed.

---

## 4. Analytics Tab

### Purpose

Account-level analytics dashboard showing follower growth, engagement rates, best posting times, and reach across all connected platforms. Self-contained within the OutstandManager — no changes to the existing business dashboard.

### Desktop Layout (768px+)

**Time range selector** at top: 7d / 30d / 90d toggle buttons. Platform filter pills alongside: All Platforms (default) | per-platform filters.

**KPI stat cards** (4-column grid):
| Metric | Source | Delta |
|--------|--------|-------|
| Total Followers | Sum of followers across all connected accounts | vs prior equivalent period |
| Engagement Rate | Weighted average (likes + comments + shares) / reach | vs prior |
| Total Reach | Sum of impressions/reach across platforms | vs prior |
| Posts Published | Count of posts with `publishedAt` in period | vs prior |

Each card: metric label (uppercase, small), value (large bold), delta with arrow (green up / red down) + "vs prior" label. Teal-tinted background with teal border.

**Follower Growth chart**: Line/area chart showing follower count over the selected time range. Per-platform lines color-coded (IG pink, TT black, FB blue, X gray, YT red). Uses Recharts (already available in the Lovable ecosystem — lightweight, React-native charting). Desktop only — hidden on mobile.

**Best Posting Times heatmap** (left half of a 2-column section): 4 time slots (9am, 12pm, 3pm, 6pm) × 7 days grid. Cell color intensity maps to average engagement rate for posts published in that slot. Teal gradient from light (low) to dark (high). Derived from post performance data. Desktop only.

**Top Performing Posts** (right half): Ranked list of top 3–5 posts by engagement rate in the selected period. Each row: rank number (teal), thumbnail placeholder, caption preview (truncated), engagement count + rate, platform badge.

**Platform Breakdown** (full width, bottom): Per-platform cards in a 3-column grid (or N columns for N connected platforms). Each card: platform icon in brand color, follower count, growth delta. Background tinted with platform's brand color at low opacity.

### Mobile Layout (<768px)

- KPI cards in 2×2 grid (condensed labels: "Followers", "Eng. Rate", "Reach", "Published")
- Platform breakdown as horizontal scroll cards
- Top posts as stacked list
- Growth chart and heatmap hidden (KPIs provide the key numbers; chart detail is a desktop luxury)

### Data Source

Outstand `GET /v1/social-accounts/{id}/metrics` per connected account. Called through the Edge Function proxy. Metrics include follower count, engagement rate, impressions, reach (availability varies by platform).

**Caching strategy** (per parent spec requirement): Metrics are cached in a new `social_analytics_cache` table in Supabase with columns: `user_id`, `platform`, `outstand_account_id`, `metric_type`, `metric_value`, `period_start`, `period_end`, `fetched_at`. Cache TTL: 1 hour. On tab load, serve from cache if fresh; otherwise fetch from Outstand API and upsert cache.

For the "vs prior period" deltas: the cache uses the `period_start` and `period_end` columns to distinguish time ranges. A 30-day view stores two rows per metric — one for the current 30-day period and one for the prior 30-day period. The `useAccountMetrics` hook queries both ranges and computes the delta client-side. If prior period data isn't cached yet, show "—" instead of a delta.

**Best posting times** are derived from post-level analytics: for each published post, record the day-of-week and hour it was posted, plus its engagement rate. Aggregate into the heatmap grid. This uses data already available from `usePosts()` + per-post metrics — no new API call.

### New Database Table

```sql
create table social_analytics_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outstand_account_id text not null,
  platform text not null,
  metric_type text not null,
  metric_value numeric not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique(user_id, outstand_account_id, metric_type, period_start, period_end)
);

create index idx_social_analytics_cache_freshness
  on social_analytics_cache (user_id, fetched_at);

alter table social_analytics_cache enable row level security;

create policy "Users can read own analytics cache"
  on social_analytics_cache for select
  using (auth.uid() = user_id);

create policy "Users can upsert own analytics cache"
  on social_analytics_cache for insert
  with check (auth.uid() = user_id);

create policy "Users can update own analytics cache"
  on social_analytics_cache for update
  using (auth.uid() = user_id);
```

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `AnalyticsTab` | `src/components/outstand/AnalyticsTab.tsx` | Tab container, time range state, data fetching |
| `KpiCards` | `src/components/outstand/analytics/KpiCards.tsx` | 4-metric stat cards with deltas |
| `FollowerChart` | `src/components/outstand/analytics/FollowerChart.tsx` | Recharts line/area chart (desktop only) |
| `PostingHeatmap` | `src/components/outstand/analytics/PostingHeatmap.tsx` | Best times grid (desktop only) |
| `TopPosts` | `src/components/outstand/analytics/TopPosts.tsx` | Ranked post list |
| `PlatformBreakdown` | `src/components/outstand/analytics/PlatformBreakdown.tsx` | Per-platform follower/growth cards |

### Hook

| Hook | File | Purpose |
|------|------|---------|
| `useAccountMetrics` | `src/hooks/outstand/useAccountMetrics.ts` | Fetches metrics from Outstand API, manages cache upsert, returns aggregated KPIs |

---

## 5. Settings Integration

### Purpose

Replace the manual social URL input fields in both `BusinessSettingsSections` and `CreatorSettingsSections` with a connected accounts display that shows real Outstand connection status and links to the Social Media Manager.

### Changes to Existing Files

**BusinessSettingsSections.tsx** and **CreatorSettingsSections.tsx**:
- Rename section title: "Social Links" → "Social Media"
- Rename subtitle: "Connect your brand's social accounts" → "Manage connected accounts & posting"
- Add `ConnectedAccountsList` component above the existing social URL fields
- Add "Open Social Media Manager →" CTA button linking to the appropriate dashboard route
- Wrap existing `SocialMediaLinks` / `CreatorSocialMediaLinks` in a collapsed sub-section labeled "Profile Links" with subtitle "URLs displayed on your public profile"

### New Shared Component

**`ConnectedAccountsList`** (`src/components/outstand/ConnectedAccountsList.tsx`):

Props: `role: 'business' | 'creator'`

Behavior:
1. Wraps itself in `DragonCandyOutstandProvider` to access the Outstand API
2. Queries `business_outstand_accounts` for the current user to get connected platforms
3. Displays each supported platform (Instagram, TikTok, Facebook, X, YouTube) as a row:
   - **Connected**: Platform icon (brand color), handle/name, "Connected" label, green checkmark. Teal border.
   - **Not connected**: Platform icon (gray), platform name, "Not connected" label, "Connect" button. Gray border.
4. "Connect" button triggers the Outstand OAuth flow (same as AccountsTab) — opens popup, returns to settings on callback
5. Uses `useOutstandPaths()` hook for the Manager CTA link

### Manual URL Fields

Kept as-is under a collapsed accordion sub-section. These URLs serve a different purpose — they're displayed on the user's public profile page and used for SEO. They're not connected to the Outstand integration. No code changes to `SocialMediaLinks` or `CreatorSocialMediaLinks` components.

---

## 6. Cross-Cutting Concerns

### Mobile Responsiveness

All new components follow the existing responsive patterns in OutstandManager:
- `hidden sm:inline` / `sm:hidden` for label toggling
- `md:grid-cols-N` for desktop grid layouts, single column on mobile
- `pb-24 md:pb-0` for bottom nav spacing
- Touch-friendly tap targets (minimum 44px)

### Error Handling

- All Outstand API calls go through the Edge Function proxy (already handles auth, tenant scoping, error normalization)
- React Query error states shown as inline error cards with retry buttons (matching existing pattern in ComposeTab/PublishedTab)
- Empty states show descriptive messages with action CTAs (e.g., "No posts scheduled — Schedule a Post")

### Loading States

- Skeleton loaders for calendar grid, engagement list, analytics cards (using existing `DCSkeleton` component pattern)
- Tab-level loading indicators in the tab badge area

### Performance

- Calendar only fetches posts for the visible date range (not all posts)
- Engagement comments fetched lazily — only for posts with `commentCount > 0`
- Analytics cache prevents redundant Outstand API calls (1-hour TTL)
- Recharts is already in `package.json` (v2.12.7) — no new dependency. Tree-shakeable — only import `LineChart`, `Area`, `XAxis`, `YAxis`, `Tooltip`

---

## 7. Files Changed Summary

### New Files (18)

| File | Type |
|------|------|
| `src/components/outstand/CalendarTab.tsx` | Component |
| `src/components/outstand/calendar/WeekGrid.tsx` | Component |
| `src/components/outstand/calendar/MonthGrid.tsx` | Component |
| `src/components/outstand/calendar/DayStrip.tsx` | Component |
| `src/components/outstand/calendar/CalendarPostCard.tsx` | Component |
| `src/components/outstand/EngagementTab.tsx` | Component |
| `src/components/outstand/engagement/EngagementList.tsx` | Component |
| `src/components/outstand/engagement/EngagementDetail.tsx` | Component |
| `src/components/outstand/engagement/EngagementCard.tsx` | Component |
| `src/components/outstand/engagement/ReplySheet.tsx` | Component |
| `src/components/outstand/AnalyticsTab.tsx` | Component |
| `src/components/outstand/analytics/KpiCards.tsx` | Component |
| `src/components/outstand/analytics/FollowerChart.tsx` | Component |

*(continued)*

| File | Type |
|------|------|
| `src/components/outstand/analytics/PostingHeatmap.tsx` | Component |
| `src/components/outstand/analytics/TopPosts.tsx` | Component |
| `src/components/outstand/analytics/PlatformBreakdown.tsx` | Component |
| `src/components/outstand/ConnectedAccountsList.tsx` | Component |
| `src/hooks/outstand/useAccountMetrics.ts` | Hook |

**Total new files: 18**

### Modified Files (3)

| File | Change |
|------|--------|
| `src/pages/OutstandManager.tsx` | Add 2 new tabs (Calendar, Engagement, Analytics), remove Scheduled tab, update tab types and imports |
| `src/components/settings/BusinessSettingsSections.tsx` | Replace Social Links section content with ConnectedAccountsList + Manager CTA + collapsed Profile Links |
| `src/components/settings/CreatorSettingsSections.tsx` | Same changes as BusinessSettingsSections |

### New Database Migration (1)

| Migration | Purpose |
|-----------|---------|
| `social_analytics_cache` table + RLS policies | Cache for Outstand account-level metrics |

---

## 8. Success Criteria

Phase 1 is complete when:

1. Restaurant users can view all scheduled and published posts on a weekly/monthly calendar grid
2. Drag-and-drop rescheduling works on desktop; tap-to-reschedule works on mobile
3. Comments and mentions from all connected platforms appear in a unified Engagement inbox
4. Restaurant staff can reply to comments directly from DragonCandy
5. Analytics tab shows follower counts, engagement rates, reach, and growth deltas across all platforms
6. Best posting times heatmap helps restaurants optimize their scheduling
7. Settings pages show real connected account status and link to the Social Media Manager
8. All features work on both mobile (375px) and desktop (768px+) layouts
9. No regressions to existing Compose, Published, or Accounts tab functionality
