# Creator Campaign Discovery — Design Spec

**Date:** 2026-04-04
**Status:** Draft
**Scope:** Phase 1 — Campaign cards, detail modal, application flow, Available + Applied tabs

---

## Problem

Creators currently see campaign cards with placeholder content: generic gradient images, "Available Campaigns" as the title, wizard marketing copy instead of the actual brief, and "Company Name" as the business. Creators cannot evaluate whether a campaign is right for them before applying. This is critically broken for launch.

## Solution

Rebuild the creator-facing campaign discovery flow: rich campaign cards with real data, a full-screen detail modal with the complete brief, an inline application form, and a tab system to track application status.

## Approach

**Surgical Rebuild (Approach A):** Enhance existing components in place. Rebuild `CardContent` inside `CampaignSwipeCard`, add a new `CampaignDetailModal` component, adapt `ApplicationForm` for inline use, and add a tab bar to `CreatorCampaignMarketplace`. ~2 new files, ~4 modified files.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delivery tier naming | Use type system names (`dragondash`/`express`/`standard`), map from DB values (`dragonrush`/`expedited`/`standard`) | CLAUDE.md rule: never rename DB columns. Types are the newer, intentional naming. One mapping layer handles translation. |
| Distance display | Hybrid — city name always, geocoded distance in background when available | City gets 90% of value without geocoding latency/API dependency. Distance enhances when both locations resolve. |
| Cover image | 4-step fallback: reference image → AI preview → blurred logo → branded gradient | Campaigns at launch may lack media. Graceful degradation ensures no broken/empty cards. |
| Apply interaction | Swipe right → full-screen modal (no route change) → inline apply form | Keeps swipe stack in background, creator doesn't lose place, back button works cleanly. |
| Tab scope | Phase 1: Available + Applied. Phase 2 (separate task): Active + Completed | Keeps this task focused on discovery. Active/Completed are project management features. |

---

## 1. Campaign Card (Swipeable)

### Data Sources

| Field | Source | Fallback |
|-------|--------|----------|
| Cover image | `campaign_media` first row where `media_type = 'reference_image'` (sorted by `sort_order`) | `campaign_media` first row where `media_type = 'ai_preview'` AND `campaigns.ai_preview_status = 'ready'` → business logo (blurred + overlay) → branded teal-to-pink gradient with title |
| Title | `campaigns.title` | — (required field) |
| Business name | `business_profiles.business_name` | "Unknown Business" |
| Business logo | `business_profiles.logo_url` | First letter avatar (existing pattern) |
| Verified badge | — | Not currently in schema. Show for all businesses in v1; add verification field later. |
| Budget | `campaigns.fixed_price` (if `pricing_type = 'fixed'`) or `budget_min`–`budget_max` | "Budget TBD" |
| Delivery tier | `campaigns.delivery_type` mapped through tier config | No badge shown if null |
| Content type pills | `campaign_deliverables.content_type` joined by `campaign_id` | Fall back to `campaigns.deliverables` string array |
| Deliverable count | Count of `campaign_deliverables` rows | Length of `campaigns.deliverables` array |
| Location | `business_profiles.city` + `country` | `business_profiles.location` (legacy) |
| Distance | Haversine calculation between geocoded creator and business locations | Not shown (city only) |
| Posted time | Relative time from `campaigns.created_at` | — |
| Applicant count | Count from `campaign_applications` where `campaign_id` matches | Already in `usePublicCampaigns` |

### Card Layout (Top to Bottom)

1. **Hero image area** (65% height)
   - Cover image with dark gradient overlay at bottom
   - Delivery tier badge: top-right corner (reuse existing `DeliveryBadge` component)
   - Applicant count badge: top-left corner, semi-transparent dark pill ("👥 5 applied")
   - Title: bold white text overlaid on bottom of image, `line-clamp-2`
   - Location + distance + posted time: below title, small white text with opacity

