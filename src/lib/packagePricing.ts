import type { PackageTemplate } from '@/types/packages';

/**
 * Package price + payout math. A creator prices their own package; the buyer pays the listed price and the
 * creator ABSORBS a flat platform fee (list = gross, creator nets ~90%). Every number lives here so it stays
 * in one place — and MUST match the backend: PACKAGE_FEE_RATE in supabase/functions/_shared/platform-fee.ts
 * and v_fee_rate in the create_package_order RPC are both 0.10.
 */

/** Flat, buyer-agnostic package fee. Keep in sync with the two backend copies. */
export const PACKAGE_FEE_RATE = 0.1;

/** Platform floor. Mirrors the creator_packages.price CHECK (>= 50) and MIN_CAMPAIGN_PRICE. */
export const MIN_PACKAGE_PRICE = 50;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The fee the creator absorbs on a given list price. */
export function platformFee(price: number): number {
  return round2(price * PACKAGE_FEE_RATE);
}

/** What the creator actually takes home: list price minus the absorbed fee. */
export function netPayout(price: number): number {
  return round2(price - platformFee(price));
}

/** "$1,200" / "$600.50" — whole dollars when even, 2dp otherwise. */
export function formatUsd(n: number): string {
  return `$${(Number.isInteger(n) ? n : round2(n)).toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface SuggestedRange {
  min: number;
  max: number;
}

/**
 * The starting price band shown under the price field. Prefers the template's own suggested_price_low/high,
 * clamped to the floor; collapses to a single value when a template ships only one figure.
 */
export function templateSuggestedRange(template: Pick<PackageTemplate, 'suggested_price_low' | 'suggested_price_high'>): SuggestedRange {
  const low = template.suggested_price_low ?? MIN_PACKAGE_PRICE;
  const high = template.suggested_price_high ?? low;
  const min = Math.max(MIN_PACKAGE_PRICE, Math.round(low));
  const max = Math.max(min, Math.round(high));
  return { min, max };
}

/** A defensible default price (band midpoint) so the editor never shows a blank rate card (F1). */
export function defaultPriceFor(template: Pick<PackageTemplate, 'suggested_price_low' | 'suggested_price_high'>): number {
  const { min, max } = templateSuggestedRange(template);
  return Math.max(MIN_PACKAGE_PRICE, Math.round((min + max) / 2 / 25) * 25);
}

/** "$300–$600", collapsing to "$300" for a single-value band. */
export function formatRange({ min, max }: SuggestedRange): string {
  return min === max ? formatUsd(min) : `${formatUsd(min)}–${formatUsd(max)}`;
}

/** One-tap price chips (low / mid / high), rounded to the nearest $25, deduped and sorted. */
export function getPriceChips({ min, max }: SuggestedRange): number[] {
  const round25 = (n: number) => Math.max(MIN_PACKAGE_PRICE, Math.round(n / 25) * 25);
  const chips = [min, (min + max) / 2, max].map(round25);
  return [...new Set(chips)].sort((a, b) => a - b);
}
