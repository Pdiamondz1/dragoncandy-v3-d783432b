# Outstand.so Integration — Full 4-Phase Audit

**Date:** 2026-05-09
**Reference:** `docs/DragonCandy_x_Outstand-so_Social_Media_Integration_Strategy.pdf` (39 pages)
**Method:** Sequential deep audit — every component file read against PDF spec, Tailwind responsive classes verified, wiring confirmed in consuming components.
**Prior audits superseded:** `2026-05-08-outstand-phase1-audit-and-phases2-4-scope.md`, `2026-05-09-outstand-phase1-phase2-audit.md`

---

## Executive Summary

| Phase | Deliverables | PASS | PARTIAL | FAIL (Deferred) | NOT BUILT |
|-------|-------------|------|---------|-----------------|-----------|
| 1 — Restaurant | 7 | 6 | 0 | 1 | 0 |
| 2 — Creator | 7 | 5 | 0 | 2 | 0 |
| 3 — Brand | 5 | 0 | 0 | 1 | 4 |
| 4 — Cross-Role | 6 | 0 | 0 | 1 | 5 |
| **Total** | **25** | **11** | **0** | **5** | **9** |

Phase 1 is production-ready. Phase 2 is fully functional with two expected Donny-blocked deferrals. Phases 3-4 are not built, but ~60% of the infrastructure (OAuth, calendar, analytics, engagement, edge proxy) is role-agnostic and reusable.

---

## Phase 1: Restaurant Social Media Manager

### 1a. OAuth + Account Management — PASS

| Component | File | Lines | Responsive |
|-----------|------|-------|------------|
| ConnectedAccountsList | `src/components/outstand/ConnectedAccountsList.tsx` | 118 | Inherently mobile-friendly (stacked list) |
| AccountsTab | `src/components/outstand/AccountsTab.tsx` | 57 | No breakpoint-specific classes needed |
| Edge Function Proxy | `supabase/functions/outstand-proxy/index.ts` | 576 | N/A (server) |
| Provider | `src/integrations/outstand/Provider.tsx` | — | N/A (context) |

**What works:**
- Five platforms supported: Instagram, TikTok, Facebook, X, YouTube
- OAuth redirect flow via `ConnectAccountButtonGroup` with `sessionStorage` stash for network echo
- Edge proxy: JWT validation → tenant scoping via `business_outstand_accounts` → default-deny scope enforcement → response filtering → connection recording → disconnect tracking
- Filename sanitization prevents Graph API URL parsing failures
- Doc/SDK response shape normalization (top-level vs `data`-wrapped)
- `AccountsTab` uses Outstand SDK's `AccountsList` for disconnect flow
- CTA to open Social Media Manager from `ConnectedAccountsList`

**Security model:** Outstand API key never reaches the browser. Edge proxy validates Supabase JWT, resolves `userId`, enforces that every social account ID in a request belongs to the caller. List responses are filtered server-side. Cross-tenant account claiming is rejected (409).

### 1b. Donny AI MCP Integration — FAIL (Deferred)

No MCP tools or Donny integration exists in the Outstand layer. This is deliberately deferred per PROJECT_CONTEXT.md — Donny is post-launch. The PDF spec envisions Donny using 25 MCP tools against the Outstand API for intelligent scheduling, content suggestions, and auto-replies.

**Impact:** Does not block launch. Manual workflows cover all use cases.

### 1c. Compose + Schedule + Publish — PASS

| Component | File | Lines | Responsive |
|-----------|------|-------|------------|
| ComposeTab | `src/components/outstand/ComposeTab.tsx` | 43 | Thin wrapper, inherits form layout |
| CustomComposeForm | `src/components/outstand/CustomComposeForm.tsx` | 380 | Full-width form, `w-full` CTA |

