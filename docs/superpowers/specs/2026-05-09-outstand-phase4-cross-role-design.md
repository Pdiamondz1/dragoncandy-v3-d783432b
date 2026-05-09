# Phase 4: Cross-Role & Advanced — Design Spec

**Date:** 2026-05-09
**Status:** Approved Design
**Approach:** Campaign-Lifecycle-First (hooks → triple-post → rush → analytics → delegation)
**Estimated Duration:** 4–6 weeks
**Prerequisites:** Phase 1 (Restaurant), Phase 2 (Creator), and Phase 3 (Brand) complete

---

## Overview

Phase 4 wires the three roles together through campaign lifecycle events. When content moves through approval, all three parties — restaurant, creator, and brand — receive coordinated posting prompts. DragonDash Rush Posting becomes the premium revenue moment ($25–50 per party per event). Unified analytics show combined campaign impact across all parties' channels. Delegated posting enables cross-account publishing with campaign-scoped permissions.

Per PROJECT_CONTEXT.md, DragonDash is the profit engine. Phase 4 is where that engine connects to the social integration layer — a single content approval can generate up to $75–150 in Rush surcharges across three parties.

**What this deletes:** Manual coordination between parties about who posts where and when.
**What this simplifies:** Three separate posting workflows into one coordinated event.
**What it automates:** Campaign lifecycle triggers, permission grants/revocations, cross-party analytics aggregation.
**Keystrokes removed:** From ~480 (3 parties × 4 platforms × ~40 keystrokes each) to 3 taps (one per party).

---

## Deliverables

| # | Deliverable | Type | Donny-Dependent |
|---|-------------|------|-----------------|
| 4a | Campaign Social Hooks (5-Stage Event System) | Frontend + Backend | No |
| 4b | Triple-Post on Content Approval | Frontend | No |
| 4c | DragonDash Rush Posting | Frontend + DB migration | No |
| 4d | Unified Cross-Role Analytics | Frontend | Partial (narrative stubbed) |
| 4e | Delegated Posting Architecture | Frontend + DB migration | No |
| 4f | Donny Auto-Pilot Mode | — | Yes (fully stubbed) |
| 4g | Donny Weekly Content Planner | — | Yes (fully stubbed) |
| 4h | Donny Performance Recommendations | — | Yes (fully stubbed) |

Deliverables 4f–4h are fully Donny-blocked and ship as placeholder UI. Deliverable 4d has AI-generated narrative stubbed with templates until MCP ships.

---

## 4a: Campaign Social Hooks (5-Stage Event System)

### Architecture

A lightweight event-driven system that fires social posting prompts at five campaign lifecycle stages. Each hook is a database record that maps a campaign event to the parties who should be prompted and the content template for each.

### Hook Definitions

| Stage | Event | Trigger | Parties Prompted | Content Template |
|-------|-------|---------|-----------------|------------------|
| 1 | Campaign Created | `campaigns.status` → `'active'` | Restaurant | "New campaign live! [campaign.title] — share with your followers" |
| 2 | Brand Sponsors | `campaign_sponsorships` INSERT | Brand + Restaurant | "Sponsorship confirmed! [brand] is backing [campaign.title]" |
| 3 | Creator Matched | `campaign_applications.status` → `'accepted'` | Creator + Restaurant | "[creator] is creating content for [campaign.title]!" |
| 4 | Content Approved | `campaign_applications.final_approval_status` → `'approved'` | All three parties | Full Triple-Post experience (see 4b) |
| 5 | Campaign Complete | `campaigns.status` → `'completed'` | All three parties | "Campaign wrap! [campaign.title] results: [metrics_summary]" |

### New Table: `campaign_social_hooks`

```sql
CREATE TABLE campaign_social_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  stage INT NOT NULL CHECK (stage BETWEEN 1 AND 5),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  party_role TEXT NOT NULL CHECK (party_role IN ('restaurant','creator','brand')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','prompted','posted','skipped','expired')),
  content_template TEXT,
  prompted_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, stage, user_id)
);

ALTER TABLE campaign_social_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own hooks"
  ON campaign_social_hooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own hooks"
  ON campaign_social_hooks FOR UPDATE
  USING (auth.uid() = user_id);
```

Insert is handled by the Edge Function that fires hooks (see below). The UNIQUE constraint prevents duplicate prompts for the same user at the same stage.

