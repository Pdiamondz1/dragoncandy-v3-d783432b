# Outstand.so Integration — Phase 1 Audit & Phases 2–4 Scope

**Date:** May 8, 2026
**Status:** Approved Design — Ready for Implementation Planning
**Parent Spec:** [Outstand Social Media Integration Strategy](2026-05-03-outstand-social-media-integration-design.md)
**Phase 1 Completion Spec:** [Phase 1 Completion Design](2026-05-08-outstand-phase1-completion-design.md)
**Source Document:** DragonCandy x Outstand.so Social Media Integration Strategy (PDF, v1.0, May 3, 2026)

---

## Executive Summary

Phase 1 (Restaurant Social Media) is built and merged. All 6 tabs — Compose, Calendar, Published, Engagement, Analytics, Accounts — exist with both mobile and desktop layouts, plus the Settings integration with connected accounts. The Edge Function proxy, OAuth flow, caching layer, and data hooks are all operational.

This document covers two things:

1. **Phase 1 code-level audit** — every component verified against the completion spec and the parent PDF, with issues categorized by severity
2. **Phases 2–4 scope** — what's left to build for Creator, Brand, and Cross-Role features, mapped against Phase 1 infrastructure reuse

Nine issues were found in Phase 1. Three are spec deviations that should be fixed before moving to Phase 2. Six are minor gaps or reasonable adaptations to API constraints.

Phases 2–4 contain 24 deliverables (8 per phase). Roughly 60% require genuinely new features. The remaining 40% reuse Phase 1 infrastructure (OAuth, calendar, analytics, posting) with role-specific configuration. The single largest dependency across all remaining phases is Donny AI integration (MCP wiring, model routing), which was explicitly deferred from Phase 1.

---

## Part 1: Phase 1 Audit

### What's Working (Desktop + Mobile)

**OutstandManager (main page)**
- 6 tabs with URL query param routing (`?tab=compose|calendar|published|engagement|analytics|accounts`)
- Shared data hoisting — `useAccounts` and `usePosts` called once, passed to child tabs
- Mobile label shortening via `hidden sm:inline` / `sm:hidden` pattern (Compose→New, Published→Posts, Engagement→Engage, Analytics→Stats)
- Bottom nav spacing (`pb-24 md:pb-0`), desktop max-width constraint (`md:max-w-4xl md:mx-auto`)
- Refresh button with loading spinner animation
- Connected accounts + scheduled posts stat cards

**CalendarTab**
- Week/month toggle (desktop only via `hidden md:flex`)
- Navigation arrows with proper `aria-label` attributes
- Platform filter pills with horizontal scroll overflow
- Today button to snap to current date
- Drag-and-drop rescheduling via HTML5 Drag API (desktop only) with PATCH → delete+recreate fallback
- Loading state via `DCSkeleton`
- Legend bar (desktop only)

**WeekGrid (desktop)**
- 7-column grid (`hidden md:grid grid-cols-7`)
- Day labels (Mon–Sun), today highlighted in teal
- Drop target visual feedback (`bg-dc-teal/5`)
- Preserves original post time on date reschedule
- Only scheduled posts are draggable (published/failed are static)

**MonthGrid (desktop)**
- Desktop only (`hidden md:block`)
- Up to 6-row × 7-column grid with Monday start
- Dot indicators (teal for scheduled, amber for published)
- Click-to-drill into week view centered on clicked day
- Today cell highlighting

**DayStrip (mobile)**
- Mobile only (`md:hidden`)
- Horizontal scrolling day strip with dot indicators
- Selected day with teal underline + background tint
- Stacked post cards for selected day
- "+ Schedule a Post" CTA button on empty days linking to Compose tab
- No drag-and-drop (correct — spec says tap-to-reschedule on mobile)

**CalendarPostCard**
- Scheduled time, caption preview (`line-clamp-2`), platform badges (IG/TT/FB/X/YT in brand colors)
- Status-colored left border (teal=scheduled, amber=published, red=failed)
- Keyboard accessibility (`role="button"`, `tabIndex`, `onKeyDown` Enter handler)
- `aria-label` with caption and time

**EngagementTab**
- Two-panel desktop layout (`md:grid md:grid-cols-[320px_1fr]`)
- Left panel scrollable (`md:overflow-y-auto md:max-h-[500px]`)
- Right panel hidden on mobile (`hidden md:flex`)
- Filter pills (All / Comments / Mentions) with badge counts
- Mobile bottom sheet via `ReplySheet` (Sheet `side="bottom"` with `rounded-t-2xl`)
- Responsive detection (`window.innerWidth < 768`) for sheet vs. detail panel
- Empty state and loading state

