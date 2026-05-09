# Phase 3: Brand Social Media — Design Spec

**Date:** 2026-05-09
**Status:** Approved Design
**Approach:** Clone-and-Configure (Approach A)
**Estimated Duration:** 3–4 weeks
**Prerequisites:** Phase 1 (Restaurant) and Phase 2 (Creator) complete

---

## Overview

Phase 3 brings sponsorship amplification, cross-party analytics, and brand intelligence to the Brand role. Per the Outstand.so Social Media Integration Strategy, this is the highest revenue impact phase — sponsorship amplification and ROI reporting directly justify the Growth/Pro subscription tiers ($499–$999/mo).

The approach reuses the existing `OutstandManager` component and its 6-tab UI (Compose, Calendar, Published, Engagement, Analytics, Accounts) as-is for brands. Brand-specific features are additive components layered on top, not rewrites of existing code. This protects the working Phase 1-2 codebase.

**What this deletes:** The need to build a separate posting, calendar, and analytics stack for brands.
**What this simplifies:** One manager component serves all three roles.
**What it automates:** Sponsorship amplification triggers at content approval.
**Keystrokes removed:** Brand connects accounts once, then amplifies sponsored content in one tap.

---

## Deliverables

| # | Deliverable | Type | Donny-Dependent |
|---|-------------|------|-----------------|
| 3a | Brand Social Route & Dashboard Integration | Frontend (wiring) | No |
| 3b | Sponsorship Amplification Prompt | Frontend + Backend | Partial (caption AI stubbed) |
| 3c | Brand Guidelines Editor | Frontend + DB migration | No |
| 3d | Cross-Party Analytics | Frontend + Backend | Partial (ROI narrative stubbed) |
| 3e | Creator Vetting by Verified Metrics | Frontend | No |
| 3f | Brand Content Calendar (sponsorship markers) | Frontend | No |
| 3g | Donny Sponsorship Intelligence | — | Yes (fully stubbed) |
| 3h | Sponsorship ROI Reports | Frontend | Partial (narrative stubbed) |

Deliverables 3g is fully Donny-blocked and will be stubbed with placeholder UI. Deliverables 3b, 3d, and 3h have AI-generated content stubbed with templates until MCP ships.

---

## 3a: Brand Social Route & Dashboard Integration

### Route

- **Path:** `/dashboard/brand/social`
- **Component:** Existing `OutstandManager` (same component used by restaurant and creator)
- **Guard:** `BrandRoute` wrapper (same pattern as `/dashboard/business/social` uses `BusinessRoute`)
- **OAuth callback:** `/dashboard/brand/social/oauth-callback` renders existing `OutstandOAuthCallbackPage`

### Dashboard Entry Point

A new Social Media entry on `BrandDashboard.tsx`. The current `QuickActionButtons` component accepts a fixed two-item tuple, so the Social Media card is added as a separate card below the existing quick actions (not inside the tuple):
- Title: "Social Media"
- Description: "Manage your brand's social presence, amplify sponsored content"
- Style: Teal border, consistent with existing quick action card styling
- Links to `/dashboard/brand/social`

### Platform Priorities

Per the strategy doc, brand primary platforms: LinkedIn, Instagram, TikTok, YouTube. Secondary: Facebook, X. The `ConnectAccountButtonGroup` already supports all of these — no changes needed.

### Navigation

No changes to bottom nav. Brand users access social through their dashboard quick action card.

---

## 3b: Sponsorship Amplification Prompt

### Trigger Points

1. **Campaign detail view:** When content is approved on a campaign the brand sponsors, an inline card shows the approved deliverable with an "Amplify to Your Channels" button.
2. **Social manager:** Pending amplifications surface as a notification/card within the brand's social manager.

### Component: `SponsorshipAmplificationPrompt`

- **Desktop:** Modal dialog (consistent with `CrossPostPrompt`)
- **Mobile:** Bottom sheet (consistent with `CrossPostPrompt`)

### Content

