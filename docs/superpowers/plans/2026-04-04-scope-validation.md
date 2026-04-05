# Scope-of-Work Time Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-estimation card to the campaign Review & Launch step that warns or blocks launch when deliverables exceed the selected tier's time window.

**Architecture:** Pure frontend validation — a config file defines time estimates, a hook computes totals and status, a card component renders the result. The hook output also gates the publish button in the existing `CampaignFinalizeStep`.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-04-04-scope-validation-design.md`

---

### Task 1: Create scope estimate config

**Files:**
- Create: `src/lib/scopeEstimates.ts`

- [ ] **Step 1: Create the config file**

```typescript
// src/lib/scopeEstimates.ts

import type { ContentType } from '@/types/campaignMedia';

/** Minutes per deliverable (shoot + edit combined) */
export const DELIVERABLE_TIME_MINUTES: Record<ContentType, number> = {
  photo: 60,
  video_reel: 75,
  story: 40,
  carousel: 120,
  tiktok: 75,
  youtube_short: 75,
};

/** Override for video types when max_duration_seconds > LONG_VIDEO_THRESHOLD */
export const LONG_VIDEO_TIME_MINUTES: Partial<Record<ContentType, number>> = {
  video_reel: 105,
  tiktok: 105,
  youtube_short: 105,
};

/** Edit portion of total time — used for footage discount calculation */
export const EDIT_RATIOS: Record<ContentType, number> = {
  photo: 0.50,
  video_reel: 0.60,
  story: 0.50,
  carousel: 0.50,
  tiktok: 0.60,
  youtube_short: 0.60,
};

/** Long-video edit ratios (when max_duration_seconds > LONG_VIDEO_THRESHOLD) */
export const LONG_VIDEO_EDIT_RATIOS: Partial<Record<ContentType, number>> = {
  video_reel: 0.57,
  tiktok: 0.57,
  youtube_short: 0.57,
};

export const TRAVEL_BUFFER_MINUTES = 30;
export const REVIEW_BUFFER_MINUTES = 15;
export const FOOTAGE_DISCOUNT = 0.3;
export const LONG_VIDEO_THRESHOLD_SECONDS = 30;

/** Tier validation thresholds in minutes */
export const TIER_THRESHOLDS = {
  dragondash: { warn: 180, block: 210 },
  express: { warn: 360, block: null },
  standard: { warn: null, block: null },
} as const;

/** Human-readable content type labels */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  photo: 'Photo',
  video_reel: 'Video Reel',
  story: 'Story',
  carousel: 'Carousel',
  tiktok: 'TikTok',
  youtube_short: 'YouTube Short',
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scopeEstimates.ts
git commit -m "feat(scope-validation): add time estimate config"
```

---

### Task 2: Create useScopeValidation hook

**Files:**
- Create: `src/hooks/useScopeValidation.ts`
- Reference: `src/lib/scopeEstimates.ts`, `src/types/campaignMedia.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useScopeValidation.ts

import { useMemo } from 'react';
import type { DeliveryTier, ContentSource, ContentType } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
import {
  DELIVERABLE_TIME_MINUTES,
  LONG_VIDEO_TIME_MINUTES,
  EDIT_RATIOS,
  LONG_VIDEO_EDIT_RATIOS,
  TRAVEL_BUFFER_MINUTES,
  REVIEW_BUFFER_MINUTES,
  FOOTAGE_DISCOUNT,
  LONG_VIDEO_THRESHOLD_SECONDS,
  TIER_THRESHOLDS,
  CONTENT_TYPE_LABELS,
} from '@/lib/scopeEstimates';

interface DeliverableInput {
  content_type: string;
  max_duration_seconds?: number;
}

export interface ScopeValidationResult {
  totalMinutes: number;
  status: 'ok' | 'warn' | 'block';
  statusMessage: string;
  suggestion: string | null;
  footageSavingsMinutes: number;
  breakdown: { label: string; minutes: number }[];
}

function isKnownContentType(type: string): type is ContentType {
  return type in DELIVERABLE_TIME_MINUTES;
}

function isLongVideo(d: DeliverableInput): boolean {
  return (
    d.max_duration_seconds != null &&
    d.max_duration_seconds > LONG_VIDEO_THRESHOLD_SECONDS
  );
}

function getBaseMinutes(d: DeliverableInput): number {
  const ct = isKnownContentType(d.content_type) ? d.content_type : 'photo';
  if (isLongVideo(d) && LONG_VIDEO_TIME_MINUTES[ct] != null) {
    return LONG_VIDEO_TIME_MINUTES[ct]!;
  }
  return DELIVERABLE_TIME_MINUTES[ct];
}

function getEditRatio(d: DeliverableInput): number {
  const ct = isKnownContentType(d.content_type) ? d.content_type : 'photo';
  if (isLongVideo(d) && LONG_VIDEO_EDIT_RATIOS[ct] != null) {
    return LONG_VIDEO_EDIT_RATIOS[ct]!;
  }
  return EDIT_RATIOS[ct];
}