**EngagementList**
- Platform avatar circles in brand colors with 2-letter abbreviations
- Username, preview text, relative timestamp (`timeAgo`)
- Type badge (Comment / Reply) and status badge (Replied green / Unreplied red)
- Replied items dimmed (`opacity-60`)
- Selected item with teal left border + background tint

**EngagementDetail (desktop)**
- Post context section (caption, date, platform)
- Comment thread with author avatar, name, timestamp, full text
- Reply input (pill-shaped input + teal send button)
- Enter key to send, disabled state while sending
- Toast feedback on success/failure
- React Query cache invalidation on reply

**ReplySheet (mobile)**
- Bottom sheet with post context ("on: [post title]")
- Full comment text display
- Reply input with `autoFocus`
- Enter key to send, cache invalidation, sheet close on success

**AnalyticsTab**
- Time range selector (7d / 30d / 90d) with `aria-pressed`
- KPI cards (2×2 mobile, 4-column desktop)
- Desktop: PostingHeatmap + TopPosts side-by-side (`md:grid md:grid-cols-2`)
- Mobile: TopPosts only (heatmap hidden)
- FollowerChart (desktop only bar chart)
- PlatformBreakdown (horizontal scroll mobile, 3-col grid desktop)
- Empty state for no connected accounts
- Loading state via `DCSkeleton`

**KpiCards**
- 4 metrics: Total Followers, Engagement Rate, Total Reach, Posts Published
- Mobile-shortened labels (Followers, Eng. Rate, Reach, Published)
- Delta badges with ▲/▼ arrows, "—" for null deltas
- Teal-tinted background (`bg-teal-50/50 border-teal-100`)

**PostingHeatmap (desktop only)**
- 4 time slots (9a, 12p, 3p, 6p) × 7 days grid
- Teal gradient intensity (4 shades based on post count)
- Legend with low/high labels

**PlatformBreakdown**
- Per-platform cards with brand-tinted backgrounds (`bg-pink-50`, `bg-blue-50`, etc.)
- Platform icon in brand color, follower count, growth delta
- 3-column grid desktop, horizontal scroll mobile with fixed 100px cards

**ConnectedAccountsList**
- All 5 platforms displayed (Instagram, TikTok, Facebook, X, YouTube)
- Connected state: brand color icon, handle, "Connected" label, green checkmark, teal border
- Not connected state: gray icon, platform name, "Not connected", Connect button, gray border
- OAuth flow via `ConnectAccountButtonGroup` with session storage for pending network
- "Open Social Media Manager →" full-width teal CTA
- Wrapped in `DragonCandyOutstandProvider` for self-contained use in Settings pages

**Settings Integration**
- `BusinessSettingsSections.tsx`: `ConnectedAccountsList` integrated, section title "Social Media", subtitle "Manage connected accounts & posting"
- `CreatorSettingsSections.tsx`: Same changes applied
- Existing social URL fields preserved in collapsed `<details>` accordion labeled "Profile Links"

**Data Layer**
- `useAccountMetrics`: Fetches from Outstand API, caches in `social_analytics_cache` with 1-hour TTL, concurrency limiting (5 parallel requests), Supabase auth check
- `usePostComments`: Fetches comments for top 50 published posts, 60-second stale time + polling interval, concurrency limiting (5)
- `social_analytics_cache` migration: RLS policies, unique constraint, freshness index
- Edge Function proxy: JWT validation, tenant scoping, endpoint allowlisting, scope enforcement, file sanitization

---

### Issues Found

#### P1 — Spec Deviations (Fix Before Phase 2)

