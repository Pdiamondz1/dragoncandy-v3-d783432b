# Campaign Sample Prompt & Full Details Display

**Date:** 2026-04-26
**Status:** Design approved
**Scope:** Screen 1 sample prompt carousel, Screen 2 editor field completeness, creator-facing campaign detail page

---

## Problem

Two gaps in the current campaign creation flow:

1. **Screen 1 (The Drop)** gives restaurants a blank input with cycling placeholder text, but no ready-to-use example. Restaurants stall trying to figure out what to type. A copy-paste sample prompt reduces friction and demonstrates what good input looks like.

2. **Campaign details are incomplete** on both sides. The Screen 2 editor is missing fields (tagline, usage rights, exclusivity, geographic scope, per-creator cap, target creator count). The creator-facing detail page has the same gaps. Creators can't make informed decisions about whether to apply.

## Solution

### 1. SamplePromptCarousel (Screen 1)

A new component placed directly below the `SmartInput` on the Drop screen.

**Behavior:**
- Displays one sample campaign prompt at a time inside a light teal card (`bg-teal-50 border border-teal-200`)
- Auto-cycles through 4 templates every 5 seconds with dot pagination indicators
- Tapping the card replaces the current SmartInput value with the prompt text (any existing text is overwritten), ready for editing. A brief "Copied!" visual feedback appears on the card.
- Header reads "Try this example" (teal, uppercase) with "Tap to copy" hint on the right

**4 rotating templates:**

| # | Scenario | Template |
|---|----------|----------|
| 1 | Weekend Promo | "We're [Restaurant] in [City]. Looking for 2 Instagram reels showcasing our [signature dish] this weekend. Fun, vibrant energy — think foodie date night vibes." |
| 2 | New Menu Launch | "[Restaurant] just launched a new summer menu. Need a TikTok and an IG carousel highlighting our top 3 new dishes. Clean, bright plating shots with a casual voiceover." |
| 3 | Grand Opening | "We're opening [Restaurant] in [Neighborhood] next Friday! Need 3 creators to cover opening night — 1 reel each, plus stories. Energetic, packed-house vibes." |
| 4 | Seasonal Special | "[Restaurant] is running a Valentine's Day prix fixe dinner. Looking for 1 romantic, cinematic reel — candlelit ambiance, plated courses, couple reactions." |

**Personalization:**
- When the user is logged in with a business profile, bracketed placeholders (`[Restaurant]`, `[City]`) auto-fill from their profile data (business name, city from `business_profiles` or `profiles` table).
- When logged out or profile is incomplete, brackets remain as guiding placeholders the user replaces manually.

**Styling:**
- White page background (no gray)
- Card: `bg-teal-50 border border-teal-200 rounded-2xl p-4`
- Label: teal, 11px uppercase, semi-bold
- Body text: 13px, dark gray, 1.5 line height
- Dot indicators: teal for active, light gray for inactive

### 2. Campaign Editor Sections (Screen 2)

Reorganize the existing `CampaignEditor` into 4 collapsible sections. Add all missing fields.

**Section structure:**

#### Section 1: Campaign Overview
- Title (text, editable)
- Tagline (text, editable) — **new field**
- Description (textarea, editable)
- Campaign Type (select: ugc_content, launch_hype, ongoing_presence, event_promo, seasonal)

#### Section 2: Content Requirements
- Platforms (chip toggles: Instagram, TikTok, Facebook, YouTube, Google Business, Multi-platform)
- Deliverables (list with add/remove — each has content_type, platform, aspect_ratio, max_duration_seconds, description)
- Style Direction (text, editable)
- Key Messages (tag list, editable)
- Hashtags (tag list, editable)

#### Section 3: Compensation & Terms
- Budget Range — min/max (slider, editable)
- Per-Creator Cap (number input, editable) — **new field in editor**
- Usage Rights Days (number input, editable) — **new field in editor**
- Exclusivity Days (number input, editable) — **new field in editor**

#### Section 4: Logistics & Targeting
- Deadline (date picker, editable)
- Delivery Tier (select: DragonDash, Express, Standard)
- Geographic Scope (select: city, region, national) — **new field in editor**
- Target Creator Count (number input, editable) — **new field in editor**
- Target Creator Personas (chip toggles: foodie, lifestyle, fitness, beauty, tech, travel, fashion, parenting, gaming, comedy)

**Behavior:**
- All 4 sections expand by default when a campaign idea is selected
- Each section has a teal-tinted header (`bg-teal-50`) with section name and expand/collapse chevron
- Fields display AI-generated values in read-only mode; tap to edit inline (existing `EditableField` pattern)
- Sections 3 and 4 use a 2-column grid for compact number/short-value fields
- On launch, validation highlights missing required fields with red borders and auto-expands the relevant section