function getAdjustedMinutes(
  d: DeliverableInput,
  hasFootage: boolean,
): number {
  const base = getBaseMinutes(d);
  if (!hasFootage) return base;
  const editRatio = getEditRatio(d);
  return Math.round(base * (1 - FOOTAGE_DISCOUNT * editRatio));
}

function getLabel(d: DeliverableInput): string {
  const ct = isKnownContentType(d.content_type) ? d.content_type : 'photo';
  const base = CONTENT_TYPE_LABELS[ct];
  if (isLongVideo(d)) return `${base} (${d.max_duration_seconds}s)`;
  return base;
}

function formatTime(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

function buildSuggestion(
  deliverableTimes: { index: number; label: string; minutes: number }[],
  totalMinutes: number,
  threshold: number,
  tier: DeliveryTier,
): string | null {
  if (deliverableTimes.length === 0) return null;

  // Next tier for upgrade suggestion
  const nextTier: Record<string, string> = {
    dragondash: 'Express',
    express: 'Standard',
  };

  // Sort descending by time to find the longest
  const sorted = [...deliverableTimes].sort((a, b) => b.minutes - a.minutes);
  const longest = sorted[0];

  // Try removing the longest deliverable
  if (totalMinutes - longest.minutes <= threshold) {
    return `Remove the ${longest.label} to save ~${longest.minutes} min and fit within ${TIER_LIMITS[tier].label}.`;
  }

  // Suggest tier upgrade (preferred over removing multiple deliverables)
  const next = nextTier[tier];
  if (next) {
    return `Switch to ${next} for more time.`;
  }

  // Last resort: try removing 2 smallest (only if no tier upgrade available and >=1 remains)
  if (sorted.length >= 3) {
    const smallest = [...deliverableTimes].sort((a, b) => a.minutes - b.minutes);
    const savingsFrom2 = smallest[0].minutes + smallest[1].minutes;
    if (totalMinutes - savingsFrom2 <= threshold) {
      return `Remove 2 smaller deliverables (${smallest[0].label} + ${smallest[1].label}) to save ~${savingsFrom2} min.`;
    }
  }

  return null;
}

export function useScopeValidation(
  deliverables: DeliverableInput[],
  deliveryTier: DeliveryTier,
  contentSource?: string,
): ScopeValidationResult {
  return useMemo(() => {
    const hasFootage =
      contentSource === 'business_footage' || contentSource === 'hybrid';

    // Per-deliverable breakdown
    const deliverableTimes = deliverables.map((d, i) => ({
      index: i,
      label: getLabel(d),
      minutes: getAdjustedMinutes(d, hasFootage),
    }));

    // Footage savings = sum of (base - adjusted) across all deliverables
    const footageSavingsMinutes = hasFootage
      ? deliverables.reduce(
          (sum, d) => sum + getBaseMinutes(d) - getAdjustedMinutes(d, true),
          0,
        )
      : 0;

    const deliverableTotal = deliverableTimes.reduce(
      (sum, d) => sum + d.minutes,
      0,
    );
    const totalMinutes =
      deliverableTotal + TRAVEL_BUFFER_MINUTES + REVIEW_BUFFER_MINUTES;

    // Build breakdown for display
    const breakdown: { label: string; minutes: number }[] = [
      ...deliverableTimes.map((d) => ({ label: d.label, minutes: d.minutes })),
      { label: 'Travel / setup', minutes: TRAVEL_BUFFER_MINUTES },
      { label: 'Review / revision', minutes: REVIEW_BUFFER_MINUTES },
    ];

    // Determine status
    const thresholds = TIER_THRESHOLDS[deliveryTier];
    let status: 'ok' | 'warn' | 'block' = 'ok';

    if (thresholds.block != null && totalMinutes > thresholds.block) {
      status = 'block';
    } else if (thresholds.warn != null && totalMinutes > thresholds.warn) {
      status = 'warn';
    }

    const tierLabel = TIER_LIMITS[deliveryTier].label;

    const statusMessage =
      status === 'ok'
        ? `Achievable within ${tierLabel} window`
        : status === 'warn'
          ? 'Tight — creator may need to work fast'
          : `Exceeds ${tierLabel} capacity. Reduce scope or upgrade.`;

    // Build suggestion for warn/block
    const relevantThreshold =
      status === 'block'
        ? thresholds.block!
        : status === 'warn'
          ? thresholds.warn!
          : 0;

    const suggestion =
      status !== 'ok'
        ? buildSuggestion(
            deliverableTimes,
            totalMinutes,
            relevantThreshold,
            deliveryTier,
          )
        : null;

    return {
      totalMinutes,
      status,
      statusMessage,
      suggestion,
      footageSavingsMinutes,
      breakdown,
    };
  }, [deliverables, deliveryTier, contentSource]);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScopeValidation.ts
git commit -m "feat(scope-validation): add useScopeValidation hook"
```

---

### Task 3: Create ScopeValidationCard component

**Files:**
- Create: `src/components/campaigns/ScopeValidationCard.tsx`
- Reference: `src/hooks/useScopeValidation.ts`

- [ ] **Step 1: Create the component**

```tsx
// src/components/campaigns/ScopeValidationCard.tsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { ScopeValidationResult } from '@/hooks/useScopeValidation';

interface ScopeValidationCardProps {
  validation: ScopeValidationResult;
}

const STATUS_CONFIG = {
  ok: {
    border: 'border-teal-300',
    Icon: CheckCircle,
    iconColor: 'text-teal-500',
    textColor: 'text-teal-700',
  },
  warn: {
    border: 'border-yellow-400',
    Icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    textColor: 'text-yellow-700',
  },
  block: {
    border: 'border-red-400',
    Icon: XCircle,
    iconColor: 'text-red-500',
    textColor: 'text-red-700',
  },
} as const;

function formatTime(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

export const ScopeValidationCard: React.FC<ScopeValidationCardProps> = ({
  validation,
}) => {
  const { totalMinutes, status, statusMessage, suggestion, footageSavingsMinutes, breakdown } =
    validation;
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.Icon;

  return (
    <Card className={`mb-6 rounded-2xl border ${config.border}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-600" />
          Estimated Creator Time
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status row */}
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-5 w-5 shrink-0 ${config.iconColor}`} />
          <span className={`text-sm font-medium ${config.textColor}`}>
            {statusMessage}
          </span>
          <span className="text-sm text-gray-500 ml-auto">
            ~{formatTime(totalMinutes)}
          </span>
        </div>

        {/* Breakdown */}
        <div className="space-y-1">
          {breakdown.map((item, i) => (
            <div
              key={i}
              className="flex justify-between items-center text-sm text-gray-500"
            >
              <span>{item.label}</span>
              <span>{item.minutes} min</span>
            </div>
          ))}
        </div>

        {/* Footage savings */}
        {footageSavingsMinutes > 0 && (
          <div className="flex items-center gap-2 text-sm text-teal-700">
            <CheckCircle className="h-4 w-4 shrink-0 text-teal-500" />
            <span>Your footage saves ~{footageSavingsMinutes} min</span>
          </div>
        )}

        {/* Quick-fix suggestion */}
        {suggestion && (
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Suggestion: </span>
              {suggestion}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ScopeValidationCard;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ScopeValidationCard.tsx
git commit -m "feat(scope-validation): add ScopeValidationCard component"
```

---

### Task 4: Wire into CampaignFinalizeStep

**Files:**
- Modify: `src/components/campaigns/CampaignFinalizeStep.tsx`

This task adds three things:
1. Import the hook and card
2. Call the hook with campaign data
3. Render the card between deliverables list and cost breakdown
4. Gate the publish/submit button when status is `block`

- [ ] **Step 1: Add imports**

At the top of `CampaignFinalizeStep.tsx`, after the existing imports (after line 21), add:

```typescript
import { useScopeValidation } from '@/hooks/useScopeValidation';
import { ScopeValidationCard } from './ScopeValidationCard';
```

- [ ] **Step 2: Call the hook**

Inside the component function, after the `form` setup (after line 82), add:

```typescript
  const scopeValidation = useScopeValidation(
    campaignData.structuredDeliverables ?? [],
    campaignData.deliveryType,
    campaignData.contentSource,
  );
```

- [ ] **Step 3: Render the card**

Insert the card between the deliverables list card (ends at line 430 `)}`) and the cost breakdown comment (line 432 `{/* Cost Breakdown */}`). Add:

```tsx
      {/* Scope Validation */}
      {campaignData.structuredDeliverables && campaignData.structuredDeliverables.length > 0 && (
        <ScopeValidationCard validation={scopeValidation} />
      )}
```

- [ ] **Step 4: Gate the publish button**

Find the submit button (the `<Button type="submit"` around line 607). Change its `disabled` prop from:

```tsx
disabled={isCreating}
```

to:

```tsx
disabled={isCreating || scopeValidation.status === 'block'}
```

And add `opacity-50` when blocked. Update the `className` expression from:

```tsx
className={`flex items-center gap-2 ${
  form.watch('publishImmediately')
    ? 'bg-gradient-to-r from-primary to-pink-500 hover:from-primary/90 hover:to-pink-500/90'
    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
}`}
```

to:

```tsx
className={`flex items-center gap-2 ${
  scopeValidation.status === 'block'
    ? 'opacity-50 cursor-not-allowed'
    : ''
} ${
  form.watch('publishImmediately')
    ? 'bg-gradient-to-r from-primary to-pink-500 hover:from-primary/90 hover:to-pink-500/90'
    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
}`}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Visual smoke test**

Run: `npm run dev`
Navigate to the campaign wizard, reach Step 5 with:
1. DragonDash tier + 2 photos → should show green "Achievable" (165 min < 180)
2. DragonDash tier + 2 short reels → should show yellow warning (195 min > 180)
3. DragonDash tier + 2 long reels → should show red block (255 min > 210), publish button disabled
4. Express tier + 4 deliverables → verify warn threshold works
5. Standard tier → no validation shown (always ok)

- [ ] **Step 7: Commit**

```bash
git add src/components/campaigns/CampaignFinalizeStep.tsx
git commit -m "campaigns: scope-of-work time validation with tier gating"
```