- Preview of the approved content (thumbnail + caption)
- Platform selection checkboxes (pre-checked based on brand's connected accounts)
- Auto-generated sponsor copy with brand guidelines applied:
  - Template (until Donny MCP): "We're proud to partner with [Restaurant] and [Creator]! [default_cta] [required_hashtags] [mandatory_disclosures]"
  - Required hashtags from brand guidelines auto-appended
  - Mandatory disclosures (#ad, #sponsored) auto-inserted
  - Voice tone noted but not AI-enforced until Donny ships
- Prohibited words check: if caption contains any prohibited words from guidelines, highlight and block publish

### Actions

| Action | Behavior | Tier |
|--------|----------|------|
| Amplify Now (all platforms) | Posts to all selected platforms simultaneously | DragonDash Rush ($25–50) if 3+ platforms |
| Amplify Now (single) | Posts to one selected platform | Standard (Starter+) |
| Schedule | Queue for optimal time per platform | Standard (Starter+) |
| Edit Caption | Opens compose form with pre-filled caption | Free |
| Skip | Dismisses prompt | Free |

### Data Flow

1. Read `campaign_sponsorships` WHERE `brand_id` = current user
2. Join `campaign_applications` WHERE `status` = 'accepted' AND `campaign_id` matches
3. Read `business_outstand_accounts` for brand's connected platforms
4. Read `business_profiles.brand_social_guidelines` for auto-applied guidelines
5. Post via existing Edge Function proxy (`outstand-proxy`)

---

## 3c: Brand Guidelines Editor

### Storage

New nullable JSONB column on `business_profiles`:

```sql
ALTER TABLE business_profiles
ADD COLUMN brand_social_guidelines JSONB DEFAULT NULL;
```

### Schema

```typescript
interface BrandSocialGuidelines {
  voice_tone: string;
  required_hashtags: string[];
  mandatory_disclosures: string[];
  prohibited_words: string[];
  default_cta: string;
}
```

### Component: `BrandGuidelinesEditor`

- **Location:** Brand social manager's Accounts tab, new section below connected accounts list
- **Desktop:** Inline form, full-width card with teal border
- **Mobile:** Same form, stacked vertically, full-width inputs

### Form Fields

| Field | Input Type | Placeholder |
|-------|-----------|-------------|
| Voice & Tone | Text input | "Professional but approachable" |
| Required Hashtags | Tag chips (add/remove) | "#YourBrand" |
| Mandatory Disclosures | Tag chips (add/remove) | "#ad" |
| Prohibited Words | Tag chips (add/remove) | "competitor name" |
| Default CTA | Text input | "Learn more at yourbrand.com" |

### Integration

- `SponsorshipAmplificationPrompt` reads guidelines and auto-applies them to caption templates
- Prohibited words list is checked pre-publish; violations block posting with inline error

---

## 3d: Cross-Party Analytics

### Component: `CrossPartyAnalytics`

New tab added to `OutstandManager` for brand users only. Tab label: "Sponsorships." Positioned between Analytics and Accounts tabs.

### Layout

- **Desktop:** Two-column — sponsorship list on left, detail view on right (same pattern as Engagement Hub)
- **Mobile:** Single-column list of sponsorship cards, tap to expand detail

### Per-Sponsorship Card

| Data Point | Source |
|------------|--------|
| Campaign name | `campaigns.title` |
| Restaurant name | `business_profiles` via `campaigns.user_id` |
| Creator name | `profiles` via `campaign_applications.creator_id` |
| Restaurant metrics (posts, reach, impressions, engagement) | `social_post_log` + `social_analytics_cache` filtered by restaurant's posts for this campaign (see Data Pipeline below) |
| Creator metrics | Same, filtered by creator's posts |
| Brand metrics | Same, filtered by brand's posts |
| Combined totals | Sum of all three |
| Cost-per-impression | `campaign_sponsorships.sponsorship_amount` / total impressions |
| Status | Derived from campaign + sponsorship state |

### Sponsorship ROI Summary (Donny-stubbed)

- "Generate ROI Report" button at bottom of each sponsorship card
- Currently shows static summary: combined reach, CPI, engagement rate, total posts
- Placeholder text: "Detailed AI-generated insights coming soon" in a subtle muted card
- "Sponsor Again?" recommendation: simple threshold — engagement rate > 3% shows "Recommended", otherwise "Review Performance"

### Data Pipeline: `social_post_log` Table

The Outstand API stores post data externally — there is no local `social_posts` table. To enable per-campaign social breakdowns, a new lightweight `social_post_log` table records the campaign association when posts are created through amplification or cross-posting:

```sql
CREATE TABLE social_post_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID REFERENCES campaigns(id),
  outstand_post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('amplification', 'cross_post', 'standalone', 'campaign')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_post_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own post log"
  ON social_post_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own post log"
  ON social_post_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

When a post is created through `SponsorshipAmplificationPrompt` or `CrossPostPrompt`, the `outstand_post_id` and `campaign_id` are logged here. Analytics for those posts are then pulled from `social_analytics_cache` by joining on `outstand_post_id`.

### Data Access

Cross-party analytics queries use direct Supabase client queries (not a new Edge Function). The data flow:

1. Query `campaign_sponsorships` WHERE `brand_id` = current user (scoped by RLS)
2. Join `social_post_log` WHERE `campaign_id` matches (each user's rows are RLS-scoped to their own)
3. For cross-party visibility: query `social_analytics_cache` for the `outstand_post_id` values from step 2 — this table already has authenticated-read RLS from the Phase 2 migration (`20260509000001`)
4. Aggregate metrics client-side per party (restaurant / creator / brand)

This approach requires no new Edge Function because all underlying tables already have appropriate RLS policies. Brand users can see aggregated analytics for campaigns they sponsor, but cannot see raw post logs or analytics for unrelated users.

---

## 3e: Creator Vetting by Verified Metrics

### Location

Existing Browse Creators page for brands (`BrandCreators.tsx`). Enhances `BrandCreatorCard` display and adds filter controls.

### Component: `CreatorMetricFilters`

Horizontal filter row above the creator listing.

| Filter | Type | Options |
|--------|------|---------|
| Platform | Multi-select pills | Instagram, TikTok, YouTube, X |
| Min Followers | Single-select pills | 1K+, 5K+, 10K+, 50K+, 100K+ |
| Min Engagement Rate | Single-select pills | 1%+, 3%+, 5%+, 8%+ |
| Sort By | Single-select | Engagement Rate (default), Followers, Recent Activity |

- **Desktop:** Horizontal row of pill selectors
- **Mobile:** "Filters" button opens a bottom sheet with stacked filter options

### BrandCreatorCard Enhancement

For verified creators (those with connected social accounts), add below the existing `VerifiedBadge`:
- Platform icons with follower counts (e.g., IG icon + "12.3K", TikTok icon + "45K")
- Average engagement rate as a small teal pill

### Data Source

- `social_analytics_cache` (already public-read for authenticated users via Phase 2 RLS migration)
- `business_outstand_accounts` for connection status
- `creator_profiles` joined through `user_id`

Creators without connected accounts still appear but sort below verified creators by default.

### No New Tables or Columns

Reads entirely from existing tables with existing RLS policies.

---

## 3f: Brand Content Calendar (Sponsorship Markers)

### What's Reused

The full calendar infrastructure from Phase 1: `CalendarTab`, `WeekGrid` (desktop), `MonthGrid` (desktop), `DayStrip` (mobile), drag-and-drop rescheduling, post composition from calendar slots.

### New: Sponsorship Timeline Markers

| Marker | Color | Label Format |
|--------|-------|-------------|
| Sponsorship start | Teal | "Sponsorship: [Campaign] begins" |
| Content approval deadline | Amber | "Content due: [Campaign]" |
| Amplification window | Subtle teal highlight | Days when sponsored content should be amplified |

### Component: `SponsorshipMarker`

Same rendering pattern as the existing campaign deadline markers added in Phase 2.

- **Desktop:** Colored dot with tooltip on hover, rendered inline on calendar grid cells below scheduled posts
- **Mobile:** Colored dots on `DayStrip` date pills, detail shown when day is selected

### Data Source

`campaign_sponsorships` joined with `campaigns` filtered to the brand's `user_id`.

---

## 3g: Donny Sponsorship Intelligence (Fully Stubbed)

Fully Donny-blocked. Placeholder UI only.

- Card on the Sponsorships tab: "Which campaigns should I sponsor next?"
- Disabled state with message: "Donny AI recommendations coming soon"
- When Donny MCP ships, this will use T2/Sonnet for cross-campaign pattern analysis and audience overlap calculation

---

## 3h: Sponsorship ROI Reports (Partially Stubbed)

Integrated into the Cross-Party Analytics sponsorship detail view (3d).

### What Ships Now

- Per-sponsorship metrics: combined reach, total impressions, engagement rate, cost-per-impression, posts by party
- Simple "Sponsor Again?" recommendation based on engagement threshold
- Exportable summary (copy to clipboard or download as text)

### What's Stubbed for Donny

- AI-generated narrative summary of sponsorship performance
- Audience demographics analysis
- Trend-based "when to sponsor next" timing recommendations

---

## Database Changes

### Migration: Add brand_social_guidelines column

```sql
ALTER TABLE business_profiles
ADD COLUMN brand_social_guidelines JSONB DEFAULT NULL;

COMMENT ON COLUMN business_profiles.brand_social_guidelines IS
  'Brand social media guidelines: voice_tone, required_hashtags, mandatory_disclosures, prohibited_words, default_cta';
```

### Migration: Create social_post_log table

See the `social_post_log` DDL in section 3d above.

### Types Regeneration

After running migrations, regenerate TypeScript types via `supabase gen types` so `brand_social_guidelines` and `social_post_log` are available in client code.

No other schema changes required. All other data reads use existing tables (`campaign_sponsorships`, `social_analytics_cache`, `business_outstand_accounts`).

---

## New Components Summary

| Component | File Location | Desktop | Mobile |
|-----------|--------------|---------|--------|
| `SponsorshipAmplificationPrompt` | `src/components/outstand/SponsorshipAmplificationPrompt.tsx` | Modal | Bottom sheet |
| `BrandGuidelinesEditor` | `src/components/outstand/BrandGuidelinesEditor.tsx` | Inline card | Stacked form |
| `CrossPartyAnalytics` | `src/components/outstand/CrossPartyAnalytics.tsx` | Two-column | Card list |
| `SponsorshipCard` | `src/components/outstand/SponsorshipCard.tsx` | Detail panel | Expandable card |
| `CreatorMetricFilters` | `src/components/outstand/CreatorMetricFilters.tsx` | Horizontal pills | Bottom sheet |
| `SponsorshipMarker` | `src/components/outstand/SponsorshipMarker.tsx` | Dot + tooltip | Dot + detail |
| `SponsorshipROISummary` | `src/components/outstand/SponsorshipROISummary.tsx` | Inline card | Stacked card |

---

## Existing Components Modified

| Component | Change |
|-----------|--------|
| `App.tsx` | Add brand social routes |
| `BrandDashboard.tsx` | Add Social Media quick action card |
| `OutstandManager.tsx` | Conditionally render "Sponsorships" tab for brand users; adjust `TabsList` grid from `grid-cols-6` to `grid-cols-7` for brands. On mobile, use horizontal scroll (`overflow-x-auto`) for the 7-tab bar to avoid cramping at 375px |
| `useOutstandPaths.ts` | Update path regex to include `brand`: `(?:business\|creator\|brand)` — required for OAuth callback redirect to work |
| `AccountsTab.tsx` | Render `BrandGuidelinesEditor` section for brand users |
| `BrandCreatorCard.tsx` | Add compact verified metrics row (brand-facing browse page uses this, not `CreatorCard`) |
| `BrandCreators.tsx` | Add `CreatorMetricFilters` above listing |
| `WeekGrid.tsx`, `MonthGrid.tsx`, `DayStrip.tsx` | Add `SponsorshipMarker` rendering |

---

## Empty States

Every brand-specific component handles the zero-data case:

| Component | Empty State |
|-----------|------------|
| Sponsorships tab | "No active sponsorships yet. Browse campaigns to find your first sponsorship opportunity." with CTA to campaign discovery |
| Cross-Party Analytics | Same as Sponsorships tab empty state |
| Amplification Prompt | Never triggers if no sponsorships exist — no empty state needed |
| Calendar sponsorship markers | No markers rendered — calendar shows only personal posts (standard behavior) |
| Creator Metric Filters | Filters show but return "No creators match your filters" if no verified creators exist |
| Donny Intelligence stub | Shows placeholder regardless — no data dependency |
| ROI Reports | "Complete a sponsorship to see your first ROI report" |

---

## Design Principles Applied

1. **Donny First, UI Second** — Amplification prompt is Donny-ready; manual UI is the fallback until MCP ships
2. **Never Store Secrets Client-Side** — All Outstand API calls through existing Edge Function proxy
3. **White-Label Everything** — Users see "DragonCandy Social", no Outstand branding
4. **Build for Reuse** — Existing Phase 1 components serve brands without modification
5. **Respect Existing Patterns** — Same route/guard/component patterns as Phases 1-2
6. **RLS on Everything** — Cross-party data scoped through sponsorship relationship, no open table access

---

## Success Metrics (Phase 3 Specific)

| Metric | Target |
|--------|--------|
| Brand social accounts connected | 60% of active brand users connect at least 1 account within 30 days |
| Sponsorship amplification rate | 50% of sponsored content amplified to brand channels within 24 hours |
| Cross-party analytics usage | 70% of brand sponsors view cross-party analytics at least once per campaign |
| Creator vetting filter usage | 40% of brand users use metric filters when browsing creators |

---

## Out of Scope

- Donny MCP integration (post-launch)
- Delegated posting architecture (Phase 4)
- Triple Social Hook at content approval (Phase 4)
- UGC detection and reposting (Phase 4)
- Donny Auto-Pilot mode (Phase 4)