**What works:**
- Account selection via `NetworkSelector` (Outstand SDK)
- Caption via `PostComposer` with per-account character awareness
- Media upload via `MediaUploader` (max 4 files)
- Per-platform config via `NetworkConfigPanel` (threads, instagram, youtube, tiktok)
- Schedule toggle with `datetime-local`, 5-min minimum, 30-day maximum, timezone display
- Pre-submit media validation: Facebook no image+video mix, YouTube/TikTok video-only, X 4-image limit
- Inline failure banner persists after toast dismisses
- Form preserved on failure for retry; cleared only on full success
- Per-account status pills on post creation response (published/failed/pending)
- Empty state directs to Accounts tab

**Desktop/mobile:** Form is naturally stacked and full-width — works on both without breakpoint-specific layout changes.

### 1d. Content Calendar — PASS

| Component | File | Lines | Responsive |
|-----------|------|-------|------------|
| CalendarTab | `src/components/outstand/CalendarTab.tsx` | 235 | Week/month toggle desktop only (`hidden md:flex`) |
| WeekGrid | `src/components/outstand/calendar/WeekGrid.tsx` | 97 | Desktop only (`hidden md:grid grid-cols-7`) |
| MonthGrid | `src/components/outstand/calendar/MonthGrid.tsx` | 89 | Desktop only (`hidden md:block`) |
| DayStrip | `src/components/outstand/calendar/DayStrip.tsx` | 117 | Mobile only (`md:hidden`) |
| CalendarPostCard | `src/components/outstand/calendar/CalendarPostCard.tsx` | 83 | Shared component, both breakpoints |

**Desktop layout:**
- Week view: 7-column grid with drag-and-drop reschedule. Visual drop target highlight (`bg-dc-teal/5`). PATCH → delete+recreate fallback on reschedule.
- Month view: Full month grid with dot indicators (teal=scheduled, amber=published, pink=deadline). Day click navigates.
- Legend bar with 4 status colors.
- Platform filter pills with horizontal scroll.

**Mobile layout:**
- Horizontal day strip with tap selection. Today highlighted in teal.
- Selected day content below with post cards and campaign deadlines.
- Empty state: calendar icon + "Schedule a Post" CTA pill button.
- No drag-and-drop (tap to interact instead).