### Hook Firing Mechanism

**Edge Function: `fire-campaign-social-hook`**

Called by existing campaign lifecycle Edge Functions when status transitions occur. Accepts `{ campaign_id, stage }` and:

1. Determines which parties to prompt based on stage (see table above)
2. Resolves `auth.users(id)` values: `campaigns.user_id` for restaurant, `campaign_applications.creator_id` for creator (same as `auth.users.id` via `profiles`), and `business_profiles.user_id` joined through `campaign_sponsorships.brand_id` for brand (since `campaign_sponsorships.brand_id` references `business_profiles(id)`, not `auth.users(id)`)
3. Inserts rows into `campaign_social_hooks` with status `'pending'`
4. For Stage 4 (Content Approved), also creates `triple_post_sessions` (see 4b). Stage 4 fires per accepted creator — if a campaign has multiple creators, one session is created per creator.

The Edge Function does NOT post content — it only creates the hook records. The frontend polls or subscribes to these records and presents the posting UI.

### Frontend: `useCampaignSocialHooks` Hook

```typescript
function useCampaignSocialHooks(campaignId: string) {
  // Returns pending hooks for current user on this campaign
  // Subscribes to realtime updates on campaign_social_hooks
  // Returns { hooks, dismissHook, markPosted }
}
```

### Component: `CampaignHookPrompt`

Renders inline within the campaign detail view when a pending hook exists for the current user. For stages 1–3 and 5, this is a compact card with the content template and posting options (Post Now, Schedule, Edit, Skip). For Stage 4, it delegates to the full `TriplePostPrompt` (see 4b).

**Desktop:** Inline card at the top of campaign detail, below the header.
**Mobile:** Sticky bottom card that slides up, dismissable.

### Expiration

Hooks expire 72 hours after creation. A scheduled Edge Function (`expire-social-hooks`) runs daily and sets `status = 'expired'` on stale hooks. Expired hooks no longer appear in the UI.

---

## 4b: Triple-Post on Content Approval

### Trigger

Stage 4 hook fires when `campaign_applications.final_approval_status` transitions to `'approved'`. The joint approval logic on `campaign_applications` uses `brand_approval_status` and `restaurant_approval_status` — if a sponsorship exists, both must be `'approved'` before `final_approval_status` flips (see `useJointApproval.ts`). This is the defining Phase 4 feature — all three parties receive a coordinated posting prompt simultaneously.

### Component: `TriplePostOrchestrator`

Coordinates the three-party posting experience. Does not render UI itself — it manages state and delegates to `TriplePostPrompt` for each party's view.

```typescript
interface TriplePostSession {
  id: string;
  campaign_id: string;
  parties: {
    restaurant: { user_id: string; status: 'pending' | 'posted' | 'skipped' };
    creator: { user_id: string; status: 'pending' | 'posted' | 'skipped' };
    brand: { user_id: string | null; status: 'pending' | 'posted' | 'skipped' | 'n/a' };
  };
  content_preview: { thumbnail_url: string; caption: string };
  created_at: string;
}
```

Brand party is nullable — not all campaigns have sponsors. If no brand sponsor exists, the session has two parties.

### New Table: `triple_post_sessions`

```sql
CREATE TABLE triple_post_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES auth.users(id),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES auth.users(id),
  restaurant_status TEXT NOT NULL DEFAULT 'pending' CHECK (restaurant_status IN ('pending','posted','skipped')),
  creator_status TEXT NOT NULL DEFAULT 'pending' CHECK (creator_status IN ('pending','posted','skipped')),
  brand_status TEXT NOT NULL DEFAULT 'n/a' CHECK (brand_status IN ('pending','posted','skipped','n/a')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, creator_id)
);

ALTER TABLE triple_post_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read their sessions"
  ON triple_post_sessions FOR SELECT
  USING (
    auth.uid() = restaurant_id OR
    auth.uid() = creator_id OR
    auth.uid() = brand_id
  );

CREATE POLICY "Participants can update their status"
  ON triple_post_sessions FOR UPDATE
  USING (
    auth.uid() = restaurant_id OR
    auth.uid() = creator_id OR
    auth.uid() = brand_id
  );
```

### Component: `TriplePostPrompt`