**1. Analytics deltas always null**
- **Location:** `src/hooks/outstand/useAccountMetrics.ts:140-149` (aggregate return) and lines 89, 112 (per-account deltas)
- **Spec requirement:** KPI cards show delta "vs prior equivalent period" (e.g., current 30d vs. previous 30d) — completion spec Section 4
- **Current behavior:** All deltas hardcoded to `null` at both the per-account level (lines 89, 112) and the aggregate return (lines 145-148). Every "vs prior" badge displays "—".
- **Fix:** Fetch two time ranges from Outstand API (current + prior period). Store both in `social_analytics_cache` with actual date boundaries as `period_start`/`period_end` (requires migration update — see Issue #8). Compute deltas as `((current - prior) / prior) * 100`. If prior period data unavailable, keep "—".
- **Complexity:** Medium — requires second API call per account per time range, cache key restructuring from string labels to date ranges, and migration column type fix (Issue #8).

**2. Top Posts not ranked by engagement**
- **Location:** `src/components/outstand/analytics/TopPosts.tsx:19-27`
- **Spec requirement:** "Ranked list of top 3–5 posts by engagement rate in the selected period" — completion spec Section 4
- **Current behavior:** Takes first 5 published posts from the array (recency order). No engagement data used for sorting.
- **Fix:** Use per-post metrics from the `PostMetrics` data (likes, comments, shares) already available via `usePosts()` return value. Sort by total engagement count or engagement rate before slicing.
- **Complexity:** Low — the data may already be in the `Post` object's social account statuses or fetchable via `GET /v1/posts/{id}` metrics. Verify Outstand API returns per-post engagement.

**3. Engagement list doesn't sort unreplied to top**
- **Location:** `src/components/outstand/EngagementTab.tsx:24-29` (filteredComments memo), chronological sort originates in `src/hooks/outstand/usePostComments.ts:96`
- **Spec requirement:** "Unreplied items sort to top" — completion spec Section 3
- **Current behavior:** Comments rendered in chronological order (newest first, set by the hook at `usePostComments.ts:96`). Replied items have `opacity-60` but aren't sorted below unreplied.
- **Fix:** Override the hook's chronological ordering in the `filteredComments` memo at `EngagementTab.tsx:24-29`: partition into unreplied and replied, concatenate unreplied first, then replied. Within each group, maintain chronological order.
- **Complexity:** Low — add a `.sort()` comparator that checks reply status before timestamp.

#### P2 — Minor Gaps (Nice to Have)

**4. Analytics tab missing platform filter pills**
- **Location:** `src/components/outstand/AnalyticsTab.tsx:57-73` (the `flex items-center justify-between` container)
- **Spec requirement:** "Platform filter pills alongside" the time range selector — completion spec Section 4
- **Current behavior:** Only time range buttons shown. No way to filter analytics to a single platform.
- **Fix:** Add the same `PLATFORM_FILTERS` array and filter state used in `CalendarTab`. Place platform pills within the existing container alongside the time range buttons. Filter `accounts` before passing to `useAccountMetrics`, and filter `posts` before passing to `PostingHeatmap`/`TopPosts`.
- **Complexity:** Low — pattern already exists in CalendarTab.

**5. Follower chart shows bars, not growth trend**
- **Location:** `src/components/outstand/analytics/FollowerChart.tsx`
- **Spec requirement:** "Line/area chart showing follower count over the selected time range. Per-platform lines color-coded" — completion spec Section 4
- **Current behavior:** Recharts `BarChart` showing current follower count per platform. Static snapshot, not time series.
- **Root cause:** Outstand API `GET /v1/social-accounts/{id}/metrics` likely returns current metrics, not historical time series. The cache stores snapshots but doesn't accumulate historical data points.
- **Potential fix:** Accumulate daily snapshots in `social_analytics_cache` over time (one row per day per account). After enough data accrues, switch to LineChart showing trends. In the meantime, the bar chart is a reasonable adaptation.
- **Complexity:** Medium — requires scheduled cache accumulation (cron or Edge Function) and chart refactor once data exists.

**6. Engagement detail missing post engagement stats**
- **Location:** `src/components/outstand/engagement/EngagementDetail.tsx:39-48`
- **Spec requirement:** Post context section shows "engagement stats (likes, comments, shares)" — completion spec Section 3
- **Current behavior:** Shows caption, date, and platform only. No engagement metrics.
- **Fix:** Pass the original `Post` object to `EngagementDetail` (currently only receives `Comment`). Extract metrics from `Post.socialAccounts[].metrics` or fetch via the existing per-post analytics.
- **Complexity:** Low — requires threading the `Post` object through the component tree or fetching it separately.

#### P3 — Cosmetic / Acceptable Adaptations

**7. Comment/mention classification is approximate**
- **Location:** `src/hooks/outstand/usePostComments.ts:84`
- **Current behavior:** Uses `isReply` (presence of `parentId`) as a proxy for distinguishing "mentions" from "comments." The Outstand API may not distinguish external mentions from threaded replies.
- **Assessment:** Acceptable. The filter UI still provides useful segmentation. True mention detection would require Outstand's mention monitoring API, which may not exist in Phase 1's API surface.

**8. Cache key uses string labels instead of date ranges + migration column type mismatch**
- **Location:** `src/hooks/outstand/useAccountMetrics.ts:58-61` and `supabase/migrations/20260508000000_social_analytics_cache.sql`
- **Current behavior:** `period_start` stores the string "7d", "30d", or "90d" rather than actual ISO date boundaries. The migration defines `period_start` and `period_end` as `text` columns, while the completion spec (Section 4) called for `timestamptz`.
- **Assessment:** The string labels work for deduplication within a session but mean the same "30d" cache row gets reused across days (stale boundary). The `text` vs `timestamptz` column type mismatch compounds Issue #1 — computing prior-period deltas requires actual date boundaries. Both the migration and the hook need updating together when implementing Issue #1.

**9. EngagementCard component not implemented**
- **Location:** `src/components/outstand/engagement/` (missing file)
- **Spec reference:** Phase 1 completion spec Section 3, New Components table lists `EngagementCard` as a required component.
- **Current behavior:** No `EngagementCard.tsx` exists. The mobile card layout is handled directly by `EngagementList.tsx`, which renders inline list items with platform avatars, badges, and preview text.
- **Assessment:** Acceptable deviation. `EngagementList` fulfills the mobile card role that the spec envisioned for `EngagementCard`. The rendering logic is the same, just consolidated into the list component rather than a separate card.

---

## Part 2: Phases 2–4 Scope

### Phase 2: Creator Social Media

**Estimated effort:** ~3–4 weeks
**Goal:** Cross-posting, portfolio analytics, and personal brand growth tools for creators. Reuses Phase 1 OAuth and calendar components — new work is creator-specific UX and the caption rewriter.

#### Deliverables

**2a. Creator account connection**
- **Reuses:** OAuth flow, `ConnectedAccountsList`, `AccountsTab`, `business_outstand_accounts` table (already supports creators via nullable `business_id` — migration `20260507000000`)
- **New work:** Platform list configuration for creator defaults (Instagram, TikTok, YouTube, X). The `PLATFORMS` array in `ConnectedAccountsList.tsx` is already correct for creators. Verify OutstandManager route exists for creator dashboard.
- **Effort:** Minimal — likely already works. Verification only.

**2b. Cross-post on content approval**
- **Reuses:** Post composer API, Edge Function proxy
- **New work:** Campaign approval event triggers a Donny prompt offering cross-post with creator-branded caption.
- **Components needed:**
  - `CrossPostPrompt` — modal/toast component shown when `campaign_applications.status` changes to `approved`. Offers 4 options: Cross-post now / Schedule for later / Customize caption / Skip.
  - Hook into campaign approval flow (likely `useCampaignApplications` or similar existing hook) to trigger the prompt.
  - Auto-populated post with same media as the approved deliverable but creator-branded caption.
- **Data flow:** `campaign_applications.approved_at` → event listener → `CrossPostPrompt` → user action → `POST /v1/posts` via Edge Function proxy using creator's connected accounts.
- **Effort:** Medium — new UI flow + campaign integration point.

**2c. Donny caption rewriter**
- **Reuses:** N/A (no Donny AI integration in Phase 1)
- **New work:** T1/Haiku AI call that rewrites a restaurant caption for the creator's voice and audience.
- **Requires:** Edge Function for AI call (Claude Haiku), voice/tone profile storage (new nullable JSONB field `voice_profile` on `creator_profiles` or a new `social_preferences` table), integration with the cross-post prompt.
- **Blocked by:** Donny AI integration (MCP wiring, model routing). Can be partially shipped with a template-based rewriter (swap hashtags, adjust tone keywords) as a stopgap.
- **Effort:** Medium — AI integration + voice profile data model.

**2d. Creator content calendar**
- **Reuses:** `CalendarTab`, `WeekGrid`, `MonthGrid`, `DayStrip`, `CalendarPostCard` — all reusable as-is.
- **New work:** Add campaign deadline markers to the calendar view. New visual indicator (different color or badge) for campaign-related posts vs. personal posts. Link `campaign_id` on `social_posts` to show campaign context.
- **Effort:** Low — visual enhancement to existing calendar.

**2e. Portfolio analytics (verified)**
- **Reuses:** `useAccountMetrics`, `social_analytics_cache` data
- **New work:** New component on the creator's public profile page showing verified social metrics (followers, engagement rate per platform). Read-only — queries `social_analytics_cache` for the creator's `user_id`.
- **Components needed:**
  - `VerifiedSocialStats` — compact card showing key metrics with "Verified by DragonCandy" badge
  - Display on creator portfolio page and the Browse Creators listing
- **Effort:** Low — data already cached, just needs a new read-only presentation component.

**2f. Verified Creator badge**
- **Reuses:** `business_outstand_accounts` table (connection status)
- **New work:** Badge logic — creator has ≥1 connected account with `status = 'active'` + minimum activity threshold (e.g., ≥1 post via DragonCandy in last 30 days).
- **Components needed:**
  - `VerifiedBadge` — small teal badge with checkmark icon
  - `useVerifiedStatus` hook — queries `business_outstand_accounts` + post count
  - Display on: creator profile card, Browse Creators search results, campaign application views
- **Effort:** Low — simple query + badge component.

**2g. Growth insights**
- **Reuses:** Analytics data from `useAccountMetrics`
- **New work:** Donny T2/Sonnet call analyzing cross-post performance and recommending campaign types to pursue.
- **Blocked by:** Donny AI integration.
- **Donny-lite alternative:** Show basic stats without AI — best-performing content type, best platform, engagement trends. Data already available from `social_analytics_cache` and post metrics.
- **Effort:** Medium (AI version) / Low (stats-only version).

**2h. Standalone posting**
- **Reuses:** `ComposeTab`, `CustomComposeForm` — fully reusable as-is.
- **New work:** Verify the creator dashboard routing includes the OutstandManager page. Creators should be able to access the Social Media Manager to post non-campaign content (behind-the-scenes, portfolio highlights).
- **Effort:** Minimal — verify route exists.

#### Phase 2 Dependency Chain

```
2a (account connection) → 2b (cross-post prompt) → 2c (caption rewriter, Donny-blocked)
2a → 2e (portfolio analytics) → 2f (verified badge)
2a → 2d (calendar enhancements)
2a → 2h (standalone posting — verify only)
2e + post data → 2g (growth insights, Donny-blocked)
```

**Ship without Donny:** 2a, 2b (with template captions), 2d, 2e, 2f, 2h. That's 6 of 8 deliverables.

---

### Phase 3: Brand Social Media

**Estimated effort:** ~3–4 weeks
**Goal:** Sponsorship amplification, cross-party analytics, and brand intelligence. Highest revenue impact phase — sponsorship amplification and ROI reporting are premium features that justify Growth/Pro subscription tiers.

#### Deliverables

**3a. Brand account connection**
- **Reuses:** OAuth flow, `ConnectedAccountsList`, `AccountsTab`
- **New work:** Platform list for brand defaults (LinkedIn, Instagram, TikTok, YouTube). LinkedIn is the main addition — verify Outstand supports LinkedIn OAuth.
- **Effort:** Minimal — same pattern as Phase 2.

**3b. Sponsorship amplification**
- **Reuses:** Post composer, Edge Function proxy
- **New work:** One-tap repost of sponsored content to the brand's channels with Donny-written sponsor copy.
- **Requires:**
  - Hook into `campaign_sponsorships` approval flow
  - Brand voice/guidelines profile (see 3c)
  - Donny T2/Sonnet call for sponsor copy generation with auto-applied `#ad`/`#sponsored` disclosures
  - `AmplificationPrompt` component — shown when sponsored content is approved, offers: Amplify to all channels / Amplify to selected / Customize copy / Skip
- **Blocked by:** Donny AI for smart copy. Can ship with templated sponsor copy as stopgap.
- **Effort:** Medium-High — new flow + Donny integration.

**3c. Brand guidelines enforcement**
- **Reuses:** N/A
- **New work:** Data model + UI for brand voice, required hashtags, mandatory disclosures (#ad, #sponsored), prohibited language.
- **Components needed:**
  - New `brand_guidelines` JSONB column on `business_profiles` (or dedicated table if complex) storing: `voice_description`, `required_hashtags[]`, `mandatory_disclosures[]`, `prohibited_terms[]`
  - `BrandGuidelinesEditor` component in brand Settings page
  - Integration with Donny — guidelines read from profile and applied when drafting/amplifying content
- **Effort:** Medium — data model + settings UI + Donny integration point.

**3d. Cross-party analytics**
- **Reuses:** `useAccountMetrics`, `KpiCards`, analytics components
- **New work:** Aggregate performance across restaurant + creator + brand accounts per sponsorship.
- **Components needed:**
  - `CrossPartyAnalytics` dashboard — shows combined reach, impressions, engagement across all parties for a given sponsorship
  - New hook `useCrossPartyMetrics` — queries `social_analytics_cache` across multiple `user_id`s linked by `campaign_sponsorships`
  - Cost-per-impression calculation from sponsorship budget + combined reach
- **RLS consideration:** Brands need read access to aggregated (not raw) metrics for campaigns they sponsor. Options: (A) Edge Function that computes aggregates server-side and returns only totals, or (B) new `sponsorship_analytics_summary` table populated by a scheduled function.
- **Effort:** High — RLS complexity + multi-user data aggregation.

**3e. Creator vetting by metrics**
- **Reuses:** `social_analytics_cache`, verified badge logic from Phase 2
- **New work:** Enhance the Browse Creators page with real-time social metrics. Filter by engagement rate, audience size, platform strength.
- **Components needed:**
  - `CreatorMetricsBadges` — compact inline display on each creator card showing follower count + engagement rate
  - Filter controls: engagement rate range, minimum followers, platform filter
  - Supabase query joining `creator_profiles` with `social_analytics_cache` (or a materialized view for performance)
- **Depends on:** Phase 2 portfolio analytics (2e) and verified badge (2f) being complete.
- **Effort:** Medium — browse page enhancements + filter logic.

**3f. Donny sponsorship intelligence**
- **Reuses:** N/A
- **New work:** T2/Sonnet cross-campaign pattern analysis — "Which campaigns should I sponsor next?" AI recommendations based on past ROI, trending categories, audience overlap.
- **Blocked by:** Donny AI integration.
- **Effort:** Medium (AI-dependent).

**3g. Sponsorship ROI reports**
- **Reuses:** Analytics data
- **New work:** Per-sponsorship reports with cost-per-impression, engagement rate, audience demographics, "sponsor again?" recommendation.
- **Partially shippable without Donny:** Data aggregation and CPI calculation work without AI. The AI-generated recommendation and demographic analysis require Donny.
- **Components needed:**
  - `SponsorshipReport` page/modal — per-sponsorship breakdown
  - `useSponsorshipROI` hook — aggregates cross-party metrics, calculates CPI, compares against benchmarks
- **Effort:** Medium — data aggregation + report UI.

**3h. Brand content calendar**
- **Reuses:** `CalendarTab` — fully reusable
- **New work:** Add sponsorship timeline markers and brand posting schedule visualization. Same pattern as campaign deadlines in Phase 2.
- **Effort:** Low.

#### Phase 3 Dependency Chain

```
3a (account connection) → 3b (amplification)
3a → 3c (guidelines data model + editor UI)
3b + 3c → guidelines enforcement during amplification
3a → 3h (brand calendar enhancements)
Phase 2 complete → 3e (creator vetting)
3d (cross-party analytics) → 3g (ROI reports)
3b + 3d → 3f (sponsorship intelligence, Donny-blocked)
```

**Ship without Donny:** 3a, 3b (with template copy), 3c (data model + UI, enforcement deferred), 3d, 3e, 3g (data-only, no AI recommendation), 3h. That's 7 of 8 deliverables in reduced form.

---

### Phase 4: Cross-Role & Advanced

**Estimated effort:** ~3–4 weeks
**Goal:** Tie all three roles together at the campaign lifecycle level. Delivers the full vision from the executive summary — Triple Social Hook, Donny Auto-Pilot, UGC detection.

#### Deliverables

**4a. Campaign social hooks (all 5 stages)**
- **Reuses:** Post composer, Edge Function proxy
- **New work:** Social prompts at each campaign lifecycle stage:
  1. **Campaign created** — Donny offers to announce on restaurant's socials ("Looking for creators!")
  2. **Brand sponsors** — Brand announces partnership on LinkedIn
  3. **Creator matched** — Creator shares excitement (optional)
  4. **Content approved** — Triple Social Hook (see 4b)
  5. **Campaign complete** — Aggregate analytics, Donny generates performance summary
- **Components needed:**
  - `CampaignSocialHook` — generic prompt component parameterized by lifecycle stage
  - Event listeners at each stage transition in the campaign flow
  - Stage-specific caption templates (or Donny-generated captions)
- **Effort:** Medium-High — 5 integration points across existing campaign flow.

**4b. Triple-post on content approval**
- **Reuses:** Post composer, multi-platform posting
- **New work:** Simultaneous coordinated posting to restaurant, creator, and brand channels from a single content approval event. Each post customized for the party's voice/audience/platform mix.
- **This is the defining feature of the entire integration.**
- **Requires:**
  - Donny T2/Sonnet for multi-party caption generation (3 versions of same content)
  - Cross-account posting architecture — posting to accounts owned by different users (requires delegated posting permissions, see 4f)
  - Coordination logic — all 3 posts triggered from one event, with individual party opt-in/opt-out
  - Status tracking — unified view of all 3 posts' success/failure
- **Blocked by:** Donny AI integration + delegated posting architecture (4f).
- **Effort:** High — most architecturally complex feature in the integration.

**4c. Donny Auto-Pilot mode**
- **Reuses:** Calendar, scheduling, analytics
- **New work:** Autonomous weekly content plan generation + scheduling + publishing with daily summary digest. Growth+ tier only.
- **Requires:**
  - Donny AI integration (T2/Sonnet for content strategy generation)
  - Scheduled Edge Function (cron) for autonomous posting
  - Content plan data model (weekly plan → daily posts → scheduled via Outstand)
  - Summary notification system (email or in-app digest)
  - Tier gating — only available on Growth+ ($499/mo) subscription
- **Blocked by:** Donny AI integration + subscription tier enforcement.
- **Effort:** High.

**4d. UGC detection & reposting**
- **Reuses:** Post composer, engagement hub
- **New work:** Donny detects when creators tag restaurants on their own channels and offers one-tap reshare to restaurant accounts.
- **Requires:**
  - Mention/tag monitoring via Outstand API (polling `GET /v1/posts/{id}/comments` for mentions, or dedicated mention endpoint if available)
  - `UGCNotification` component — "Creator @foodie123 tagged your restaurant! Reshare?"
  - Reshare flow using the restaurant's connected accounts
- **Blocked by:** Outstand API mention monitoring capability.
- **Effort:** Medium.

**4e. Unified cross-role analytics**
- **Reuses:** `useAccountMetrics`, analytics components, Phase 3's `CrossPartyAnalytics`
- **New work:** Combined dashboard showing campaign social performance across all parties — the "265K combined reach" view from the PDF.
- **Extends:** Phase 3's cross-party analytics (3d) with a unified dashboard that aggregates across all campaigns, not just per-sponsorship.
- **Effort:** Medium — dashboard composition, largely reusing existing components.

**4f. Delegated posting architecture**
- **Reuses:** Edge Function proxy, `business_outstand_accounts`
- **New work:** Permission model for posting to another user's connected accounts.
- **Components needed:**
  - New `social_posting_permissions` table:
    ```
    granter_id (uuid) — user who owns the account
    grantee_id (uuid) — user who can post to it
    outstand_account_id (text) — specific account granted
    permission_level ('post' | 'schedule' | 'full')
    granted_at, expires_at, revoked_at
    ```
  - RLS policies: granters manage their own grants, grantees can read their permissions
  - Edge Function proxy update: allow posting to accounts where the caller has a valid grant
  - UI for managing permissions (grant/revoke in Settings)
- **Prerequisite for:** Triple Social Hook (4b).
- **Effort:** Medium-High — new table, RLS, proxy changes, permission UI.

**4g. Donny weekly content planner**
- **Reuses:** Calendar
- **New work:** AI generates a full week of content based on menu, events, trends, past performance data.
- **Blocked by:** Donny AI integration.
- **Effort:** Medium (AI-dependent).

**4h. Performance-based recommendations**
- **Reuses:** Analytics data
- **New work:** Donny uses historical data to recommend optimal posting strategies per role, content type, and platform.
- **Blocked by:** Donny AI integration.
- **Effort:** Medium (AI-dependent).

#### Phase 4 Dependency Chain

```
4f (delegated posting) → 4b (Triple Social Hook) → 4a (campaign hooks stage 4)
4a stages 1-3,5 can ship independently
Phase 3 (3d) → 4e (unified cross-role analytics)
Donny AI → 4c (Auto-Pilot), 4g (content planner), 4h (recommendations)
Outstand mention API → 4d (UGC detection)
```

**Ship without Donny:** 4a (stages 1-3,5 with template prompts), 4d (with basic mention monitoring), 4e, 4f. That's 4 of 8 deliverables. The Triple Social Hook (4b) can partially ship with template captions but requires delegated posting architecture (4f) regardless.

---

## Cross-Phase Dependencies

```
Phase 1 (Complete) ─── Foundation: OAuth, posting, analytics, proxy, calendar
    │
    └── Phase 1 Fixes (P1 issues) ─── Deltas, top posts sorting, unreplied sorting
            │
            ├── Phase 2 (Creator) ─── Cross-post prompt, verified badge, portfolio analytics
            │       │
            │       └── Donny AI Integration ← BLOCKER for caption rewriter, growth insights
            │
            ├── Phase 3 (Brand) ─── Sponsorship amplification, cross-party analytics, creator vetting
            │       │
            │       ├── Depends on Phase 2 (verified badge, creator metrics)
            │       └── Donny AI Integration ← BLOCKER for sponsorship intelligence, ROI reports
            │
            └── Phase 4 (Cross-Role) ─── Campaign hooks, Triple Social Hook, Auto-Pilot
                    │
                    ├── Depends on Phases 2 + 3
                    ├── Delegated posting architecture ← NEW infrastructure (prerequisite for Triple Hook)
                    └── Donny AI Integration ← BLOCKER for Auto-Pilot, content planner, recommendations
```

### Donny AI: The Biggest Dependency

Approximately 40% of Phase 2–4 deliverables depend on Donny AI integration (MCP wiring, model routing, Edge Function AI calls). The Phase 1 completion spec explicitly deferred this. Features affected:

| Phase | Feature | AI Tier | Donny-Lite Alternative |
|-------|---------|---------|----------------------|
| 2 | Caption rewriter | T1/Haiku | Template-based tone swaps |
| 2 | Growth insights | T2/Sonnet | Basic stats display |
| 3 | Sponsorship amplification copy | T2/Sonnet | Template sponsor copy |
| 3 | Sponsorship intelligence | T2/Sonnet | None — fully AI-dependent |
| 3 | ROI report recommendation | T2/Sonnet | Data-only report, no recommendation |
| 4 | Triple Social Hook captions | T2/Sonnet | Template per-role captions |
| 4 | Auto-Pilot | T2/Sonnet | None — fully AI-dependent |
| 4 | Weekly content planner | T2/Sonnet | None — fully AI-dependent |
| 4 | Performance recommendations | T2/Sonnet | None — fully AI-dependent |

**Recommendation:** Ship Donny-lite versions of Phase 2–3 features to unblock the UI and data layer, then layer in AI when Donny integration lands. Phase 4's Auto-Pilot and content planner are fully blocked and should wait.

---

## Recommended Execution Order

1. **Fix Phase 1 P1 issues** (1–2 days) — analytics deltas, top posts ranking, engagement sorting
2. **Phase 2 non-Donny deliverables** (~2 weeks) — 2a verification, 2b cross-post prompt with templates, 2d calendar enhancements, 2e portfolio analytics, 2f verified badge, 2h standalone posting verification
3. **Donny AI integration** (parallel workstream) — MCP wiring, model routing, Edge Function AI calls
4. **Phase 2 Donny features** (~1 week after Donny lands) — 2c caption rewriter, 2g growth insights
5. **Phase 3** (~3 weeks) — brand connection, amplification, guidelines, cross-party analytics, creator vetting, ROI reports
6. **Phase 4** (~3–4 weeks) — delegated posting architecture first, then campaign hooks, Triple Social Hook, advanced features

---

## Files Referenced in This Audit

### Phase 1 Components Audited

| File | Status |
|------|--------|
| `src/pages/OutstandManager.tsx` | Pass |
| `src/components/outstand/CalendarTab.tsx` | Pass |
| `src/components/outstand/calendar/WeekGrid.tsx` | Pass |
| `src/components/outstand/calendar/MonthGrid.tsx` | Pass |
| `src/components/outstand/calendar/DayStrip.tsx` | Pass |
| `src/components/outstand/calendar/CalendarPostCard.tsx` | Pass |
| `src/components/outstand/EngagementTab.tsx` | Issue #3 |
| `src/components/outstand/engagement/EngagementList.tsx` | Pass |
| `src/components/outstand/engagement/EngagementDetail.tsx` | Issue #6 |
| `src/components/outstand/engagement/ReplySheet.tsx` | Pass |
| `src/components/outstand/AnalyticsTab.tsx` | Issue #4 |
| `src/components/outstand/analytics/KpiCards.tsx` | Pass (dependent on Issue #1) |
| `src/components/outstand/analytics/FollowerChart.tsx` | Issue #5 |
| `src/components/outstand/analytics/PostingHeatmap.tsx` | Pass |
| `src/components/outstand/analytics/TopPosts.tsx` | Issue #2 |
| `src/components/outstand/analytics/PlatformBreakdown.tsx` | Pass |
| `src/components/outstand/ConnectedAccountsList.tsx` | Pass |
| `src/hooks/outstand/useAccountMetrics.ts` | Issue #1, #8 |
| `src/hooks/outstand/usePostComments.ts` | Issue #7 |
| `src/components/settings/BusinessSettingsSections.tsx` | Pass |
| `src/components/settings/CreatorSettingsSections.tsx` | Pass |
| `supabase/functions/outstand-proxy/index.ts` | Pass |
| `supabase/migrations/20260508000000_social_analytics_cache.sql` | Pass |
