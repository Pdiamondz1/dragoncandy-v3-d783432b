import type { DeliveryTier, ContentType } from '@/types/campaignMedia';
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
} from './scopeEstimates';

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

function getAdjustedMinutes(d: DeliverableInput, hasFootage: boolean): number {
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

function buildSuggestion(
  deliverableTimes: { label: string; minutes: number }[],
  totalMinutes: number,
  threshold: number,
  tier: DeliveryTier,
): string | null {
  if (deliverableTimes.length === 0) return null;

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

export function computeScopeValidation(
  deliverables: DeliverableInput[],
  deliveryTier: DeliveryTier,
  contentSource?: string,
): ScopeValidationResult {
  const hasFootage =
    contentSource === 'business_footage' || contentSource === 'hybrid';

  const deliverableTimes = deliverables.map((d) => ({
    label: getLabel(d),
    minutes: getAdjustedMinutes(d, hasFootage),
  }));

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

  const breakdown: { label: string; minutes: number }[] = [
    ...deliverableTimes,
    { label: 'Travel / setup', minutes: TRAVEL_BUFFER_MINUTES },
    { label: 'Review / revision', minutes: REVIEW_BUFFER_MINUTES },
  ];

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

  const relevantThreshold =
    status === 'block'
      ? thresholds.block!
      : status === 'warn'
        ? thresholds.warn!
        : 0;

  const suggestion =
    status !== 'ok'
      ? buildSuggestion(deliverableTimes, totalMinutes, relevantThreshold, deliveryTier)
      : null;

  return {
    totalMinutes,
    status,
    statusMessage,
    suggestion,
    footageSavingsMinutes,
    breakdown,
  };
}
