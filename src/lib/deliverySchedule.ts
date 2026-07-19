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
 * How many days out each tier's deadline lands — matched to the turnaround the UI
 * advertises from TIER_LIMITS, so the date written never overshoots the promise:
 * DragonDash is 1–3 hours (today), Express is 24–48 hours (two days), Standard is
 * 5–7 days (a week).
 */
export const TIER_DEADLINE_DAYS: Record<DeliveryTier, number> = {
  dragondash: 0,
  express: 2,
  standard: 7,
};

/**
 * Upper bound, in days out, for deriving a tier back from a date: the **cheapest tier
 * whose advertised turnaround can still make that date**.
 *
 * A deadline one day out cannot rely on Express (its 48-hour worst case would miss it),
 * so it resolves to DragonDash. A deadline five days out is inside Standard's 5–7 day
 * window, so it stays Standard rather than upselling. These are exact inverses of
 * TIER_DEADLINE_DAYS above — 0 -> dragondash, 2 -> express, 7 -> standard.
 */
const TIER_MAX_DAYS_OUT: Record<Exclude<DeliveryTier, 'standard'>, number> = {
  dragondash: 1,
  express: 4,
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

/** Local midnight today — the reference point for every comparison in this module. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Whether a YYYY-MM-DD deadline is acceptable to launch against.
 *
 * **Today counts.** DragonDash turns content around in 1–3 hours, so a same-day deadline
 * is the honest one for it — rejecting today would make the tier unlaunchable.
 *
 * This replaced a `new Date(d) > new Date()` check, which failed twice over: it parsed a
 * date-only string as UTC midnight (already in the past by morning anywhere west of
 * Greenwich) and it required strictly-future, blocking same-day entirely.
 */
export function isDeadlineAcceptable(deadline: string): boolean {
  if (!deadline) return false;
  const target = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(target.getTime())) return false;
  return target.getTime() >= startOfToday().getTime();
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
 * option highlighted at all; here anything beyond Express's reach is simply Standard.
 */
export function tierForDeadline(deadline: string): DeliveryTier {
  if (!deadline) return 'standard';

  const target = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 'standard';

  // Midnight-to-midnight, rounded — immune to the 23/25-hour days around DST.
  const diffDays = Math.round(
    (target.getTime() - startOfToday().getTime()) / 86_400_000
  );

  if (diffDays <= TIER_MAX_DAYS_OUT.dragondash) return 'dragondash';
  if (diffDays <= TIER_MAX_DAYS_OUT.express) return 'express';
  return 'standard';
}