2. **Card body** (remaining height)
   - Budget: large teal text, left-aligned. Deliverable count: right-aligned same row
   - Content type pills: horizontal row of small teal-outlined pills (📸 Photo, 🎬 Reel, 📱 Story)
   - Business row: avatar (circular, teal ring) + name + verified badge
   - CTA button: "View Campaign" — teal, full-width, `rounded-full`

### Swipe Behavior

- **Swipe left:** Skip (card consumed, next card appears)
- **Swipe right:** Open detail modal (card NOT consumed until application submitted)
- **Tap "View Campaign" button:** Open detail modal
- **Tap card body:** Open detail modal
- Swipe hints below stack: "← Skip" and "View Details →"

### Delivery Tier Mapping

DB `delivery_type` values map to display names:

| DB Value | Type System | Display | Badge Style |
|----------|------------|---------|-------------|
| `dragonrush` | `dragondash` | DragonDash | Orange-to-pink gradient bg |
| `expedited` | `express` | Express | Yellow bg |
| `standard` | `standard` | Standard | Green bg |

Emojis in this table are decorative (spec only). The actual `DeliveryBadge` component uses Lucide icons (`Flame`, `Zap`, `Turtle`) and should not be changed.

Mapping lives in a single `mapDeliveryType(dbValue: string | null): DeliveryTier | null` utility function. The existing `DeliveryBadge` component already uses the type system names and needs no changes.

**Bug fix:** The current `CampaignSwipeCard.tsx` line 148 passes `campaign.delivery_type as DeliveryType` directly to `DeliveryBadge`, bypassing type safety. This sends raw DB values (`dragonrush`, `expedited`) to a component expecting type system names. The rebuild must use `mapDeliveryType(campaign.delivery_type)` instead of the cast.

---

## 2. Campaign Detail Modal

### Trigger & Animation

- Opens when: card tapped, "View Campaign" pressed, or swipe right
- Animation: slides up from bottom of screen
- Mobile: full-screen overlay (100vh)
- Desktop lg+: centered modal (max-w-lg) with dark backdrop
- Close: ✕ button (top-left) or swipe down gesture
- Closing returns to swipe stack — the card is NOT consumed

### Content Sections (Scrollable, Top to Bottom)

1. **Sticky header bar**
   - ✕ close button (left), "Campaign Details" label (center)

2. **Hero image**
   - Same image and fallback chain as card, larger format
   - Delivery tier badge overlay (top-right)

3. **Title + business block**
   - Campaign title: `text-xl font-bold`
   - Business: avatar + name + verified badge + city + distance
   - Metrics pills row: budget (teal bg), deliverable count, applicant count, posted time

4. **About This Campaign**
   - `campaigns.description` — full text, no truncation
   - If `campaigns.goals` exists, show below description under "Goals" subheading

5. **Visual References** (conditional: only if `campaign_media` has `media_type = 'reference_image'` or `'reference_video'` rows)
   - Horizontal scroll of thumbnail images/videos (100×100, `rounded-xl`)
   - Tap thumbnail → lightbox overlay (full-size view, swipe to navigate)
   - Source: `campaign_media` where `media_type IN ('reference_image', 'reference_video')`, ordered by `sort_order`

6. **Raw Footage Available** (conditional: only if `campaign_media` has `media_type = 'raw_footage'` rows)
   - Info card with 📹 icon, teal background
   - "Raw Footage Provided" title
   - "The business has footage for you to use. Available after acceptance." description
   - No download links — footage accessible only after application accepted

7. **Deliverables breakdown**
   - Numbered list, each item shows:
     - Content type icon + type label + description
     - Platform + aspect ratio + max duration (from `campaign_deliverables`)
   - Primary source: `campaign_deliverables` table joined by `campaign_id`
   - Fallback: `campaigns.deliverables` string array (simpler display, no platform/aspect info)

8. **Timeline**
   - Delivery tier card with colored background matching tier
   - "Due X hours/days from acceptance" text
   - Rush fee note if DragonDash ($75) or Express ($25) — these amounts come from `DELIVERY_TIER_LIMITS` in `src/types/campaignMedia.ts` and should be referenced from the config in `campaignUtils.ts`, not hardcoded
   - Tier time windows: DragonDash 1–3 hrs, Express 24–48 hrs, Standard 5–7 days (authoritative source: `DeliveryBadge` config; note the legacy `ApplicationForm.tsx` shows "8-12 hours" for expedited — the new form should use 24–48 hrs to match the design system)