**Accessibility:** CalendarPostCard has `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter key, `aria-label` with caption and time.

### 1e. Analytics Dashboard — PASS

| Component | File | Lines | Responsive |
|-----------|------|-------|------------|
| AnalyticsTab | `src/components/outstand/AnalyticsTab.tsx` | 128 | `grid-cols-2 md:grid-cols-4` KPIs, side-by-side heatmap+posts desktop |
| KpiCards | `src/components/outstand/analytics/KpiCards.tsx` | 33 | `grid-cols-2 md:grid-cols-4`, mobile-shortened labels |
| TopPosts | `src/components/outstand/analytics/TopPosts.tsx` | 66 | No breakpoint classes needed |
| FollowerChart | `src/components/outstand/analytics/FollowerChart.tsx` | 70 | Desktop only (`hidden md:block`) |
| PostingHeatmap | `src/components/outstand/analytics/PostingHeatmap.tsx` | 76 | Desktop only (`hidden md:block`) |
| PlatformBreakdown | `src/components/outstand/analytics/PlatformBreakdown.tsx` | 41 | `flex overflow-x-auto` mobile, `md:grid md:grid-cols-3` desktop |
| DeltaBadge | `src/components/outstand/analytics/DeltaBadge.tsx` | 18 | Inline component |
| useAccountMetrics | `src/hooks/outstand/useAccountMetrics.ts` | 237 | N/A (hook) |

**Desktop layout:**
- Time range selector (7d/30d/90d) with `aria-pressed` + platform filter pills
- 4 KPI cards in a row: Total Followers, Engagement Rate, Total Reach, Posts Published
- Heatmap + TopPosts side-by-side (`hidden md:grid md:grid-cols-2`)
- FollowerChart bar chart with per-platform colors and DeltaBadge breakdown
- PlatformBreakdown in 3-column grid

**Mobile layout:**
- 2-column KPI grid with shortened labels (Followers, Eng. Rate, Reach, Published)
- TopPosts list visible (no heatmap, no follower chart)
- PlatformBreakdown horizontal scroll

**Data layer:**
- `useAccountMetrics` computes deltas via `getDateRange()` — current period vs prior period of equal length
- `computeDelta()`: `((current - prior) / prior) * 100`, returns null when prior is zero
- Concurrency-limited to 5 parallel API calls
- Caches to `social_analytics_cache` with ISO date boundaries
- 5-minute stale time

**Note:** TopPosts sorted by recency (not engagement) because inline engagement metrics aren't available from the Outstand posts list API. This was a deliberate pragmatic decision (commit `e3b0ae0`).

### 1f. Engagement Hub — PASS

| Component | File | Lines | Responsive |
|-----------|------|-------|------------|
| EngagementTab | `src/components/outstand/EngagementTab.tsx` | 126 | `md:grid md:grid-cols-[320px_1fr]` |
| EngagementList | `src/components/outstand/engagement/EngagementList.tsx` | 80 | Stacked list, works both |
| EngagementDetail | `src/components/outstand/engagement/EngagementDetail.tsx` | 101 | Desktop right panel (`hidden md:flex`) |
| ReplySheet | `src/components/outstand/engagement/ReplySheet.tsx` | 86 | Mobile bottom sheet (`Sheet side="bottom"`) |
| usePostComments | `src/hooks/outstand/usePostComments.ts` | 103 | N/A (hook) |

**Desktop layout:**
- Two-panel: scrollable comment list (320px) + detail panel with reply input
- Left panel: `md:overflow-y-auto md:max-h-[500px]`
- Right panel: post context, engagement metrics (likes/comments/shares via `usePostMetrics`), comment thread, pill-shaped reply input with teal send button

**Mobile layout:**
- Full-width comment list
- Tap opens `ReplySheet` bottom sheet (`max-h-[80vh]`, `rounded-t-2xl`)
- Auto-focus on reply input
- Comment context shown above reply field

**Data layer:**
- `usePostComments` fetches comments across up to 50 published posts with concurrency limit of 5
- Normalized `Comment` interface with cross-post platform attribution
- Unreplied items sorted to top (commit `2b3ae7e`)
- 60-second stale/refetch interval
- Filter pills: All / Comments / Mentions with badge counts

### 1g. Published Feed — PASS

| Component | File | Lines | Responsive |
|-----------|------|-------|------------|
| PublishedTab | `src/components/outstand/PublishedTab.tsx` | 254 | Full-width cards, works both breakpoints |
| postUtils | `src/components/outstand/postUtils.tsx` | 103 | N/A (utilities) |

**What works:**
- Published post cards with `border-2 border-dc-teal`, `rounded-2xl`
- Per-post: caption (whitespace-pre-wrap), media preview strip (images + video), per-account status pills
- Status badges: Posted (emerald), Publishing (amber, spinner), Failed (red), Partial (amber)
- `PostMetrics` component (from Outstand SDK) rendered for successfully published posts
- Delete with `AlertDialog` confirmation. Force-delete fallback (`?force=true`) for posts stuck in publishing queue
- Detailed error messages with 12-second toast duration
- Loading skeleton via `DCSkeleton`, empty state via `DCEmptyState`
- `AccountStatusPill` shows network name, status icon, and error text (truncated to 180px)

**Shared utilities (postUtils.tsx):**
- `getCaption`: Extracts caption from container (content → text → caption → body)
- `getMedia`: Extracts media URLs from containers with contentType detection
- `MediaPreviewStrip`: Horizontal scroll, 80×80 thumbnails, video/image detection
- `getUniqueNetworks`: Deduped network list from socialAccounts
- `formatPostDate`: Locale-formatted date with month, day, hour, minute

---

## Phase 2: Creator Social Features

### 2a. Creator OAuth + Social Manager Access — PASS

No separate implementation needed. The shared infrastructure works for both roles:
- `OutstandManager` page is role-agnostic — no business-specific gating
- Edge proxy scopes by `user_id` (not `business_id`) — works for creators
- `ConnectedAccountsList` accepts `role: 'business' | 'creator'` prop (currently unused functionally — both roles get the same UI)
- `business_outstand_accounts` table is used for both roles despite the name (rows have `user_id` as the primary scope key)

### 2b. Cross-Post Prompt — PASS

| Component | File | Lines | Responsive |
|-----------|------|-------|------------|
| CrossPostPrompt | `src/components/outstand/CrossPostPrompt.tsx` | 191 | Sheet (mobile) / Dialog (desktop) at 768px |
| useCrossPost | `src/hooks/outstand/useCrossPost.ts` | 43 | N/A (hook) |

**Desktop:** `Dialog` with centered overlay. Account toggles (teal when selected). Caption preview with textarea edit mode. 4 action buttons in 2×2 grid (Post Now, Schedule, Edit Caption, Skip).

**Mobile:** `Sheet side="bottom"` with `rounded-t-2xl`. Same content, naturally stacked.

**Wiring confirmed:** `DetailedApplicationCard.tsx` imports and renders `CrossPostPrompt` behind a "Cross-Post to Your Socials" button on accepted applications. Passes `campaignTitle`, `creatorName`, `mediaUrls`.

**Template caption:** Includes `#DragonCandy #DragonDashed #ContentCreator` — aligns with brand verbification strategy from PROJECT_CONTEXT.md.

