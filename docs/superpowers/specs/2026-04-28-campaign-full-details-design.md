# Campaign Full Details Visibility — Design Spec

**Date:** 2026-04-28
**Status:** Approved
**Goal:** All campaign details collected during creation must be visible after save/launch, editable by business owners, and fully visible to creators, restaurants, and brands — no partial information.

---

## Problem

The campaign creation form collects ~20 fields across 4 sections (Campaign Overview, Content Requirements, Compensation & Terms, Logistics & Targeting). After saving or launching, most views show only a subset of these fields:

- **Business/Restaurant detail view** — missing key_messages, style_direction (freeform), delivery_tier, tier_reasoning, cost breakdown, structured deliverables
- **Creator full detail view** — missing key_messages, style_direction, tier_reasoning, cost breakdown/earnings
- **Creator browse modal** — missing nearly everything (tagline, campaign_type, key_messages, hashtags, per_creator_cap, usage_rights_days, exclusivity_days, geographic_scope, creator_count, target_creator_personas, style_direction, tier_reasoning)
- **Edit page** — cannot edit 12+ fields (tagline, campaign_type, key_messages, hashtags, per_creator_cap, usage_rights_days, exclusivity_days, geographic_scope, target_creator_count, target_creator_personas, delivery_tier, style_direction, structured deliverables)
- **Save as Draft** — only persists 6 of ~20 fields; most data is silently lost

### Root Causes

1. `saveDraft` writes only 6 fields (title, description, budget_min, budget_max, deadline, delivery_type)
2. Many fields are stored in the `ai_analysis` JSON blob; `hydrateCampaignFromAnalysis()` only extracts 9 of them
3. `key_messages` is flattened into a comma-joined string in the `goals` column — the array form is lost
4. `style_direction` (freeform text from creation) conflicts with `style`/`tone` (dropdown values from edit)
5. Views were built incrementally and never reconciled with the full creation form field set

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Creator browse modal | Rich summary + "View Full Details" link | Fast-scan browse UX; all details accessible on full page |
| Edit page | All fields editable (mirrors creation form) | Broken to show fields you can't change |
| Save as Draft | Persist all fields, same as Launch | Prevents silent data loss |
| Data storage | Keep `ai_analysis` JSON blob, make writes/reads consistent | Avoids risky DB migration; fix the pattern, not the architecture |
| Cost breakdown | Business sees full cost breakdown; creators see "Your potential earnings: up to $X" | Prevents creator confusion about total vs. individual payout |

---

## Design

### Section 1: Data Layer Fixes

#### 1a. Fix `saveDraft` (`src/hooks/useCampaignCreator.ts`)

Must match `launchCampaign`'s save logic — write all fields to the same columns and `ai_analysis` blob, with `status: 'draft'` instead of `'active'`.

Fields to add to draft save:
- Direct columns: `goals` (from key_messages join), `platforms`, `style` (from style_direction), `delivery_type`, `delivery_fee`
- `ai_analysis` blob: `tagline`, `campaign_type`, `per_creator_cap`, `usage_rights_days`, `exclusivity_days`, `geographic_scope`, `creator_count`, `target_creator_personas`, `hashtag_requirements`, `key_messages`, `style_direction`, `tier_reasoning`, `delivery_fee`, `business_context`

#### 1b. Expand `hydrateCampaignFromAnalysis` (`src/hooks/useCampaignQueries.ts`)

Currently extracts 9 fields. Add:
- `key_messages` (string array)
- `style_direction` (string — the freeform text, distinct from `style` dropdown)
- `tier_reasoning` (string)
- `delivery_fee` (number)

#### 1c. Update `Campaign` interface (`src/hooks/useCampaignQueries.ts`)

Add optional fields populated by hydration:
- `key_messages?: string[]`
- `style_direction?: string`
- `tier_reasoning?: string`
- `delivery_fee?: number`

#### 1d. Verify `launchCampaign` writes all fields

Ensure `key_messages`, `style_direction`, `tier_reasoning`, and `delivery_fee` are all included in the `ai_analysis` blob on launch. Add any that are missing.

---

### Section 2: Shared Read-Only Section Components

Four new components in `src/components/campaign-details/sections/`:

#### `CampaignOverviewSection.tsx`