**New fields for Donny AI generation:**
The `donny-campaign-generate` edge function must populate the new fields (tagline, per_creator_cap, usage_rights_days, exclusivity_days, geographic_scope, target_creator_count) in its response so the editor is pre-filled. Reasonable defaults: usage_rights_days=30, exclusivity_days=14, geographic_scope="city", target_creator_count=2.

### 3. Creator-Facing Campaign Detail Page

Redesign `CampaignDetailsPage` to display all campaign fields in a structured, read-only layout.

**Layout:**

**Hero header (teal gradient):**
- Back button (top-left): translucent circle with arrow + "Back" label. Uses `navigate(-1)` for context-aware navigation back to wherever the creator came from.
- Campaign emoji + title + business name + campaign type
- Tagline in italic below
- Delivery tier badge (top-right): translucent dark pill

**Quick Stats Bar:**
- 3-column row with pink dividers (matching existing profile stats pattern)
- Budget range | Deadline | Creator count
- Visible without scrolling — the 3 things creators scan first

**Description:**
- Full campaign description text below stats bar

**Section 1: Content Requirements (always expanded)**
- Platforms (teal pills)
- Deliverables (list cards with content type icon, aspect ratio, duration)
- Style Direction
- Key Messages (gray pills)
- Hashtags (teal text)

**Section 2: Compensation & Terms (always expanded)**
- Budget Range + Per-Creator Cap (2-column grid, bold values)
- Usage Rights + Exclusivity (2-column grid with plain-English subtitles: "Brand can reuse your content" / "No competing campaigns")

**Section 3: Logistics & Targeting (always expanded)**
- Deadline + Delivery Tier (2-column grid)
- Geographic Scope + Target Creator Personas (2-column grid, personas as pink pills)

**Apply Now CTA:**
- Full-width teal pill button at bottom
- "X spots remaining" subtitle below (creator_count minus active collaborations)

**Key differences from editor:**
- All sections are always expanded (no collapsing) — creators shouldn't hunt for information
- Campaign Overview fields are promoted to the hero header instead of a section
- Compensation fields include creator-friendly plain-English explanations
- Read-only throughout — no edit affordances

### 4. Database & Validation

**No schema changes needed.** All required columns already exist in the `campaigns` table (added in migration `20260406100000_brand_campaign_fields`): `tagline`, `per_creator_cap`, `usage_rights_days`, `exclusivity_days`, `geographic_scope`, `creator_count`, `target_creator_personas`.

**Launch validation** (update `campaignCreatorValidation.ts`):
- `tagline`: optional (string, max 120 chars)
- `per_creator_cap`: optional (number, min 0)
- `usage_rights_days`: optional (number, min 0, 0 = perpetual)
- `exclusivity_days`: optional (number, min 0)
- `geographic_scope`: optional (enum: city, region, national)
- `target_creator_count`: optional (number, min 1)

All new fields are optional for launch since Donny pre-fills them with sensible defaults. Existing campaigns without these fields display gracefully (omit the field in the UI rather than showing "N/A").

---

## Components Summary

| Component | Location | Status |
|-----------|----------|--------|
| `SamplePromptCarousel` | `src/components/campaign-creator/SamplePromptCarousel.tsx` | New |
| `CampaignEditor` | `src/components/campaign-creator/CampaignEditor.tsx` | Refactor into sections, add fields |
| `EditorSection` | `src/components/campaign-creator/EditorSection.tsx` | New (collapsible section wrapper) |
| `CampaignDetailsPage` | `src/pages/CampaignDetailsPage.tsx` | Redesign with hero + sections |
| `CampaignQuickStats` | `src/components/campaign-details/CampaignQuickStats.tsx` | New |
| `CampaignDetailSection` | `src/components/campaign-details/CampaignDetailSection.tsx` | New (read-only section wrapper) |
| `donny-campaign-generate` | `supabase/functions/donny-campaign-generate` | Update to return new fields |
| `campaignCreatorValidation` | `src/lib/campaignCreatorValidation.ts` | Add new field validation |
| `useCampaignCreator` | `src/hooks/useCampaignCreator.ts` | Add new fields to EditableCampaign state |
| `campaignCreator types` | `src/types/campaignCreator.ts` | Add new fields to EditableCampaign interface |

## Out of Scope

- Campaign image/photo upload or AI-generated preview images
- Creator application flow changes
- Brand-specific wizard (`BrandCreateCampaign.tsx`) — only the unified flow is affected
- Stripe payment integration changes
- Marketplace filtering by new fields