**Data layer:** `useCrossPost` is a React Query mutation that posts to `/posts` via the Outstand API, invalidates all `['outstand']` queries on success.

### 2c. Donny AI Caption Rewriter — FAIL (Deferred)

No implementation. Requires Donny AI MCP integration to rewrite campaign captions for creator voice/platform tone. Same dependency as 1b.

### 2d. Campaign Deadline Markers — PASS

**Wiring:**
- `OutstandManager.tsx`: Queries `campaign_applications` joined with `campaigns` for creators. Extracts `CampaignDeadline[]` with `id`, `title`, `deadline` fields. Passes to `CalendarTab`.
- `CalendarTab.tsx`: Passes `campaignDeadlines` to all three calendar views.
- `WeekGrid.tsx`: Renders deadline chips (`bg-pink-100 text-pink-700 border-pink-200`) below post cards on matching days.
- `MonthGrid.tsx`: Pink dot indicator (`bg-pink-400`) alongside scheduled/published dots.
- `DayStrip.tsx`: Full deadline cards (`bg-pink-50 border-pink-200 rounded-xl`) with "Campaign Deadline" label and title. Pink dot on day strip.

Consistent pink visual treatment across all views. Deadline data sourced from real campaign data.

### 2e. Verified Creator Badge — PASS

| Component | File | Lines |
|-----------|------|-------|
| VerifiedBadge | `src/components/outstand/VerifiedBadge.tsx` | 19 |
| useVerifiedStatus | `src/hooks/outstand/useVerifiedStatus.ts` | 41 |

**Wiring confirmed:**
- `CreatorCard.tsx`: `useVerifiedStatus(creator.user_id)` → `{isVerified && <VerifiedBadge />}` next to creator name
- `PublicCreatorProfile.tsx`: `useVerifiedStatus(profile?.user_id)` → `{isVerified && <VerifiedBadge className="ml-1" />}` in profile header

**Data layer:** `useVerifiedStatus` queries `business_outstand_accounts` for active connections. Returns `isVerified: true` if any active account exists. 5-minute stale time.

**Visual:** BadgeCheck icon from lucide-react, filled teal with white text. Two sizes: sm (h-3.5 w-3.5) and md (h-4.5 w-4.5). Title tooltip: "Verified Creator — social accounts connected via DragonCandy".

### 2f. Verified Social Stats on Profile — PASS

| Component | File | Lines |
|-----------|------|-------|
| VerifiedSocialStats | `src/components/outstand/VerifiedSocialStats.tsx` | 64 |
| useCreatorSocialStats | `src/hooks/outstand/useCreatorSocialStats.ts` | 49 |

**What works:**
- Platform-specific follower cards with brand colors (IG pink, TT black, FB blue, X gray, YT red)
- Horizontal scroll layout (`flex gap-3 overflow-x-auto`)
- Total followers footer: "X total followers · Verified by DragonCandy"
- `useCreatorSocialStats` queries `social_analytics_cache` for latest follower counts, dedupes by platform (takes most recent row per platform)
- Wired into `PublicCreatorProfile.tsx` below the stats row
- RLS migration exists (`20260509000001_public_read_verified_stats.sql`) for cross-user read access