Enhanced version of the existing `CrossPostPrompt`, with additions:

- **Coordination status panel:** Shows all parties' posting status in real-time (green dot = posted, teal dot = prompted/pending, gray = skipped). Uses Supabase Realtime subscription on `triple_post_sessions`.
- **DragonDash Rush CTA:** Prominent teal gradient button at top (see 4c). Only appears when user has 3+ connected platforms.
- **Standard options:** Post Now (single platform), Schedule, Edit First, Skip — same 2×2 grid on mobile, 1×4 on desktop.
- **Content preview:** Thumbnail + caption from the approved deliverable.

**Desktop (1280px+):** Modal dialog, max-width 480px, centered. Media + caption preview side-by-side. Four standard options in a horizontal row below the Rush CTA. Coordination panel at bottom with status indicators and party names.

**Mobile (375px):** Bottom sheet with drag handle. Media preview as horizontal scroll thumbnails. Rush CTA full-width. Standard options in 2×2 grid. Coordination panel stacked below.

### Hook: `useTriplePostState`

```typescript
function useTriplePostState(sessionId: string) {
  // Subscribes to realtime updates on triple_post_sessions
  // Returns current status of all parties
  // Provides updateMyStatus(newStatus) mutation
}
```

### Party-Specific Behavior

| Party | Sees | Default Caption Template |
|-------|------|------------------------|
| Restaurant | Full prompt + Rush CTA | "Check out this amazing content from @[creator]! [campaign.title] 🍽️ #DragonDashed" |
| Creator | Full prompt + Rush CTA + portfolio share option | "New collab with [restaurant]! [campaign.title] ✨ #ContentCreator #DragonDashed" |
| Brand | Full prompt + Rush CTA + brand guidelines auto-applied | Template from `brand_social_guidelines` with mandatory disclosures |

Brand captions auto-apply `required_hashtags`, `mandatory_disclosures`, and `default_cta` from `business_profiles.brand_social_guidelines` (Phase 3 column). Prohibited words are checked pre-publish.

---

## 4c: DragonDash Rush Posting

### What It Is

Premium simultaneous multi-platform posting for $25–50 surcharge. When a user hits "Rush Post — All Platforms," their content goes to all connected platforms at once instead of posting to each individually. This is DragonDash's primary social revenue moment.

### Component: `DragonDashRushButton`

Self-contained CTA that drops into any posting prompt (Triple-Post, Cross-Post, standard compose).

**Appearance:** Teal-to-mint gradient (Tailwind: `bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC]`), white bold text, yellow DRAGONDASH badge. The most visually prominent element in any posting prompt — positioned above standard options.

**Visibility rules:**
- Only appears when user has 3+ connected platforms (Rush makes no sense for 1–2)
- Grayed out for Free-tier users with "Upgrade to unlock Rush Posting" tooltip
- Shows platform count and surcharge amount: "Rush Post — All Platforms · IG + TikTok + YouTube + Facebook · $25"

### Payment Flow (Stubbed for Launch)

Rather than wiring Stripe checkout for Rush surcharges, the button shows a confirmation dialog:

**Desktop:** Small modal overlay: "Rush Post to [N] platforms — $25 surcharge will be added to your next invoice. Continue?"
**Mobile:** Bottom sheet confirmation with two buttons: "Confirm Rush ($25)" and "Cancel"

On confirmation (client-side flow):
1. Client inserts a `rush_surcharge_log` entry with `status = 'pending'` (RLS INSERT policy allows `auth.uid() = user_id`)
2. Client calls `outstand-proxy` Edge Function to post to all connected platforms simultaneously
3. User sees success state with all platform confirmations

When Stripe billing goes live post-launch, pending log entries become invoice line items. This preserves the ledger-first principle — every surcharge is recorded from Day 1.

### New Table: `rush_surcharge_log`