| Field | Display |
|-------|---------|
| Title | Heading text |
| Tagline | Italic/muted subtitle, or "No tagline" placeholder |
| Description | Body text |
| Campaign Type | Badge (e.g., "UGC Content") |

#### `ContentRequirementsSection.tsx`

| Field | Display |
|-------|---------|
| Platforms | Pill badges (Instagram, TikTok, etc.) |
| Structured Deliverables | Cards with content_type, platform, aspect_ratio, description. Fetched from `campaign_deliverables` table via `useCampaignDeliverables` hook. Falls back to string badges from `campaign.deliverables` if no structured data. |
| Style Direction | Freeform text (from `style_direction`, NOT the style/tone dropdowns) |
| Key Messages | Individual chips/pills |
| Hashtags | Teal-colored tags with `#` prefix |

#### `CompensationSection.tsx`

Takes `role: 'business' | 'creator'` prop.

| Field | Display |
|-------|---------|
| Budget Range | "$100 — $300" format |
| Per-Creator Cap | Dollar amount |
| Usage Rights | "X days" |
| Exclusivity | "X days" |
| Cost Breakdown (business) | Existing `CostBreakdown` component — deliverable count × per_creator_cap, total |
| Earnings (creator) | "Your potential earnings: up to $X" based on per_creator_cap |

#### `LogisticsSection.tsx`

| Field | Display |
|-------|---------|
| Deadline | Formatted date |
| Delivery Tier | Badge with tier name + turnaround (e.g., "Standard · 5–7 days") + tier_reasoning as muted helper text |
| Geographic Scope | Pill badges (City, Region, National) |
| Target Creator Count | Number |
| Target Creator Personas | Pill badges (Foodie, Lifestyle, etc.) |

Each section uses a heading + content card wrapper for visual consistency. Sections receive campaign data via props. The one exception is `ContentRequirementsSection`, which also takes a `campaignId` prop and uses the `useCampaignDeliverables` hook internally to fetch structured deliverables from the `campaign_deliverables` table.

---

### Section 3: View Updates

#### 3a. Business/Restaurant Detail View (`src/components/campaigns/CampaignDetailsOverview.tsx`)

**Replace** the current two-column grid and `CampaignAnalysisDisplay` with the 4 shared sections stacked vertically:
1. `CampaignOverviewSection`
2. `ContentRequirementsSection`
3. `CompensationSection` with `role="business"`
4. `LogisticsSection`

Keep the status badge and action buttons (edit, manage applications) above the sections. Remove `CampaignAnalysisDisplay` (the raw JSON dump is replaced by structured sections).

#### 3b. Creator Full Detail View (`src/components/campaign-details/CreatorCampaignDetails.tsx`)

**Replace** `CampaignBriefSection`, `CampaignDeliverablesBreakdown`, `CampaignTimeline`, `CampaignBudgetDetail`, and inline scope section with the 4 shared sections:
1. `CampaignOverviewSection`
2. `ContentRequirementsSection`
3. `CompensationSection` with `role="creator"`
4. `LogisticsSection`

**Keep as-is:**
- `CampaignHero` — top hero (title, business name, tagline, delivery badge)
- `CampaignMetricsBar` — quick-glance stats below hero
- `CampaignReferencesGallery` — visual references
- `CampaignFootageSection` — raw footage
- `BusinessProfileStrip` — business info at bottom
- `StickyApplyCTA` / `InvitationBanner` — action elements

Shared sections slot between the metrics bar and business profile strip.

#### 3c. Creator Browse Modal (`src/components/campaigns/CampaignDetailModal.tsx`)

Add a **rich summary** with key fields from all 4 sections (compact, not full accordion):

- Campaign type badge + tagline below title
- Platforms as small pill badges
- Deliverables count + first deliverable's type/platform summary
- Budget range + "Per creator: up to $X"
- Delivery tier badge + deadline
- Geographic scope + target creator count
- Target personas as small pills
- Hashtags as teal tags
- Key messages as compact list
- Style direction as muted text

Add a prominent **"View Full Details"** button navigating to the full `CreatorCampaignDetails` page. Keep existing elements (hero image, business info, visual references, apply button).

---

### Section 4: Edit Page Updates

#### Replace Current Form Layout (`src/pages/CampaignEditPage.tsx`)