**Threshold:** `MIN_DISPLAY_FOLLOWERS = 100` in `useCreatorSocialStats` filters out platforms below 100 followers. Creators with no qualifying platforms get no stats section (component returns null). Fixed 2026-05-09.

### 2g. Donny AI Growth Insights — FAIL (Deferred)

No implementation. Requires Donny AI to analyze posting patterns, follower trends, and engagement data to generate actionable growth recommendations. Same dependency as 1b/2c.

---

## Phase 3: Brand/Sponsor Social Features — NOT BUILT

All Phase 3 deliverables require new brand-specific UI entry points. The underlying infrastructure (OAuth, calendar, analytics, engagement hub, edge proxy) is role-agnostic and reusable, but no brand dashboard integration exists.

| # | Deliverable | Status | Reusable Infrastructure | New Work Needed |
|---|-------------|--------|------------------------|-----------------|
| 3a | Brand OAuth + Social Manager | NOT BUILT | Edge proxy, AccountsTab, ConnectedAccountsList all work for any role | Brand dashboard entry point, brand-specific onboarding flow |
| 3b | Sponsored Content Amplification | NOT BUILT | CrossPostPrompt pattern | Amplification targeting UI, budget controls, audience selection |
| 3c | Brand Content Calendar | NOT BUILT | CalendarTab, WeekGrid, MonthGrid, DayStrip | Brand-specific event types (sponsored post deadlines, campaign milestones) |
| 3d | Campaign Analytics for Brands | NOT BUILT | AnalyticsTab, KpiCards, useAccountMetrics | Aggregate view across sponsored creators, ROI metrics, per-campaign breakdown |
| 3e | Donny AI Brand Intelligence | NOT BUILT | — | Donny AI MCP integration (post-launch) |

**Effort estimate:** 3a-3d are primarily wiring tasks — the components exist, they need brand-specific entry points and possibly some metric customization. Estimated 2-3 days of focused work per deliverable. 3e is blocked on Donny.

---

## Phase 4: Cross-Role & Advanced Features — NOT BUILT

These are the differentiating features that create network effects across roles.

| # | Deliverable | Status | Dependencies | Effort |
|---|-------------|--------|-------------|--------|
| 4a | Triple Social Hook | NOT BUILT | Phase 3 complete, approval workflow | 5-8 days — simultaneous coordinated posting to restaurant + creator + brand channels on content approval |
| 4b | Social Proof Marketplace Boost | NOT BUILT | VerifiedSocialStats, search/ranking system | 3-5 days — weight creator search results by verified social metrics |
| 4c | DragonDash Rush Posting | NOT BUILT | Stripe integration, posting queue | 5-8 days — premium $25-50 surcharge for multi-platform simultaneous posting with priority queue |
| 4d | Unified Analytics Dashboard | NOT BUILT | Phase 3 analytics | 3-5 days — cross-role aggregate view |
| 4e | Donny AI Cross-Platform Optimizer | NOT BUILT | Donny AI MCP | Post-launch |
| 4f | Social Commerce Bridge | NOT BUILT | Toast POS integration, product tagging | 5-8 days — shoppable social posts linking to restaurant menus/ordering |

**Key insight:** 4c (DragonDash Rush Posting) is the highest-priority Phase 4 item per PROJECT_CONTEXT.md — it's the premium revenue driver ($25-50/rush). It should be prioritized over social proof and unified analytics.

---

## Responsive Audit Summary

Every component was checked for proper Tailwind responsive class usage. The pattern is consistent: mobile-first base classes with `md:` breakpoints at 768px for desktop enhancements.

