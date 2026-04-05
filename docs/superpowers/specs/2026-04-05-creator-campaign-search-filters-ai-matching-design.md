# Creator Campaign Search, Filters & AI Matching

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Creator-facing campaign marketplace — search, filtering, and Donny's Picks AI matching

---

## Problem

Creators browse campaigns by swiping cards with no way to search, filter, or get AI-recommended matches. Creators with specific skills (food photography, reel editing) have no efficient way to find relevant campaigns, especially for time-sensitive DragonDash deliveries.

## Solution

Add compact search + filter UI and a client-side AI matching system ("Donny's Picks") to the Creator Campaign Marketplace page.

---

## 1. Search Bar

- Full-width input with DragonCandy logo icon on the left (use existing `Transparent_DragonCandy_logo.png`)
- Placeholder: `"Search campaigns..."`
- **Mobile:** collapsed to a search icon by default, expands on tap
- **Debounced 300ms** client-side filtering against: `title`, `description`, `business_profile.business_name`
- Clear button (X) inside the input when active
- **Mobile swipe interaction:** when search text changes, the filtered campaign list updates and the swipe stack resets to the top card. This is acceptable since search is an intentional action (user tapped to expand, typed a query). The reset signals "new results."

## 2. Filter Pills

### Content Type (single row, single-select, "All" is default)

| Pill | Matches `campaign.content_types` array (already denormalized by `usePublicCampaigns`) |
|------|------------------------------------------------------------------------------------------|
| All | everything |
| Photo | `photo` |
| Reel | `video_reel`, `tiktok`, `youtube_short` |
| Story | `story` |
| Carousel | `carousel` |

### Delivery Tier (second row, appears on expand/tap)

| Pill | Matches `campaign.delivery_type` (DB value) |
|------|-----------------------------------------------|
| All | everything |
| DragonDash | `dragonrush` (DB stores `dragonrush`, displays as "DragonDash" via `mapDeliveryType`) |
| Express | `expedited` (DB stores `expedited`, displays as "Express" via `mapDeliveryType`) |
| Standard | `standard` |

### Sort (compact dropdown, right-aligned)

- **Newest** (default) — `created_at` descending
- **Highest Budget** — sort by `campaign.fixed_price ?? campaign.budget_max ?? 0` descending
- **Ending Soon** — `deadline` ascending (nulls last)

### Collapsibility

- Default state: search icon + content type pills visible
- Expanded state: full search bar + content type pills + delivery tier pills + sort
- Campaign count text below filters: "12 campaigns available" (updates dynamically)

### Deferred (not in MVP)

- Distance radius pills (no geocoding data in DB)
- Budget range slider
- Saved filter presets

## 3. AI Matching — "Donny's Picks"

### Mobile (Swipe Stack Injection)

- Top 3 AI-matched campaigns are injected as the **first cards** in the swipe stack
- Each card has a teal badge overlay (top-left): "95% Match"
- On detail modal open, match criteria shown: "Matches your: Photography, Reel Editing, Philadelphia"
- After swiping through picks, regular campaigns follow seamlessly
- If fewer than 3 campaigns score above 40%, show only qualifying ones
- If none qualify, skip — go straight to regular campaigns (no empty state)

### Desktop (Picks Row Above Grid)

- "Donny's Picks for You" section above the campaign grid
- Subtext: "Matched based on your skills, location, and ratings"
- Horizontal row of up to 3 cards with match score badges
- Regular grid follows below

### Matching Algorithm

Client-side, computed in a `useDonnyMatches` hook.

**With location data available on both sides:**

```
Score = (skillMatch x 0.4) + (locationMatch x 0.3) + (ratingFit x 0.2) + (availability x 0.1)
```

**Fallback when location data is missing (either side):**

```
Score = (skillMatch x 0.5) + (ratingFit x 0.3) + (availability x 0.2)
```

### Scoring Factors

