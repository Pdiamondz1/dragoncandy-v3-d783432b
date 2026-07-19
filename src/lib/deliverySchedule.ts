// src/lib/deliverySchedule.ts
//
// The tier <-> deadline derivation behind the campaign builder's single delivery control.
//
// These used to be two independent controls: a timeline picker that wrote only
// `deadline` and a tier badge that wrote only `delivery_type`. Nothing tied them
// together, so a campaign could promise a weekend turnaround while being priced and
// timed as Standard. Deriving one from the other here is what makes that unrepresentable.

import type { DeliveryTier } from '@/types/campaignMedia';

/**
 * How many days out each tier's deadline lands. Also the upper bound used when
 * deriving a tier back from a date, so the two directions stay exact inverses.
 */
export const TIER_DEADLINE_DAYS: Record<DeliveryTier, number> = {
  dragondash: 1,
  express: 3,
  standard: 7,
};

/**
 * Formats a Date as YYYY-MM-DD in **local** time.
 *
 * `toISOString()` converts to UTC first, so an evening in a negative-offset timezone
 * rolls the date forward a day. Formatting locally keeps this exactly inverse to the
 * local-midnight parse in `tierForDeadline`.
 */
function toLocalISODate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Today as YYYY-MM-DD, local — the `min` for the custom date input. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/** Forward: the deadline a tier implies. */
export function deadlineForTier(tier: DeliveryTier): string {
  const d = new Date();
  d.setDate(d.getDate() + TIER_DEADLINE_DAYS[tier]);
  return toLocalISODate(d);
}

/**
 * Reverse: the tier a deadline implies.
 *
 * Always resolves. The control this replaced returned null past 22 days, which left no
 * option highlighted at all; here anything past 3 days is simply Standard.
 */
export function tierForDeadline(deadline: string): DeliveryTier {
  if (!deadline) return 'standard';

  const target = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 'standard';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Midnight-to-midnight, rounded — immune to the 23/25-hour days around DST.
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays <= TIER_DEADLINE_DAYS.dragondash) return 'dragondash';
  if (diffDays <= TIER_DEADLINE_DAYS.express) return 'express';
  return 'standard';
}