| Pattern | Usage | Files |
|---------|-------|-------|
| Desktop-only content | `hidden md:block` or `hidden md:grid` or `hidden md:flex` | WeekGrid, MonthGrid, FollowerChart, PostingHeatmap, EngagementDetail |
| Mobile-only content | `md:hidden` | DayStrip |
| Responsive grid | `grid-cols-2 md:grid-cols-4` | KpiCards |
| Responsive layout | `flex overflow-x-auto` → `md:grid md:grid-cols-3` | PlatformBreakdown |
| Sheet/Dialog switch | 768px `resize` listener | CrossPostPrompt, EngagementTab |
| Mobile label shortening | `hidden sm:inline` / `sm:hidden` | OutstandManager tab labels |
| Desktop constraint | `md:max-w-4xl md:mx-auto` | OutstandManager |
| Bottom nav spacing | `pb-24 md:pb-0` | OutstandManager |

**No lg: classes were modified.** All desktop patterns use `md:` exclusively, consistent with the project convention.

**Finding:** No issues found. The responsive strategy is consistent and correct across all components.

---

## Issues Found (This Audit)

| # | Severity | Component | Issue | Status |
|---|----------|-----------|-------|--------|
| 1 | ~~P3~~ | VerifiedSocialStats | ~~No minimum follower threshold~~ | **FIXED** — `MIN_DISPLAY_FOLLOWERS = 100` added to `useCreatorSocialStats` |
| 2 | P4 | ConnectedAccountsList | `role` prop accepted but unused (`_role`) — no role-specific behavior | Cosmetic — address when Phase 3 lands |
| 3 | P4 | PostingHeatmap | Title "Best Posting Times" is misleading — shows posting frequency, not optimal times | Cosmetic — rename to "Posting Activity" or keep |
| 4 | Info | business_outstand_accounts | Table name implies business-only but stores creator accounts too | Cosmetic — not worth migration churn pre-launch |

All actionable issues resolved. Issues #2-4 are cosmetic/informational only.

---

## Fixes Confirmed from Prior Audits

All fixes from the May 8-9 audit cycle were verified via git log and code review:

| Commit | Fix | Verified |
|--------|-----|----------|
| `e3b0ae0` | TopPosts sort by recency, compute all metric deltas, add follower growth display | Yes — TopPosts.tsx sorts by `publishedAt/createdAt`, useAccountMetrics computes deltas |
| `2b3ae7e` | Sort unreplied engagement items to top | Yes — EngagementTab sorts unreplied before replied |
| `78db061` | Add platform filter pills to analytics tab | Yes — AnalyticsTab renders platform pills alongside time range |
| `e93c460` | Show post engagement stats in engagement detail panel | Yes — EngagementDetail uses `usePostMetrics` for likes/comments/shares |
| `25cd558` | Compute analytics deltas from prior period with date-range cache keys | Yes — useAccountMetrics `computeDelta()` compares current vs prior period |
| `d3a36a3` | Alter analytics cache period columns from text to timestamptz | Yes — migration applied |
| `962a4d6` | Campaign deadline markers in calendar | Yes — WeekGrid, MonthGrid, DayStrip all render deadline markers |
| `c0b02e0` | CrossPostPrompt component | Yes — Sheet/Dialog with account selection, caption edit, 4 actions |
| `962a4d6` | Wire CrossPostPrompt into DetailedApplicationCard | Yes — button + modal on accepted applications |

---

## Launch Readiness Assessment

**Phase 1 (Restaurant): SHIP-READY.** All 6 non-Donny deliverables pass. Complete social media manager with compose, calendar, analytics, engagement, and published feed. Responsive desktop and mobile layouts verified. Edge proxy security model is solid.

**Phase 2 (Creator): SHIP-READY.** All 5 non-Donny deliverables pass. Follower threshold (2f) fixed — platforms below 100 followers are filtered out. Cross-post prompt, verified badge, and deadline markers are all wired and working.

**Phases 3-4: Backlog.** 9 deliverables not built, 2 Donny-blocked. Infrastructure reuse from Phases 1-2 will accelerate Phase 3 significantly. Phase 4 items are the high-value differentiators — prioritize 4c (DragonDash Rush Posting) as the revenue driver.

**Donny-blocked items (5 total across all phases):** 1b, 2c, 2g, 3e, 4e. These represent ~20% of total deliverables and ~40% of Phases 2-4. None block launch.
