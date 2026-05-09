# Outstand.so Social Media Integration — Gap Analysis & Phase 2–4 Readiness

**Date:** May 8, 2026
**Status:** Approved Design — Ready for Implementation Planning
**Parent Spec:** [Outstand Social Media Integration Strategy](2026-05-03-outstand-social-media-integration-design.md)
**Phase 1 Completion Spec:** [Phase 1 Completion Design](2026-05-08-outstand-phase1-completion-design.md)
**Phase 1 Audit:** [Phase 1 Audit & Phases 2–4 Scope](2026-05-08-outstand-phase1-audit-and-phases2-4-scope.md)
**Source Document:** DragonCandy x Outstand.so Social Media Integration Strategy (PDF, v1.0, May 3, 2026)

---

## Executive Summary

Phase 1 (Restaurant Social Media) is complete and verified. All 6 tabs — Compose, Calendar, Published, Engagement, Analytics, Accounts — are built with responsive desktop and mobile layouts. The Edge Function proxy, OAuth flow, analytics caching layer, and data hooks are operational. Five audit issues were fixed and verified via build (`npm run build` passes clean). Two low-priority items (engagement/reach/posts deltas, follower trend chart) are deferred — both require historical data accumulation over time before they become meaningful.

This document maps the remaining 24 deliverables across Phases 2–4 against the PDF strategy doc, with desktop/mobile readiness, Donny AI dependency status, and recommended execution order.

**Key finding:** 17 of 24 deliverables can ship without Donny AI. 4 are fully blocked with no stopgap (3f, 4c, 4g, 4h). The remaining 3 have viable template-based alternatives (2c, 2g, 4b — though 4b also requires the delegated posting architecture from 4f). The single largest infrastructure gap is the delegated posting architecture (Phase 4), which is a prerequisite for the Triple Social Hook — the PDF's defining feature.

---

## Phase 1: Verified Status

### Fixes Verified (Build Clean)

| Issue | Fix | Status |
|-------|-----|--------|
| #1 Analytics deltas | `followersDelta` computed via `computeDelta()` from prior-period cache | **Partial — acceptable.** Engagement/reach/posts deltas need historical accumulation (deferred) |
| #2 Top Posts ranking | Sorted by published account count (best proxy — engagement metrics not on Post object) | **Pass** |
| #3 Engagement sorting | Unreplied items sort to top via `aReplied ? 1 : -1` comparator | **Pass** |
| #4 Platform filter pills | Added alongside time range selector in AnalyticsTab | **Pass** |
| #6 Engagement detail stats | Likes, comments, shares displayed from `postAnalytics.aggregated_metrics` | **Pass** |

### Deferred Items (Low Priority)

**A. Analytics deltas for engagement/reach/posts** — Outstand API returns current metrics, not historical time series. `followersDelta` works because follower count is a single-point metric comparable period-over-period. Engagement rate and reach are aggregate metrics that shift with each post — they need daily accumulation via a scheduled Edge Function cron before deltas become meaningful. Deferred to Phase 2 or later.

**B. Follower chart (bars vs. trend line)** — Same root cause. The bar chart showing current followers per platform is the correct adaptation. Once the cron accumulates daily snapshots in `social_analytics_cache`, the `BarChart` can swap to a `LineChart`.

---

## Phase 2: Creator Social Media

**Estimated effort:** ~3–4 weeks
**Goal:** Cross-posting, portfolio analytics, and personal brand growth tools for creators. Reuses Phase 1 OAuth and calendar components — new work is creator-specific UX and the caption rewriter.
**PDF reference:** Section 2 (Creator Role), The Creator Flywheel (Fig 4), Campaign Content to Personal Brand Growth (Fig 5)

### Deliverables

#### 2a. Creator account connection

- **Desktop:** Reuse `ConnectedAccountsList` — platform list already correct for creators (Instagram, TikTok, YouTube, X)
- **Mobile:** Reuse (already responsive)
- **Status:** Verify only — `business_outstand_accounts` table supports creators via nullable `business_id` (migration `20260507000000`). Confirm OutstandManager route exists in creator dashboard.
- **Effort:** Minimal
- **Donny-blocked:** No