9. **Budget**
   - Large teal amount (`text-2xl font-bold`)
   - Pricing type context: "Fixed price" or "Bid range · You'll propose your rate when applying"
   - "Payment via Stripe upon approval"

10. **About the Business**
    - Larger avatar (40px) + name + verified + location
    - "View Business Profile" link button (pink text, outline style) — navigates to `/creators/:userId` or equivalent public profile route. If no public business profile route exists yet, this button is hidden in Phase 1.

11. **Requirements** (conditional: only if `campaigns.style` or `campaigns.tone` exists)
    - Style and tone values
    - Any additional notes from the campaign

12. **Sticky "Apply for This Campaign" button**
    - Fixed at bottom, white bg with top border + shadow
    - Teal `rounded-full` button, full-width
    - Tapping expands the inline application form (Section 3)

### Data Fetching

New hook: `useCampaignDetail(campaignId: string)` — fetches:
- Campaign row (already have from list, but refresh for freshness)
- `campaign_media` rows where `campaign_id` matches
- `campaign_deliverables` rows where `campaign_id` matches
- Business profile (already joined in list data)

Single hook, parallel queries internally via `useQueries` or sequential with early data from the list cache.

---

## 3. Inline Application Form

### Trigger

Tapping "Apply for This Campaign" button:
1. Sticky button disappears
2. Form expands inline at the bottom of the scrollable content
3. Modal auto-scrolls to show the form
4. Teal top border on form section for visual separation

### Form Fields

| Field | Type | Required | Pre-fill | Notes |
|-------|------|----------|----------|-------|
| Your Rate | Number input with $ prefix | Yes (bid-range) / No (fixed) | Creator's profile rate if set | Hidden for fixed-price campaigns; replaced with fixed price confirmation message |
| Available Dates | Pill selector | Yes | "Today" for DragonDash | Options: Today, Tomorrow, This Week, Custom (opens date picker). DragonDash shows urgency warning |
| Quick Pitch | Textarea | No | Empty | Placeholder: "Why you're a great fit..." Max 280 chars. Replaces old required "Introduction Message" |
| Attach a Sample | Portfolio selector | No | None | Horizontal scroll of creator's `file_uploads`. Tap to toggle selection (teal ring + checkmark). "+" button for new upload |

### DragonDash Urgency

When `delivery_type` maps to `dragondash`:
- Orange warning card above submit button: "⚡ DragonDash campaign. If accepted, you'll need to deliver within 1-3 hours."
- "Today" pre-selected in date pills
- Date selector shows urgency note: "⚡ DragonDash — must deliver within 1-3 hours of acceptance"

### Data Mapping to Existing Hook

