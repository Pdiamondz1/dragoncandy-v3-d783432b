# Mobile Overflow Fixes - Messages, Campaign Wizard, Campaigns, Campaign Details

**Date:** 2026-03-23
**Status:** Approved
**Approach:** Targeted per-page CSS fixes using proven Tailwind patterns

## Problem

Four pages exhibit horizontal overflow on mobile (375-430px viewports):
1. Messages page - conversation list content extends past right edge
2. Campaign Wizard - header description and delivery tier cards overflow
3. Campaigns list - campaign cards push beyond container width
4. Campaign Details - long campaign titles and card overlay overflow

## Root Cause

The `DashboardLayout` applies `overflow-x-hidden` at the wrapper and `<main>` levels, which clips overflow but doesn't prevent child content from computing wider than the viewport. The fix must constrain content at the source using `overflow-hidden`, `min-w-0`, `break-words`, and `max-w-full`.

## Prior Art

Commits `6ed8f65`, `dddcd66`, `ab8d5ed` applied the same pattern to other pages:
- `min-w-0` on flex parents to prevent flex children from overflowing
- `overflow-hidden` on card/container roots
- `shrink-0` on fixed-size elements (icons, badges)
- `truncate` / `break-words` on text elements
- `w-full` / `max-w-full` on grid containers

## Changes

### 1. DirectMessagesPage (`src/pages/DirectMessagesPage.tsx`)

**Line 86** - Conversation list wrapper:
```diff
- <div className="pb-24 px-4 pt-4">
+ <div className="pb-24 px-4 pt-4 overflow-hidden">
```

### 2. CampaignWizardHeader (`src/components/campaigns/CampaignWizardHeader.tsx`)

**Line 22** - Header text center div (add both `max-w-full` and `overflow-hidden`):
```diff
- <div className="text-center mb-8">
+ <div className="text-center mb-8 max-w-full overflow-hidden">
```

**Line 24** - Description paragraph:
```diff
- <p className="text-gray-600">
+ <p className="text-gray-600 break-words">
```

### 3. DeliveryTierStep (`src/components/campaigns/DeliveryTierStep.tsx`)

**Line 67** - Outer wrapper div:
```diff
- <div className="space-y-6">
+ <div className="space-y-6 overflow-hidden">
```

**Line 96** - Premium badge repositioning (currently uses `absolute -top-2 -right-2` which extends outside the card boundary and would be clipped by the parent `overflow-hidden`):
```diff
- <div className="absolute -top-2 -right-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium z-10">
+ <div className="absolute top-2 right-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium z-10">
```

### 4. CampaignCard (`src/components/campaigns/CampaignCard.tsx`)

**Line 224** - Root Card element: Add `overflow-hidden` to the Card className.

**Line 227** - Application counter badge repositioning (currently `absolute -top-2 -right-2` extends outside the card and would be clipped):
```diff
- <div className="absolute -top-2 -right-2 z-10">
+ <div className="absolute top-2 right-2 z-10">
```

**Line 236** - Title wrapper div: Already has `min-w-0` which is sufficient. No change needed.

### 5. CampaignDetailsPage (`src/pages/CampaignDetailsPage.tsx`)

**Line 107** - White card overlay div:
```diff
- <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28">
+ <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28 overflow-hidden">
```

**Line 110** - Campaign title h2:
```diff
- <h2 className="text-xl font-bold text-gray-900">{campaign.title}</h2>
+ <h2 className="text-xl font-bold text-gray-900 break-words">{campaign.title}</h2>
```

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `src/pages/DirectMessagesPage.tsx` | 86 | Add `overflow-hidden` |
| `src/components/campaigns/CampaignWizardHeader.tsx` | 22, 24 | Add `max-w-full overflow-hidden`, `break-words` |
| `src/components/campaigns/DeliveryTierStep.tsx` | 67, 96 | Add `overflow-hidden`, reposition Premium badge inside card |
| `src/components/campaigns/CampaignCard.tsx` | 224, 227 | Add `overflow-hidden`, reposition counter badge inside card |
| `src/pages/CampaignDetailsPage.tsx` | 107, 110 | Add `overflow-hidden`, `break-words` |

## Risk Notes

- Repositioning badges from `-top-2 -right-2` to `top-2 right-2` changes visual appearance slightly (badge sits inside the card instead of overlapping the edge). This is acceptable since the badge remains visible and prominent.
- `overflow-hidden` on containers will clip any absolutely-positioned children that extend beyond boundaries. All such cases (the two badges above) are addressed by repositioning.

## Testing

- Verify each page at 375px viewport width in browser DevTools
- Confirm no horizontal scrollbar appears (`document.documentElement.scrollWidth` should equal `document.documentElement.clientWidth`)
- Confirm the application counter badge and Premium badge are fully visible after repositioning
- Confirm no content is clipped that should be visible (truncated text should show ellipsis)
- Verify the fix doesn't break desktop layout