#### 2b. Cross-post on content approval

- **Desktop:** New `CrossPostPrompt` modal — 4 options (Cross-post now / Schedule for later / Customize caption / Skip). Shows media preview + auto-generated creator-branded caption.
- **Mobile:** Bottom sheet variant of same prompt
- **Status:** Not built. Requires event listener on `campaign_applications.status` change to `approved`. Auto-populated post with same media as approved deliverable but creator-branded caption.
- **Data flow:** `campaign_applications.approved_at` → event listener → `CrossPostPrompt` → user action → `POST /v1/posts` via Edge Function proxy using creator's connected accounts
- **Effort:** Medium
- **Donny-blocked:** No (template captions as stopgap)

#### 2c. Donny caption rewriter

- **Desktop:** Inline in cross-post prompt — AI-rewritten caption preview with edit capability
- **Mobile:** Same
- **Status:** Not built. T1/Haiku AI call rewrites restaurant caption for creator's voice. Needs `voice_profile` JSONB field on `creator_profiles` or a new `social_preferences` table.
- **Effort:** Medium
- **Donny-blocked:** Yes (template tone-swap as stopgap — swap hashtags, adjust tone keywords)

#### 2d. Creator content calendar

- **Desktop:** Reuse `CalendarTab` — add campaign deadline markers in different color (e.g., pink for campaign deadlines vs. teal for scheduled posts). Link `campaign_id` on posts to show campaign context.
- **Mobile:** Reuse `DayStrip` — same markers
- **Status:** Not built. Visual enhancement only.
- **Effort:** Low
- **Donny-blocked:** No

#### 2e. Portfolio analytics (verified)

- **Desktop:** New `VerifiedSocialStats` card on creator profile page — compact metrics display (followers, engagement rate per platform) with "Verified by DragonCandy" badge
- **Mobile:** Stacked layout of same card
- **Status:** Not built. Read-only component querying `social_analytics_cache` for the creator's `user_id`. Data layer already exists.
- **Display locations:** Creator portfolio page, Browse Creators listing
- **Effort:** Low
- **Donny-blocked:** No

#### 2f. Verified Creator badge

- **Desktop:** `VerifiedBadge` component — small teal badge with checkmark icon
- **Mobile:** Same (badge is inline)
- **Status:** Not built. `useVerifiedStatus` hook checks `business_outstand_accounts` connection status + minimum activity threshold (≥1 connected account with `status = 'active'` + ≥1 post via DragonCandy in last 30 days).
- **Display locations:** Creator profile card, Browse Creators search results, campaign application views
- **Effort:** Low
- **Donny-blocked:** No

#### 2g. Growth insights

- **Desktop:** Dashboard section — best-performing content type, best platform, engagement trends
- **Mobile:** Stacked cards
- **Status:** Not built. Donny T2/Sonnet version (cross-post performance analysis + campaign recommendations) fully blocked. Donny-lite version (basic stats from existing `social_analytics_cache` + post metrics) is shippable.
- **Effort:** Medium (AI) / Low (stats-only)
- **Donny-blocked:** Yes (stats-only as stopgap)

#### 2h. Standalone posting

- **Desktop:** Reuse `ComposeTab` + `CustomComposeForm` as-is
- **Mobile:** Reuse (already responsive)
- **Status:** Verify only — confirm creator dashboard routing includes OutstandManager
- **Effort:** Minimal
- **Donny-blocked:** No

### Phase 2 Dependency Chain

```
2a (account connection) → 2b (cross-post prompt) → 2c (caption rewriter, Donny-blocked)
2a → 2e (portfolio analytics) → 2f (verified badge)
2a → 2d (calendar enhancements)
2a → 2h (standalone posting — verify only)
2e + post data → 2g (growth insights, Donny-blocked)
```

### Phase 2 Ship-Without-Donny

6 of 8 deliverables: 2a, 2b (template captions), 2d, 2e, 2f, 2h. Estimated ~2 weeks.