```sql
CREATE TABLE rush_surcharge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID REFERENCES campaigns(id),
  platform_count INT NOT NULL,
  surcharge_cents INT NOT NULL DEFAULT 2500,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rush_surcharge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own surcharges"
  ON rush_surcharge_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own surcharges"
  ON rush_surcharge_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### Surcharge Calculation

| Platforms | Surcharge |
|-----------|-----------|
| 3 platforms | $25 |
| 4 platforms | $30 |
| 5+ platforms | $50 |

Stored as `surcharge_cents` for precision. The tiered pricing incentivizes connecting more platforms.

### Tier Gating

| Tier | Rush Access |
|------|-------------|
| Free | Locked — shows upgrade prompt |
| Starter ($149/mo) | Enabled |
| Growth ($499/mo) | Enabled |
| Pro ($999/mo) | Enabled, discounted surcharge (20% off) |
| Enterprise | Enabled, custom pricing |

### Integration Points

`DragonDashRushButton` is rendered by:
- `TriplePostPrompt` (Stage 4 hook)
- `CrossPostPrompt` (existing, Phase 1–2)
- `SponsorshipAmplificationPrompt` (Phase 3)
- Future: standalone compose flow

Each caller passes `campaignId` (optional) and `onRushComplete` callback. The button handles its own confirmation dialog and surcharge logging internally.

---

## 4d: Unified Cross-Role Analytics

### What It Is

Enhancement to the existing Cross-Party Analytics component (Phase 3, deliverable 3d) that adds combined campaign impact metrics across all three parties' social channels.

### Component: `CampaignImpactSummary`

Renders inside each sponsorship card on the brand's Sponsorships tab, and as a new section on the campaign detail view for restaurants and creators.

### Metrics

| Metric | Source | Display |
|--------|--------|---------|
| Combined Reach | Sum of all parties' impressions from `social_analytics_cache` | Large teal number with "combined reach" label |
| Per-Party Breakdown | Filtered by `social_post_log.user_id` per party | Three horizontal bars (teal = restaurant, pink = creator, mint = brand) |
| Cost Per Impression | `campaign_sponsorships.sponsorship_amount` / total impressions | Dollar figure with trend arrow |
| Engagement Rate | (likes + comments + shares) / impressions across all parties | Percentage in teal pill |
| Rush vs Standard | Join `rush_surcharge_log` on `campaign_id` | Badge on each post entry ("RUSH" in yellow or "Standard" in gray) |
| Platform Mix | Grouped by `social_post_log.platform` | Platform icon row with per-platform counts |

### Layout

**Desktop (1280px+):** Header card above the existing per-party detail in Cross-Party Analytics. Full-width, two-column interior: left side shows combined reach + CPI + engagement rate as large numbers, right side shows the per-party breakdown bars and platform mix.

**Mobile (375px):** Stacked card at the top of the sponsorship detail view. Combined reach as hero number, then metrics in a 2×2 grid, then per-party breakdown as stacked horizontal bars.

### Data Flow

No new Edge Functions. Client-side aggregation using existing tables. Note: `social_analytics_cache` stores account-level metrics (by `outstand_account_id`), not per-post metrics. Campaign-level analytics are derived by aggregating account metrics for users who participated in the campaign, filtered by the campaign's active date range.

1. Query `campaign_sponsorships` WHERE `brand_id` = current user's `business_profiles.id` (for brands) or `campaign_id` in user's campaigns (for restaurants/creators). Note: `brand_id` references `business_profiles(id)`, so resolve through `business_profiles.user_id` for auth-based lookups.
2. Identify campaign participants from `campaigns.user_id` (restaurant), `campaign_applications.creator_id` (creator), and `campaign_sponsorships.brand_id` → `business_profiles.user_id` (brand)
3. Query `social_analytics_cache` for each participant's `user_id`, filtered by `period_start`/`period_end` overlapping the campaign's active dates
4. Query `social_post_log` on `campaign_id` to get post counts and platform breakdown per party
5. Left join `rush_surcharge_log` on `campaign_id` + `user_id` for Rush badges
6. Aggregate client-side: sum metrics per party, calculate CPI using `campaign_sponsorships.sponsorship_amount`, group by platform via `social_post_log.platform`

### Role-Specific Views

| Role | What They See |
|------|--------------|
| Brand | Full cross-party analytics with CPI and ROI. Appears on Sponsorships tab. |
| Restaurant | Their own metrics + combined total for campaigns they own. Appears on campaign detail. |
| Creator | Their own metrics + combined total for campaigns they participated in. Appears on campaign detail. |

### Donny-Stubbed Element

**Component: `AIPerformanceInsights`**

Card below the metrics summary. Currently shows static placeholder:
- Title: "AI Performance Insights"
- Body: "Donny AI insights coming soon — detailed campaign performance narrative, audience analysis, and timing recommendations."
- Visual: Muted card with dashed teal border, disabled state

When Donny MCP ships, this uses T2/Sonnet to generate narrative like: "Your Sakura Sushi campaign reached 265K users — 3.2× your average. The creator's TikTok reel drove 72% of engagement. Consider sponsoring similar video-first campaigns."

---

## 4e: Delegated Posting Architecture

### What It Is

Permission model that enables one party to post on behalf of another's connected social accounts, scoped to a specific campaign. This is the technical foundation for the Triple Social Hook to work across organizational boundaries without requiring each party to manually post.

### Component: `DelegatedPostingPermissions`

New section on each user's Accounts tab (within `OutstandManager`), below their connected accounts list.

**Desktop:** Card with teal border showing active delegated permissions as a list. Each row: grantee name, campaign name, authorized platforms as icons, expiration date, "Revoke" button.

**Mobile:** Same card, stacked vertically. Swipe-to-revoke on each permission row.

### New Table: `delegated_posting_permissions`

```sql
CREATE TABLE delegated_posting_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_id UUID NOT NULL REFERENCES auth.users(id),
  grantee_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platforms TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grantor_id, grantee_id, campaign_id)
);

