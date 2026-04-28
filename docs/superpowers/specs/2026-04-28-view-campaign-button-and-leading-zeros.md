# View Campaign Button & Leading Zeros — Bug Fix Spec

**Date:** 2026-04-28
**Status:** Approved
**Scope:** Two bug fixes — non-functional "View Campaign" button on campaign swipe cards, and leading-zero display issue on all dollar/numeric input fields.

---

## Bug 1: View Campaign Button Not Functional

### Problem

On the creator Available Campaigns view (`CreatorCampaignMarketplace`), the "View Campaign" teal button on swipe cards does not respond to taps on mobile. The only way to view campaign details is to swipe right. The button has `onClick` and `onTouchEnd` handlers, but `react-tinder-card` uses pointer events internally for drag detection, so it consumes the gesture before the button's handlers fire.

### Fix

**File:** `src/components/campaigns/CampaignSwipeCard.tsx` (lines 294-309)

Replace the button's mouse/touch event handlers with pointer event equivalents:

- **`onPointerDown`**: `stopPropagation()` — prevents TinderCard from tracking the gesture
- **`onPointerUp`**: `stopPropagation()`, `preventDefault()`, then call `onViewDetail(campaign)`
- Remove: `onMouseDown`, `onTouchStart`, `onTouchEnd`, `onClick`

This targets the same event model that `react-tinder-card` uses, blocking the library from seeing the gesture at the pointer level.

---

## Bug 2: Leading Zeros on Numeric Input Fields

### Problem

When a user clears a dollar amount field (or any numeric field) to "0" and types a new value, the leading "0" remains — producing values like "0500" instead of "500". This is especially visible on mobile where `type="number"` does not reliably strip leading zeros during editing.

### Fix

For every affected numeric input:

1. Switch `type="number"` to `type="text"` with `inputMode="numeric"` and `pattern="[0-9]*"` — this shows the numeric keyboard on mobile while giving full control over the displayed value.
2. On `onChange`, sanitize the input:
   - Strip non-digit characters: `value.replace(/[^0-9]/g, '')`
   - Remove leading zeros: `.replace(/^0+(?=\d)/, '')`
   - Convert to number for state: `Number(sanitized) || 0`
3. Keep `value={field || ''}` so zero shows the placeholder instead of "0".

### Files Affected

| File | Fields |
|------|--------|
| `src/components/brand-campaigns/BrandCampaignDetailsStep.tsx` | budgetMin, budgetMax, perCreatorCap, exclusivityDays, creatorCount |
| `src/components/campaign-creator/CampaignEditor.tsx` | per_creator_cap, usage_rights_days, exclusivity_days, target_creator_count |
| `src/components/campaign-creator/BudgetSlider.tsx` | min, max |
| `src/components/campaigns/CampaignBudgetTimelineForm.tsx` | budget_min, budget_max |

### Not Affected

- `CampaignBudgetTimelineForm` stores values as strings and passes raw `e.target.value` to its parent. The sanitization still applies (strip leading zeros from the string), but the conversion to `Number()` happens upstream.

---

## Testing

- **View Campaign button:** Tap the button on mobile — should open the campaign detail modal. Swiping right should still work.
- **Leading zeros:** Clear any dollar field, type a new number — no leading zeros should appear. Typing "0" alone should work. Backspacing to empty should show placeholder.
- **Desktop:** Both fixes should work identically on desktop browsers.
