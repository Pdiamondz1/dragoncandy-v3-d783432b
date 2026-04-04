# Delivery-First Campaign Wizard Reorder

## Problem

The campaign creation wizard asks for content details before the delivery tier. This is backwards — the delivery window constrains scope of work, number of deliverables, and what's achievable. A 1–3 hour DragonDash can't accommodate a 10-piece content campaign. Delivery tier must come first.

## Scope

- **Business wizard only** (`CampaignWizard.tsx`) — anonymous wizard is a follow-up task
- **Frontend only** — no edge function or Supabase schema changes
- **Approach:** Reorder in place (keep existing hook + state architecture)

## Delivery Tier Rebrand

The existing `standard | expedited | dragonrush` delivery types are rebranded:

| Old Name | New Name | New Timeframe | Max Deliverables | Content Types | Fee |
|----------|----------|---------------|------------------|---------------|-----|
| dragonrush | dragondash | 1–3 hours | 2 | Photo, short Reel | $75 premium |
| expedited | express | 24–48 hours | 4 | All | $25 rush |
| standard | standard | 5–7 days | 10 | All | No fee |

No production data to preserve — clean rename throughout.

## New Step Order

| Step | Title | Component | Changes |
|------|-------|-----------|---------|
| 0 | "How fast do you need it?" | `DeliveryTierStep` (NEW) | New component replacing old `DeliveryTypeSelector` usage in timeline step |
| 1 | "What do you need?" | `CampaignBriefStep` (existing) | Unchanged — goal input, content source, AI generation |
| 2 | "Campaign Details" | `CampaignCustomizeForm` (existing) | Remove `DeliverableBuilder` (moves to Step 3). Budget auto-adjusts by tier. Content types filtered by tier. Show estimated creation time and scope warning. |
| 3 | "Add Visuals & Footage" | `CampaignVisualsStep` (NEW) | Three sections: visual references, raw footage toggle, tier-gated deliverable builder |
| 4 | "Review & Launch" | `CampaignFinalizeStep` (existing) | Display tier info in summary |

Progress bar updates from 3 steps to 5.

## New Component: DeliveryTierStep

Three tappable cards, mobile-first layout (single column, 375–430px):

**Card A — DragonDash:**
- Icon: ⚡ on teal gradient background with glow
- "PREMIUM" badge (teal gradient, top-right)
- "1–3 hours · Same-day content"
- "Best for: 1–2 simple posts, quick photo/reel"
- Price indicator: "$$$ Premium"
- "Max 2 deliverables"

**Card B — Express:**
- Icon: 🚀 on amber gradient background
- "24–48 hours · Next-day delivery"
- "Best for: 2–4 deliverables, edited reels"
- Price indicator: "$$ Standard"
- "Max 4 deliverables"

**Card C — Standard:**
- Icon: 📅 on green gradient background
- "5–7 days · Full production"
- "Best for: 5–10 deliverables, full campaigns"
- Price indicator: "$ Value"
- "Max 10 deliverables"

Selected card: teal border + checkmark. No default selection — "Continue" button disabled until a tier is chosen.

## New Component: CampaignVisualsStep

Three sections within a single step:

### Section A — Visual References (optional)
- Header: "Show creators what you're looking for"
- Drag-and-drop upload zone with dashed teal border
- "Browse files" button (teal outlined pill)
- Accepted: .jpg, .png, .mp4, .mov — max 50MB per file, max 5 files
- Thumbnail previews in horizontal scroll row
- Each thumbnail: remove (×) button, auto-detected "Photo" or "Video" badge

### Section B — Your Footage (optional, toggle)
- Toggle: "I have footage for the creator to use"
- When ON: upload zone (same style), max 10 files / 200MB total, per-file progress bar
- When OFF: hidden

### Section C — Content Deliverables (moved from Step 2)
- Header: "How many pieces of content do you need?"
- Stepper control: −/+ with number (min 1, max = tier limit)
- Plus button disabled at tier cap with tooltip explaining the limit
- Each deliverable is a self-contained card containing:
  - Numbered badge (teal circle)
  - Content type pills (flex-wrap): Photo | Reel | Story | Video
  - DragonDash tier hides Video option
  - Optional description input field inside the card

## State Changes to useCampaignWizard.ts

- Rename `deliveryType` → `deliveryTier` with type `'dragondash' | 'express' | 'standard'`
- Update `deliveryFee` derivation from tier
- Add tier config constant:
  ```typescript
  const TIER_LIMITS = {
    dragondash: { maxDeliverables: 2, contentTypes: ['photo', 'reel'] },
    express: { maxDeliverables: 4, contentTypes: ['photo', 'reel', 'story', 'video'] },
    standard: { maxDeliverables: 10, contentTypes: ['photo', 'reel', 'story', 'video'] },
  } as const;
  ```
- Step count: 3 → 5
- No new context providers or state libraries — stays as hook + local state

## Deliverable Gating

- Frontend only — no server-side enforcement
- `DeliverableBuilder` stepper max reads from `TIER_LIMITS[deliveryTier].maxDeliverables`
- Content type selector reads from `TIER_LIMITS[deliveryTier].contentTypes`

## Pricing Constraint

- DragonDash forces fixed pricing (no bid range) — carried over from existing DragonRush behavior
- Express and Standard allow both fixed and bid range pricing
- This logic already exists in `CampaignTimelineBudgetStep` — just needs the type rename

## Validation & Edge Cases

### Per-Step Validation
- **Step 0:** Cannot proceed without tier selection
- **Step 1:** Unchanged
- **Step 2:** Budget auto-adjusts by tier (DragonDash higher floor). Content types filtered. "Estimated creation time" label shown (static per tier: DragonDash ~90 min, Express ~1–2 days, Standard ~4–5 days). Scope warning if AI brief exceeds tier capacity.
- **Step 3:** Reference uploads: max 5 files, 50MB each (toast on rejection). Raw footage: max 10 files, 200MB total (progress bar per file). Deliverable stepper: min 1, max per tier.
- **Step 4:** Unchanged beyond showing tier in summary

### Back Navigation
- Switching to a higher-cap tier: existing deliverables preserved, stepper max increases
- Switching to a lower-cap tier: auto-trim deliverables with toast — "Reduced to N deliverables for [TierName]"

## Out of Scope

- Anonymous wizard changes (follow-up task)
- Edge function / Supabase changes
- New database tables or columns
- Server-side tier validation
- Donny AI visual preview integration

## Files Modified

- `src/pages/CampaignWizard.tsx` — step mapping, step count
- `src/hooks/useCampaignWizard.ts` — state rename, tier config, step count
- `src/components/campaigns/DeliveryTypeSelector.tsx` — rebrand to `DeliveryTierSelector.tsx` or replace with `DeliveryTierStep`
- `src/components/campaigns/CampaignTimelineBudgetStep.tsx` — remove delivery type selector (moved to Step 0)
- `src/components/campaigns/CampaignCustomizeForm.tsx` — remove DeliverableBuilder, add tier-based content type filtering
- `src/components/campaigns/CampaignWizardHeader.tsx` — 5-step progress bar
- `src/components/campaigns/CampaignFinalizeStep.tsx` — show tier in summary
- `src/types/campaign.ts` — update DeliveryType to DeliveryTier
- `src/types/campaignMedia.ts` — update type references

## New Files

- `src/components/campaigns/DeliveryTierStep.tsx` — Step 0 tier selection cards
- `src/components/campaigns/CampaignVisualsStep.tsx` — Step 3 visuals + footage + deliverables