The form maps to `useCreateApplication` mutation:
- `campaignId` ← `campaign.id`
- `introMessage` ← Quick Pitch text (send empty string if not filled)
- `proposedTimeline` ← selected date pill value stored as ISO date string (e.g., "Today" → today's date as `2026-04-04`). Always store as ISO date so the business side can display it without interpretation. For "This Week", store the end-of-week date.
- `proposedRate` ← rate input value (undefined for fixed-price)

Portfolio attachment is **deferred to Phase 2**. The portfolio selector UI will be designed but the "Attach a Sample" field is hidden in Phase 1 since `campaign_applications` has no column for file references and the "no schema changes" constraint applies. The `useCreatorPortfolio` hook is similarly deferred.

### States

- **Default:** Form visible with fields
- **Submitting:** Button shows "Submitting..." spinner, fields disabled
- **Success:** Form replaced with success card: "✅ Application sent! The business will respond within 24 hours." + "View Your Applications" link (navigates to Applied tab). Swipe card is consumed from the stack.
- **Error:** Toast notification with error message, form remains editable
- **Cancel:** "Cancel" text button at top-right of form. Collapses form, restores sticky Apply button.

---

## 4. Tab Bar + Applied View

### Tab Bar Component

Position: top of `CreatorCampaignMarketplace`, below page header, above content.

| Tab | Phase | Badge | Content |
|-----|-------|-------|---------|
| Available | 1 | None | Swipe stack (rebuilt cards) |
| Applied | 1 | Pending application count | Scrollable application list |
| Active | 2 | Active campaign count | Disabled, grayed out text |
| Done | 2 | None | Disabled, grayed out text |

Style: white background, teal underline on active tab, `text-sm font-semibold`. Badge is a small pill with count next to tab label.

### Applied Tab — Application List

New hook: `useCreatorApplications()` — two-step query (same pattern as `usePublicCampaigns`):

1. Fetch applications with campaign data:
```
campaign_applications
  .select('*, campaign:campaigns!inner(id, title, user_id, delivery_type, pricing_type, fixed_price, budget_min, budget_max, deliverables)')
  .eq('creator_id', currentUserId)
  .order('created_at', { ascending: false })
```

2. Fetch business profiles for the campaign owners:
```
business_profiles
  .select('user_id, business_name, logo_url, city, country')
  .in('user_id', campaignUserIds)
```

Then merge in-memory via `user_id` map (same approach as `usePublicCampaigns` lines 97-110). Direct FK join from `campaigns` to `business_profiles` is not available — they share a `user_id` through `profiles`, not a direct FK.

Returns: application status, campaign title, business info, proposed rate, timestamps.

### Application Card States

| Status | Badge | Left Border | Opacity | CTA |
|--------|-------|-------------|---------|-----|
| `pending` | ⏳ Pending (yellow) | None | 1.0 | "View Details" → opens detail modal (read-only, no apply button) |
| `accepted` | ✅ Accepted (green) | 3px teal | 1.0 | "Start Campaign →" — Phase 1: opens detail modal with a success banner ("You've been accepted! Active campaigns coming soon."); Phase 2: navigates to collaboration view |
| `rejected` | ✗ Declined (red) | None | 0.7 | "View Details" → opens detail modal (read-only) |
| `counter_offered` | 💬 Counter Offer (orange) | 3px orange | 1.0 | "View Offer" → opens existing CounterOfferThread component |

### Application Card Layout

Each card shows:
- Content type icon (from first deliverable) in a rounded square
- Campaign title (truncated)
- Business name + time since application
- Status badge (right-aligned)
- Creator's bid amount (or "fixed" for fixed-price)
- Action button (right-aligned, varies by status)

---

## 5. Data Layer Changes

### Enhanced `usePublicCampaigns`

Add to the existing query:
- First `campaign_media` row where `media_type = 'reference_image'` → `cover_image_url`
- Count of `campaign_deliverables` → `deliverable_count`
- First few `campaign_deliverables.content_type` values → `content_types`

This avoids N+1 queries on the card list. The detail modal fetches full media/deliverables separately.

### New: `useCampaignDetail(campaignId)`

Fetches complete campaign data for the detail modal:
- Campaign row (with cache warming from list data)
- `campaign_media` rows (all types, ordered by `sort_order`)
- `campaign_deliverables` rows (ordered by `sort_order`)

### New: `useCreatorApplications()`

Fetches current creator's applications with joined campaign + business data. Used by the Applied tab.

### New: `useCreatorPortfolio()`

Fetches current creator's `file_uploads` for the portfolio selector in the application form. Filtered to image/video types, ordered by `created_at` descending.

### Utility: `mapDeliveryType(dbValue)`

```typescript
function mapDeliveryType(dbValue: string | null): DeliveryTier | null {
  switch (dbValue) {
    case 'dragonrush': return 'dragondash';
    case 'expedited': return 'express';
    case 'standard': return 'standard';
    default: return null; // No badge rendered for null/unknown values
  }
}
```

### Utility: `getRelativeTime(dateString)`

Returns human-readable relative time: "2h ago", "1d ago", "3d ago", etc. Used on both card and application list.

### Utility: `calculateDistance(lat1, lng1, lat2, lng2)`

Haversine formula returning distance in miles. Used by the hybrid location display. Returns `null` if either coordinate pair is missing.

---

## 6. Component File Plan

| File | Action | Description |
|------|--------|-------------|
| `src/components/campaigns/CampaignSwipeCard.tsx` | **Modify** | Rebuild `CardContent` with rich data, cover image fallback, info pills, content type pills. Change swipe-right to open modal. |
| `src/components/campaigns/CampaignDetailModal.tsx` | **New** | Full-screen modal with scrollable campaign brief, media gallery, deliverables, business info, sticky apply button. |
| `src/components/campaigns/CampaignApplyForm.tsx` | **New** | Inline application form: rate, date pills, pitch, portfolio selector. Replaces old `ApplicationForm` usage in this flow. |
| `src/components/campaigns/CreatorApplicationCard.tsx` | **New** | Card component for Applied tab showing application status, campaign info, action button. |
| `src/hooks/useCampaignDetail.ts` | **New** | Fetches campaign + media + deliverables for detail modal. |
| `src/hooks/useCreatorApplications.ts` | **New** | Fetches creator's applications with joined data for Applied tab. |
| `src/hooks/useCreatorPortfolio.ts` | **New (Phase 2)** | Deferred — fetches creator's file_uploads for portfolio selector. Requires schema change for `campaign_applications` to store file references. |
| `src/lib/campaignUtils.ts` | **New** | `mapDeliveryType()`, `getRelativeTime()`, `calculateDistance()` utilities. |
| `src/hooks/usePublicCampaigns.ts` | **Modify** | Add cover image URL, deliverable count, content types to query. |
| `src/pages/CreatorCampaignMarketplace.tsx` | **Modify** | Add tab bar (Available / Applied / Active / Done), modal state management, integrate new components. |

### Files NOT Modified (Protected)

- All restaurant/business dashboard pages
- `CampaignDetailsPage.tsx` (business-oriented detail page, separate from new creator modal)
- `ApplicationForm.tsx` (keep existing, used elsewhere; new `CampaignApplyForm` is creator-swipe-specific)
- Auth logic, Supabase config, Stripe integration
- Desktop `lg:` Tailwind classes on all existing components

---

## 7. Phase 2 Scope (Deferred)

Designed but not implemented in this task:

- **Active tab:** Query `campaign_collaborations` for active campaigns. Show deadlines, upload buttons, progress tracking.
- **Completed tab:** Query completed collaborations. Show review prompts, earnings summary.
- **Verified badge system:** Add `verified` boolean to `business_profiles`. Currently show badge for all businesses.
- **Distance sort/filter:** Sort campaigns by distance once geocoding is reliable.
- **"Campaigns without images rank lower" sort:** Incentivize businesses to upload media.
- **Portfolio attachment in apply form:** Requires new column on `campaign_applications` + `useCreatorPortfolio` hook.
- **"View Business Profile" link:** Requires a public-facing business profile route.

---

## 8. Loading, Error, and Empty States

| Component | Loading | Error | Empty |
|-----------|---------|-------|-------|
| Swipe stack (Available tab) | Skeleton card with pulsing gradient | Toast + "Retry" button | Existing "All caught up!" empty state (already implemented) |
| Detail modal | Skeleton sections for media/deliverables (campaign data cached from list) | Toast with error, modal stays open with cached data | N/A (modal only opens for a known campaign) |
| Apply form | Submit button shows spinner + "Submitting..." | Toast with error message, form stays editable | N/A |
| Applied tab | Skeleton list of 3 cards | Toast + "Retry" button | "No applications yet. Browse available campaigns to get started." with link to Available tab |

---

## 9. Constraints

- Mobile-first: all layouts designed for 375–430px width
- Tailwind only: no custom CSS, follow existing class patterns
- Pill-shaped buttons: `rounded-full` everywhere
- Teal + pink brand colors: no changes to color system
- RLS-safe queries: assume Row Level Security on all tables
- No table/column modifications: all data available in existing schema
- `npm run build` must succeed