ALTER TABLE delegated_posting_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Grantor and grantee can read"
  ON delegated_posting_permissions FOR SELECT
  USING (auth.uid() = grantor_id OR auth.uid() = grantee_id);

CREATE POLICY "Only grantor can update"
  ON delegated_posting_permissions FOR UPDATE
  USING (auth.uid() = grantor_id);

CREATE POLICY "Campaign participants can insert"
  ON delegated_posting_permissions FOR INSERT
  WITH CHECK (
    auth.uid() = delegated_posting_permissions.grantor_id
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = delegated_posting_permissions.campaign_id
      AND (
        c.user_id = delegated_posting_permissions.grantor_id
        OR EXISTS (SELECT 1 FROM campaign_applications ca WHERE ca.campaign_id = c.id AND ca.creator_id = delegated_posting_permissions.grantor_id)
        OR EXISTS (SELECT 1 FROM campaign_sponsorships cs JOIN business_profiles bp ON bp.id = cs.brand_id WHERE cs.campaign_id = c.id AND bp.user_id = delegated_posting_permissions.grantor_id)
      )
    )
  );
```

### Permission Schema

```typescript
interface DelegatedPermission {
  id: string;
  grantor_id: string;
  grantee_id: string;
  campaign_id: string;
  platforms: string[];
  status: 'active' | 'revoked';
  expires_at: string | null;
  created_at: string;
}
```

### Key Constraints

- **Campaign-scoped:** No blanket "post to my account anytime" grants. Every permission references a specific campaign.
- **Auto-expiry:** Permissions expire when the campaign status changes to `completed` or `cancelled`. The `expire-social-hooks` Edge Function (from 4a) also handles permission expiration.
- **Grantor control:** Only the account owner can revoke. Revocation is immediate for new posts. See "Race condition note" in Integration with Posting for the sub-second edge case on in-flight posts.
- **Visual distinction:** Grantee sees delegated accounts in a separate "Posting on behalf of [Name]" section in their platform selector, clearly differentiated from their own accounts.

### UI Flow

1. Restaurant approves content → Triple-Post prompt appears
2. Below standard options, a toggle: "Allow [Creator] to also post this to your channels?"
3. If enabled, platform checkboxes appear for the restaurant to select which accounts to delegate
4. On confirm, `delegated_posting_permissions` row is created with `expires_at` set to campaign end date
5. Creator's Triple-Post prompt refreshes (via Realtime) to show the restaurant's platforms as additional options, labeled "On behalf of [Restaurant]"
6. When campaign completes, permission auto-revokes

### Component: `DelegatePostingToggle`

Rendered within `TriplePostPrompt` for the approving party (typically the restaurant).

**Desktop:** Inline toggle row with platform checkboxes, below the standard posting options.
**Mobile:** Expandable section with toggle and stacked platform checkboxes.

### Hook: `useDelegatedPermissions`

```typescript
function useDelegatedPermissions(campaignId: string) {
  // Returns permissions where current user is grantor or grantee
  // Subscribes to realtime updates
  // Provides grantPermission(granteeId, platforms) and revokePermission(permissionId)
}
```

### Integration with Posting

When a grantee initiates a post through the `outstand-proxy` Edge Function, the function checks `delegated_posting_permissions`:
1. Verify permission exists, is `active`, and hasn't expired
2. Verify the requested platform is in the `platforms` array
3. Use the grantor's `outstand_social_account_id` (from `business_outstand_accounts`) to post through the Outstand API — OAuth tokens are managed by Outstand, not stored locally
4. Log the post in `social_post_log` with the grantor's `user_id` but include grantee context

**Race condition note:** If a grantor revokes permission between the Edge Function's check (step 1) and the actual Outstand API call (step 3), the post may still go through. This is an accepted race condition with a sub-second window. The Edge Function logs a warning if it detects post-hoc that the permission was revoked during execution.

---

## 4f: Donny Auto-Pilot Mode (Fully Stubbed)

Fully Donny-blocked. Placeholder UI only.

- Toggle on OutstandManager header: "Donny Auto-Pilot" with a lightning bolt icon
- Disabled state with tooltip: "Coming soon — Donny will automatically schedule and post optimal content"
- When Donny MCP ships: T2/Sonnet analyzes engagement patterns, auto-schedules posts at optimal times, auto-generates captions with brand guidelines applied

---

## 4g: Donny Weekly Content Planner (Fully Stubbed)

Fully Donny-blocked. Placeholder UI only.

- Card on Calendar tab: "Weekly Content Plan"
- Disabled state with message: "Donny AI will generate your weekly posting schedule based on performance data"
- When Donny MCP ships: T1/Haiku generates a weekly content calendar with suggested post types, platforms, and times based on historical engagement

---

## 4h: Donny Performance Recommendations (Fully Stubbed)

Fully Donny-blocked. Placeholder UI only.

- Card on Analytics tab: "Performance Recommendations"
- Disabled state with message: "Donny AI recommendations coming soon"
- When Donny MCP ships: T2/Sonnet generates actionable recommendations from analytics data ("Your TikTok reels get 3× more engagement on Thursdays — consider scheduling your next reel for Thursday 6 PM")

---

## Database Changes Summary

### Migration 1: `campaign_social_hooks` table

See DDL in section 4a above.

### Migration 2: `triple_post_sessions` table

See DDL in section 4b above.

### Migration 3: `rush_surcharge_log` table

See DDL in section 4c above.

### Migration 4: `delegated_posting_permissions` table

See DDL in section 4e above.

### Types Regeneration

After running all migrations, regenerate TypeScript types via `supabase gen types` so all new tables are available in client code.

No modifications to existing tables. All new tables have RLS enabled with appropriate policies.

---

## New Components Summary

| Component | File Location | Desktop | Mobile |
|-----------|--------------|---------|--------|
| `CampaignHookPrompt` | `src/components/outstand/CampaignHookPrompt.tsx` | Inline card | Sticky bottom card |
| `TriplePostOrchestrator` | `src/components/outstand/TriplePostOrchestrator.tsx` | — (state only) | — (state only) |
| `TriplePostPrompt` | `src/components/outstand/TriplePostPrompt.tsx` | Modal dialog | Bottom sheet |
| `DragonDashRushButton` | `src/components/outstand/DragonDashRushButton.tsx` | Inline CTA | Full-width CTA |
| `RushConfirmDialog` | `src/components/outstand/RushConfirmDialog.tsx` | Small modal | Bottom sheet |
| `CampaignImpactSummary` | `src/components/outstand/CampaignImpactSummary.tsx` | Two-column card | Stacked card |
| `AIPerformanceInsights` | `src/components/outstand/AIPerformanceInsights.tsx` | Inline card (disabled) | Stacked card (disabled) |
| `DelegatedPostingPermissions` | `src/components/outstand/DelegatedPostingPermissions.tsx` | Card list | Stacked list |
| `DelegatePostingToggle` | `src/components/outstand/DelegatePostingToggle.tsx` | Inline toggle | Expandable section |
| `DonnyAutoPilotStub` | `src/components/outstand/DonnyAutoPilotStub.tsx` | Toggle (disabled) | Toggle (disabled) |
| `DonnyWeeklyPlannerStub` | `src/components/outstand/DonnyWeeklyPlannerStub.tsx` | Card (disabled) | Card (disabled) |
| `DonnyPerformanceStub` | `src/components/outstand/DonnyPerformanceStub.tsx` | Card (disabled) | Card (disabled) |

---

## Existing Components Modified

| Component | Change |
|-----------|--------|
| `OutstandManager.tsx` | Add Donny stub placeholders on relevant tabs (Auto-Pilot toggle on header, Weekly Planner on Calendar, Performance on Analytics) |
| `CrossPartyAnalytics.tsx` | Integrate `CampaignImpactSummary` as header card; add `AIPerformanceInsights` stub below metrics |
| `AccountsTab.tsx` | Render `DelegatedPostingPermissions` section below connected accounts and brand guidelines |
| `CrossPostPrompt.tsx` | Accept optional `DragonDashRushButton` rendering when 3+ platforms connected |
| `SponsorshipAmplificationPrompt.tsx` | Accept optional `DragonDashRushButton` rendering |
| `CalendarTab.tsx` | No changes — sponsorship markers (Phase 3) already handle campaign timeline display |

---

## New Hooks Summary

| Hook | Purpose |
|------|---------|
| `useCampaignSocialHooks(campaignId)` | Returns pending hooks for current user, subscribes to realtime |
| `useTriplePostState(sessionId)` | Tracks all-party posting status with realtime subscription |
| `useDelegatedPermissions(campaignId)` | Returns delegated permissions (as grantor and grantee) |
| `useRushSurchargeLog(campaignId?)` | Returns Rush surcharge history for current user |

---

## Edge Functions

| Function | Purpose | New or Modified |
|----------|---------|-----------------|
| `fire-campaign-social-hook` | Creates hook records when campaign status transitions occur | New |
| `expire-social-hooks` | Daily job: expires stale hooks (72h) and revokes permissions for completed campaigns | New |
| `outstand-proxy` | Modified: checks `delegated_posting_permissions` when posting on behalf of another user | Modified |

---

## Empty States

| Component | Empty State |
|-----------|------------|
| `CampaignHookPrompt` | Never renders if no pending hooks — no empty state needed |
| `TriplePostPrompt` | Only triggers at content approval — no empty state needed |
| `DragonDashRushButton` | Hidden when < 3 platforms connected — no empty state needed |
| `CampaignImpactSummary` | "Complete a campaign to see combined social impact" with campaign discovery CTA |
| `DelegatedPostingPermissions` | "No active posting permissions. Permissions are created when you approve content on a campaign." |
| Donny stubs (4f–4h) | Each shows its own "coming soon" message regardless of data state |

---

## Design Principles Applied

1. **DragonDash First** — Rush Posting is the most prominent CTA in every posting prompt. Standard options are secondary.
2. **Ledger-First** — `rush_surcharge_log` records every surcharge from Day 1, even before Stripe billing is wired.
3. **Campaign-Scoped Permissions** — No blanket delegated access. Every permission ties to a specific campaign and auto-expires.
4. **Donny-Ready, Donny-Independent** — All AI features are stubbed with clean interfaces. When MCP ships, swap template strings for Donny calls.
5. **Realtime Coordination** — Triple-Post uses Supabase Realtime to show all parties' status live, creating urgency and social proof.
6. **Reuse Phase 1–3 Infrastructure** — Edge Function proxy, OAuth flow, calendar, analytics cache all serve Phase 4 without modification.

---

## Success Metrics (Phase 4 Specific)

| Metric | Target |
|--------|--------|
| Triple-Post conversion | 60% of content approvals result in at least 2 parties posting within 24 hours |
| DragonDash Rush adoption | 25% of multi-platform posts use Rush within 30 days of launch |
| Rush revenue per campaign | Average $50+ in Rush surcharges per sponsored campaign (2+ parties rushing) |
| Delegated posting opt-in | 40% of restaurants enable delegated posting for their creator on at least one campaign |
| Hook prompt engagement | 50% of Stage 1–3 hooks result in a post (not skipped) |

---

## Out of Scope

- Stripe checkout integration for Rush surcharges (post-launch — ledger-only for now)
- Donny MCP integration (post-launch)
- UGC detection and automatic reposting (future phase)
- Social commerce / shoppable post links (future phase)
- Multi-language caption generation (future phase)
