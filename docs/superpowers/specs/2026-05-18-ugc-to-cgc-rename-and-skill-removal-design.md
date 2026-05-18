# Rename UGC Campaigns → CGC Campaigns & Remove UGC Creation Skill

**Date:** 2026-05-18
**Status:** Draft

## Context

The Restaurant Dashboard sidebar currently labels the promotions section "UGC Campaigns" (User Generated Content). The correct terminology for DragonCandy is "CGC" — Customer Generated Content — which the page title already uses ("CUSTOMER GENERATED CONTENT CAMPAIGNS"). The sidebar label is the only place that still says "UGC Campaigns."

Separately, "UGC Creation" exists as a selectable creator skill in three UI surfaces: the Browse Creators filter chips, the creator profile skill picker, and the onboarding wizard. This skill should be removed from all three.

Both changes are UI-only. No database migrations, no enum changes, no renaming of internal code identifiers.

## Changes

### 1. Rename sidebar label (navConfig.ts)

**File:** `src/lib/navConfig.ts`

Two occurrences of `label: 'UGC Campaigns'`:
- Line 53 — `businessSidebarNav` array → change to `'CGC Campaigns'`
- Line 179 — `businessDrawerMenu` array → change to `'CGC Campaigns'`

### 2. Remove UGC Creation skill from UI

**File:** `src/lib/skillUtils.ts`
- Line 8 — Remove `{ value: 'ugc_creation', label: 'UGC Creation' }` from `SKILL_OPTIONS`
- Add a `LEGACY_SKILL_LABELS` map below `skillLabelMap` containing `ugc_creation → 'UGC Creation'`, and update `formatSkillLabel` to check it as a fallback. This ensures any existing creator profile that still has `ugc_creation` in the database renders correctly as "UGC Creation" rather than the regex fallback "Ugc Creation".

**File:** `src/components/creator-profile/SkillsSelection.tsx`
- Line 9 — Remove `{ id: 'ugc_creation', label: 'UGC Creation' }` from `skills` array

**File:** `src/components/onboarding/OnboardingWizard.tsx`
- Line 49 — Remove `{ value: 'ugc_creation', label: 'UGC', icon: '🎬' }` from `SKILL_ITEMS`

### Downstream cascade (no code changes needed)

These components derive their skill lists from `SKILL_OPTIONS`, so removing `ugc_creation` from that array automatically removes it from:
- `src/components/creator-browse/CreatorBrowseHeader.tsx` — the filter pill row on Browse Creators
- `src/components/creator-search/AdvancedCreatorFilters.tsx` — skill badges in the advanced filters panel

### What stays unchanged

- Database `creator_skill` enum — existing creator data with `ugc_creation` remains valid
- `src/lib/donnyMatching.ts` — `SKILL_TO_CONTENT_TYPES` and `SKILL_LABELS` mappings stay so matching logic still works for legacy data
- All other UGC references (campaign types, brand goals, content styles, edge functions, social badges, AI prompts)
- The page title "CUSTOMER GENERATED CONTENT CAMPAIGNS" — already correct

## Verification

1. `npm run build` passes with no errors
2. `npm run typecheck` passes
3. Browser verification on production (dragoncandy.io) after Lovable deploy:
   - **Restaurant account:** Sidebar shows "CGC Campaigns" (not "UGC Campaigns")
   - **Restaurant account:** Browse Creators page no longer shows "UGC Creation" filter chip
   - **Creator account:** Profile skills picker no longer shows "UGC Creation"
   - **Creator account:** Onboarding wizard no longer shows "UGC" skill option
4. **Restaurant account:** Advanced Creator Filters panel no longer shows "UGC Creation" badge
5. **Any account:** Verify an existing creator profile with `ugc_creation` skill still renders the label correctly (not "Ugc Creation")
6. Console check for errors in Chrome DevTools on each verified page