---

## Phase 3: Brand Social Media

**Estimated effort:** ~3–4 weeks
**Goal:** Sponsorship amplification, cross-party analytics, and brand intelligence. Highest revenue impact phase — sponsorship amplification and ROI reporting justify Growth/Pro subscription tiers.
**PDF reference:** Section 3 (Brand Role), The Brand Multiplier Effect (Fig 6), Sponsorship Lifecycle (Fig 7)

### Deliverables

#### 3a. Brand account connection

- **Desktop:** Reuse `ConnectedAccountsList` — platform list configured for LinkedIn, Instagram, TikTok, YouTube
- **Mobile:** Reuse (already responsive)
- **Status:** Verify only. LinkedIn is the main addition — verify Outstand supports LinkedIn OAuth.
- **Effort:** Minimal
- **Donny-blocked:** No

#### 3b. Sponsorship amplification

- **Desktop:** New `AmplificationPrompt` modal — shown when sponsored content approved. Options: Amplify to all channels / Amplify to selected / Customize copy / Skip
- **Mobile:** Bottom sheet variant
- **Status:** Not built. Hooks into `campaign_sponsorships` approval flow. Donny T2/Sonnet generates sponsor copy with auto-applied `#ad`/`#sponsored` disclosures.
- **Effort:** Medium-High
- **Donny-blocked:** Yes (template sponsor copy as stopgap)

#### 3c. Brand guidelines enforcement

- **Desktop:** New `BrandGuidelinesEditor` component in brand Settings page — fields for voice description, required hashtags, mandatory disclosures, prohibited terms
- **Mobile:** Stacked form layout
- **Status:** Not built. New `brand_guidelines` JSONB column on `business_profiles` (or dedicated table). Data model + UI can ship without Donny; enforcement during content generation requires it.
- **Effort:** Medium
- **Donny-blocked:** Partially (data model ships, enforcement blocked)

#### 3d. Cross-party analytics

- **Desktop:** New `CrossPartyAnalytics` dashboard — combined reach, impressions, engagement across restaurant + creator + brand per sponsorship. Cost-per-impression calculation.
- **Mobile:** Stacked KPI cards + scrollable breakdown
- **Status:** Not built. Most architecturally complex in Phase 3.
- **RLS challenge:** Brands need aggregated (not raw) metrics for campaigns they sponsor. Two options:
  - **Option A:** Edge Function computes aggregates server-side, returns only totals. Simpler to implement.
  - **Option B:** `sponsorship_analytics_summary` table populated by scheduled function. Scales better.
- **Components needed:** `CrossPartyAnalytics` dashboard, `useCrossPartyMetrics` hook
- **Effort:** High
- **Donny-blocked:** No

#### 3e. Creator vetting by metrics

- **Desktop:** Enhanced Browse Creators page — `CreatorMetricsBadges` inline on each card (follower count + engagement rate). Filter controls for engagement rate range, minimum followers, platform.
- **Mobile:** Vertical filter drawer + same badge display
- **Status:** Not built. Joins `creator_profiles` with `social_analytics_cache`. May need materialized view for performance at scale.
- **Depends on:** Phase 2 portfolio analytics (2e) and verified badge (2f)
- **Effort:** Medium
- **Donny-blocked:** No

#### 3f. Donny sponsorship intelligence

- **Desktop/Mobile:** "Which campaigns should I sponsor next?" — AI recommendations
- **Status:** Not built. T2/Sonnet cross-campaign pattern analysis and audience overlap calculation.
- **Effort:** Medium
- **Donny-blocked:** Yes — fully dependent, no viable stopgap

#### 3g. Sponsorship ROI reports

- **Desktop:** New `SponsorshipReport` page/modal — per-sponsorship cost-per-impression, reach, engagement rate, demographics, "sponsor again?" recommendation
- **Mobile:** Scrollable report card
- **Status:** Not built. Data aggregation + CPI calculation work without Donny. AI-generated recommendation and demographic analysis require it.
- **Components needed:** `SponsorshipReport`, `useSponsorshipROI` hook
- **Effort:** Medium
- **Donny-blocked:** Partially (data report ships, AI recommendation blocked)

