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
```
- <div className="pb-24 px-4 pt-4">
+ <div className="pb-24 px-4 pt-4 overflow-hidden">
```

### 2. CampaignWizardHeader (`src/components/campaigns/CampaignWizardHeader.tsx`)

**Line 22-23** - Header text center div:
```
- <div className="text-center mb-8">
+ <div className="text-center mb-8 max-w-full">
```

**Line 26** - Description paragraph:
```
- <p className="text-gray-600">
+ <p className="text-gray-600 break-words">
```

### 3. DeliveryTierStep (`src/components/campaigns/DeliveryTierStep.tsx`)

**Line 67** - Outer wrapper div:
```
- <div className="space-y-6">
+ <div className="space-y-6 overflow-hidden">
```

### 4. CampaignCard (`src/components/campaigns/CampaignCard.tsx`)

**Line 224** - Root Card element:
```
Add `overflow-hidden` to the Card className
```

**Line 236** - Title wrapper div inside CardHeader:
```
- <div className="flex-1 min-w-0 pr-4">
Already has min-w-0 - verify this is sufficient
```

### 5. CampaignDetailsPage (`src/pages/CampaignDetailsPage.tsx`)

**Line 107** - White card overlay div:
```
- <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28">
+ <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28 overflow-hidden">
```

**Line 110** - Campaign title h2:
```
- <h2 className="text-xl font-bold text-gray-900">{campaign.title}</h2>
+ <h2 className="text-xl font-bold text-gray-900 break-words">{campaign.title}</h2>
```

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `src/pages/DirectMessagesPage.tsx` | 86 | Add `overflow-hidden` |
| `src/components/campaigns/CampaignWizardHeader.tsx` | 22, 26 | Add `max-w-full`, `break-words` |
| `src/components/campaigns/DeliveryTierStep.tsx` | 67 | Add `overflow-hidden` |
| `src/components/campaigns/CampaignCard.tsx` | 224 | Add `overflow-hidden` |
| `src/pages/CampaignDetailsPage.tsx` | 107, 110 | Add `overflow-hidden`, `break-words` |

## Testing

- Verify each page at 375px viewport width in browser DevTools
- Confirm no horizontal scrollbar appears
- Confirm no content is clipped that should be visible (truncated text should show ellipsis)
- Verify the fix doesn't break desktop layout