| Factor | Computation | Range |
|--------|-------------|-------|
| Skills | Overlap between creator `skills` enum and campaign `content_types` via mapping table (e.g. `photography` -> `photo`, `video_editing` -> `video_reel`) | 0-100 |
| Location | Normalized city string match: exact = 100, same country = 50, no data/no match = 0 | 0-100 |
| Rating | `average_rating / 5 * 100`. Higher-rated creators boosted for higher-budget campaigns | 0-100 |
| Availability | `max(0, (max_projects_per_month - active_count) / max_projects_per_month * 100)`. If `max_projects_per_month` is null, fall back to: <2 active = 100, 2 active = 50, 3+ active = 0 | 0-100 |

### Skill-to-Content-Type Mapping

| Creator Skill (enum) | Campaign Content Type |
|----------------------|----------------------|
| `photography` | `photo` |
| `video_editing` | `video_reel`, `tiktok`, `youtube_short` |
| `ugc_creation` | `video_reel`, `photo`, `story` |
| `illustration` | `photo`, `carousel` |
| `graphic_design` | `photo`, `carousel` |
| `animation` | `video_reel`, `story` |
| `social_media_management` | all types (broad match, weighted at 50%) |
| `content_strategy` | all types (broad match, weighted at 50%) |
| `copywriting` | `carousel`, `story` |
| `influencer_marketing` | all types (broad match, weighted at 50%) |
| `other` | no match (0 score) |

### Data Requirements

- **Creator profile** (fetched once): `skills`, `city`, `country`, `average_rating`, `max_projects_per_month`
- **Active collaboration count**: query `campaign_collaborations` where `creator_id = user.id` and `status = 'active'`
- **Campaign data**: already available from `usePublicCampaigns` (includes `content_types`, `delivery_type`, `business_profile.city/country`, budget fields)

### Filter Interaction

Donny's Picks respect active filters. If a creator filters to "Photo", picks only show photo-matching campaigns. The algorithm runs against the already-filtered campaign set.

## 4. Empty States

| Scenario | Message |
|----------|---------|
| No campaigns match search/filters | "No campaigns found. Try different filters or check back soon." + "Clear filters" button |
| No campaigns at all | Existing empty state preserved ("All caught up!") |
| Filters active + zero results | Active filter count displayed + "Clear filters" button |

## 5. Existing Code Disposition

- **`src/components/campaigns/CampaignMarketplaceFilters.tsx`** — existing filter component built for business-side use. **Do not reuse.** The new `CampaignSearchFilters.tsx` is mobile-first with pill-based design; the existing component uses form inputs and a desktop grid layout. Leave the existing file untouched (it may be used on business pages later).
- **`src/hooks/useCampaignMarketplaceFilters.ts`** — if this file exists, it is currently unused (no imports). **Do not reuse or delete.** Build the new filtering logic inline in the marketplace page or in a small dedicated hook.

## 6. Edge Cases

- **Unauthenticated / non-creator users:** If no creator profile exists (user not logged in, or user is a business account), Donny's Picks section does not render. Regular campaigns still display with search/filters functional.
- **Creator with no skills set:** Skill match scores 0 for all campaigns. Donny's Picks will still rank by location/rating/availability.
- **Campaign with no deliverables:** `content_types` array is empty. Content type filter pills won't match it unless "All" is selected.

## 7. Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/useDonnyMatches.ts` | **New** — matching algorithm, scoring, skill mapping |
| `src/hooks/useCreatorMatchProfile.ts` | **New** — fetch logged-in creator's profile + active collab count |
| `src/components/campaigns/CampaignSearchFilters.tsx` | **New** — compact search + filter pills + sort |
| `src/components/campaigns/DonnyPicksBadge.tsx` | **New** — match score badge overlay for swipe cards |
| `src/components/campaigns/DonnyPicksRow.tsx` | **New** — desktop horizontal picks section |
| `src/pages/CreatorCampaignMarketplace.tsx` | **Modify** — integrate search, filters, Donny's Picks injection |
| `src/components/campaigns/CampaignSwipeCard.tsx` | **Modify** — accept badge overlay prop for injected picks |

## 8. Constraints

- **No changes to business/restaurant pages**
- **All existing `lg:` Tailwind classes preserved** on desktop layouts
- **Client-side only** — no new Supabase edge functions or DB migrations
- **Mobile-first** — all new UI designed for 375-430px first
- **DragonCandy design system** — teal/pink palette, pill buttons, rounded cards
- **No geocoding API dependency** — city string matching only