#### 3h. Brand content calendar

- **Desktop:** Reuse `CalendarTab` — add sponsorship timeline markers and brand posting schedule
- **Mobile:** Reuse `DayStrip` — same markers
- **Status:** Not built. Same pattern as campaign deadlines in Phase 2.
- **Effort:** Low
- **Donny-blocked:** No

### Phase 3 Dependency Chain

```
3a (account connection) → 3b (amplification)
3a → 3c (guidelines data model + editor UI)
3b + 3c → guidelines enforcement during amplification
3a → 3h (brand calendar enhancements)
Phase 2 complete → 3e (creator vetting)
3d (cross-party analytics) → 3g (ROI reports)
3b + 3d → 3f (sponsorship intelligence, Donny-blocked)
```

### Phase 3 Ship-Without-Donny

7 of 8 deliverables in reduced form: 3a, 3b (template copy), 3c (data model + UI, enforcement deferred), 3d, 3e, 3g (data-only, no AI recommendation), 3h. Only 3f (sponsorship intelligence) is fully blocked.

---

## Phase 4: Cross-Role & Advanced

**Estimated effort:** ~3–4 weeks
**Goal:** Tie all three roles together at the campaign lifecycle level. Delivers the full vision — Triple Social Hook, Donny Auto-Pilot, UGC detection.
**PDF reference:** Campaign Lifecycle with Social Hooks (Fig 8), Section 4 (Donny AI), Section 6 (Implementation Phases)

### Deliverables

#### 4a. Campaign social hooks (all 5 stages)