Replace the 5 existing form components with 4 collapsible sections matching the creation wizard:

**Section 1 — Campaign Overview**
- Title (text input) — existing
- Tagline (text input) — new
- Description (textarea) — existing
- Campaign Type (read-only badge) — new, non-editable (drives AI generation logic)

**Section 2 — Content Requirements**
- Platforms (checkbox pills) — existing
- Structured Deliverables (add/edit/remove cards: content_type, platform, aspect_ratio, description) — new, writes to `campaign_deliverables` table
- Style Direction (textarea) — new freeform text field. This is the AI-generated creative direction from campaign creation (e.g., "Romantic and engaging, focusing on the intimate dining experience"). The existing `style` and `tone` dropdowns (e.g., "Professional", "Casual") remain as separate fields below it — they serve different purposes (freeform creative brief vs. quick categorization).
- Key Messages (editable chip list) — new
- Hashtags (editable chip list) — new

**Section 3 — Compensation & Terms**
- Budget Range min/max (number inputs) — existing
- Per-Creator Cap (number input) — new
- Usage Rights days (number input) — new
- Exclusivity days (number input) — new
- Cost Breakdown (read-only, auto-calculated) — new

**Section 4 — Logistics & Targeting**
- Deadline (date picker) — existing
- Delivery Tier (selector: Standard/Express/Rush) — new
- Geographic Scope (pill selector: City/Region/National) — new
- Target Creator Count (number input) — new
- Target Creator Personas (multi-select pills) — new

#### Edit Save Logic (`src/hooks/useCampaignEditForm.ts`)

Update save function to write all fields — direct DB columns where they exist, everything else into `ai_analysis` blob. Structured deliverables save to `campaign_deliverables` table via upsert/delete.

#### Component Reuse

The creation wizard components (`PlatformChips`, `DeliverablesList`, `BudgetSlider`, `TimelinePicker`, `TierBadge` from `src/components/campaign-creator/`) can be reused in the edit form. They'd be initialized with existing campaign data instead of AI-generated defaults.

---

## Files Affected

### New Files
- `src/components/campaign-details/sections/CampaignOverviewSection.tsx`
- `src/components/campaign-details/sections/ContentRequirementsSection.tsx`
- `src/components/campaign-details/sections/CompensationSection.tsx`
- `src/components/campaign-details/sections/LogisticsSection.tsx`

### Modified Files
- `src/hooks/useCampaignCreator.ts` — fix saveDraft to persist all fields
- `src/hooks/useCampaignQueries.ts` — expand Campaign interface + hydrateCampaignFromAnalysis
- `src/hooks/useCampaignEditForm.ts` — expand edit form data type + save logic
- `src/components/campaigns/CampaignDetailsOverview.tsx` — replace with shared sections
- `src/components/campaign-details/CreatorCampaignDetails.tsx` — replace scattered sub-components with shared sections
- `src/components/campaigns/CampaignDetailModal.tsx` — add rich summary fields + "View Full Details" button
- `src/pages/CampaignEditPage.tsx` — replace form layout with 4-section structure

### Potentially Removable After Migration
These components are replaced by the shared sections and may become unused:
- `src/components/campaign-details/CampaignBriefSection.tsx`
- `src/components/campaign-details/CampaignTimeline.tsx`
- `src/components/campaign-details/CampaignBudgetDetail.tsx`
- `src/components/campaigns/CampaignAnalysisDisplay.tsx`
- `src/components/campaigns/CampaignBasicInfoForm.tsx`
- `src/components/campaigns/CampaignBudgetTimelineForm.tsx`
- `src/components/campaigns/CampaignStyleToneForm.tsx`
- `src/components/campaigns/CampaignSponsorshipToggle.tsx`

Verify these are not imported elsewhere before removing.

---

## Out of Scope

- No database schema changes (no new columns, no migrations)
- No changes to campaign creation wizard (`CampaignEditor.tsx`)
- No changes to campaign card list views (`CampaignCard.tsx`) — intentionally a summary
- No changes to auth, RLS, or Stripe integration
- No changes to `CampaignHero`, `CampaignMetricsBar`, `CampaignReferencesGallery`, `CampaignFootageSection`, `BusinessProfileStrip`, `StickyApplyCTA`, `InvitationBanner`