- **Desktop:** `CampaignSocialHook` — generic prompt component parameterized by lifecycle stage. 5 integration points across the campaign flow.
- **Mobile:** Bottom sheet variant at each stage
- **Status:** Not built. Stages:
  1. Campaign created → announce on restaurant's socials
  2. Brand sponsors → LinkedIn partnership announcement
  3. Creator matched → share excitement (optional, creator's choice)
  4. Content approved → Triple Social Hook (see 4b)
  5. Campaign complete → aggregate analytics + Donny performance summary
- **Effort:** Medium-High (5 integration points)
- **Donny-blocked:** Partially (stages 1–3,5 ship with template captions; stage 4 depends on 4b)

#### 4b. Triple-post on content approval

- **Desktop:** Coordinated posting UI — 3 party post previews side-by-side with individual opt-in/opt-out toggles. Status tracking for all 3 posts.
- **Mobile:** Stacked card preview with party toggles
- **Status:** Not built. **Most architecturally complex feature in the entire integration.** Requires:
  1. Donny T2/Sonnet for 3 caption variants (restaurant voice, creator voice, brand voice)
  2. Delegated posting architecture (4f) — posting to accounts owned by different users
  3. Cross-account coordination logic — all 3 posts triggered from one event
  4. Unified success/failure tracking
- **Effort:** High
- **Donny-blocked:** Yes + blocked by 4f (delegated posting)

#### 4c. Donny Auto-Pilot mode

- **Desktop:** Settings toggle + weekly content plan view in Calendar. Daily summary digest.
- **Mobile:** Same with simplified plan view
- **Status:** Not built. Needs: scheduled Edge Function cron, content plan data model, summary notification system, subscription tier enforcement (Growth+ $499/mo only).
- **Effort:** High
- **Donny-blocked:** Yes — fully dependent, no viable stopgap

#### 4d. UGC detection & reposting

- **Desktop:** `UGCNotification` component — "Creator @foodie123 tagged your restaurant! Reshare?" Integrates with Engagement Hub.
- **Mobile:** Push notification + bottom sheet
- **Status:** Not built. Mention/tag monitoring via Outstand API. Reshare flow using restaurant's connected accounts.
- **Effort:** Medium
- **Donny-blocked:** No (but Outstand API mention monitoring endpoint must exist)

#### 4e. Unified cross-role analytics

- **Desktop:** Combined dashboard — the "265K combined reach" view from the PDF. Aggregates across ALL campaigns.
- **Mobile:** Scrollable summary cards
- **Status:** Not built. Extends Phase 3's cross-party analytics (3d) with multi-campaign aggregation.
- **Effort:** Medium
- **Donny-blocked:** No

#### 4f. Delegated posting architecture

- **Desktop:** Permission management UI in Settings — grant/revoke posting access to specific accounts
- **Mobile:** Same
- **Status:** Not built. **Prerequisite for Triple Social Hook (4b).** New infrastructure:
  - `social_posting_permissions` table: `granter_id`, `grantee_id`, `outstand_account_id`, `permission_level` ('post' | 'schedule' | 'full'), `granted_at`, `expires_at`, `revoked_at`
  - RLS policies: granters manage own grants, grantees read their permissions
  - Edge Function proxy update: allow posting to accounts where caller has valid grant
  - Permission management UI
- **Effort:** Medium-High
- **Donny-blocked:** No

#### 4g. Donny weekly content planner

- **Desktop/Mobile:** Calendar integration — AI generates full week of content
- **Status:** Not built. Fully Donny-dependent, no viable stopgap. Feeds into Auto-Pilot (4c).
- **Effort:** Medium
- **Donny-blocked:** Yes — fully dependent, no viable stopgap

#### 4h. Performance-based recommendations

- **Desktop/Mobile:** Optimal posting strategies per role, content type, platform
- **Status:** Not built. Historical data analysis. Fully Donny-dependent.
- **Effort:** Medium
- **Donny-blocked:** Yes — fully dependent, no viable stopgap

### Phase 4 Dependency Chain

```
4f (delegated posting) → 4b (Triple Social Hook) → 4a stage 4
4a stages 1-3,5 can ship independently
Phase 3 (3d) → 4e (unified cross-role analytics)
Donny AI → 4c (Auto-Pilot), 4g (content planner), 4h (recommendations)
Outstand mention API → 4d (UGC detection)
```

### Phase 4 Ship-Without-Donny

4 of 8 deliverables ship without Donny: 4a (stages 1–3,5 with templates), 4d (basic mention monitoring), 4e, 4f. The Triple Social Hook (4b) has a template-caption stopgap for the AI dependency but is also blocked by the delegated posting architecture (4f) — it requires both. 3 deliverables (4c, 4g, 4h) are fully Donny-dependent with no viable stopgap.

---

## Cross-Phase Summary

| Phase | Total | Ship Without Donny (full or reduced) | Fully Donny-Blocked (no stopgap) | New Infrastructure Required |
|-------|-------|--------------------------------------|--------------------------------|---------------------------|
| 1 (Restaurant) | Complete | N/A | N/A | Done |
| 2 (Creator) | 8 | 6 (2c, 2g have template stopgaps) | 0 | Cross-post prompt, verified badge |
| 3 (Brand) | 8 | 7 reduced (3b template copy, 3c data-only, 3g data-only) | 1 (3f) | Cross-party analytics RLS, brand guidelines |
| 4 (Cross-Role) | 8 | 4 (4a partial, 4d, 4e, 4f) + 4b has template stopgap but also needs 4f | 3 (4c, 4g, 4h) | Delegated posting permissions |
| **Total** | **24** | **17 in full or reduced form** | **4** | — |

### Donny AI: The Biggest Dependency

~40% of Phase 2–4 deliverables depend on Donny AI integration (MCP wiring, model routing, Edge Function AI calls). Features affected:

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

### Biggest Risks

1. **Delegated posting architecture (4f)** — New cross-user posting permissions. Security-critical surface. Must be solid before Triple Social Hook.
2. **Cross-party analytics RLS (3d)** — Aggregating metrics across multiple users. Current RLS is per-user isolation. Needs server-side computation pattern.
3. **Donny AI integration** — Blocks 5 deliverables outright (no stopgap) and reduces 4 more. Phase 4 is where this dependency becomes acute.
4. **Outstand API capabilities** — UGC detection (4d) depends on mention monitoring endpoint. Follower trend charts depend on historical time-series data. Engagement-based post ranking depends on per-post metrics availability.

---

## Recommended Execution Order

1. **Phase 2 non-Donny deliverables** (~2 weeks) — 2a verification, 2b cross-post prompt with templates, 2d calendar enhancements, 2e portfolio analytics, 2f verified badge, 2h standalone posting verification
2. **Donny AI integration** (parallel workstream) — MCP wiring, model routing, Edge Function AI calls
3. **Phase 2 Donny features** (~1 week after Donny lands) — 2c caption rewriter, 2g growth insights
4. **Phase 3** (~3 weeks) — brand connection, amplification, guidelines, cross-party analytics, creator vetting, ROI reports
5. **Phase 4** (~3–4 weeks) — delegated posting architecture first, then campaign hooks, Triple Social Hook, advanced features

**Total estimated timeline:** ~13–16 weeks for all 24 deliverables, assuming Donny AI integration runs in parallel with Phase 2.

---

## Files Referenced

### Phase 1 Infrastructure (Reused by Phases 2–4)

| Component | Path | Reused By |
|-----------|------|-----------|
| OutstandManager | `src/pages/OutstandManager.tsx` | All phases |
| OAuth callback | `src/pages/OutstandOAuthCallbackPage.tsx` | All phases |
| ConnectedAccountsList | `src/components/outstand/ConnectedAccountsList.tsx` | 2a, 3a |
| AccountsTab | `src/components/outstand/AccountsTab.tsx` | 2a, 3a |
| ComposeTab | `src/components/outstand/ComposeTab.tsx` | 2h |
| CustomComposeForm | `src/components/outstand/CustomComposeForm.tsx` | 2b, 3b |
| CalendarTab | `src/components/outstand/CalendarTab.tsx` | 2d, 3h |
| AnalyticsTab | `src/components/outstand/AnalyticsTab.tsx` | 2e, 3d, 4e |
| EngagementTab | `src/components/outstand/EngagementTab.tsx` | 4d |
| useAccountMetrics | `src/hooks/outstand/useAccountMetrics.ts` | 2e, 2g, 3d, 3e, 4e |
| Edge Function proxy | `supabase/functions/outstand-proxy/index.ts` | All phases |
| Outstand Provider | `src/integrations/outstand/Provider.tsx` | All phases |
| Account links table | `supabase/migrations/20260506140000_outstand_account_links.sql` | All phases |
| Analytics cache | `supabase/migrations/20260508000000_social_analytics_cache.sql` | 2e, 2g, 3d, 3e, 4e |

### New Components Needed (Phases 2–4)

| Component | Phase | Type |
|-----------|-------|------|
| `CrossPostPrompt` | 2b | Modal / Bottom sheet |
| `VerifiedSocialStats` | 2e | Card |
| `VerifiedBadge` | 2f | Inline badge |
| `useVerifiedStatus` | 2f | Hook |
| `AmplificationPrompt` | 3b | Modal / Bottom sheet |
| `BrandGuidelinesEditor` | 3c | Settings form |
| `CrossPartyAnalytics` | 3d | Dashboard |
| `useCrossPartyMetrics` | 3d | Hook |
| `CreatorMetricsBadges` | 3e | Inline badge |
| `SponsorshipReport` | 3g | Page / Modal |
| `useSponsorshipROI` | 3g | Hook |
| `CampaignSocialHook` | 4a | Generic prompt |
| `UGCNotification` | 4d | Notification / Sheet |
| `social_posting_permissions` table | 4f | Migration |

### New Database Objects Needed

| Object | Phase | Purpose |
|--------|-------|---------|
| `voice_profile` JSONB on `creator_profiles` | 2c | Creator voice/tone for caption rewriting |
| `brand_guidelines` JSONB on `business_profiles` | 3c | Brand voice, required hashtags, disclosures |
| `sponsorship_analytics_summary` table (or Edge Function) | 3d | Cross-party aggregated metrics |
| `social_posting_permissions` table | 4f | Delegated posting grants |
